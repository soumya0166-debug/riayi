export type MemoryType =
  | 'preference'
  | 'project'
  | 'instruction'
  | 'context'
  | 'goal'
  | 'fact';

export interface UserMemory {
  id: string;
  userId: string;
  memoryType: MemoryType;
  content: string;
  importance: number; // 1 to 5 (5 highest importance)
  sourceConversationId?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  conversationId: string;
  userId?: string;
  summary: string;
  keyTopics: string[];
  importantDecisions: string[];
  unresolvedQuestions: string[];
  messageCount?: number;
  lastMessageId?: string;
  updatedAt: string;
}

export interface MemorySearchResult {
  memory: UserMemory;
  relevanceScore: number;
}

export interface MemoryCandidate {
  shouldRemember: boolean;
  memoryType?: MemoryType;
  content?: string;
  importance?: number;
  reason?: string;
}

export interface ExplicitMemoryCommandResult {
  isCommand: boolean;
  action?: 'remember' | 'forget' | 'list' | 'clear';
  targetContent?: string;
  feedbackMessage?: string;
  memory?: UserMemory;
}
