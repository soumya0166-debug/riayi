import { NextRequest, NextResponse } from 'next/server';
import { ollamaProvider } from '@/services/ai/providers/ollamaProvider';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await ollamaProvider.checkHealth();
    let installedModels: Array<{
      name: string;
      sizeBytes: number;
      parameterSize: string;
      quantizationLevel: string;
      modifiedAt: string;
    }> = [];

    if (health.isOnline) {
      installedModels = await ollamaProvider.listModels();
    }

    return NextResponse.json({
      success: true,
      status: {
        isAvailable: health.isOnline,
        endpoint: ollamaProvider.getBaseUrl(),
        version: health.version,
        installedModels,
        errorMessage: health.error,
      },
    });
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
    if (!body || !body.action) {
      return NextResponse.json(
        { success: false, error: 'action parameter is required.' },
        { status: 400 }
      );
    }

    const { action, modelName, testPrompt } = body;

    if (action === 'test-inference') {
      const targetModel = modelName || 'qwen2.5:0.5b';
      const prompt = testPrompt || 'What is 12 * 13? Provide the final numerical answer clearly.';

      const startTime = Date.now();
      let responseText = '';

      const generator = ollamaProvider.streamChat({
        model: targetModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 256,
      });

      for await (const chunk of generator) {
        responseText += chunk;
      }

      const latencyMs = Date.now() - startTime;
      const passed = responseText.includes('156');

      return NextResponse.json({
        success: true,
        model: targetModel,
        prompt,
        response: responseText.trim(),
        latencyMs,
        latencySec: +(latencyMs / 1000).toFixed(2),
        passedExpectedTest: passed,
      });
    }

    if (action === 'generate-modelfile') {
      const base = modelName || 'qwen2.5:0.5b';
      const modelfile = `# RIYAI LoRA Adapter Modelfile
FROM ${base}
# ADAPTER ./riyai_lora_adapter
PARAMETER temperature 0.6
PARAMETER top_p 0.95
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"

SYSTEM """You are RIYAI, an advanced, articulate reasoning AI assistant. Solve problems systematically and provide precise solutions."""
`;

      return NextResponse.json({
        success: true,
        modelfile,
        instructions: [
          '1. Save the snippet above into a file named "Modelfile".',
          '2. Place your downloaded adapter directory or merged GGUF in the same directory.',
          `3. Run in your terminal: ollama create riyai-qwen-finetuned -f Modelfile`,
          '4. Select "RIYAI Fine-Tuned LoRA (Local)" in RIYAI.',
        ],
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action "${action}".` },
      { status: 400 }
    );
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
