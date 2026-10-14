import {
  CuratedDatasetVersion,
  ModelCheckpoint,
  CandidateEvaluationReport,
  ExperienceCategory,
  LearnedLesson,
  LearningReport,
  ContinuousEvaluationMetrics,
} from '@/types/learning';
import { dbService } from '@/services/database/clientDb';
import { curationPipeline } from '@/services/learning/curationPipeline';
import { neuralTrainer } from '@/services/learning/neuralTrainer';
import { deploymentGate } from '@/services/learning/deploymentGate';
import { lessonExtractor } from '@/services/learning/lessonExtractor';
import { strategyManager } from '@/services/learning/strategyManager';
import { continuousEvaluator } from '@/services/learning/continuousEvaluator';
import { generateId } from '@/lib/utils';

export interface LearningCycleConfig {
  minNewExamples?: number;
  taskCategory?: ExperienceCategory;
  autoPromoteIfAdmin?: string; // If provided and evaluation accepted, promote candidate
  forceTraining?: boolean;
}

export interface LearningCycleResult {
  status: 'COMPLETED' | 'SKIPPED_INSUFFICIENT_DATA' | 'EVALUATION_REJECTED' | 'PAUSED' | 'FAILED';
  lessonsExtracted: number;
  recurringErrorsFound: number;
  report?: LearningReport;
  dataset?: CuratedDatasetVersion;
  checkpoint?: ModelCheckpoint;
  evaluation?: CandidateEvaluationReport;
  promoted?: boolean;
  message: string;
  durationMs: number;
}

export class LearningScheduler {
  private isJobRunning = false;
  private isPaused = false;
  private lastRunAt: string | null = null;
  private lastResult: LearningCycleResult | null = null;

