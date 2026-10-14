import { Conversation, ConversationDetail } from '@/types/conversation';
import { Message } from '@/types/message';
import { UserPreference } from '@/types/preference';
import { UserMemory, ConversationSummary } from '@/types/memory';
import { StoredFile, FileChunk } from '@/types/attachment';
import { AgentTask, ApprovalRequest, WorkflowDefinition, WorkflowRun } from '@/types/automation';
import {
  LearningExperience,
  CuratedDatasetVersion,
  ModelCheckpoint,
  CandidateEvaluationReport,
  ModelDeploymentRecord,
  AgentStrategyMetric,
  LearnedLesson,
  LessonStatus,
  AdaptiveStrategy,
  LearningReport,
  ExperienceCategory,
  QualityStatus,
} from '@/types/learning';

export interface IDatabaseService {
  // Conversation Operations
  getConversations(userId?: string): Promise<Conversation[]>;
  getConversationById(id: string, userId?: string): Promise<ConversationDetail | null>;
  createConversation(data: { title?: string; modelId?: string; userId?: string }): Promise<Conversation>;
  updateConversation(id: string, data: Partial<Conversation>, userId?: string): Promise<Conversation>;
  renameConversation(id: string, newTitle: string, userId?: string): Promise<Conversation>;
  deleteConversation(id: string, userId?: string): Promise<void>;
  togglePinConversation(id: string, userId?: string): Promise<boolean>;

  // Message Operations
  getMessages(conversationId: string): Promise<Message[]>;
  saveMessage(message: Message): Promise<Message>;
  deleteMessage(id: string): Promise<void>;

  // Preference Operations
  getUserPreferences(userId: string): Promise<UserPreference>;
  updateUserPreferences(userId: string, data: Partial<UserPreference>): Promise<UserPreference>;

  // Memory Operations (Phase 3)
  getMemories(userId: string): Promise<UserMemory[]>;
  getMemoryById(id: string, userId: string): Promise<UserMemory | null>;
  createMemory(data: Omit<UserMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserMemory>;
  updateMemory(id: string, userId: string, data: Partial<UserMemory>): Promise<UserMemory>;
  deleteMemory(id: string, userId: string): Promise<void>;
  clearMemories(userId: string): Promise<void>;

  // Conversation Summary Operations (Phase 3)
  getConversationSummary(conversationId: string): Promise<ConversationSummary | null>;
  saveConversationSummary(summary: ConversationSummary): Promise<ConversationSummary>;

  // File and Knowledge Chunk Operations (Phase 4)
  saveFile(file: StoredFile): Promise<StoredFile>;
  getFile(fileId: string, userId: string): Promise<StoredFile | null>;
  getFiles(userId: string, conversationId?: string): Promise<StoredFile[]>;
  updateFile(fileId: string, userId: string, data: Partial<StoredFile>): Promise<StoredFile>;
  renameFile(fileId: string, userId: string, newName: string): Promise<StoredFile>;
  deleteFile(fileId: string, userId: string): Promise<void>;
  clearFiles(userId: string): Promise<void>;

  saveChunks(chunks: FileChunk[]): Promise<void>;
  getChunksByFileId(fileId: string, userId: string): Promise<FileChunk[]>;
  getAllChunks(userId: string): Promise<FileChunk[]>;
  deleteChunksByFileId(fileId: string, userId: string): Promise<void>;

  // Automation & Agent Operations
  getTasks(userId: string): Promise<AgentTask[]>;
  getTaskById(taskId: string, userId: string): Promise<AgentTask | null>;
  saveTask(task: AgentTask): Promise<AgentTask>;
  deleteTask(taskId: string, userId: string): Promise<void>;
  clearTasks(userId: string): Promise<void>;

  getApprovalRequests(userId: string, taskId?: string): Promise<ApprovalRequest[]>;
  getApprovalRequestById(approvalId: string, userId: string): Promise<ApprovalRequest | null>;
  saveApprovalRequest(approval: ApprovalRequest): Promise<ApprovalRequest>;

  getWorkflows(userId?: string): Promise<WorkflowDefinition[]>;
  saveWorkflow(workflow: WorkflowDefinition): Promise<WorkflowDefinition>;
  getWorkflowRuns(userId: string): Promise<WorkflowRun[]>;
  saveWorkflowRun(run: WorkflowRun): Promise<WorkflowRun>;

  // Learning & Intelligence Operations
  saveExperience(experience: LearningExperience): Promise<LearningExperience>;
  getExperiences(userId: string, filter?: { category?: ExperienceCategory; status?: QualityStatus }): Promise<LearningExperience[]>;
  getExperienceById(id: string, userId: string): Promise<LearningExperience | null>;
  deleteExperience(id: string, userId: string): Promise<void>;
  clearExperiences(userId: string): Promise<void>;

  saveCuratedDataset(dataset: CuratedDatasetVersion): Promise<CuratedDatasetVersion>;
  getCuratedDatasets(category?: ExperienceCategory): Promise<CuratedDatasetVersion[]>;
  getCuratedDatasetById(id: string): Promise<CuratedDatasetVersion | null>;

  saveModelCheckpoint(checkpoint: ModelCheckpoint): Promise<ModelCheckpoint>;
  getModelCheckpoints(task?: string): Promise<ModelCheckpoint[]>;
  getModelCheckpointById(id: string): Promise<ModelCheckpoint | null>;

  saveEvaluationReport(report: CandidateEvaluationReport): Promise<CandidateEvaluationReport>;
  getEvaluationReports(): Promise<CandidateEvaluationReport[]>;
  getEvaluationReportById(id: string): Promise<CandidateEvaluationReport | null>;

  getActiveDeployment(): Promise<ModelDeploymentRecord | null>;
  saveActiveDeployment(deployment: ModelDeploymentRecord): Promise<ModelDeploymentRecord>;

  getStrategyMetrics(): Promise<AgentStrategyMetric[]>;
  saveStrategyMetric(metric: AgentStrategyMetric): Promise<AgentStrategyMetric>;

  // Learned Lessons Operations
  getLearnedLessons(userId: string, filter?: { status?: LessonStatus; taskType?: string }): Promise<LearnedLesson[]>;
  getLearnedLessonById(id: string, userId: string): Promise<LearnedLesson | null>;
  saveLearnedLesson(lesson: LearnedLesson): Promise<LearnedLesson>;
  deleteLearnedLesson(id: string, userId: string): Promise<void>;

  // Adaptive Strategies Operations
  getAdaptiveStrategies(): Promise<AdaptiveStrategy[]>;
  getAdaptiveStrategyById(id: string): Promise<AdaptiveStrategy | null>;
  saveAdaptiveStrategy(strategy: AdaptiveStrategy): Promise<AdaptiveStrategy>;

  // Learning Reports Operations
  getLearningReports(userId?: string): Promise<LearningReport[]>;
  saveLearningReport(report: LearningReport): Promise<LearningReport>;
}

