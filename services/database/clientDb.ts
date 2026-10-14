import { IDatabaseService } from './db.interface';
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
import { safeStorage } from '@/lib/storage';
import { STORAGE_KEYS, DEFAULT_PREFERENCES } from '@/lib/constants';
import { generateId } from '@/lib/utils';
import { DEFAULT_MODEL_ID } from '@/config/models';

/**
 * ClientDatabaseService
 *
 * Implements IDatabaseService using browser local storage for Phase 1-3.
 * Enforces user ownership partitioning on all memory and preference queries.
 */
export class ClientDatabaseService implements IDatabaseService {
  public async getConversations(userId?: string): Promise<Conversation[]> {
    if (userId) {
      const userKey = `${STORAGE_KEYS.CONVERSATIONS}_${userId}`;
      const userConvs = safeStorage.get<Conversation[]>(userKey, []);
      if (userConvs.length > 0) {
        return userConvs;
      }
      // Check legacy shared list for any matching this userId
      const shared = safeStorage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
      const matched = shared.filter(
        (c) => c.userId === userId || (!c.userId && userId === 'guest_user_default')
      );
      if (matched.length > 0) {
        safeStorage.set(userKey, matched);
        return matched;
      }
      return [];
    }
    return safeStorage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
  }

  public async getConversationById(id: string, userId?: string): Promise<ConversationDetail | null> {
    const conversations = userId ? await this.getConversations(userId) : await this.getConversations();
    let conv = conversations.find((c) => c.id === id);

    // If not found in user partition, check shared storage
    if (!conv) {
      const shared = safeStorage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
      conv = shared.find((c) => c.id === id);
    }

    if (!conv) return null;

    // Enforce ownership if userId specified
    if (userId && conv.userId && conv.userId !== userId) {
      return null;
    }

    const messages = await this.getMessages(id);
    const summary = await this.getConversationSummary(id);

    return {
      ...conv,
      messages,
      summary,
    };
  }

  public async createConversation(data: {
    title?: string;
    modelId?: string;
    userId?: string;
  }): Promise<Conversation> {
    const userId = data.userId || 'guest_user_default';
    const userConvs = await this.getConversations(userId);
    const newConv: Conversation = {
      id: generateId('conv'),
      userId,
      title: data.title || 'New Conversation',
      modelId: data.modelId || DEFAULT_MODEL_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPinned: false,
      messageCount: 0,
    };

    // Save in user-partitioned storage
    const updatedUserList = [newConv, ...userConvs];
    safeStorage.set(`${STORAGE_KEYS.CONVERSATIONS}_${userId}`, updatedUserList);

    // Also update shared storage for backward compatibility
    const sharedConvs = safeStorage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    safeStorage.set(STORAGE_KEYS.CONVERSATIONS, [newConv, ...sharedConvs.filter((c) => c.id !== newConv.id)]);

    return newConv;
  }

