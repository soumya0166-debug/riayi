import { EvaluationMetrics } from '@/types/learning';
import { knowledgeService } from '@/services/knowledge/knowledgeService';
import { neuralRanker } from '@/services/neural/neuralRanker';
import { dbService } from '@/services/database/clientDb';

export interface RetrievalBenchmarkSample {
  query: string;
  relevantChunkIds: string[];
  expectedTopics?: string[];
}

export class RetrievalLearningService {
  /**
   * Evaluate retrieval configurations on a benchmark set of question-document pairs.
   */
  public async evaluateRetrieval(
    userId: string,
    benchmarkSamples: RetrievalBenchmarkSample[]
  ): Promise<{
    baselineMetrics: EvaluationMetrics;
    neuralRankedMetrics: EvaluationMetrics;
    mrrImprovementPct: number;
    precisionImprovementPct: number;
  }> {
    if (!benchmarkSamples.length) {
      const defaultMetrics: EvaluationMetrics = {
        sampleCount: 0,
        precisionAt1: 0,
        precisionAt3: 0,
        recallAt3: 0,
        mrr: 0,
        avgLatencyMs: 0,
        binaryAccuracy: 0,
      };
      return {
        baselineMetrics: defaultMetrics,
        neuralRankedMetrics: defaultMetrics,
        mrrImprovementPct: 0,
        precisionImprovementPct: 0,
      };
    }

    let baseP1 = 0;
    let baseP3 = 0;
    let baseR3 = 0;
    let baseMrr = 0;
    let baseLatencyTotal = 0;

    let neuralP1 = 0;
    let neuralP3 = 0;
    let neuralR3 = 0;
    let neuralMrr = 0;
    let neuralLatencyTotal = 0;

    for (const sample of benchmarkSamples) {
      const relevantSet = new Set(sample.relevantChunkIds);

      // 1. Baseline Search: raw knowledgeService results
      const t0 = Date.now();
      const rawMatches = await knowledgeService.searchKnowledge(userId, sample.query, { limit: 6 });
      baseLatencyTotal += Date.now() - t0;

      const baseTop1 = rawMatches.length > 0 && relevantSet.has(rawMatches[0].chunk.id) ? 1 : 0;
      baseP1 += baseTop1;

      const baseTop3 = rawMatches.slice(0, 3).filter((m) => relevantSet.has(m.chunk.id)).length;
      baseP3 += baseTop3 / 3;
      baseR3 += sample.relevantChunkIds.length > 0 ? baseTop3 / sample.relevantChunkIds.length : 1;

      let baseRank = 0;
      for (let i = 0; i < rawMatches.length; i++) {
        if (relevantSet.has(rawMatches[i].chunk.id)) {
          baseRank = 1 / (i + 1);
          break;
        }
      }
      baseMrr += baseRank;

      // 2. Neural Re-Ranked Search: pass raw matches through neuralRanker
      const t1 = Date.now();
      const rankedMatches = await neuralRanker.rankChunks(sample.query, rawMatches, { limit: 3 });
      neuralLatencyTotal += Date.now() - t1;

      const neuralTop1 = rankedMatches.length > 0 && relevantSet.has(rankedMatches[0].chunk.id) ? 1 : 0;
      neuralP1 += neuralTop1;

      const neuralTop3 = rankedMatches.slice(0, 3).filter((m) => relevantSet.has(m.chunk.id)).length;
      neuralP3 += neuralTop3 / 3;
      neuralR3 += sample.relevantChunkIds.length > 0 ? neuralTop3 / sample.relevantChunkIds.length : 1;

      let neuralRank = 0;
      for (let i = 0; i < rankedMatches.length; i++) {
        if (relevantSet.has(rankedMatches[i].chunk.id)) {
          neuralRank = 1 / (i + 1);
          break;
        }
      }
      neuralMrr += neuralRank;
    }

    const n = benchmarkSamples.length;

    const baselineMetrics: EvaluationMetrics = {
      sampleCount: n,
      precisionAt1: Number((baseP1 / n).toFixed(4)),
      precisionAt3: Number((baseP3 / n).toFixed(4)),
      recallAt3: Number((baseR3 / n).toFixed(4)),
      mrr: Number((baseMrr / n).toFixed(4)),
      avgLatencyMs: Number((baseLatencyTotal / n).toFixed(1)),
      binaryAccuracy: Number((baseP1 / n).toFixed(4)),
    };

    const neuralRankedMetrics: EvaluationMetrics = {
      sampleCount: n,
      precisionAt1: Number((neuralP1 / n).toFixed(4)),
      precisionAt3: Number((neuralP3 / n).toFixed(4)),
      recallAt3: Number((neuralR3 / n).toFixed(4)),
      mrr: Number((neuralMrr / n).toFixed(4)),
      avgLatencyMs: Number((neuralLatencyTotal / n).toFixed(1)),
      binaryAccuracy: Number((neuralP1 / n).toFixed(4)),
    };

    const mrrImprovementPct = baselineMetrics.mrr > 0
      ? Number((((neuralRankedMetrics.mrr - baselineMetrics.mrr) / baselineMetrics.mrr) * 100).toFixed(2))
      : 0;

    const precisionImprovementPct = baselineMetrics.precisionAt3 > 0
      ? Number((((neuralRankedMetrics.precisionAt3 - baselineMetrics.precisionAt3) / baselineMetrics.precisionAt3) * 100).toFixed(2))
      : 0;

    return {
      baselineMetrics,
      neuralRankedMetrics,
      mrrImprovementPct,
      precisionImprovementPct,
    };
  }

  /**
   * Update memory usefulness tracking based on user feedback.
   */
  public async recordMemoryUtility(
    userId: string,
    memoryId: string,
    wasUseful: boolean
  ): Promise<void> {
    const memory = await dbService.getMemoryById(memoryId, userId);
    if (!memory) return;

    const currentImportance = memory.importance || 3;
    const newImportance = wasUseful
      ? Math.min(5, currentImportance + 1)
      : Math.max(1, currentImportance - 1);

    await dbService.updateMemory(memoryId, userId, {
      importance: newImportance,
    });
  }
}

export const retrievalLearningService = new RetrievalLearningService();
export const retrievalLearning = retrievalLearningService;
