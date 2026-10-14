import OpenAI from 'openai';
import { IAIProvider, StreamChatParams } from './provider.interface';
import { AppError, AIProviderNotConfiguredError } from '@/lib/errors';

export class OpenAIProvider implements IAIProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI';
  private client: OpenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });
    }
  }

  public isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  public async *streamChat(params: StreamChatParams): AsyncIterable<string> {
    if (!this.client || !this.isConfigured()) {
      // Re-check in case env was loaded dynamically
      this.initClient();
    }

    if (!this.client || !this.isConfigured()) {
      throw new AIProviderNotConfiguredError(
        'OpenAI API is not configured. Please define OPENAI_API_KEY in .env.local on the server.'
      );
    }

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: params.model,
          messages: params.messages as any,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 4096,
          stream: true,
        },
        { signal: params.signal }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Normal client-initiated abort
        return;
      }

      if (error instanceof OpenAI.APIError) {
        if (error.status === 401) {
          throw new AppError(
            'RIYAI authentication failed with OpenAI provider. Please verify server API key configuration.',
            'INVALID_CREDENTIALS',
            401
          );
        }
        if (error.status === 429) {
          throw new AppError(
            'RIYAI is currently experiencing high demand with the AI provider (rate limit reached). Please wait a moment and retry.',
            'RATE_LIMITED',
            429
          );
        }
        if (error.status && error.status >= 500) {
          throw new AppError(
            'The AI provider service is temporarily unavailable. Please try again in a few moments.',
            'NETWORK_ERROR',
            503
          );
        }
        throw new AppError(
          error.message || 'An error occurred while communicating with the AI provider.',
          'INTERNAL_ERROR',
          error.status || 500
        );
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'An unexpected error occurred while processing your request.',
        'INTERNAL_ERROR',
        500
      );
    }
  }
}

export const openAIProvider = new OpenAIProvider();
