import { IAIService } from './aiService.interface';
import { Message } from '@/types/message';
import {
  SendMessageOptions,
  SendMessageResult,
  StreamChunk,
  FileAnalysisOptions,
  FileAnalysisResult,
} from '@/types/ai';
import { AIProviderNotConfiguredError, AppError } from '@/lib/errors';
import { generateId } from '@/lib/utils';

/**
 * AIService (Phase 2 Full-Stack Client Implementation)
 *
 * Communicates with RIYAI's secure server-side endpoint (/api/chat).
 * Stream tokens progressively via Server-Sent Events (SSE).
 * The client NEVER holds or accesses raw API keys.
 */
export class AIService implements IAIService {
  private endpoint = '/api/chat';

  public async *streamMessage(
    messages: Message[],
    options: SendMessageOptions
  ): AsyncIterable<StreamChunk> {
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: options.conversationId,
          messages,
          modelId: options.modelId,
          temperature: options.temperature,
          systemPrompt: options.systemPrompt,
          relevantMemories: options.relevantMemories,
          conversationSummary: options.conversationSummary,
          userPreferences: options.userPreferences,
          relevantChunks: options.relevantChunks,
          attachedFiles: options.attachedFiles,
        }),
        signal: options.signal,
      });
    } catch (fetchError: unknown) {
      if (options.signal?.aborted) {
        return;
      }
      yield {
        delta: '',
        done: true,
        error: 'Unable to reach the RIYAI backend service. Please check your network connection.',
      };
      return;
    }

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const message =
        errorJson.error ||
        `RIYAI request failed with status ${response.status}. Please try again.`;

      yield {
        delta: '',
        done: true,
        error: message,
      };
      return;
    }

    if (!response.body) {
      yield {
        delta: '',
        done: true,
        error: 'No response stream received from the RIYAI server.',
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) {
            continue;
          }

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { delta: '', done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              yield { delta: '', done: true, error: parsed.error };
              return;
            }
            if (parsed.delta) {
              yield { delta: parsed.delta, done: false };
            }
          } catch {
            // Ignore malformed chunk lines
          }
        }
      }

      yield { delta: '', done: true };
    } catch (readError: unknown) {
      if (options.signal?.aborted) {
        return;
      }
      yield {
        delta: '',
        done: true,
        error: 'Streaming connection was interrupted. Please retry.',
      };
    } finally {
      reader.releaseLock();
    }
  }

  public async sendMessage(
    messages: Message[],
    options: SendMessageOptions
  ): Promise<SendMessageResult> {
    let fullContent = '';
    let errorMessage: string | undefined;

    for await (const chunk of this.streamMessage(messages, options)) {
      if (chunk.error) {
        errorMessage = chunk.error;
        break;
      }
      fullContent += chunk.delta;
    }

    if (errorMessage) {
      throw new AppError(errorMessage, 'INTERNAL_ERROR', 500);
    }

    const resultMessage: Message = {
      id: generateId('msg_ast'),
      conversationId: options.conversationId,
      role: 'assistant',
      content: fullContent,
      createdAt: new Date().toISOString(),
      metadata: {
        model: options.modelId,
        status: 'delivered',
      },
    };

    return { message: resultMessage };
  }

  public async generateTitle(firstMessage: string): Promise<string> {
    const clean = firstMessage.trim().replace(/^["'`#\s]+/, '');
    if (!clean) return 'New Conversation';

    // Fast, lightweight semantic title extraction
    // Removes filler words and creates concise 3-5 word title
    const withoutIntro = clean
      .replace(/^(can you |please |how (do|can) I |what is |explain |tell me about )/i, '')
      .trim();

    const capitalized = withoutIntro.charAt(0).toUpperCase() + withoutIntro.slice(1);
    const words = capitalized.split(/\s+/).slice(0, 5).join(' ');

    return words.length > 38 ? `${words.slice(0, 36)}...` : words;
  }

  public async analyzeFile(options: FileAnalysisOptions): Promise<FileAnalysisResult> {
    throw new AIProviderNotConfiguredError('File Analysis is reserved for Phase 3+');
  }

  public async generateImage(prompt: string): Promise<string> {
    throw new AIProviderNotConfiguredError('Image Generation is reserved for Phase 3+');
  }

  public async transcribeAudio(audioBlob: Blob): Promise<string> {
    throw new AIProviderNotConfiguredError('Audio Transcription is reserved for Phase 3+');
  }
}

export const aiService = new AIService();