  public async updateConversation(
    id: string,
    data: Partial<Conversation>,
    userId?: string
  ): Promise<Conversation> {
    // 1. Check in user-specific partition if userId provided
    let updatedConv: Conversation | null = null;
    const targetUserId = userId || data.userId;

    if (targetUserId) {
      const userConvs = await this.getConversations(targetUserId);
      const index = userConvs.findIndex((c) => c.id === id);
      if (index !== -1) {
        updatedConv = {
          ...userConvs[index],
          ...data,
          updatedAt: new Date().toISOString(),
        };
        userConvs[index] = updatedConv;
        safeStorage.set(`${STORAGE_KEYS.CONVERSATIONS}_${targetUserId}`, userConvs);
      }
    }

    // 2. Also update in shared storage
    const shared = safeStorage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const sharedIndex = shared.findIndex((c) => c.id === id);
    if (sharedIndex !== -1) {
      // Enforce ownership if userId specified
      if (userId && shared[sharedIndex].userId && shared[sharedIndex].userId !== userId) {
        throw new Error(`Unauthorized: User ${userId} does not own conversation ${id}`);
      }
      updatedConv = {
        ...shared[sharedIndex],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      shared[sharedIndex] = updatedConv;
      safeStorage.set(STORAGE_KEYS.CONVERSATIONS, shared);

      // If user partition wasn't updated yet, update it now
      const effectiveUserId = updatedConv.userId || targetUserId;
      if (effectiveUserId) {
        const uList = safeStorage.get<Conversation[]>(`${STORAGE_KEYS.CONVERSATIONS}_${effectiveUserId}`, []);
        const uIdx = uList.findIndex((c) => c.id === id);
        if (uIdx !== -1) {
          uList[uIdx] = updatedConv;
          safeStorage.set(`${STORAGE_KEYS.CONVERSATIONS}_${effectiveUserId}`, uList);
        } else {
          safeStorage.set(`${STORAGE_KEYS.CONVERSATIONS}_${effectiveUserId}`, [updatedConv, ...uList]);
        }
      }
    }

    if (!updatedConv) {
      throw new Error(`Conversation ${id} not found`);
    }

    return updatedConv;
  }

  public async renameConversation(
    id: string,
    newTitle: string,
    userId?: string
  ): Promise<Conversation> {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      throw new Error('Conversation title cannot be empty.');
    }
    return this.updateConversation(id, { title: trimmed }, userId);
  }

  public async deleteConversation(id: string, userId?: string): Promise<void> {
    // Check ownership if userId provided
    if (userId) {
      const userConvs = await this.getConversations(userId);
      const existsInUser = userConvs.some((c) => c.id === id);
      const shared = safeStorage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
      const sharedConv = shared.find((c) => c.id === id);

      if (sharedConv && sharedConv.userId && sharedConv.userId !== userId) {
        throw new Error(`Unauthorized: Cannot delete conversation belonging to another user.`);
      }

      const filteredUser = userConvs.filter((c) => c.id !== id);
      safeStorage.set(`${STORAGE_KEYS.CONVERSATIONS}_${userId}`, filteredUser);
    }

    // Remove from shared storage
    const conversations = safeStorage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const filtered = conversations.filter((c) => c.id !== id);
    safeStorage.set(STORAGE_KEYS.CONVERSATIONS, filtered);

    // Remove conversation messages and summary
    safeStorage.remove(`${STORAGE_KEYS.MESSAGES_PREFIX}${id}`);
    safeStorage.remove(`${STORAGE_KEYS.SUMMARIES_PREFIX}${id}`);
  }

  public async togglePinConversation(id: string, userId?: string): Promise<boolean> {
    const conv = await this.getConversationById(id, userId);
    if (!conv) return false;

    const nextPin = !conv.isPinned;
    await this.updateConversation(id, { isPinned: nextPin }, userId);
    return nextPin;
  }

  public async getMessages(conversationId: string): Promise<Message[]> {
    return safeStorage.get<Message[]>(`${STORAGE_KEYS.MESSAGES_PREFIX}${conversationId}`, []);
  }

