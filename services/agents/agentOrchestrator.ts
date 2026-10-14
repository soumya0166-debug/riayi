import {
  AgentTask,
  TaskStep,
  ApprovalRequest,
  RiskLevel,
  ToolExecutionResult,
} from '@/types/automation';
import { toolRegistry } from '@/services/tools/toolRegistry';
import { geminiProvider } from '@/services/ai/providers/geminiProvider';
import { dbService } from '@/services/database/clientDb';
import { generateId } from '@/lib/utils';
import crypto from 'crypto';

export interface ExecuteTaskOptions {
  userId: string;
  taskId?: string;
  prompt?: string;
  conversationId?: string;
  idempotencyKey?: string;
  abortSignal?: AbortSignal;
}

export class AgentOrchestrator {
  private static readonly MAX_STEPS = 8;
  private static readonly TASK_TIMEOUT_MS = 60000;
  private activeLocks = new Set<string>();

  /**
   * Plan and execute an autonomous agent task with bounded execution,
   * tool registry validation, and risk-based approval gates.
   */
  public async planAndExecute(options: ExecuteTaskOptions): Promise<AgentTask> {
    const { userId, prompt, conversationId, idempotencyKey } = options;

    if (!prompt || !prompt.trim()) {
      throw new Error('Task prompt cannot be empty.');
    }

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existingTasks = await dbService.getTasks(userId);
      const existing = existingTasks.find(
        (t) => t.idempotencyKey === idempotencyKey && (t.status === 'running' || t.status === 'planning')
      );
      if (existing) {
        return existing;
      }
    }

    const taskId = options.taskId || generateId('task');

    // Prevent concurrent duplicate executions of the exact same task
    if (this.activeLocks.has(taskId)) {
      throw new Error(`Task ${taskId} is currently executing. Concurrent duplicate execution is blocked.`);
    }

    const task: AgentTask = {
      id: taskId,
      userId,
      conversationId,
      title: prompt.slice(0, 50).trim(),
      prompt,
      status: 'planning',
      steps: [],
      currentStepIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotencyKey,
    };

    await dbService.saveTask(task);

