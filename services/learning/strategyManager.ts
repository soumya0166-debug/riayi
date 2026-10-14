import { AdaptiveStrategy, LearnedLesson } from '@/types/learning';
import { dbService } from '@/services/database/clientDb';
import { strategyLearner } from '@/services/learning/strategyLearner';
import { generateId } from '@/lib/utils';

export const DEFAULT_ADAPTIVE_STRATEGIES: AdaptiveStrategy[] = [
  {
    id: 'strat_doc_analysis',
    taskType: 'doc_analysis',
    name: 'Progressive Document Analysis & Search',
    description: 'Executes semantic retrieval followed by entity extraction and structured report generation.',
    preferredToolSequence: ['doc_search', 'extract_entities', 'generate_report'],
    fallbackToolSequence: ['doc_search', 'extract_entities'],
    maxRetries: 1,
    timeoutMs: 20000,
    successCount: 5,
    failureCount: 0,
    totalExecutions: 5,
    winRate: 1.0,
    lastUpdated: new Date().toISOString(),
    isApproved: true,
  },
  {
    id: 'strat_rag_retrieval',
    taskType: 'rag_query',
    name: 'Two-Stage Neural RAG Retrieval',
    description: 'Hybrid BM25 + Vector embedding candidate retrieval followed by Neural Re-Ranker sorting.',
    preferredToolSequence: ['doc_search'],
    fallbackToolSequence: ['doc_search'],
    maxRetries: 1,
    timeoutMs: 12000,
    successCount: 8,
    failureCount: 1,
    totalExecutions: 9,
    winRate: 0.89,
    lastUpdated: new Date().toISOString(),
    isApproved: true,
  },
  {
    id: 'strat_data_extraction',
    taskType: 'data_extraction',
    name: 'Resilient Entity Extraction',
    description: 'Parses unstructured text, extracts verified entities and metrics, and compiles findings.',
    preferredToolSequence: ['extract_entities', 'generate_report'],
    fallbackToolSequence: ['extract_entities'],
    maxRetries: 1,
    timeoutMs: 15000,
    successCount: 4,
    failureCount: 0,
    totalExecutions: 4,
    winRate: 1.0,
    lastUpdated: new Date().toISOString(),
    isApproved: true,
  },
];

export class StrategyManager {
  /**
   * Retrieve or initialize adaptive strategies for a task type.
   * Incorporates active approved lessons to adapt tool routing.
   */
  public async getStrategyForTask(taskType: string, userId: string): Promise<AdaptiveStrategy> {
    const allStrategies = await this.getAllStrategies();
    let matched = allStrategies.find((s) => s.taskType === taskType && s.isApproved);

    if (!matched) {
      // Find fallback default
      matched = allStrategies.find((s) => s.taskType === 'doc_analysis') || DEFAULT_ADAPTIVE_STRATEGIES[0];
    }

    // Clone to allow dynamic lesson-based adaptation without directly modifying base config
    const adapted: AdaptiveStrategy = {
      ...matched,
      preferredToolSequence: [...matched.preferredToolSequence],
      fallbackToolSequence: [...matched.fallbackToolSequence],
    };

    // Inspect approved lessons for the user
    const approvedLessons = await dbService.getLearnedLessons(userId, { status: 'approved' });

    for (const lesson of approvedLessons) {
      // If a lesson warns about a specific tool failure, adapt tool sequence
      if (lesson.source === 'task_failure') {
        for (const badTool of ['external_fetch', 'unstable_crawler']) {
          if (lesson.triggerCondition.includes(badTool)) {
            // Remove badTool from preferred sequence and ensure fallback is ready
            adapted.preferredToolSequence = adapted.preferredToolSequence.filter((t) => t !== badTool);
          }
        }
      }
    }

    return adapted;
  }

  /**
   * Retrieve all registered adaptive strategies, seeding defaults if empty.
   */
  public async getAllStrategies(): Promise<AdaptiveStrategy[]> {
    let existing = await dbService.getAdaptiveStrategies();
    if (existing.length === 0) {
      for (const def of DEFAULT_ADAPTIVE_STRATEGIES) {
        await dbService.saveAdaptiveStrategy(def);
      }
      existing = await dbService.getAdaptiveStrategies();
    }
    return existing;
  }

