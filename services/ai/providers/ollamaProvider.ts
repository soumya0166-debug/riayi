import { IAIProvider, StreamChatParams, MessageContentPart } from './provider.interface';
import { AppError } from '@/lib/errors';

export class OllamaProvider implements IAIProvider {
  public readonly id = 'ollama';
  public readonly name = 'Ollama (Local)';
  private baseUrl: string;

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    if (url && typeof url === 'string') {
      this.baseUrl = url.trim().replace(/\/+$/, '');
    }
  }

  public isConfigured(): boolean {
    return true; // Local service doesn't require cloud API keys
  }

  /**
   * Health check to test if Ollama server is currently running.
   */
  public async checkHealth(): Promise<{ isOnline: boolean; version?: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/api/version`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return { isOnline: true, version: data.version };
      }
      return { isOnline: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isOnline: false, error: msg };
    }
  }

  /**
   * List locally installed models from Ollama
   */
  public async listModels(): Promise<Array<{
    name: string;
    sizeBytes: number;
    parameterSize: string;
    quantizationLevel: string;
    modifiedAt: string;
  }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }
      return data.models.map((m: any) => ({
        name: m.name,
        sizeBytes: m.size || 0,
        parameterSize: m.details?.parameter_size || 'Unknown',
        quantizationLevel: m.details?.quantization_level || 'Unknown',
        modifiedAt: m.modified_at || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  public async *streamChat(params: StreamChatParams): AsyncIterable<string> {
    // 1. Convert messages to Ollama format, filtering out any empty turns
    const formattedMessages = params.messages
      .map((msg) => {
        let textContent = '';
        const images: string[] = [];

        if (typeof msg.content === 'string') {
          textContent = msg.content.trim();
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'text' && part.text?.trim()) {
              textContent += (textContent ? ' ' : '') + part.text.trim();
            } else if (part.type === 'image_url') {
              // Check if base64 data url
              const match = part.image_url.url.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
              if (match) {
                images.push(match[1]);
              }
            }
          }
        }

        const out: any = {
          role: msg.role,
          content: textContent,
        };
        if (images.length > 0) {
          out.images = images;
        }
        return out;
      })
      .filter((m) => m.content.length > 0 || (m.images && m.images.length > 0));

    if (formattedMessages.length === 0) {
      formattedMessages.push({ role: 'user', content: 'Hello' });
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          messages: formattedMessages,
          stream: true,
          options: {
            temperature: params.temperature ?? 0.7,
            num_predict: params.maxTokens ?? 4096,
          },
        }),
        signal: params.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      throw new AppError(
        `Failed to connect to local Ollama inference server at ${this.baseUrl}. Please ensure Ollama is running ("ollama serve").`,
        'NETWORK_ERROR',
        503
      );
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 404) {
        throw new AppError(
          `Model "${params.model}" is not installed in local Ollama. Please run "ollama pull ${params.model}" or import your fine-tuned model.`,
          'NOT_FOUND',
          404
        );
      }
      throw new AppError(
        `Ollama inference error (${response.status}): ${errText || response.statusText}`,
        'INTERNAL_ERROR',
        response.status
      );
    }

    if (!response.body) {
      throw new AppError('Ollama response body is empty.', 'INTERNAL_ERROR', 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
            if (parsed.done) {
              return;
            }
          } catch {
            // Incomplete JSON chunk, skip to next
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } catch {
          // ignore trailing invalid chunk
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const ollamaProvider = new OllamaProvider();
