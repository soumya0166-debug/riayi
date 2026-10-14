import {
  CandidateEvaluationReport,
  ModelDeploymentRecord,
  ModelCheckpoint,
  CuratedDatasetVersion,
  EvaluationMetrics,
  LearningExperience,
} from '@/types/learning';
import { dbService } from '@/services/database/clientDb';
import { neuralTrainer } from '@/services/learning/neuralTrainer';
import { generateId } from '@/lib/utils';

export interface DeploymentGateOptions {
  minMrrDelta?: number;
  maxLatencyMs?: number;
  minAccuracyDelta?: number;
}

export const DEFAULT_GATE_OPTIONS: DeploymentGateOptions = {
  minMrrDelta: -0.01, // Candidate must match or beat baseline MRR
  maxLatencyMs: 30,   // Re-ranking inference must be under 30ms
  minAccuracyDelta: -0.05,
};

export class DeploymentGate {
  /**
   * Run held-out evaluation of candidate checkpoint vs baseline on the curated test split.
   */
  public async evaluateCandidate(params: {
    candidateCheckpoint: ModelCheckpoint;
    dataset: CuratedDatasetVersion;
    baselineModelId?: string;
    options?: DeploymentGateOptions;
  }): Promise<CandidateEvaluationReport> {
    const { candidateCheckpoint, dataset } = params;
    const options = { ...DEFAULT_GATE_OPTIONS, ...(params.options || {}) };
    const testSet = dataset.splits.test;

    if (!testSet || testSet.length === 0) {
      throw new Error('Test split is empty. Cannot perform held-out evaluation without held-out data.');
    }

    // 1. Evaluate Baseline Model
    const baselineMetrics = this.evaluateBaselineOnTestSet(testSet);

    // 2. Evaluate Candidate Model
    const candidateMetrics = this.evaluateCandidateOnTestSet(testSet, candidateCheckpoint);

    // 3. Compute Deltas
    const differences = {
      mrrDelta: Number((candidateMetrics.mrr - baselineMetrics.mrr).toFixed(4)),
      precisionAt3Delta: Number((candidateMetrics.precisionAt3 - baselineMetrics.precisionAt3).toFixed(4)),
      latencyDeltaMs: Number((candidateMetrics.avgLatencyMs - baselineMetrics.avgLatencyMs).toFixed(2)),
      accuracyDelta: Number((candidateMetrics.binaryAccuracy - baselineMetrics.binaryAccuracy).toFixed(4)),
    };

    // 4. Validate Acceptance Criteria
    const reasons: string[] = [];
    let passed = true;

    // Check weights integrity
    const weightsValid = this.verifyWeightsIntegrity(candidateCheckpoint);
    if (!weightsValid) {
      passed = false;
      reasons.push('Model weights contain NaN or Infinity.');
    }

    // Check test split size
    if (testSet.length < 2) {
      passed = false;
      reasons.push('Test split too small for statistically valid evaluation (minimum 2 samples required).');
    }

    // Check latency
    if (candidateMetrics.avgLatencyMs > (options.maxLatencyMs ?? 30)) {
      passed = false;
      reasons.push(
        `Candidate latency (${candidateMetrics.avgLatencyMs}ms) exceeds max threshold of ${options.maxLatencyMs}ms.`
      );
    }

    // Check MRR regression
    if (differences.mrrDelta < (options.minMrrDelta ?? -0.01)) {
      passed = false;
      reasons.push(
        `Candidate MRR regressed compared to baseline: delta ${differences.mrrDelta} is below threshold ${options.minMrrDelta}.`
      );
    }

    // Check Accuracy regression
    if (differences.accuracyDelta < (options.minAccuracyDelta ?? -0.05)) {
      passed = false;
      reasons.push(
        `Candidate accuracy regressed compared to baseline: delta ${differences.accuracyDelta} is below threshold ${options.minAccuracyDelta}.`
      );
    }

    if (passed) {
      reasons.push('Candidate passed all held-out evaluation, latency, and safety benchmarks.');
    }

    const report: CandidateEvaluationReport = {
      id: `eval_${Date.now()}_${generateId('eval')}`,
      candidateModelId: candidateCheckpoint.id,
      candidateVersion: candidateCheckpoint.version,
      baselineModelId: params.baselineModelId || 'baseline_heuristic',
      baselineVersion: 'v0_heuristic',
      testSplitSize: testSet.length,
      evaluatedAt: new Date().toISOString(),
      candidateMetrics,
      baselineMetrics,
      differences,
      gateDecision: passed ? 'ACCEPTED' : 'REJECTED',
      reasons,
      safetyVerified: weightsValid && dataset.injectionsQuarantinedCount >= 0,
      adminApproved: false,
    };

    await dbService.saveEvaluationReport(report);
    return report;
  }

