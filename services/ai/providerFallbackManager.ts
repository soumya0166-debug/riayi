import { QuotaExhaustedError, ProviderUnavailableError } from '@/lib/errors';
import { formatSecondsToHumanReadable } from './providers/geminiErrorClassifier';

export interface ProviderCircuitState {
  isHealthy: boolean;
  cooldownUntil: number; // timestamp in ms
  lastFailureTime?: number;
  failureCount: number;
  errorType?: 'daily_quota' | 'rpm_limit' | 'transient' | 'auth';
  retryDelaySeconds?: number;
  reason?: string;
}

export interface FallbackResolutionResult {
  canFallback: boolean;
  error?: string;
}

/**
 * Provider Circuit Manager: Tracks health and rate limits for Gemini without any secondary or local fallback providers.
 */
export class ProviderFallbackManager {
  private static instance: ProviderFallbackManager;
  private circuitStates: Map<string, ProviderCircuitState> = new Map();

  private constructor() {
    this.initProvider('gemini');
  }

  public static getInstance(): ProviderFallbackManager {
    if (!ProviderFallbackManager.instance) {
      ProviderFallbackManager.instance = new ProviderFallbackManager();
    }
    return ProviderFallbackManager.instance;
  }

  private initProvider(id: string) {
    if (!this.circuitStates.has(id)) {
      this.circuitStates.set(id, {
        isHealthy: true,
        cooldownUntil: 0,
        failureCount: 0,
      });
    }
  }

  /**
   * Check if provider is available and not in rate-limit cooldown.
   */
  public isProviderAvailable(providerId: string = 'gemini'): {
    available: boolean;
    cooldownRemainingSec?: number;
    reason?: string;
  } {
    const state = this.circuitStates.get(providerId);
    if (!state) return { available: true };

    const now = Date.now();
    if (state.cooldownUntil > now) {
      const remainingSec = Math.ceil((state.cooldownUntil - now) / 1000);
      return {
        available: false,
        cooldownRemainingSec: remainingSec,
        reason: state.reason || `Gemini is in cooldown for ${formatSecondsToHumanReadable(remainingSec)}.`,
      };
    }

    if (!state.isHealthy && state.cooldownUntil <= now) {
      state.isHealthy = true;
      state.cooldownUntil = 0;
      state.failureCount = 0;
      state.reason = undefined;
    }

    return { available: true };
  }

  /**
   * Record a provider failure.
   */
  public recordFailure(providerId: string = 'gemini', error: unknown): void {
    this.initProvider(providerId);
    const state = this.circuitStates.get(providerId)!;
    const now = Date.now();
    state.lastFailureTime = now;
    state.failureCount += 1;

    if (error instanceof QuotaExhaustedError) {
      const delaySec = error.retryAfterSeconds || (error.exhaustionType === 'daily_limit' ? 68905 : 60);
      state.isHealthy = false;
      state.cooldownUntil = now + delaySec * 1000;
      state.retryDelaySeconds = delaySec;
      state.errorType = error.exhaustionType === 'daily_limit' ? 'daily_quota' : 'rpm_limit';
      state.reason = error.message;
      return;
    }

    if (error instanceof ProviderUnavailableError) {
      state.isHealthy = false;
      state.cooldownUntil = now + 30 * 1000;
      state.retryDelaySeconds = 30;
      state.errorType = 'transient';
      state.reason = error.message;
      return;
    }

    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      const defaultDelay = 68905;
      state.isHealthy = false;
      state.cooldownUntil = now + defaultDelay * 1000;
      state.retryDelaySeconds = defaultDelay;
      state.errorType = 'daily_quota';
      state.reason = 'Gemini daily request quota exhausted.';
      return;
    }

    if (state.failureCount >= 3) {
      state.isHealthy = false;
      state.cooldownUntil = now + 60 * 1000;
      state.reason = msg;
    }
  }

  /**
   * Record a successful provider call to clear failure counters.
   */
  public recordSuccess(providerId: string = 'gemini'): void {
    const state = this.circuitStates.get(providerId);
    if (state) {
      state.isHealthy = true;
      state.cooldownUntil = 0;
      state.failureCount = 0;
      state.reason = undefined;
      state.errorType = undefined;
    }
  }

  /**
   * Reset circuit state (useful for testing or manual retry).
   */
  public resetCircuit(providerId?: string): void {
    if (providerId) {
      this.initProvider(providerId);
      const state = this.circuitStates.get(providerId)!;
      state.isHealthy = true;
      state.cooldownUntil = 0;
      state.failureCount = 0;
      state.reason = undefined;
      state.errorType = undefined;
    } else {
      for (const key of this.circuitStates.keys()) {
        this.resetCircuit(key);
      }
    }
  }

  /**
   * No fallback providers are permitted. Always returns canFallback: false.
   */
  public async resolveFallback(
    _failedProviderId?: string,
    _preferredLocalModel?: string
  ): Promise<FallbackResolutionResult> {
    return {
      canFallback: false,
      error: 'No secondary or fallback model is configured. All requests route solely to Google Gemini.',
    };
  }
}

export const fallbackManager = ProviderFallbackManager.getInstance();