  public async saveMessage(message: Message): Promise<Message> {
    const messages = await this.getMessages(message.conversationId);
    const existingIndex = messages.findIndex((m) => m.id === message.id);

    let updatedMessages: Message[];
    if (existingIndex >= 0) {
      updatedMessages = [...messages];
      updatedMessages[existingIndex] = message;
    } else {
      updatedMessages = [...messages, message];
    }

    safeStorage.set(`${STORAGE_KEYS.MESSAGES_PREFIX}${message.conversationId}`, updatedMessages);

    // Update conversation snippet and count across shared and user-partitioned lists
    const shared = safeStorage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const convIndex = shared.findIndex((c) => c.id === message.conversationId);
    if (convIndex >= 0) {
      shared[convIndex].lastMessageSnippet = message.content.slice(0, 60);
      shared[convIndex].messageCount = updatedMessages.length;
      shared[convIndex].updatedAt = new Date().toISOString();
      safeStorage.set(STORAGE_KEYS.CONVERSATIONS, shared);

      const userId = shared[convIndex].userId;
      if (userId) {
        const userConvs = safeStorage.get<Conversation[]>(`${STORAGE_KEYS.CONVERSATIONS}_${userId}`, []);
        const uIdx = userConvs.findIndex((c) => c.id === message.conversationId);
        if (uIdx >= 0) {
          userConvs[uIdx].lastMessageSnippet = message.content.slice(0, 60);
          userConvs[uIdx].messageCount = updatedMessages.length;
          userConvs[uIdx].updatedAt = new Date().toISOString();
          safeStorage.set(`${STORAGE_KEYS.CONVERSATIONS}_${userId}`, userConvs);
        }
      }
    }

    return message;
  }

  public async deleteMessage(id: string): Promise<void> {
    // In Phase 3, basic cleanup
  }