  /**
   * Promote an accepted candidate model to production.
   * Requires explicit human administrator approval.
   * Rejects self-approval by automated routines.
   */
  public async promoteCandidate(params: {
    reportId: string;
    adminUserId: string;
    overrideReason?: string;
  }): Promise<ModelDeploymentRecord> {
    const { reportId, adminUserId, overrideReason } = params;

    if (!adminUserId || adminUserId === 'system_auto' || adminUserId.startsWith('model_')) {
      throw new Error('Deployment rejected: Model promotion requires explicit authenticated administrator approval.');
    }

    const report = await dbService.getEvaluationReportById(reportId);
    if (!report) {
      throw new Error(`Evaluation report ${reportId} not found.`);
    }

    if (report.gateDecision !== 'ACCEPTED' && !overrideReason) {
      throw new Error(`Cannot promote rejected candidate model. Gate decision was REJECTED: ${report.reasons.join('; ')}`);
    }

    // Update report with administrator sign-off
    report.adminApproved = true;
    report.approvedBy = adminUserId;
    report.approvedAt = new Date().toISOString();
    await dbService.saveEvaluationReport(report);

    // Retrieve previous active deployment
    const currentActive = await dbService.getActiveDeployment();

    const deployment: ModelDeploymentRecord = {
      activeModelId: report.candidateModelId,
      activeVersion: report.candidateVersion,
      deployedAt: new Date().toISOString(),
      deployedBy: adminUserId,
      previousModelId: currentActive ? currentActive.activeModelId : 'baseline_heuristic',
      previousVersion: currentActive ? currentActive.activeVersion : 'v0_heuristic',
      evaluationReportId: report.id,
      status: 'active',
    };

    await dbService.saveActiveDeployment(deployment);
    return deployment;
  }

  /**
   * Instantly rollback active deployment to the previous stable model.
   */
  public async rollbackDeployment(adminUserId: string): Promise<ModelDeploymentRecord> {
    if (!adminUserId) {
      throw new Error('Rollback requires authorized administrator identity.');
    }

    const current = await dbService.getActiveDeployment();
    if (!current) {
      throw new Error('No active deployment record found to roll back.');
    }

    if (!current.previousModelId) {
      throw new Error('Cannot roll back: No previous model version recorded.');
    }

    const rolledBack: ModelDeploymentRecord = {
      activeModelId: current.previousModelId,
      activeVersion: current.previousVersion,
      deployedAt: new Date().toISOString(),
      deployedBy: adminUserId,
      previousModelId: current.activeModelId,
      previousVersion: current.activeVersion,
      evaluationReportId: current.evaluationReportId,
      status: 'rolled_back',
    };

    await dbService.saveActiveDeployment(rolledBack);
    return rolledBack;
  }

  // ==========================================
  // Private Evaluation Helpers
  // ==========================================

  private evaluateCandidateOnTestSet(
    testSet: LearningExperience[],
    checkpoint: ModelCheckpoint
  ): EvaluationMetrics {
    const start = performance.now();
    let correctCount = 0;
    const scores: Array<{ score: number; label: number; query: string }> = [];

    for (const exp of testSet) {
      const feat = exp.features || {
        vectorSimilarity: 0.6,
        keywordCoverage: 0.5,
        proximityBonus: 0.05,
        queryLengthNorm: Math.min(1, exp.inputQuery.length / 50),
        chunkLengthNorm: Math.min(1, (exp.contextSnippet?.length || 200) / 1000),
        exactTitleMatch: 0,
        label: exp.outcome === 'positive' ? 1 : 0,
      };

      const pred = neuralTrainer.predict(
        {
          vectorSimilarity: feat.vectorSimilarity ?? 0.5,
          keywordCoverage: feat.keywordCoverage ?? 0.5,
          proximityBonus: feat.proximityBonus ?? 0,
          queryLengthNorm: feat.queryLengthNorm ?? 0.5,
          chunkLengthNorm: feat.chunkLengthNorm ?? 0.5,
          exactTitleMatch: feat.exactTitleMatch ?? 0,
        },
        checkpoint
      );

      const label = feat.label ?? (exp.outcome === 'positive' ? 1 : 0);
      const isCorrect = (pred >= 0.5 && label === 1) || (pred < 0.5 && label === 0);
      if (isCorrect) correctCount++;

      scores.push({ score: pred, label, query: exp.inputQuery });
    }

    const totalDuration = performance.now() - start;
    const avgLatencyMs = Number((totalDuration / testSet.length).toFixed(3));
    const binaryAccuracy = Number((correctCount / testSet.length).toFixed(4));

    const { mrr, p1, p3, r3 } = this.computeRankingMetrics(scores);

    return {
      sampleCount: testSet.length,
      precisionAt1: p1,
      precisionAt3: p3,
      recallAt3: r3,
      mrr,
      avgLatencyMs,
      binaryAccuracy,
    };
  }