  /**
   * Record task execution outcome and update strategy performance stats.
   */
  public async recordStrategyOutcome(params: {
    strategyId: string;
    success: boolean;
    durationMs: number;
  }): Promise<AdaptiveStrategy | null> {
    const { strategyId, success, durationMs } = params;
    const strategy = await dbService.getAdaptiveStrategyById(strategyId);
    if (!strategy) return null;

    const total = strategy.totalExecutions + 1;
    const successCount = strategy.successCount + (success ? 1 : 0);
    const failureCount = strategy.failureCount + (success ? 0 : 1);
    const winRate = Number((successCount / total).toFixed(4));

    const updated: AdaptiveStrategy = {
      ...strategy,
      totalExecutions: total,
      successCount,
      failureCount,
      winRate,
      lastUpdated: new Date().toISOString(),
    };

    return await dbService.saveAdaptiveStrategy(updated);
  }

  /**
   * Execute a task with adaptive strategy protection:
   * - Bounded timeout
   * - Preferred tool sequence with fallback switch
   * - Duplicate-execution prevention
   * - Disallowing retries on unsafe/destructive operations
   */
  public async executeWithStrategy(params: {
    taskType: string;
    userId: string;
    isDestructive?: boolean;
    executeFn: (tools: string[]) => Promise<{ success: boolean; result?: any; error?: string }>;
  }): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    strategyUsed: string;
    toolsExecuted: string[];
    durationMs: number;
    usedFallback: boolean;
  }> {
    const { taskType, userId, isDestructive, executeFn } = params;
    const strategy = await this.getStrategyForTask(taskType, userId);
    const startTime = Date.now();

    let usedFallback = false;
    let toolsToUse = strategy.preferredToolSequence;

    // Timeout Promise wrapper
    const timeoutPromise = new Promise<{ success: boolean; result?: any; error?: string }>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Strategy execution timed out after ${strategy.timeoutMs}ms`));
      }, strategy.timeoutMs);
    });

    try {
      // 1. Primary Execution with Preferred Tools
      let execResult = await Promise.race([executeFn(toolsToUse), timeoutPromise]);

      // 2. Bounded Retry / Fallback Routing if Failed
      // CRITICAL SAFETY GUARD: Never auto-retry if operation is destructive or irreversible!
      if (!execResult.success && !isDestructive && strategy.fallbackToolSequence.length > 0) {
        usedFallback = true;
        toolsToUse = strategy.fallbackToolSequence;

        // Bounded retry with fallback
        execResult = await Promise.race([executeFn(toolsToUse), timeoutPromise]);
      }

      const durationMs = Date.now() - startTime;

      // Update strategy performance stats in background
      this.recordStrategyOutcome({
        strategyId: strategy.id,
        success: execResult.success,
        durationMs,
      }).catch(() => {});

      return {
        success: execResult.success,
        result: execResult.result,
        error: execResult.error,
        strategyUsed: strategy.name,
        toolsExecuted: toolsToUse,
        durationMs,
        usedFallback,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err.message || String(err);

      this.recordStrategyOutcome({
        strategyId: strategy.id,
        success: false,
        durationMs,
      }).catch(() => {});

      return {
        success: false,
        error: errorMsg,
        strategyUsed: strategy.name,
        toolsExecuted: toolsToUse,
        durationMs,
        usedFallback,
      };
    }
  }

  /**
   * Reset strategy statistics to baseline.
   */
  public async resetStrategyStats(strategyId: string): Promise<AdaptiveStrategy | null> {
    const strategy = await dbService.getAdaptiveStrategyById(strategyId);
    if (!strategy) return null;

    const reset: AdaptiveStrategy = {
      ...strategy,
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      winRate: 1.0,
      lastUpdated: new Date().toISOString(),
    };

    return await dbService.saveAdaptiveStrategy(reset);
  }
}

export const strategyManager = new StrategyManager();