    try {
      this.activeLocks.add(taskId);

      // 2. Generate structured plan using Gemini
      const planSteps = await this.generatePlan(prompt, userId);
      task.steps = planSteps;
      task.status = 'running';
      await dbService.saveTask(task);

      // 3. Execute bounded step loop
      return await this.executeStepLoop(task, options.abortSignal);
    } catch (err: unknown) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      await dbService.saveTask(task);
      return task;
    } finally {
      this.activeLocks.delete(taskId);
    }
  }

  /**
   * Resume an existing task from its current paused/waiting step (e.g. after approval).
   */
  public async resumeTask(taskId: string, userId: string, abortSignal?: AbortSignal): Promise<AgentTask> {
    const task = await dbService.getTaskById(taskId, userId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found for user "${userId}".`);
    }

    if (task.status !== 'waiting_approval' && task.status !== 'running') {
      return task;
    }

    if (this.activeLocks.has(taskId)) {
      throw new Error(`Task ${taskId} is already running.`);
    }

    try {
      this.activeLocks.add(taskId);
      task.status = 'running';
      await dbService.saveTask(task);

      return await this.executeStepLoop(task, abortSignal);
    } finally {
      this.activeLocks.delete(taskId);
    }
  }

  /**
   * Cancel an in-progress or waiting task.
   */
  public async cancelTask(taskId: string, userId: string): Promise<AgentTask> {
    const task = await dbService.getTaskById(taskId, userId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    task.status = 'cancelled';
    task.error = 'Task was cancelled by user.';
    task.completedAt = new Date().toISOString();

    // Mark active step as skipped/cancelled
    if (task.steps[task.currentStepIndex]) {
      task.steps[task.currentStepIndex].status = 'skipped';
    }

    await dbService.saveTask(task);
    return task;
  }

  /**
   * Generate a structured execution plan from the user prompt using Gemini.
   */
  private async generatePlan(prompt: string, userId: string): Promise<TaskStep[]> {
    const availableTools = toolRegistry.getToolDescriptionsForLLM();

    const systemPrompt = `You are an AI Agent Planner for RIYAAI.
Your job is to convert a user's task into an ordered sequence of 1 to 4 logical steps using ONLY the registered tools provided below.

AVAILABLE TOOLS:
${JSON.stringify(availableTools, null, 2)}

STRICT RULES:
1. ONLY select tools that exist in the registered tools list. Never invent tool names.
2. Output a strictly valid JSON array of step objects with this exact format:
[
  {
    "title": "Short title describing what this step does",
    "toolName": "doc_search",
    "parameters": { "query": "..." }
  }
]
3. Do not include markdown code ticks (\`\`\`), output raw valid JSON only.
4. Keep the plan focused and minimal (1 to 4 steps max).`;

    const userMsg = `Plan steps for task: "${prompt}"`;

    let responseText = '';
    try {
      responseText = await geminiProvider.generateText({
        prompt: userMsg,
        systemPrompt,
        temperature: 0.1,
      });
    } catch (err: unknown) {
      throw new Error(`Failed to generate task plan with Gemini: ${err instanceof Error ? err.message : String(err)}`);
    }

    let parsedPlan: Array<{ title: string; toolName: string; parameters: Record<string, unknown> }>;
    try {
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedPlan = JSON.parse(cleanJson);
      if (!Array.isArray(parsedPlan)) {
        throw new Error('LLM did not return an array of steps.');
      }
    } catch {
      // Heuristic fallback if LLM response could not be parsed as raw JSON
      parsedPlan = [
        {
          title: 'Search documents for task context',
          toolName: 'doc_search',
          parameters: { query: prompt },
        },
      ];
    }

    const steps: TaskStep[] = [];
    let index = 0;

    for (const rawStep of parsedPlan.slice(0, AgentOrchestrator.MAX_STEPS)) {
      const tool = toolRegistry.get(rawStep.toolName);
      if (!tool) {
        // Skip invalid/unregistered tools suggested by model
        continue;
      }

      steps.push({
        id: `step_${index + 1}_${Date.now()}`,
        stepIndex: index,
        title: rawStep.title || `Execute ${tool.name}`,
        toolName: tool.name,
        parameters: rawStep.parameters || {},
        status: 'pending',
        riskLevel: tool.riskLevel,
      });
      index++;
    }

    if (steps.length === 0) {
      // Default to doc_search
      steps.push({
        id: `step_1_${Date.now()}`,
        stepIndex: 0,
        title: 'Search available workspace knowledge',
        toolName: 'doc_search',
        parameters: { query: prompt },
        status: 'pending',
        riskLevel: 'LOW',
      });
    }

    return steps;
  }

  /**
   * Bounded execution loop processing steps in order.
   */
  private async executeStepLoop(task: AgentTask, abortSignal?: AbortSignal): Promise<AgentTask> {
    const startTime = Date.now();

    while (task.currentStepIndex < task.steps.length) {
      // Check execution timeout
      if (Date.now() - startTime > AgentOrchestrator.TASK_TIMEOUT_MS) {
        task.status = 'failed';
        task.error = `Task execution exceeded global timeout limit of ${AgentOrchestrator.TASK_TIMEOUT_MS}ms.`;
        await dbService.saveTask(task);
        return task;
      }

      if (abortSignal?.aborted) {
        task.status = 'cancelled';
        task.error = 'Task was cancelled.';
        await dbService.saveTask(task);
        return task;
      }

      const step = task.steps[task.currentStepIndex];

      // If step already completed, advance
      if (step.status === 'completed') {
        task.currentStepIndex++;
        continue;
      }

      // If step was rejected or failed, stop task
      if (step.status === 'rejected' || step.status === 'failed') {
        task.status = 'failed';
        task.error = step.error || `Step "${step.title}" failed.`;
        await dbService.saveTask(task);
        return task;
      }

      // Check Risk Gate for MEDIUM and HIGH risk
      if (step.riskLevel === 'MEDIUM' || step.riskLevel === 'HIGH') {
        // Check if an approved request exists for this step
        const approvals = await dbService.getApprovalRequests(task.userId, task.id);
        const approvedReq = approvals.find(
          (a) => a.stepIndex === step.stepIndex && a.status === 'approved'
        );

        if (!approvedReq) {
          // Pause execution and create immutable approval request
          let pendingReq = approvals.find(
            (a) => a.stepIndex === step.stepIndex && a.status === 'pending'
          );

          if (!pendingReq) {
            const approvalToken = crypto.randomBytes(24).toString('hex');
            pendingReq = {
              id: generateId('appr'),
              taskId: task.id,
              userId: task.userId,
              stepIndex: step.stepIndex,
              toolName: step.toolName,
              riskLevel: step.riskLevel,
              actionDescription: `Step ${step.stepIndex + 1}: ${step.title}`,
              parameters: step.parameters,
              approvalToken,
              status: 'pending',
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins expiry
            };
            await dbService.saveApprovalRequest(pendingReq);
          }

          step.status = 'waiting_approval';
          step.approvalRequestId = pendingReq.id;
          task.status = 'waiting_approval';
          await dbService.saveTask(task);
          return task;
        }
      }

      // Execute Step
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      await dbService.saveTask(task);

      // Resolve piped values from previous steps
      const resolvedParams = this.resolvePipedParameters(step.parameters, task.steps);

      const execResult: ToolExecutionResult = await toolRegistry.execute(
        step.toolName,
        resolvedParams,
        {
          userId: task.userId,
          taskId: task.id,
          conversationId: task.conversationId,
          abortSignal,
        }
      );

      if (execResult.success) {
        step.status = 'completed';
        step.result = execResult.data;
        step.completedAt = new Date().toISOString();
        task.currentStepIndex++;
        await dbService.saveTask(task);
      } else {
        step.status = 'failed';
        step.error = execResult.error || 'Step execution encountered an error.';
        step.completedAt = new Date().toISOString();
        task.status = 'failed';
        task.error = step.error;
        await dbService.saveTask(task);
        return task;
      }
    }

    // All steps completed successfully
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.summary = await this.generateFinalSummary(task);
    await dbService.saveTask(task);

    return task;
  }

  /**
   * Resolve parameter references like "$step_1.data" or "$prev.data".
   */
  private resolvePipedParameters(
    params: Record<string, unknown>,
    allSteps: TaskStep[]
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = { ...params };

    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string') {
        if (value.startsWith('$step_')) {
          const match = value.match(/^\$step_(\d+)(?:\.(.+))?$/);
          if (match) {
            const stepNum = parseInt(match[1], 10) - 1;
            const targetStep = allSteps[stepNum];
            if (targetStep && targetStep.result) {
              resolved[key] = match[2]
                ? (targetStep.result as Record<string, unknown>)[match[2]] ?? targetStep.result
                : JSON.stringify(targetStep.result);
            }
          }
        } else if (value.startsWith('$prev')) {
          const prevStep = allSteps.filter((s) => s.status === 'completed').pop();
          if (prevStep && prevStep.result) {
            resolved[key] = typeof prevStep.result === 'string'
              ? prevStep.result
              : JSON.stringify(prevStep.result);
          }
        }
      }
    }

    return resolved;
  }

  /**
   * Generate concise final summary of the completed task.
   */
  private async generateFinalSummary(task: AgentTask): Promise<string> {
    const completedSteps = task.steps.filter((s) => s.status === 'completed');
    const failedSteps = task.steps.filter((s) => s.status === 'failed');

    const summaryLines: string[] = [
      `### Task Execution Summary: ${task.title}`,
      `**Status**: ${task.status.toUpperCase()} (${completedSteps.length}/${task.steps.length} steps completed)`,
      '',
      '#### Completed Steps:',
    ];

    completedSteps.forEach((s) => {
      summaryLines.push(`- **Step ${s.stepIndex + 1} (${s.toolName})**: ${s.title}`);
    });

    if (failedSteps.length > 0) {
      summaryLines.push('', '#### Failed Steps:');
      failedSteps.forEach((s) => {
        summaryLines.push(`- **Step ${s.stepIndex + 1} (${s.toolName})**: ${s.error || 'Failed'}`);
      });
    }

    return summaryLines.join('\n');
  }
}

export const agentOrchestrator = new AgentOrchestrator();
