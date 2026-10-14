import { Message } from '@/types/message';
import {
  SendMessageOptions,
  SendMessageResult,
  StreamChunk,
  FileAnalysisOptions,
  FileAnalysisResult,
} from '@/types/ai';

export interface IAIService {
  /**
   * Send a complete message to the AI model and await full completion.
   * Phase 1: Throws AIProviderNotConfiguredError.
   */
  sendMessage(
    messages: Message[],
    options: SendMessageOptions
  ): Promise<SendMessageResult>;

  /**
   * Stream token chunks progressively from the AI provider.
   * Phase 1: Yields error chunk informing caller of Phase 1 architectural state.
   */
  streamMessage(
    messages: Message[],
    options: SendMessageOptions
  ): AsyncIterable<StreamChunk>;

  /**
   * Automatically generate a succinct title from initial conversation messages.
   */
  generateTitle(firstMessage: string): Promise<string>;

  /**
   * Analyze an uploaded document, image, or audio file.
   */
  analyzeFile(options: FileAnalysisOptions): Promise<FileAnalysisResult>;

  /**
   * Generate an image from a prompt.
   */
  generateImage(prompt: string, options?: { size?: string }): Promise<string>;

  /**
   * Transcribe an audio recording into text.
   */
  transcribeAudio(audioBlob: Blob): Promise<string>;
}
