import { IAIProvider } from './provider.interface';
import { geminiProvider } from './geminiProvider';
import { AppError } from '@/lib/errors';

class ProviderRegistry {
  private providers: Map<string, IAIProvider> = new Map();

  constructor() {
    // Gemini is the single centralized AI provider for RIYAI
    this.register(geminiProvider);
  }

  public register(provider: IAIProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  public get(id: string = 'gemini'): IAIProvider {
    // Route all provider requests cleanly to Gemini
    const provider = this.providers.get(id.toLowerCase()) || this.providers.get('gemini');
    if (!provider) {
      throw new AppError(
        'Gemini AI Provider is not registered on this server.',
        'VALIDATION_ERROR',
        500
      );
    }
    return provider;
  }

  public has(id: string): boolean {
    return id.toLowerCase() === 'gemini';
  }
}

export const providerRegistry = new ProviderRegistry();