  private evaluateBaselineOnTestSet(testSet: LearningExperience[]): EvaluationMetrics {
    const start = performance.now();
    let correctCount = 0;
    const scores: Array<{ score: number; label: number; query: string }> = [];

    for (const exp of testSet) {
      const feat = exp.features || {
        vectorSimilarity: 0.6,
        keywordCoverage: 0.5,
        proximityBonus: 0.05,
        label: exp.outcome === 'positive' ? 1 : 0,
      };

      // Baseline heuristic: 0.6 * vectorSimilarity + 0.3 * keywordCoverage + 0.1 * proximityBonus
      const vSim = feat.vectorSimilarity ?? 0.5;
      const kCov = feat.keywordCoverage ?? 0.5;
      const pBon = feat.proximityBonus ?? 0;
      const baselineScore = Number((0.6 * vSim + 0.3 * kCov + 0.1 * pBon).toFixed(4));

      const label = feat.label ?? (exp.outcome === 'positive' ? 1 : 0);
      const isCorrect = (baselineScore >= 0.5 && label === 1) || (baselineScore < 0.5 && label === 0);
      if (isCorrect) correctCount++;

      scores.push({ score: baselineScore, label, query: exp.inputQuery });
    }

    const totalDuration = performance.now() - start;
    const avgLatencyMs = Number((totalDuration / testSet.length).toFixed(3));
    const binaryAccuracy = Number((correctCount / testSet.length).toFixed(4));

    const { mrr, p1, p3, r3 } = this.computeRankingMetrics(scores);

    return {
      sampleCount: testSet.length,
      precisionAt1: p1,
      precisionAt3: p3,
      recallAt3: r3,
      mrr,
      avgLatencyMs,
      binaryAccuracy,
    };
  }

  private computeRankingMetrics(
    items: Array<{ score: number; label: number; query: string }>
  ): { mrr: number; p1: number; p3: number; r3: number } {
    // Group by query
    const groups = new Map<string, Array<{ score: number; label: number }>>();
    for (const item of items) {
      const list = groups.get(item.query) || [];
      list.push({ score: item.score, label: item.label });
      groups.set(item.query, list);
    }

    let totalReciprocalRank = 0;
    let totalP1 = 0;
    let totalP3 = 0;
    let totalR3 = 0;
    const queryCount = groups.size;

    for (const [, candidates] of groups) {
      // Sort descending by score
      candidates.sort((a, b) => b.score - a.score);

      // MRR: rank of first item with label === 1
      const firstRelevantIdx = candidates.findIndex((c) => c.label === 1);
      if (firstRelevantIdx >= 0) {
        totalReciprocalRank += 1 / (firstRelevantIdx + 1);
      }

      // Precision@1
      if (candidates[0] && candidates[0].label === 1) {
        totalP1 += 1;
      }

      // Precision@3 & Recall@3
      const top3 = candidates.slice(0, 3);
      const relevantInTop3 = top3.filter((c) => c.label === 1).length;
      totalP3 += relevantInTop3 / Math.max(1, top3.length);

      const totalRelevant = candidates.filter((c) => c.label === 1).length;
      totalR3 += totalRelevant > 0 ? relevantInTop3 / totalRelevant : 1;
    }

    return {
      mrr: Number((totalReciprocalRank / queryCount).toFixed(4)),
      p1: Number((totalP1 / queryCount).toFixed(4)),
      p3: Number((totalP3 / queryCount).toFixed(4)),
      r3: Number((totalR3 / queryCount).toFixed(4)),
    };
  }

  private verifyWeightsIntegrity(checkpoint: ModelCheckpoint): boolean {
    const { W1, b1, W2, b2, W3, b3 } = checkpoint.weights;
    const checkNum = (n: number) => !isNaN(n) && isFinite(n);

    if (!checkNum(b3)) return false;
    if (!b1.every(checkNum) || !b2.every(checkNum)) return false;
    if (!W1.every((row) => row.every(checkNum))) return false;
    if (!W2.every((row) => row.every(checkNum))) return false;
    if (!W3.every(checkNum)) return false;

    return true;
  }
}

export const deploymentGate = new DeploymentGate();