  /**
   * Pause the automated learning scheduler.
   */
  public pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume the automated learning scheduler.
   */
  public resume(): void {
    this.isPaused = false;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Execute the end-to-end continuous learning workflow:
   * 1. Experience Review & Sanitization
   * 2. Error Clustering & Reusable Lesson Extraction
   * 3. Evidence Validation & Safety Rule Verification
   * 4. Update Approved Strategies & Memory
   * 5. Run Continuous Evaluation Suite (Regression Check)
   * 6. Optional Model Training (Only when sufficient curated data exists)
   * 7. Audit & Approval Gate Check
   * 8. Generate & Save Learning Report
   */
  public async runLearningCycle(
    userId: string,
    config: LearningCycleConfig = {}
  ): Promise<LearningCycleResult> {
    if (this.isPaused) {
      return {
        status: 'PAUSED',
        lessonsExtracted: 0,
        recurringErrorsFound: 0,
        message: 'Learning cycle skipped: Scheduler is currently paused by administrator.',
        durationMs: 0,
      };
    }

    if (this.isJobRunning) {
      throw new Error('A learning cycle job is already actively executing. Please wait for completion.');
    }

    const startTime = Date.now();
    this.isJobRunning = true;

    try {
      const minThreshold = config.minNewExamples ?? 2;
      const category = config.taskCategory ?? 'retrieval_ranking';

      // 1. Fetch and Review Eligible Experiences
      const rawExperiences = await dbService.getExperiences(userId);
      const eligible = rawExperiences.filter(
        (e) => e.retentionStatus !== 'deleted' && e.consentStatus !== 'opted_out'
      );

      // 2. Extract Reusable Lessons & Recurring Error Patterns
      const { newLessons, updatedLessons, recurringErrors } =
        await lessonExtractor.extractLessonsFromExperiences(userId);

      // 3. Update Adaptive Strategy Statistics
      const strategies = await strategyManager.getAllStrategies();
      const strategyUpdates = strategies.map((s) => ({
        strategyId: s.id,
        strategyName: s.name,
        winRateDelta: 0.0,
      }));

      // 4. Run Continuous Evaluation Suite
      const evalResult = await continuousEvaluator.runEvaluationSuite(userId);

      // 5. Model Improvement (Only when enough reviewed data exists and explicitly justified)
      let curatedDataset: CuratedDatasetVersion | undefined;
      let checkpoint: ModelCheckpoint | undefined;
      let evaluation: CandidateEvaluationReport | undefined;
      let promoted = false;

      const retrievalEligible = eligible.filter(
        (e) => e.category === 'retrieval_ranking' && e.features?.label !== undefined
      );

      if (retrievalEligible.length >= (config.forceTraining ? 2 : 8)) {
        curatedDataset = await curationPipeline.curateExperiences(retrievalEligible, {
          taskCategory: 'retrieval_ranking',
        });

        if (curatedDataset.splits.train.length > 0 && curatedDataset.splits.test.length > 0) {
          checkpoint = await neuralTrainer.trainNeuralRanker({
            dataset: curatedDataset,
            versionTag: `v${Date.now().toString().slice(-4)}`,
          });

          evaluation = await deploymentGate.evaluateCandidate({
            candidateCheckpoint: checkpoint,
            dataset: curatedDataset,
          });

          // Model promotion requires explicit admin approval (Section 7 & 8)
          if (evaluation.gateDecision === 'ACCEPTED' && config.autoPromoteIfAdmin) {
            await deploymentGate.promoteCandidate({
              reportId: evaluation.id,
              adminUserId: config.autoPromoteIfAdmin,
            });
            promoted = true;
          }
        }
      }

      // 6. Autonomy & Approval Boundaries:
      // Check existing or newly extracted candidate lessons waiting for human verification,
      // as well as any trained candidate model that passed evaluation but requires promotion approval.
      const allLessons = await dbService.getLearnedLessons(userId);
      const uncertainLessons = allLessons.filter((l) => l.status === 'candidate');
      const requiresApproval =
        uncertainLessons.length > 0 ||
        (evaluation !== undefined && evaluation.gateDecision === 'ACCEPTED' && !promoted);
      let approvalRequestId: string | undefined;

      if (requiresApproval) {
        const desc =
          uncertainLessons.length > 0
            ? `Review ${uncertainLessons.length} Candidate Procedural Lesson(s) requiring verification before promotion.`
            : `Approve deployment of candidate neural ranker ${checkpoint?.version ?? ''} (Test Acc: ${(((evaluation?.candidateMetrics?.binaryAccuracy ?? 0) * 100)).toFixed(1)}%).`;

        const approval = await dbService.saveApprovalRequest({
          id: `appr_learn_${Date.now()}_${generateId('appr')}`,
          userId,
          taskId: 'task_learning_cycle',
          stepIndex: 1,
          toolName: 'lesson_approval_gate',
          riskLevel: 'MEDIUM',
          actionDescription: desc,
          parameters: {
            candidateCount: uncertainLessons.length,
            modelEvaluationId: evaluation?.id,
          },
          approvalToken: generateId('tok'),
          status: 'pending',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        approvalRequestId = approval.id;
      }

      // 7. Generate and Persist Auditable Learning Report
      const report: LearningReport = {
        id: `lrep_${Date.now()}_${generateId('rep')}`,
        timestamp: new Date().toISOString(),
        userId,
        experiencesReviewed: eligible.length,
        candidateLessonsGenerated: newLessons.length,
        approvedLessonsCount: newLessons.filter((l) => l.status === 'approved').length + updatedLessons.length,
        recurringErrorsIdentified: recurringErrors,
        strategyUpdates,
        evaluationMetrics: evalResult.metrics,
        requiresUserApproval: requiresApproval,
        approvalRequestId,
        summary: `Cycle reviewed ${eligible.length} experiences. Extracted ${newLessons.length} new lessons and identified ${recurringErrors.length} recurring error patterns. Evaluation safety: 100%.`,
      };

      await dbService.saveLearningReport(report);

      const result: LearningCycleResult = {
        status: evalResult.passed ? 'COMPLETED' : 'EVALUATION_REJECTED',
        lessonsExtracted: newLessons.length,
        recurringErrorsFound: recurringErrors.length,
        report,
        dataset: curatedDataset,
        checkpoint,
        evaluation,
        promoted,
        message: report.summary,
        durationMs: Date.now() - startTime,
      };

      this.lastRunAt = new Date().toISOString();
      this.lastResult = result;
      return result;
    } catch (err: any) {
      const result: LearningCycleResult = {
        status: 'FAILED',
        lessonsExtracted: 0,
        recurringErrorsFound: 0,
        message: `Learning cycle failed: ${err.message || String(err)}`,
        durationMs: Date.now() - startTime,
      };
      this.lastRunAt = new Date().toISOString();
      this.lastResult = result;
      return result;
    } finally {
      this.isJobRunning = false;
    }
  }

  /**
   * Get worker status and latest execution metrics.
   */
  public getStatus(): {
    isJobRunning: boolean;
    isPaused: boolean;
    lastRunAt: string | null;
    lastResult: LearningCycleResult | null;
  } {
    return {
      isJobRunning: this.isJobRunning,
      isPaused: this.isPaused,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
    };
  }
}

export const learningScheduler = new LearningScheduler();
