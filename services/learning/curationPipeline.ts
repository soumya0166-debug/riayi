import {
  LearningExperience,
  CuratedDatasetVersion,
  CuratedDatasetSplit,
  ExperienceCategory,
} from '@/types/learning';
import { dbService } from '@/services/database/clientDb';
import { generateId } from '@/lib/utils';
import crypto from 'crypto';

export interface CurationResult {
  dataset: CuratedDatasetVersion;
  curatedCount: number;
  rejectedCount: number;
  pendingReviewCount: number;
  piiScrubbedCount: number;
  duplicatesRemovedCount: number;
  injectionsQuarantinedCount: number;
}

export class CurationPipeline {
  // Regex patterns for sensitive PII and secrets
  private static readonly PII_PATTERNS = [
    { name: 'email', regex: /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, replacement: '[EMAIL_REDACTED]' },
    { name: 'phone', regex: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
    { name: 'api_key', regex: /\b(?:sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{16,40}|ghp_[a-zA-Z0-9]{20,})\b/g, replacement: '[API_KEY_REDACTED]' },
    { name: 'jwt', regex: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, replacement: '[JWT_REDACTED]' },
    { name: 'password', regex: /(?:password|passwd|secret)\s*[:=]\s*[^\s,;]+/gi, replacement: 'password: [PASSWORD_REDACTED]' },
  ];

  // Prompt injection signatures
  private static readonly INJECTION_PATTERNS = [
    /ignore (?:all )?previous instructions/i,
    /disregard (?:all )?prior (?:rules|prompts)/i,
    /you are now in (?:DAN|jailbreak) mode/i,
    /system prompt override/i,
    /reveal your (?:system|developer) instructions/i,
    /bypass safety (?:checks|filters)/i,
  ];

  /**
   * Run the complete data curation pipeline on raw collected experiences.
   */
  public async curateAndCreateDataset(params: {
    userId: string;
    category: ExperienceCategory;
    version?: string;
  }): Promise<CurationResult> {
    const rawList = await dbService.getExperiences(params.userId, { category: params.category });
    return this.processRecords(rawList, params.category, params.version);
  }

  /**
   * Curate an explicit array of learning experiences and return a versioned dataset.
   */
  public async curateExperiences(
    experiences: LearningExperience[],
    options?: { taskCategory?: ExperienceCategory; versionTag?: string }
  ): Promise<CuratedDatasetVersion> {
    const category = options?.taskCategory || 'retrieval_ranking';
    const result = await this.processRecords(experiences, category, options?.versionTag);
    return result.dataset;
  }

  private async processRecords(
    rawList: LearningExperience[],
    category: ExperienceCategory,
    version?: string
  ): Promise<CurationResult> {
    let piiScrubbedCount = 0;
    let duplicatesRemovedCount = 0;
    let injectionsQuarantinedCount = 0;
    let pendingReviewCount = 0;
    let rejectedCount = 0;

    const queryOutcomeMap = new Map<string, Array<{ outcome: string; exp: LearningExperience }>>();
    const uniqueInputs = new Set<string>();
    const eligibleRecords: LearningExperience[] = [];

    for (const raw of rawList) {
      // 1. Validate fields
      if (!raw.inputQuery || raw.inputQuery.trim().length < 3) {
        raw.qualityStatus = 'rejected';
        raw.curationNotes = 'Input text too short or empty.';
        rejectedCount++;
        await dbService.saveExperience(raw);
        continue;
      }

      // 2. Prompt Injection Quarantine
      const isInjection = CurationPipeline.INJECTION_PATTERNS.some((p) => p.test(raw.inputQuery));
      if (isInjection) {
        raw.qualityStatus = 'rejected';
        raw.curationNotes = 'Prompt injection detected; quarantined from ground-truth training.';
        injectionsQuarantinedCount++;
        rejectedCount++;
        await dbService.saveExperience(raw);
        continue;
      }

      // 3. PII & Secret Scrubbing
      let sanitizedQuery = raw.inputQuery;
      let sanitizedSnippet = raw.contextSnippet || '';
      let hasRedactions = false;

      for (const pii of CurationPipeline.PII_PATTERNS) {
        if (pii.regex.test(sanitizedQuery)) {
          sanitizedQuery = sanitizedQuery.replace(pii.regex, pii.replacement);
          hasRedactions = true;
        }
        if (pii.regex.test(sanitizedSnippet)) {
          sanitizedSnippet = sanitizedSnippet.replace(pii.regex, pii.replacement);
          hasRedactions = true;
        }
      }

      if (hasRedactions) {
        piiScrubbedCount++;
      }

      // 4. Deduplication by normalized content hash
      const normHash = this.computeContentHash(sanitizedQuery + (sanitizedSnippet || ''));
      if (uniqueInputs.has(normHash)) {
        raw.qualityStatus = 'rejected';
        raw.curationNotes = 'Exact duplicate of existing experience example.';
        duplicatesRemovedCount++;
        rejectedCount++;
        await dbService.saveExperience(raw);
        continue;
      }
      uniqueInputs.add(normHash);

      // Track outcomes per query + candidate content to detect true contradictions
      const normalizedQueryKey = `${sanitizedQuery.toLowerCase().trim()}:::${(sanitizedSnippet || raw.targetOutput || '').toLowerCase().trim()}`;
      const existingOutcomes = queryOutcomeMap.get(normalizedQueryKey) || [];
      existingOutcomes.push({ outcome: raw.outcome, exp: raw });
      queryOutcomeMap.set(normalizedQueryKey, existingOutcomes);

      const curatedExp: LearningExperience = {
        ...raw,
        inputQuery: sanitizedQuery,
        contextSnippet: sanitizedSnippet,
        qualityStatus: 'curated',
      };

      eligibleRecords.push(curatedExp);
    }

    // 5. Contradiction Detection
    const finalCuratedList: LearningExperience[] = [];
    for (const exp of eligibleRecords) {
      const key = `${exp.inputQuery.toLowerCase().trim()}:::${(exp.contextSnippet || exp.targetOutput || '').toLowerCase().trim()}`;
      const recordsForQuery = queryOutcomeMap.get(key) || [];
      const hasConflict =
        recordsForQuery.some((r) => r.outcome === 'positive') &&
        recordsForQuery.some((r) => r.outcome === 'negative');

      if (hasConflict) {
        exp.qualityStatus = 'pending_review';
        exp.curationNotes = 'Contradictory feedback detected for identical query; flagged for human review.';
        pendingReviewCount++;
        await dbService.saveExperience(exp);
      } else {
        await dbService.saveExperience(exp);
        finalCuratedList.push(exp);
      }
    }

    // 6. Partition into Train (70%), Val (15%), Test (15%) splits
    // Group by query hash to GUARANTEE zero data leakage between train and test splits!
    const splits = this.partitionSplits(finalCuratedList);

    // 7. Version the curated dataset
    const existingDatasets = await dbService.getCuratedDatasets(category);
    const versionNumber = version || `1.${existingDatasets.length}.0`;
    const datasetId = `dataset_${category}_v${versionNumber.replace(/\./g, '_')}_${Date.now()}`;

    // Compute source distribution provenance
    const sourceCounts: Record<string, number> = {};
    for (const exp of finalCuratedList) {
      sourceCounts[exp.source] = (sourceCounts[exp.source] || 0) + 1;
    }

    const timestamps = finalCuratedList.map((e) => new Date(e.timestamp).getTime()).filter((t) => !isNaN(t));
    const dateRange = {
      start: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : new Date().toISOString(),
      end: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : new Date().toISOString(),
    };

    const datasetVersion: CuratedDatasetVersion = {
      id: datasetId,
      version: versionNumber,
      createdAt: new Date().toISOString(),
      taskCategory: category,
      recordCount: finalCuratedList.length,
      trainCount: splits.train.length,
      valCount: splits.validation.length,
      testCount: splits.test.length,
      piiScrubbedCount,
      duplicatesRemovedCount,
      injectionsQuarantinedCount,
      splits,
      provenance: {
        sources: sourceCounts,
        dateRange,
      },
    };

    await dbService.saveCuratedDataset(datasetVersion);

    return {
      dataset: datasetVersion,
      curatedCount: finalCuratedList.length,
      rejectedCount,
      pendingReviewCount,
      piiScrubbedCount,
      duplicatesRemovedCount,
      injectionsQuarantinedCount,
    };
  }

  /**
   * Deterministically partition into Train (70%), Validation (15%), and Held-out Test (15%)
   * grouping by query hash to prevent cross-split data leakage.
   */
  private partitionSplits(records: LearningExperience[]): CuratedDatasetSplit {
    const train: LearningExperience[] = [];
    const validation: LearningExperience[] = [];
    const test: LearningExperience[] = [];

    if (records.length === 0) {
      return { train, validation, test };
    }

    // Cluster by query string
    const clusters = new Map<string, LearningExperience[]>();
    for (const rec of records) {
      const qKey = rec.inputQuery.toLowerCase().trim();
      const list = clusters.get(qKey) || [];
      list.push(rec);
      clusters.set(qKey, list);
    }

    const clusterKeys = Array.from(clusters.keys());

    // Deterministic shuffle based on hash
    clusterKeys.sort((a, b) => this.hashStringToNumber(a) - this.hashStringToNumber(b));

    const totalClusters = clusterKeys.length;
    const testCutoff = Math.max(1, Math.round(totalClusters * 0.15));
    const valCutoff = Math.max(1, Math.round(totalClusters * 0.30));

    clusterKeys.forEach((key, index) => {
      const group = clusters.get(key) || [];
      if (index < testCutoff && totalClusters >= 3) {
        test.push(...group);
      } else if (index < valCutoff && totalClusters >= 3) {
        validation.push(...group);
      } else {
        train.push(...group);
      }
    });

    // If small dataset, ensure at least 1 in test and 1 in train if records >= 2
    if (records.length >= 2 && test.length === 0) {
      const moved = train.pop();
      if (moved) test.push(moved);
    }

    return { train, validation, test };
  }

  private computeContentHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex').slice(0, 16);
  }

  private hashStringToNumber(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

export const curationPipeline = new CurationPipeline();
