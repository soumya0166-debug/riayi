/**
 * RIYAAI Self-Learning Intelligence Engine Types
 *
 * Defines experience collection schemas, data curation splits,
 * neural training configurations, evaluation metrics, and deployment gates.
 */

export type ExperienceCategory =
  | 'retrieval_ranking'
  | 'tool_selection'
  | 'response_quality'
  | 'memory_relevance';

export type ExperienceSource =
  | 'user_feedback'
  | 'user_correction'
  | 'task_outcome'
  | 'retrieval_feedback';

export type ExperienceOutcome = 'positive' | 'negative' | 'corrected';

export type QualityStatus = 'raw' | 'curated' | 'rejected' | 'pending_review';

export interface LearningExperience {
  id: string; // exp_<timestamp>_<nanoid>
  userId: string;
  category: ExperienceCategory;
  source: ExperienceSource;
  timestamp: string;
  outcome: ExperienceOutcome;
  qualityStatus: QualityStatus;
  consentStatus: 'consented' | 'opted_out';
  retentionStatus: 'active' | 'archived' | 'deleted';

  // Experience Content
  inputQuery: string;
  contextSnippet?: string;
  targetOutput?: string;
  candidateOutputs?: string[];
  userFeedbackText?: string;
  rating?: number; // 1 to 5 or -1/+1

  // Specific Metadata
  toolName?: string;
  chunkId?: string;
  fileId?: string;
  executionSuccess?: boolean;

  // Feature representation for neural training
  features?: {
    vectorSimilarity?: number;
    keywordCoverage?: number;
    proximityBonus?: number;
    queryLengthNorm?: number;
    chunkLengthNorm?: number;
    exactTitleMatch?: number;
    label: number; // 1 = positive/relevant, 0 = negative/irrelevant
  };

  curationNotes?: string;
}

export interface CuratedDatasetSplit {
  train: LearningExperience[];
  validation: LearningExperience[];
  test: LearningExperience[]; // Held-out evaluation
}

export interface CuratedDatasetVersion {
  id: string; // dataset_v1_...
  version: string; // e.g. '1.0.0'
  createdAt: string;
  taskCategory: ExperienceCategory;
  recordCount: number;
  trainCount: number;
  valCount: number;
  testCount: number;
  piiScrubbedCount: number;
  duplicatesRemovedCount: number;
  injectionsQuarantinedCount: number;
  splits: CuratedDatasetSplit;
  provenance: {
    sources: Record<string, number>;
    dateRange: { start: string; end: string };
  };
}

export interface ModelHyperparameters {
  inputDimension: number;
  hiddenDimension1: number;
  hiddenDimension2: number;
  learningRate: number;
  batchSize: number;
  epochs: number;
  l2Reg: number;
  dropoutRate: number;
  earlyStoppingPatience: number;
}

export interface TrainingLossPoint {
  epoch: number;
  trainLoss: number;
  valLoss: number;
}

export interface ModelCheckpoint {
  id: string; // model_ranker_v1_...
  version: string; // 'v1', 'v2', etc.
  task: 'retrieval_ranking';
  datasetId: string;
  datasetVersion: string;
  hyperparameters: ModelHyperparameters;
  weights: {
    W1: number[][]; // [hidden1, input]
    b1: number[];   // [hidden1]
    W2: number[][]; // [hidden2, hidden1]
    b2: number[];   // [hidden2]
    W3: number[];   // [1, hidden2]
    b3: number;     // scalar bias
  };
  trainHistory: TrainingLossPoint[];
  finalTrainLoss: number;
  finalValLoss: number;
  trainedAt: string;
  trainingDurationMs: number;
}

export interface EvaluationMetrics {
  sampleCount: number;
  precisionAt1: number;
  precisionAt3: number;
  recallAt3: number;
  mrr: number; // Mean Reciprocal Rank
  avgLatencyMs: number;
  binaryAccuracy: number;
}

export interface CandidateEvaluationReport {
  id: string; // eval_...
  candidateModelId: string;
  candidateVersion: string;
  baselineModelId: string;
  baselineVersion: string;
  testSplitSize: number;
  evaluatedAt: string;
  candidateMetrics: EvaluationMetrics;
  baselineMetrics: EvaluationMetrics;
  differences: {
    mrrDelta: number;
    precisionAt3Delta: number;
    latencyDeltaMs: number;
    accuracyDelta: number;
  };
  gateDecision: 'ACCEPTED' | 'REJECTED';
  reasons: string[];
  safetyVerified: boolean;
  adminApproved?: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ModelDeploymentRecord {
  activeModelId: string;
  activeVersion: string;
  deployedAt: string;
  deployedBy: string;
  previousModelId: string;
  previousVersion: string;
  evaluationReportId: string;
  status: 'active' | 'rolled_back';
}

export interface AgentStrategyMetric {
  toolName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  avgLatencyMs: number;
  reliabilityScore: number; // [0.0 - 1.0]
  recentErrors: string[];
}

export type LessonStatus = 'candidate' | 'approved' | 'rejected' | 'rolled_back';

export interface LearnedLesson {
  id: string; // lesson_<timestamp>_<nanoid>
  userId: string;
  title: string;
  taskType: string;
  triggerCondition: string; // e.g., 'When executing document analysis for large PDFs'
  actionRecommendation: string; // e.g., 'Pre-filter by section headers before semantic search'
  confidence: number; // 0.0 to 1.0
  evidenceCount: number;
  supportingExperienceIds: string[];
  source: 'task_success' | 'task_failure' | 'user_correction';
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  isVerified: boolean; // Distinguishes verified fact from unverified conclusion
  rollbackNotes?: string;
}

export interface AdaptiveStrategy {
  id: string; // strat_<id>
  taskType: string;
  name: string;
  description: string;
  preferredToolSequence: string[];
  fallbackToolSequence: string[];
  maxRetries: number;
  timeoutMs: number;
  successCount: number;
  failureCount: number;
  totalExecutions: number;
  winRate: number; // 0.0 to 1.0
  lastUpdated: string;
  isApproved: boolean;
}

export interface ContinuousEvaluationMetrics {
  timestamp: string;
  taskCompletionRate: number; // e.g. 0.95
  errorRate: number;          // e.g. 0.05
  retryRate: number;          // e.g. 0.08
  retrievalMrr: number;       // e.g. 0.88
  lessonAccuracy: number;     // e.g. 0.92
  avgLatencyMs: number;       // e.g. 240
  safetyComplianceRate: number; // 1.0 = 100% compliant
  regressionsDetected: number;
}

export interface LearningReport {
  id: string; // lrep_<timestamp>
  timestamp: string;
  userId: string;
  experiencesReviewed: number;
  candidateLessonsGenerated: number;
  approvedLessonsCount: number;
  recurringErrorsIdentified: Array<{ error: string; count: number; affectedTools: string[] }>;
  strategyUpdates: Array<{ strategyId: string; strategyName: string; winRateDelta: number }>;
  evaluationMetrics: ContinuousEvaluationMetrics;
  requiresUserApproval: boolean;
  approvalRequestId?: string;
  summary: string;
}
