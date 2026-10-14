import { AgentStrategyMetric } from '@/types/learning';
import { dbService } from '@/services/database/clientDb';

export class StrategyLearner {
  /**
   * Record the outcome of an agent tool or workflow execution step.
   * Tracks success rate, latency, and failure patterns.
   */
  public async recordExecution(params: {
    toolName: string;
    success: boolean;
    latencyMs: number;
    errorMessage?: string;
  }): Promise<AgentStrategyMetric> {
    const { toolName, success, latencyMs, errorMessage } = params;

    const metrics = await dbService.getStrategyMetrics();
    const existing = metrics.find((m) => m.toolName === toolName);

    const total = (existing?.totalExecutions || 0) + 1;
    const successful = (existing?.successfulExecutions || 0) + (success ? 1 : 0);
    const failed = (existing?.failedExecutions || 0) + (success ? 0 : 1);
    const successRate = Number((successful / total).toFixed(4));

    // Rolling latency calculation
    const prevLatency = existing?.avgLatencyMs || latencyMs;
    const avgLatencyMs = Number(((prevLatency * (total - 1) + latencyMs) / total).toFixed(2));

    // Laplace-smoothed reliability score: (successful + 1) / (total + 2)
    const reliabilityScore = Number(((successful + 1) / (total + 2)).toFixed(4));

    const recentErrors = existing ? [...existing.recentErrors] : [];
    if (!success && errorMessage) {
      recentErrors.unshift(errorMessage.slice(0, 200));
      if (recentErrors.length > 5) recentErrors.pop();
    }

    const updatedMetric: AgentStrategyMetric = {
      toolName,
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: failed,
      successRate,
      avgLatencyMs,
      reliabilityScore,
      recentErrors,
    };

    await dbService.saveStrategyMetric(updatedMetric);
    return updatedMetric;
  }

  /**
   * Get the measured reliability score of a tool.
   * Returns a default neutral score of 0.70 for unexecuted tools.
   */
  public async getToolReliability(toolName: string): Promise<number> {
    const metrics = await dbService.getStrategyMetrics();
    const found = metrics.find((m) => m.toolName === toolName);
    return found ? found.reliabilityScore : 0.7;
  }

  /**
   * Rank a list of strictly PERMITTED tools by measured reliability.
   * 
   * SECURITY ENFORCEMENT:
   * Only reorders the provided permitted whitelist. Never introduces
   * unauthorized tools or elevates permissions.
   */
  public async rankPermittedTools(permittedTools: string[]): Promise<string[]> {
    if (!permittedTools || permittedTools.length <= 1) {
      return [...permittedTools];
    }

    const metrics = await dbService.getStrategyMetrics();
    const metricMap = new Map<string, number>();
    for (const m of metrics) {
      metricMap.set(m.toolName, m.reliabilityScore);
    }

    // Clone to prevent mutating input
    const ranked = [...permittedTools];

    // Sort descending by reliability score
    ranked.sort((a, b) => {
      const scoreA = metricMap.get(a) ?? 0.7;
      const scoreB = metricMap.get(b) ?? 0.7;
      return scoreB - scoreA;
    });

    return ranked;
  }

  /**
   * Identify recurring failure patterns across all registered tools.
   */
  public async analyzeFailurePatterns(): Promise<
    Array<{
      toolName: string;
      failureRate: number;
      commonErrors: string[];
      recommendation: string;
    }>
  > {
    const metrics = await dbService.getStrategyMetrics();

    return metrics
      .filter((m) => m.failedExecutions > 0)
      .map((m) => {
        const failureRate = Number(((m.failedExecutions / m.totalExecutions) * 100).toFixed(1));
        let recommendation = 'Performance within normal operational parameters.';

        if (failureRate > 40) {
          recommendation = 'High failure frequency. Recommend inspecting parameter formats or tool health.';
        } else if (m.avgLatencyMs > 5000) {
          recommendation = 'High execution latency. Consider timeout guardrails or optimizing workflow payload.';
        }

        return {
          toolName: m.toolName,
          failureRate,
          commonErrors: m.recentErrors,
          recommendation,
        };
      })
      .sort((a, b) => b.failureRate - a.failureRate);
  }

  /**
   * Retrieve complete strategy performance telemetry.
   */
  public async getAllStrategyMetrics(): Promise<AgentStrategyMetric[]> {
    return dbService.getStrategyMetrics();
  }
}

export const strategyLearner = new StrategyLearner();
