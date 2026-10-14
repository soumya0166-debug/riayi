import { Message } from './message';
import { UserMemory, ConversationSummary } from './memory';
import { UserPreference } from './preference';
import { FileChunk, StoredFile } from './attachment';

export interface AIModel {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'gemini' | 'ollama' | 'custom';
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  isDefault?: boolean;
  badge?: string;
}

export interface SendMessageOptions {
  conversationId: string;
  modelId?: string;
  temperature?: number;
  systemPrompt?: string;
  signal?: AbortSignal;
  relevantMemories?: UserMemory[];
  conversationSummary?: ConversationSummary | null;
  userPreferences?: UserPreference | null;
  relevantChunks?: FileChunk[];
  attachedFiles?: StoredFile[];
}

export interface SendMessageResult {
  message: Message;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  error?: string;
  fallbackNotice?: string;
  activeProvider?: string;
  activeModel?: string;
}

export interface FileAnalysisOptions {
  file: File | Blob;
  instruction?: string;
}

export interface FileAnalysisResult {
  summary: string;
  extractedText?: string;
  insights?: string[];
}
