import { Message } from './message';
import { ConversationSummary } from './memory';

export interface Conversation {
  id: string;
  userId?: string;
  title: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageSnippet?: string;
  modelId?: string;
  messageCount?: number;
  summaryId?: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
  summary?: ConversationSummary | null;
}
