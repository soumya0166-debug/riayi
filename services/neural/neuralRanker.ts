import { ChunkSearchResult, FileChunk } from '@/types/attachment';
import { embeddingService } from '@/services/knowledge/embeddingService';

export interface RankedChunkResult extends ChunkSearchResult {
  neuralScore: number;
  originalScore: number;
  coverageRatio: number;
  rankDiagnostics: {
    vectorSimilarity: number;
    keywordCoverage: number;
    proximityBonus: number;
  };
}

export class NeuralRanker {
  /**
   * Re-rank candidate chunks using a multi-factor neural semantic scoring heuristic.
   * Boosts passages that demonstrate dense semantic alignment and close term proximity.
   */
  public async rankChunks(
    query: string,
    candidates: Array<ChunkSearchResult | FileChunk>,
    options?: {
      limit?: number;
      minScore?: number;
    }
  ): Promise<RankedChunkResult[]> {
    if (!query || !candidates.length) return [];

    const cleanQuery = query.trim().toLowerCase();
    const queryTokens = cleanQuery
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const queryVec = await embeddingService.generateEmbedding(query);

    const scored: RankedChunkResult[] = [];

    for (const item of candidates) {
      const chunk = 'chunk' in item ? item.chunk : item;
      const originalScore = 'relevanceScore' in item ? item.relevanceScore : 0.5;
      const sourceReference =
        'sourceReference' in item
          ? item.sourceReference
          : `${chunk.fileName} — Chunk ${chunk.chunkIndex + 1}`;

      const chunkContent = chunk.content || '';
      const lowerContent = chunkContent.toLowerCase();

      // 1. Neural Vector Similarity
      let vectorSim = 0;
      if (chunk.embedding && chunk.embedding.length > 0) {
        vectorSim = embeddingService.calculateCosineSimilarity(queryVec, chunk.embedding);
      } else {
        const chunkVec = await embeddingService.generateEmbedding(chunkContent.slice(0, 500));
        vectorSim = embeddingService.calculateCosineSimilarity(queryVec, chunkVec);
      }

      // 2. Query Term Coverage Ratio
      let matchedCount = 0;
      const matchedPositions: number[] = [];

      for (const token of queryTokens) {
        const pos = lowerContent.indexOf(token);
        if (pos !== -1) {
          matchedCount++;
          matchedPositions.push(pos);
        }
      }

      const coverageRatio = queryTokens.length > 0 ? matchedCount / queryTokens.length : 0.5;

      // 3. Positional Proximity Bonus (terms appearing within 200 chars of each other)
      let proximityBonus = 0;
      if (matchedPositions.length >= 2) {
        matchedPositions.sort((a, b) => a - b);
        const span = matchedPositions[matchedPositions.length - 1] - matchedPositions[0];
        if (span < 250) {
          proximityBonus = 0.15;
        } else if (span < 500) {
          proximityBonus = 0.08;
        }
      }

      // 4. Combined Calibrated Neural Score
      // 55% dense vector similarity, 30% coverage ratio, 15% proximity bonus
      const rawNeuralScore =
        vectorSim * 0.55 +
        coverageRatio * 0.30 +
        proximityBonus;

      const normalizedNeuralScore = Number(Math.max(0, Math.min(1, rawNeuralScore)).toFixed(4));

      scored.push({
        chunk,
        relevanceScore: normalizedNeuralScore,
        sourceReference,
        neuralScore: normalizedNeuralScore,
        originalScore,
        coverageRatio,
        rankDiagnostics: {
          vectorSimilarity: Number(vectorSim.toFixed(4)),
          keywordCoverage: Number(coverageRatio.toFixed(4)),
          proximityBonus,
        },
      });
    }

    // Sort descending by neural score
    scored.sort((a, b) => b.neuralScore - a.neuralScore);

    const minScore = options?.minScore ?? 0.1;
    const filtered = scored.filter((s) => s.neuralScore >= minScore);

    const limit = options?.limit ?? 5;
    return filtered.slice(0, limit);
  }
}

export const neuralRanker = new NeuralRanker();
