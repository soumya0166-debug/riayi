/**
 * RIYAI Phase 4: Dataset Upload, Model Fine-Tuning & Integration Types
 */

export type DatasetFormat = 'instruction' | 'chat' | 'cot' | 'csv_custom';

export type DatasetTaskType =
  | 'reasoning'
  | 'general'
  | 'chat'
  | 'coding'
  | 'mathematical_reasoning'
  | 'general_instruction'
  | 'code_generation'
  | 'multi_turn_chat';

export type DatasetSplitName = 'train' | 'val' | 'test';

export interface DatasetRecord {
  id: string;
  // Instruction format
  instruction?: string;
  input?: string;
  output?: string;
  // Chat format
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  // OpenMathReasoning / CoT format
  problem?: string;
  generated_solution?: string;
  expected_answer?: string;
  // Metadata & split assignment
  split?: DatasetSplitName;
  tokenCountEst?: number;
  [key: string]: unknown;
}

export interface CSVColumnMapping {
  promptColumn: string;
  inputColumn?: string;
  outputColumn: string;
  splitColumn?: string;
}

export interface DatasetStats {
  totalRecords: number;
  trainRecords: number;
  valRecords: number;
  testRecords: number;
  duplicatesRemoved: number;
  missingFieldsCount: number;
  avgLengthChars: number;
  totalTokensEst: number;
}

export interface DatasetMetadata {
  id: string;
  name: string;
  description: string;
  taskType: DatasetTaskType;
  format: DatasetFormat;
  version: number;
  recordCount: number;
  stats: DatasetStats;
  source: 'uploaded' | 'imported_math' | 'custom';
  originalFileName?: string;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export type TrainingStatus =
  | 'dataset_validation'
  | 'training_preparation'
  | 'training_in_progress'
  | 'evaluation_in_progress'
  | 'completed'
  | 'failed';

export type SupportedBaseModel =
  | 'Qwen/Qwen2.5-0.5B-Instruct'
  | 'Qwen/Qwen2.5-1.5B-Instruct'
  | 'Qwen/Qwen2.5-3B-Instruct'
  | 'Qwen/Qwen2.5-7B-Instruct';

export interface TrainingHyperparameters {
  baseModel: SupportedBaseModel;
  epochs: number;
  learningRate: number;
  batchSize: number;
  gradientAccumulationSteps: number;
  loraRank: number;
  loraAlpha: number;
  loraDropout: number;
  maxSequenceLength: number;
  targetModules: string[];
  quantization: '4bit' | '8bit' | 'none';
  useGradientCheckpointing: boolean;
  warmupRatio: number;
  weightDecay: number;
}

export interface TrainingMetricPoint {
  step: number;
  epoch: number;
  trainLoss?: number;
  valLoss?: number;
  learningRate?: number;
  timestamp: string;
}

export interface TrainingRunMetrics {
  currentEpoch: number;
  totalEpochs: number;
  currentStep: number;
  totalSteps: number;
  currentTrainLoss?: number;
  currentValLoss?: number;
  bestValLoss?: number;
  elapsedTimeSec: number;
  estimatedRemainingSec?: number;
  progressPct: number;
}

export interface TrainingArtifacts {
  adapterDir?: string;
  modelfile?: string;
  notebookFilename?: string;
  notebookDownloadUrl?: string;
  datasetDownloadUrl?: string;
  ollamaModelName?: string;
  evaluationReportId?: string;
}

export interface TrainingRun {
  id: string;
  name: string;
  datasetId: string;
  datasetName: string;
  status: TrainingStatus;
  hyperparameters: TrainingHyperparameters;
  metrics: TrainingRunMetrics;
  lossHistory: TrainingMetricPoint[];
  artifacts: TrainingArtifacts;
  errorDetails?: string;
  logs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelComparisonSample {
  index: number;
  id: string;
  problem: string;
  expectedAnswer: string;
  baseModelPrediction?: string;
  baseModelPassed: boolean;
  baseModelLatencySec: number;
  finetunedPrediction?: string;
  finetunedPassed: boolean;
  finetunedLatencySec: number;
  isEquivalent: boolean;
  comparisonRationale?: string;
}

export interface ModelEvaluationReport {
  id: string;
  runId?: string;
  baseModelName: string;
  finetunedModelName: string;
  testSampleCount: number;
  baseExactMatchAcc: number;
  finetunedExactMatchAcc: number;
  effectiveFinetunedAcc: number;
  accuracyImprovementPct: number;
  baseAvgLatencySec: number;
  finetunedAvgLatencySec: number;
  unreliableSymbolicCount: number;
  evaluatedAt: string;
  samples: ModelComparisonSample[];
}

export interface OllamaServiceStatus {
  isAvailable: boolean;
  endpoint: string;
  version?: string;
  installedModels: Array<{
    name: string;
    sizeBytes: number;
    parameterSize: string;
    quantizationLevel: string;
    modifiedAt: string;
  }>;
  activeModel?: string;
  errorMessage?: string;
}
