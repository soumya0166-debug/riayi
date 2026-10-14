import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ModelEvaluationReport, ModelComparisonSample } from '@/types/training';
import { ollamaProvider } from '@/services/ai/providers/ollamaProvider';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeMathAnswer(ans: string): string {
  if (!ans) return '';
  let clean = ans.trim();
  // Strip LaTeX boxed formatting
  const boxedMatch = clean.match(/\\boxed\{([^{}]+)\}/);
  if (boxedMatch) {
    clean = boxedMatch[1].trim();
  }
  // Strip math dollar signs
  clean = clean.replace(/^\$+|\$+$/g, '').trim();
  // Strip degrees
  clean = clean.replace(/\\circ/g, 'deg').replace(/°/g, 'deg');
  return clean;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const runId = url.searchParams.get('runId');

    // 1. If runId provided, check for run-specific evaluation
    if (runId) {
      const evalPath = path.join(process.cwd(), 'storage', 'training_runs', `${runId}_eval.json`);
      if (fs.existsSync(evalPath)) {
        const report = JSON.parse(fs.readFileSync(evalPath, 'utf-8'));
        return NextResponse.json({ success: true, report });
      }
    }

    // 2. Otherwise load the baseline benchmark evaluation from math_training/results/gemini_full_test_eval.json
    const benchmarkPath = path.join(process.cwd(), 'math_training', 'results', 'gemini_full_test_eval.json');
    if (fs.existsSync(benchmarkPath)) {
      const raw = JSON.parse(fs.readFileSync(benchmarkPath, 'utf-8'));
      const samples: ModelComparisonSample[] = (raw.results || []).map((r: any) => ({
        index: r.index,
        id: r.id,
        problem: r.problem,
        expectedAnswer: r.expected_answer,
        baseModelPrediction: r.extracted_answer || r.model_raw_output?.slice(0, 100),
        baseModelPassed: r.is_correct || false,
        baseModelLatencySec: r.latency_sec || 0,
        finetunedPrediction: undefined,
        finetunedPassed: false,
        finetunedLatencySec: 0,
        isEquivalent: r.is_correct || false,
        comparisonRationale: r.comparison_rationale || (r.is_correct ? 'Correct' : 'Mismatch'),
      }));

      const report: ModelEvaluationReport = {
        id: 'eval_benchmark_gemini_baseline',
        baseModelName: 'Gemini 3.8 Flash (Baseline)',
        finetunedModelName: 'Qwen2.5-Instruct (LoRA)',
        testSampleCount: raw.total_evaluated || 35,
        baseExactMatchAcc: raw.accuracy_pct || 57.14,
        finetunedExactMatchAcc: 0, // Awaiting post-training eval
        effectiveFinetunedAcc: 0,
        accuracyImprovementPct: 0,
        baseAvgLatencySec: raw.avg_time_per_sample_sec || 11.15,
        finetunedAvgLatencySec: 0,
        unreliableSymbolicCount: raw.unreliable_auto_compare_count || 4,
        evaluatedAt: new Date().toISOString(),
        samples,
      };

      return NextResponse.json({ success: true, report });
    }

    return NextResponse.json(
      { success: false, error: 'No baseline evaluation benchmark found.' },
      { status: 404 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Request body is required.' },
        { status: 400 }
      );
    }

    const { modelName, sampleLimit = 5, runId } = body;
    const targetModel = modelName || 'qwen2.5:0.5b';

    // Load held-out test split
    const testSplitPath = path.join(process.cwd(), 'math_training', 'data', 'test.jsonl');
    if (!fs.existsSync(testSplitPath)) {
      throw new AppError('Held-out test split not found in math_training/data/test.jsonl.', 'NOT_FOUND', 404);
    }

    const rawLines = fs.readFileSync(testSplitPath, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
    const testSamples = rawLines.slice(0, Math.min(sampleLimit, rawLines.length)).map((l) => JSON.parse(l));

    let correctCount = 0;
    let totalLatencyMs = 0;
    let unreliableCount = 0;
    const evaluatedSamples: ModelComparisonSample[] = [];

    for (let i = 0; i < testSamples.length; i++) {
      const sample = testSamples[i];
      const prompt = `Solve this mathematical reasoning problem carefully. End your solution with the final answer inside \\boxed{...}:\n\n${sample.problem}`;
      const expectedNorm = normalizeMathAnswer(sample.expected_answer);

      const startTime = Date.now();
      let rawOutput = '';

      try {
        const stream = ollamaProvider.streamChat({
          model: targetModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          maxTokens: 512,
        });

        for await (const chunk of stream) {
          rawOutput += chunk;
        }
      } catch (err: unknown) {
        rawOutput = `[Inference Error: ${formatErrorMessage(err)}]`;
      }

      const latencyMs = Date.now() - startTime;
      totalLatencyMs += latencyMs;
      const latencySec = +(latencyMs / 1000).toFixed(2);

      // Extract boxed answer
      let extracted = '';
      const boxedMatch = rawOutput.match(/\\boxed\{([^{}]+)\}/);
      if (boxedMatch) {
        extracted = boxedMatch[1].trim();
      } else {
        const lastNumberMatch = rawOutput.match(/[-+]?\d*\.?\d+/g);
        if (lastNumberMatch) {
          extracted = lastNumberMatch[lastNumberMatch.length - 1];
        }
      }

      const extractedNorm = normalizeMathAnswer(extracted);
      const isSymbolic = /[a-zA-Z\\{}^_]/.test(expectedNorm) && expectedNorm.length > 3;
      if (isSymbolic) {
        unreliableCount++;
      }

      const passed = Boolean(extractedNorm && expectedNorm && (extractedNorm === expectedNorm || extracted.includes(expectedNorm)));
      if (passed) correctCount++;

      evaluatedSamples.push({
        index: i + 1,
        id: sample.id || `sample_${i + 1}`,
        problem: sample.problem,
        expectedAnswer: sample.expected_answer,
        baseModelPassed: false,
        baseModelLatencySec: 0,
        finetunedPrediction: extracted || rawOutput.slice(0, 100),
        finetunedPassed: passed,
        finetunedLatencySec: latencySec,
        isEquivalent: passed,
        comparisonRationale: passed
          ? 'Exact normalized match'
          : isSymbolic
          ? 'Symbolic mismatch / requires manual review'
          : `Mismatch (pred: "${extractedNorm}", exp: "${expectedNorm}")`,
      });
    }

    const accuracy = testSamples.length > 0 ? +((correctCount / testSamples.length) * 100).toFixed(2) : 0;
    const avgLatency = testSamples.length > 0 ? +(totalLatencyMs / (testSamples.length * 1000)).toFixed(2) : 0;

    const report: ModelEvaluationReport = {
      id: `eval_${Date.now()}`,
      runId,
      baseModelName: 'Gemini 3.8 Flash (Baseline)',
      finetunedModelName: `${targetModel} (Evaluated)`,
      testSampleCount: testSamples.length,
      baseExactMatchAcc: 57.14,
      finetunedExactMatchAcc: accuracy,
      effectiveFinetunedAcc: accuracy,
      accuracyImprovementPct: +(accuracy - 57.14).toFixed(2),
      baseAvgLatencySec: 11.15,
      finetunedAvgLatencySec: avgLatency,
      unreliableSymbolicCount: unreliableCount,
      evaluatedAt: new Date().toISOString(),
      samples: evaluatedSamples,
    };

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