  public async getUserPreferences(userId: string): Promise<UserPreference> {
    const defaultPref: UserPreference = {
      id: generateId('pref'),
      userId,
      ...DEFAULT_PREFERENCES,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return safeStorage.get<UserPreference>(
      `${STORAGE_KEYS.USER_PREFERENCES}_${userId}`,
      defaultPref
    );
  }

  public async updateUserPreferences(
    userId: string,
    data: Partial<UserPreference>
  ): Promise<UserPreference> {
    const current = await this.getUserPreferences(userId);
    const updated: UserPreference = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    safeStorage.set(`${STORAGE_KEYS.USER_PREFERENCES}_${userId}`, updated);
    return updated;
  }

  // --- User Memory Operations (Phase 3) ---

  public async getMemories(userId: string): Promise<UserMemory[]> {
    if (!userId) return [];
    return safeStorage.get<UserMemory[]>(`${STORAGE_KEYS.MEMORIES_PREFIX}${userId}`, []);
  }

  public async getMemoryById(id: string, userId: string): Promise<UserMemory | null> {
    const memories = await this.getMemories(userId);
    return memories.find((m) => m.id === id && m.userId === userId) || null;
  }

  public async createMemory(
    data: Omit<UserMemory, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<UserMemory> {
    const memories = await this.getMemories(data.userId);
    const newMemory: UserMemory = {
      ...data,
      id: generateId('mem'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [newMemory, ...memories];
    safeStorage.set(`${STORAGE_KEYS.MEMORIES_PREFIX}${data.userId}`, updated);
    return newMemory;
  }

  public async updateMemory(
    id: string,
    userId: string,
    data: Partial<UserMemory>
  ): Promise<UserMemory> {
    const memories = await this.getMemories(userId);
    const index = memories.findIndex((m) => m.id === id && m.userId === userId);
    if (index === -1) {
      throw new Error(`Memory ${id} not found or unauthorized for user ${userId}`);
    }

    const updatedMemory: UserMemory = {
      ...memories[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    memories[index] = updatedMemory;
    safeStorage.set(`${STORAGE_KEYS.MEMORIES_PREFIX}${userId}`, memories);
    return updatedMemory;
  }

  public async deleteMemory(id: string, userId: string): Promise<void> {
    const memories = await this.getMemories(userId);
    const filtered = memories.filter((m) => !(m.id === id && m.userId === userId));
    safeStorage.set(`${STORAGE_KEYS.MEMORIES_PREFIX}${userId}`, filtered);
  }

  public async clearMemories(userId: string): Promise<void> {
    safeStorage.remove(`${STORAGE_KEYS.MEMORIES_PREFIX}${userId}`);
  }

  // --- Conversation Summary Operations (Phase 3) ---

  public async getConversationSummary(
    conversationId: string
  ): Promise<ConversationSummary | null> {
    return safeStorage.get<ConversationSummary | null>(
      `${STORAGE_KEYS.SUMMARIES_PREFIX}${conversationId}`,
      null
    );
  }

  public async saveConversationSummary(
    summary: ConversationSummary
  ): Promise<ConversationSummary> {
    const toSave: ConversationSummary = {
      ...summary,
      updatedAt: new Date().toISOString(),
    };
    safeStorage.set(
      `${STORAGE_KEYS.SUMMARIES_PREFIX}${summary.conversationId}`,
      toSave
    );
    return toSave;
  }

  // --- File and Knowledge Chunk Operations (Phase 4) ---

  public async saveFile(file: StoredFile): Promise<StoredFile> {
    const files = await this.getFiles(file.userId);
    const existingIndex = files.findIndex((f) => f.id === file.id);
    let updated: StoredFile[];
    if (existingIndex >= 0) {
      updated = [...files];
      updated[existingIndex] = { ...file, updatedAt: new Date().toISOString() };
    } else {
      updated = [file, ...files];
    }
    safeStorage.set(`${STORAGE_KEYS.FILES_PREFIX}${file.userId}`, updated);
    return file;
  }

  public async getFile(fileId: string, userId: string): Promise<StoredFile | null> {
    const files = await this.getFiles(userId);
    return files.find((f) => f.id === fileId && f.userId === userId) || null;
  }

  public async getFiles(userId: string, conversationId?: string): Promise<StoredFile[]> {
    const files = safeStorage.get<StoredFile[]>(`${STORAGE_KEYS.FILES_PREFIX}${userId}`, []);
    if (conversationId) {
      return files.filter((f) => f.conversationId === conversationId);
    }
    return files;
  }

  public async updateFile(
    fileId: string,
    userId: string,
    data: Partial<StoredFile>
  ): Promise<StoredFile> {
    const files = await this.getFiles(userId);
    const index = files.findIndex((f) => f.id === fileId && f.userId === userId);
    if (index === -1) {
      throw new Error(`File with id ${fileId} not found for user ${userId}`);
    }
    const updatedFile = {
      ...files[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    files[index] = updatedFile;
    safeStorage.set(`${STORAGE_KEYS.FILES_PREFIX}${userId}`, files);
    return updatedFile;
  }

  public async renameFile(fileId: string, userId: string, newName: string): Promise<StoredFile> {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('File name cannot be empty');
    }
    const updated = await this.updateFile(fileId, userId, { name: trimmed });

    // Propagate the new filename to all chunks belonging to this file
    const allChunks = await this.getAllChunks(userId);
    let chunksUpdated = false;
    const updatedChunks = allChunks.map((chunk) => {
      if (chunk.fileId === fileId && chunk.userId === userId) {
        chunksUpdated = true;
        return { ...chunk, fileName: trimmed };
      }
      return chunk;
    });

    if (chunksUpdated) {
      safeStorage.set(`${STORAGE_KEYS.CHUNKS_PREFIX}${userId}`, updatedChunks);
    }

    return updated;
  }

  public async deleteFile(fileId: string, userId: string): Promise<void> {
    const files = await this.getFiles(userId);
    const filtered = files.filter((f) => !(f.id === fileId && f.userId === userId));
    safeStorage.set(`${STORAGE_KEYS.FILES_PREFIX}${userId}`, filtered);

    // Also automatically delete associated chunks
    await this.deleteChunksByFileId(fileId, userId);
  }

  public async clearFiles(userId: string): Promise<void> {
    safeStorage.remove(`${STORAGE_KEYS.FILES_PREFIX}${userId}`);
    safeStorage.remove(`${STORAGE_KEYS.CHUNKS_PREFIX}${userId}`);
  }

  public async saveChunks(chunks: FileChunk[]): Promise<void> {
    if (!chunks.length) return;
    const userId = chunks[0].userId;
    const existing = await this.getAllChunks(userId);
    const merged = [...chunks, ...existing];
    safeStorage.set(`${STORAGE_KEYS.CHUNKS_PREFIX}${userId}`, merged);
  }

  public async getChunksByFileId(fileId: string, userId: string): Promise<FileChunk[]> {
    const all = await this.getAllChunks(userId);
    return all.filter((c) => c.fileId === fileId && c.userId === userId);
  }

  public async getAllChunks(userId: string): Promise<FileChunk[]> {
    return safeStorage.get<FileChunk[]>(`${STORAGE_KEYS.CHUNKS_PREFIX}${userId}`, []);
  }

  public async deleteChunksByFileId(fileId: string, userId: string): Promise<void> {
    const all = await this.getAllChunks(userId);
    const remaining = all.filter((c) => !(c.fileId === fileId && c.userId === userId));
    safeStorage.set(`${STORAGE_KEYS.CHUNKS_PREFIX}${userId}`, remaining);
  }

  // ==========================================
  // Automation & Agent Task Operations
  // ==========================================

  public async getTasks(userId: string): Promise<AgentTask[]> {
    if (!userId) return [];
    const tasks = safeStorage.get<AgentTask[]>(`${STORAGE_KEYS.TASKS_PREFIX}${userId}`, []);
    return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getTaskById(taskId: string, userId: string): Promise<AgentTask | null> {
    const tasks = await this.getTasks(userId);
    return tasks.find((t) => t.id === taskId && t.userId === userId) || null;
  }

  public async saveTask(task: AgentTask): Promise<AgentTask> {
    const userId = task.userId;
    const tasks = await this.getTasks(userId);
    const existingIndex = tasks.findIndex((t) => t.id === task.id);

    if (existingIndex >= 0) {
      tasks[existingIndex] = { ...task, updatedAt: new Date().toISOString() };
    } else {
      tasks.unshift(task);
    }

    safeStorage.set(`${STORAGE_KEYS.TASKS_PREFIX}${userId}`, tasks);
    return task;
  }

  public async deleteTask(taskId: string, userId: string): Promise<void> {
    const tasks = await this.getTasks(userId);
    const remaining = tasks.filter((t) => !(t.id === taskId && t.userId === userId));
    safeStorage.set(`${STORAGE_KEYS.TASKS_PREFIX}${userId}`, remaining);
  }

  public async clearTasks(userId: string): Promise<void> {
    safeStorage.remove(`${STORAGE_KEYS.TASKS_PREFIX}${userId}`);
  }

  // ==========================================
  // Approval Request Operations
  // ==========================================

  public async getApprovalRequests(userId: string, taskId?: string): Promise<ApprovalRequest[]> {
    if (!userId) return [];
    const approvals = safeStorage.get<ApprovalRequest[]>(`${STORAGE_KEYS.APPROVALS_PREFIX}${userId}`, []);
    let filtered = approvals.filter((a) => a.userId === userId);
    if (taskId) {
      filtered = filtered.filter((a) => a.taskId === taskId);
    }
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getApprovalRequestById(approvalId: string, userId: string): Promise<ApprovalRequest | null> {
    const approvals = await this.getApprovalRequests(userId);
    return approvals.find((a) => a.id === approvalId && a.userId === userId) || null;
  }

  public async saveApprovalRequest(approval: ApprovalRequest): Promise<ApprovalRequest> {
    const userId = approval.userId;
    const approvals = await this.getApprovalRequests(userId);
    const existingIndex = approvals.findIndex((a) => a.id === approval.id);

    if (existingIndex >= 0) {
      approvals[existingIndex] = approval;
    } else {
      approvals.unshift(approval);
    }

    safeStorage.set(`${STORAGE_KEYS.APPROVALS_PREFIX}${userId}`, approvals);
    return approval;
  }

  // ==========================================
  // Workflow Definitions & Runs
  // ==========================================

  public async getWorkflows(userId?: string): Promise<WorkflowDefinition[]> {
    const custom = safeStorage.get<WorkflowDefinition[]>(STORAGE_KEYS.WORKFLOWS, []);
    return custom;
  }

  public async saveWorkflow(workflow: WorkflowDefinition): Promise<WorkflowDefinition> {
    const custom = await this.getWorkflows();
    const existingIndex = custom.findIndex((w) => w.id === workflow.id);
    if (existingIndex >= 0) {
      custom[existingIndex] = workflow;
    } else {
      custom.push(workflow);
    }
    safeStorage.set(STORAGE_KEYS.WORKFLOWS, custom);
    return workflow;
  }

  public async getWorkflowRuns(userId: string): Promise<WorkflowRun[]> {
    if (!userId) return [];
    return safeStorage.get<WorkflowRun[]>(`${STORAGE_KEYS.WORKFLOW_RUNS_PREFIX}${userId}`, []);
  }

  public async saveWorkflowRun(run: WorkflowRun): Promise<WorkflowRun> {
    const userId = run.userId;
    const runs = await this.getWorkflowRuns(userId);
    const existingIndex = runs.findIndex((r) => r.id === run.id);
    if (existingIndex >= 0) {
      runs[existingIndex] = run;
    } else {
      runs.unshift(run);
    }
    safeStorage.set(`${STORAGE_KEYS.WORKFLOW_RUNS_PREFIX}${userId}`, runs);
    return run;
  }

  // ==========================================
  // Learning & Experience Operations
  // ==========================================

  public async saveExperience(experience: LearningExperience): Promise<LearningExperience> {
    const userId = experience.userId;
    const experiences = await this.getExperiences(userId);
    const existingIndex = experiences.findIndex((e) => e.id === experience.id);

    if (existingIndex >= 0) {
      experiences[existingIndex] = experience;
    } else {
      experiences.unshift(experience);
    }

    safeStorage.set(`${STORAGE_KEYS.LEARNING_EXPERIENCES_PREFIX}${userId}`, experiences);
    return experience;
  }

  public async getExperiences(
    userId: string,
    filter?: { category?: ExperienceCategory; status?: QualityStatus }
  ): Promise<LearningExperience[]> {
    if (!userId) return [];
    const list = safeStorage.get<LearningExperience[]>(
      `${STORAGE_KEYS.LEARNING_EXPERIENCES_PREFIX}${userId}`,
      []
    );

    let filtered = list.filter((e) => e.retentionStatus !== 'deleted');
    if (filter?.category) {
      filtered = filtered.filter((e) => e.category === filter.category);
    }
    if (filter?.status) {
      filtered = filtered.filter((e) => e.qualityStatus === filter.status);
    }

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public async getExperienceById(id: string, userId: string): Promise<LearningExperience | null> {
    const list = await this.getExperiences(userId);
    return list.find((e) => e.id === id) || null;
  }

  public async deleteExperience(id: string, userId: string): Promise<void> {
    const list = await this.getExperiences(userId);
    const remaining = list.filter((e) => e.id !== id);
    safeStorage.set(`${STORAGE_KEYS.LEARNING_EXPERIENCES_PREFIX}${userId}`, remaining);
  }

  public async clearExperiences(userId: string): Promise<void> {
    safeStorage.remove(`${STORAGE_KEYS.LEARNING_EXPERIENCES_PREFIX}${userId}`);
  }

  // ==========================================
  // Curated Datasets & Versioning
  // ==========================================

  public async saveCuratedDataset(dataset: CuratedDatasetVersion): Promise<CuratedDatasetVersion> {
    const datasets = await this.getCuratedDatasets();
    const existingIndex = datasets.findIndex((d) => d.id === dataset.id);
    if (existingIndex >= 0) {
      datasets[existingIndex] = dataset;
    } else {
      datasets.unshift(dataset);
    }
    safeStorage.set(STORAGE_KEYS.LEARNING_DATASETS, datasets);
    return dataset;
  }

  public async getCuratedDatasets(category?: ExperienceCategory): Promise<CuratedDatasetVersion[]> {
    const datasets = safeStorage.get<CuratedDatasetVersion[]>(STORAGE_KEYS.LEARNING_DATASETS, []);
    if (category) {
      return datasets.filter((d) => d.taskCategory === category);
    }
    return datasets;
  }

  public async getCuratedDatasetById(id: string): Promise<CuratedDatasetVersion | null> {
    const datasets = await this.getCuratedDatasets();
    return datasets.find((d) => d.id === id) || null;
  }

  // ==========================================
  // Model Checkpoints & Checkpoint Storage
  // ==========================================

  public async saveModelCheckpoint(checkpoint: ModelCheckpoint): Promise<ModelCheckpoint> {
    const checkpoints = await this.getModelCheckpoints();
    const existingIndex = checkpoints.findIndex((c) => c.id === checkpoint.id);
    if (existingIndex >= 0) {
      checkpoints[existingIndex] = checkpoint;
    } else {
      checkpoints.unshift(checkpoint);
    }
    safeStorage.set(STORAGE_KEYS.LEARNING_MODELS, checkpoints);
    return checkpoint;
  }

  public async getModelCheckpoints(task?: string): Promise<ModelCheckpoint[]> {
    const checkpoints = safeStorage.get<ModelCheckpoint[]>(STORAGE_KEYS.LEARNING_MODELS, []);
    if (task) {
      return checkpoints.filter((c) => c.task === task);
    }
    return checkpoints;
  }

  public async getModelCheckpointById(id: string): Promise<ModelCheckpoint | null> {
    const checkpoints = await this.getModelCheckpoints();
    return checkpoints.find((c) => c.id === id) || null;
  }

  // ==========================================
  // Evaluation Reports
  // ==========================================

  public async saveEvaluationReport(report: CandidateEvaluationReport): Promise<CandidateEvaluationReport> {
    const reports = await this.getEvaluationReports();
    const existingIndex = reports.findIndex((r) => r.id === report.id);
    if (existingIndex >= 0) {
      reports[existingIndex] = report;
    } else {
      reports.unshift(report);
    }
    safeStorage.set(STORAGE_KEYS.LEARNING_EVALUATIONS, reports);
    return report;
  }

  public async getEvaluationReports(): Promise<CandidateEvaluationReport[]> {
    return safeStorage.get<CandidateEvaluationReport[]>(STORAGE_KEYS.LEARNING_EVALUATIONS, []);
  }

  public async getEvaluationReportById(id: string): Promise<CandidateEvaluationReport | null> {
    const reports = await this.getEvaluationReports();
    return reports.find((r) => r.id === id) || null;
  }

  // ==========================================
  // Active Deployment Registry & Rollback
  // ==========================================

  public async getActiveDeployment(): Promise<ModelDeploymentRecord | null> {
    return safeStorage.get<ModelDeploymentRecord | null>('riyai_active_model_deployment', null);
  }

  public async saveActiveDeployment(deployment: ModelDeploymentRecord): Promise<ModelDeploymentRecord> {
    safeStorage.set('riyai_active_model_deployment', deployment);
    return deployment;
  }

  // ==========================================
  // Agent Strategy Learning Metrics
  // ==========================================

  public async getStrategyMetrics(): Promise<AgentStrategyMetric[]> {
    return safeStorage.get<AgentStrategyMetric[]>(STORAGE_KEYS.AGENT_STRATEGY_STATS, []);
  }

  public async saveStrategyMetric(metric: AgentStrategyMetric): Promise<AgentStrategyMetric> {
    const metrics = await this.getStrategyMetrics();
    const existingIndex = metrics.findIndex((m) => m.toolName === metric.toolName);
    if (existingIndex >= 0) {
      metrics[existingIndex] = metric;
    } else {
      metrics.push(metric);
    }
    safeStorage.set(STORAGE_KEYS.AGENT_STRATEGY_STATS, metrics);
    return metric;
  }

  // ==========================================
  // Learned Lessons Operations
  // ==========================================

  public async getLearnedLessons(
    userId: string,
    filter?: { status?: LessonStatus; taskType?: string }
  ): Promise<LearnedLesson[]> {
    const key = `${STORAGE_KEYS.LEARNED_LESSONS_PREFIX}${userId}`;
    const lessons = safeStorage.get<LearnedLesson[]>(key, []);
    return lessons.filter((l) => {
      if (filter?.status && l.status !== filter.status) return false;
      if (filter?.taskType && l.taskType !== filter.taskType) return false;
      return true;
    });
  }

  public async getLearnedLessonById(id: string, userId: string): Promise<LearnedLesson | null> {
    const lessons = await this.getLearnedLessons(userId);
    return lessons.find((l) => l.id === id) || null;
  }

  public async saveLearnedLesson(lesson: LearnedLesson): Promise<LearnedLesson> {
    const key = `${STORAGE_KEYS.LEARNED_LESSONS_PREFIX}${lesson.userId}`;
    const lessons = safeStorage.get<LearnedLesson[]>(key, []);
    const existingIndex = lessons.findIndex((l) => l.id === lesson.id);
    if (existingIndex >= 0) {
      lessons[existingIndex] = { ...lesson, updatedAt: new Date().toISOString() };
    } else {
      lessons.unshift(lesson);
    }
    safeStorage.set(key, lessons);
    return lesson;
  }

  public async deleteLearnedLesson(id: string, userId: string): Promise<void> {
    const key = `${STORAGE_KEYS.LEARNED_LESSONS_PREFIX}${userId}`;
    const lessons = safeStorage.get<LearnedLesson[]>(key, []);
    const filtered = lessons.filter((l) => l.id !== id);
    safeStorage.set(key, filtered);
  }

  // ==========================================
  // Adaptive Strategies Operations
  // ==========================================

  public async getAdaptiveStrategies(): Promise<AdaptiveStrategy[]> {
    return safeStorage.get<AdaptiveStrategy[]>(STORAGE_KEYS.ADAPTIVE_STRATEGIES, []);
  }

  public async getAdaptiveStrategyById(id: string): Promise<AdaptiveStrategy | null> {
    const strategies = await this.getAdaptiveStrategies();
    return strategies.find((s) => s.id === id) || null;
  }

  public async saveAdaptiveStrategy(strategy: AdaptiveStrategy): Promise<AdaptiveStrategy> {
    const strategies = await this.getAdaptiveStrategies();
    const existingIndex = strategies.findIndex((s) => s.id === strategy.id);
    if (existingIndex >= 0) {
      strategies[existingIndex] = { ...strategy, lastUpdated: new Date().toISOString() };
    } else {
      strategies.push(strategy);
    }
    safeStorage.set(STORAGE_KEYS.ADAPTIVE_STRATEGIES, strategies);
    return strategy;
  }

  // ==========================================
  // Learning Reports Operations
  // ==========================================

  public async getLearningReports(userId?: string): Promise<LearningReport[]> {
    const reports = safeStorage.get<LearningReport[]>(STORAGE_KEYS.LEARNING_REPORTS, []);
    if (userId) {
      return reports.filter((r) => r.userId === userId || r.userId === 'system_auto');
    }
    return reports;
  }

  public async saveLearningReport(report: LearningReport): Promise<LearningReport> {
    const reports = await this.getLearningReports();
    const existingIndex = reports.findIndex((r) => r.id === report.id);
    if (existingIndex >= 0) {
      reports[existingIndex] = report;
    } else {
      reports.unshift(report);
    }
    safeStorage.set(STORAGE_KEYS.LEARNING_REPORTS, reports);
    return report;
  }
}

export const dbService = new ClientDatabaseService();

