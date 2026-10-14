import { Attachment, SourceReference } from './attachment';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageMetadata {
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  status?: 'pending' | 'delivered' | 'error' | 'phase1_architectural';
  errorMessage?: string;
  fallbackNotice?: string;
  feedback?: 'positive' | 'negative' | null;
  sources?: SourceReference[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  updatedAt?: string;
  attachments?: Attachment[];
  metadata?: MessageMetadata;
}
