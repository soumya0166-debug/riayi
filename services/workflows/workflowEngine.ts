import {
  WorkflowDefinition,
  WorkflowRun,
  AgentTask,
  TaskStep,
  RiskLevel,
} from '@/types/automation';
import { dbService } from '@/services/database/clientDb';
import { toolRegistry } from '@/services/tools/toolRegistry';
import { generateId } from '@/lib/utils';
import { strategyLearner } from '@/services/learning/strategyLearner';
import { experienceCollector } from '@/services/learning/experienceCollector';
import crypto from 'crypto';

export const BUILTIN_WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'workflow_summarize_doc',
    name: 'Document & PDF Summarizer',
    description: 'Generates an executive summary and highlights of an uploaded document or text.',
    triggerType: 'manual',
    inputSchema: {
      fileId: { type: 'string', description: 'ID of uploaded file to summarize', required: false },
      text: { type: 'string', description: 'Direct text content to summarize', required: false },
      focus: { type: 'string', description: 'Summary focus area', required: false },
    },
    steps: [
      {
        id: 'ws_sum_1',
        title: 'Summarize Document Content',
        toolName: 'summarize_document',
        paramMapping: { fileId: '$input.fileId', text: '$input.text', focus: '$input.focus' },
        riskLevel: 'LOW',
      },
    ],
    requiredPermissions: ['read:documents'],
    retryPolicy: { maxRetries: 1, backoffMs: 1500 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'workflow_extract_info',
    name: 'Structured Entity & Data Extractor',
    description: 'Extracts entities, key dates, action items, and numeric metrics into structured JSON.',
    triggerType: 'manual',
    inputSchema: {
      text: { type: 'string', description: 'Text to extract structured entities from', required: true },
      category: { type: 'string', description: 'Category focus ("actions", "dates", "metrics", "all")', required: false },
    },
    steps: [
      {
        id: 'ws_ext_1',
        title: 'Extract Entities & Action Items',
        toolName: 'extract_entities',
        paramMapping: { text: '$input.text', category: '$input.category' },
        riskLevel: 'LOW',
      },
    ],
    requiredPermissions: ['read:documents'],
    retryPolicy: { maxRetries: 1, backoffMs: 1500 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'workflow_rag_qa',
    name: 'Knowledge Base Q&A',
    description: 'Searches knowledge base files using neural re-ranking and synthesizes an accurate answer.',
    triggerType: 'manual',
    inputSchema: {
      query: { type: 'string', description: 'Question or query to search for', required: true },
    },
    steps: [
      {
        id: 'ws_rag_1',
        title: 'Search Workspace Knowledge Base',
        toolName: 'doc_search',
        paramMapping: { query: '$input.query', limit: '4' },
        riskLevel: 'LOW',
      },
      {
        id: 'ws_rag_2',
        title: 'Compile Synthesized Answer Report',
        toolName: 'generate_report',
        paramMapping: { title: 'Knowledge Base Findings', findings: '$step_1.data' },
        riskLevel: 'LOW',
      },
    ],
    requiredPermissions: ['read:documents'],
    retryPolicy: { maxRetries: 1, backoffMs: 2000 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'workflow_generate_report',
    name: 'Analytical Report Generator',
    description: 'Compiles raw findings or text into a professional structured markdown report.',
    triggerType: 'manual',
    inputSchema: {
      title: { type: 'string', description: 'Title of the report', required: true },
      findings: { type: 'string', description: 'Raw findings or source notes', required: true },
      format: { type: 'string', description: 'Report format ("executive", "technical", "standard")', required: false },
    },
    steps: [
      {
        id: 'ws_rep_1',
        title: 'Generate Analytical Report',
        toolName: 'generate_report',
        paramMapping: { title: '$input.title', findings: '$input.findings', format: '$input.format' },
        riskLevel: 'LOW',
      },
    ],
    requiredPermissions: ['read:documents'],
    retryPolicy: { maxRetries: 1, backoffMs: 2000 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'workflow_multi_step_analysis',
    name: 'Full Document Intelligence Pipeline',
    description: 'Multi-step pipeline: searches documents, extracts structured data, and compiles an executive report.',
    triggerType: 'manual',
    inputSchema: {
      query: { type: 'string', description: 'Topic to analyze across documents', required: true },
      reportTitle: { type: 'string', description: 'Title of the resulting report', required: true },
    },
    steps: [
      {
        id: 'ws_pipe_1',
        title: 'Search Workspace Documents',
        toolName: 'doc_search',
        paramMapping: { query: '$input.query', limit: '4' },
        riskLevel: 'LOW',
      },
      {
        id: 'ws_pipe_2',
        title: 'Extract Key Entities & Metrics',
        toolName: 'extract_entities',
        paramMapping: { text: '$step_1.data' },
        riskLevel: 'LOW',
      },
      {
        id: 'ws_pipe_3',
        title: 'Generate Comprehensive Executive Report',
        toolName: 'generate_report',
        paramMapping: { title: '$input.reportTitle', findings: '$step_1.data' },
        riskLevel: 'LOW',
      },
    ],
    requiredPermissions: ['read:documents'],
    retryPolicy: { maxRetries: 1, backoffMs: 2000 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export class WorkflowEngine {
  /**
   * Get all available workflows (builtin + user custom).
   */
  public async getAvailableWorkflows(userId?: string): Promise<WorkflowDefinition[]> {
    const custom = await dbService.getWorkflows(userId);
    const customMap = new Map(custom.map((w) => [w.id, w]));

    // Merge: custom overwrites builtin if same ID
    const merged: WorkflowDefinition[] = [...BUILTIN_WORKFLOWS.filter((b) => !customMap.has(b.id)), ...custom];
    return merged;
  }

  /**
   * Get a specific workflow definition by ID.
   */
  public async getWorkflowById(workflowId: string, userId?: string): Promise<WorkflowDefinition | null> {
    const all = await this.getAvailableWorkflows(userId);
    return all.find((w) => w.id === workflowId) || null;
  }

  /**
   * Execute a workflow definition with validated inputs.
   */
  public async executeWorkflow(
    workflowId: string,
    inputs: Record<string, unknown>,
    options: { userId: string; conversationId?: string; abortSignal?: AbortSignal }
  ): Promise<WorkflowRun> {
    const workflow = await this.getWorkflowById(workflowId, options.userId);
    if (!workflow) {
      throw new Error(`Workflow with ID "${workflowId}" was not found.`);
    }

    // 1. Input Schema Validation
    const validationErrors = this.validateInputs(workflow, inputs);
    if (validationErrors.length > 0) {
      throw new Error(`Workflow input validation failed: ${validationErrors.join('; ')}`);
    }

    const runId = generateId('run');
    const taskId = generateId('task');

    // Create tracking task for UI visibility
    const task: AgentTask = {
      id: taskId,
      userId: options.userId,
      conversationId: options.conversationId,
      title: `${workflow.name} Run`,
      prompt: `Workflow: ${workflow.name}`,
      status: 'running',
      steps: workflow.steps.map((s, idx) => ({
        id: `step_${idx + 1}_${Date.now()}`,
        stepIndex: idx,
        title: s.title,
        toolName: s.toolName,
        parameters: {},
        status: 'pending',
        riskLevel: s.riskLevel,
      })),
      currentStepIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dbService.saveTask(task);

    const run: WorkflowRun = {
      id: runId,
      workflowId,
      userId: options.userId,
      taskId,
      status: 'running',
      inputs,
      startedAt: new Date().toISOString(),
    };

    await dbService.saveWorkflowRun(run);

    // 2. Sequential Step Execution with Input/Output Piping
    const stepOutputs: Record<string, unknown> = {};

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        if (options.abortSignal?.aborted) {
          run.status = 'cancelled';
          run.error = 'Workflow execution cancelled.';
          run.completedAt = new Date().toISOString();
          task.status = 'cancelled';
          await dbService.saveTask(task);
          await dbService.saveWorkflowRun(run);
          return run;
        }

        const stepDef = workflow.steps[i];
        const taskStep = task.steps[i];

        taskStep.status = 'running';
        taskStep.startedAt = new Date().toISOString();
        task.currentStepIndex = i;
        await dbService.saveTask(task);

        // Resolve parameter mapping
        const mappedArgs: Record<string, unknown> = {};
        for (const [paramKey, mappingExpr] of Object.entries(stepDef.paramMapping)) {
          mappedArgs[paramKey] = this.resolveExpression(mappingExpr, inputs, stepOutputs);
        }
        taskStep.parameters = mappedArgs;

        // Check Risk Gate for MEDIUM/HIGH
        if (stepDef.riskLevel === 'MEDIUM' || stepDef.riskLevel === 'HIGH') {
          const approvals = await dbService.getApprovalRequests(options.userId, taskId);
          const approved = approvals.find((a) => a.stepIndex === i && a.status === 'approved');

          if (!approved) {
            let pending = approvals.find((a) => a.stepIndex === i && a.status === 'pending');
            if (!pending) {
              const approvalToken = crypto.randomBytes(24).toString('hex');
              pending = {
                id: generateId('appr'),
                taskId,
                userId: options.userId,
                stepIndex: i,
                toolName: stepDef.toolName,
                riskLevel: stepDef.riskLevel,
                actionDescription: `Workflow Step ${i + 1}: ${stepDef.title}`,
                parameters: mappedArgs,
                approvalToken,
                status: 'pending',
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
              };
              await dbService.saveApprovalRequest(pending);
            }

            taskStep.status = 'waiting_approval';
            taskStep.approvalRequestId = pending.id;
            task.status = 'waiting_approval';
            run.status = 'waiting_approval';
            await dbService.saveTask(task);
            await dbService.saveWorkflowRun(run);
            return run;
          }
        }

        // Execute Tool with retry policy and telemetry recording
        const stepStart = Date.now();
        let execResult = await toolRegistry.execute(stepDef.toolName, mappedArgs, {
          userId: options.userId,
          taskId,
          conversationId: options.conversationId,
          abortSignal: options.abortSignal,
        });

        // Bounded retry if failed
        if (!execResult.success && workflow.retryPolicy.maxRetries > 0) {
          await new Promise((res) => setTimeout(res, workflow.retryPolicy.backoffMs));
          execResult = await toolRegistry.execute(stepDef.toolName, mappedArgs, {
            userId: options.userId,
            taskId,
            conversationId: options.conversationId,
            abortSignal: options.abortSignal,
          });
        }

        const stepLatency = Date.now() - stepStart;
        // Record strategy outcome & learning experience asynchronously
        strategyLearner
          .recordExecution({
            toolName: stepDef.toolName,
            success: execResult.success,
            latencyMs: stepLatency,
            errorMessage: execResult.error,
          })
          .catch(() => {});

        experienceCollector
          .collectTaskOutcome({
            userId: options.userId,
            taskCategory: 'tool_selection',
            toolName: stepDef.toolName,
            inputQuery: stepDef.title,
            success: execResult.success,
            durationMs: stepLatency,
            outputSnippet: execResult.success ? JSON.stringify(execResult.data)?.slice(0, 200) : execResult.error,
          })
          .catch(() => {});

        if (!execResult.success) {
          taskStep.status = 'failed';
          taskStep.error = execResult.error;
          taskStep.completedAt = new Date().toISOString();
          task.status = 'failed';
          task.error = execResult.error;
          run.status = 'failed';
          run.error = execResult.error;
          run.completedAt = new Date().toISOString();

          await dbService.saveTask(task);
          await dbService.saveWorkflowRun(run);
          return run;
        }

        taskStep.status = 'completed';
        taskStep.result = execResult.data;
        taskStep.completedAt = new Date().toISOString();
        stepOutputs[`step_${i + 1}`] = execResult.data;
        await dbService.saveTask(task);
      }

      run.status = 'completed';
      run.outputs = stepOutputs;
      run.completedAt = new Date().toISOString();
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.summary = `Workflow "${workflow.name}" completed successfully with ${workflow.steps.length} steps.`;

      await dbService.saveTask(task);
      await dbService.saveWorkflowRun(run);
      return run;
    } catch (err: unknown) {
      run.status = 'failed';
      run.error = err instanceof Error ? err.message : String(err);
      run.completedAt = new Date().toISOString();
      task.status = 'failed';
      task.error = run.error;

      await dbService.saveTask(task);
      await dbService.saveWorkflowRun(run);
      return run;
    }
  }

  /**
   * Validate user inputs against workflow input schema.
   */
  private validateInputs(workflow: WorkflowDefinition, inputs: Record<string, unknown>): string[] {
    const errors: string[] = [];

    for (const [key, schema] of Object.entries(workflow.inputSchema)) {
      const val = inputs[key];
      if (schema.required && (val === undefined || val === null || val === '')) {
        errors.push(`Missing required input "${key}".`);
      }
    }

    return errors;
  }

  /**
   * Resolve an expression like "$input.query" or "$step_1.data".
   */
  private resolveExpression(
    expr: string,
    inputs: Record<string, unknown>,
    stepOutputs: Record<string, unknown>
  ): unknown {
    if (typeof expr !== 'string') return expr;

    if (expr.startsWith('$input.')) {
      const field = expr.slice(7);
      return inputs[field] ?? '';
    }

    if (expr.startsWith('$step_')) {
      const parts = expr.split('.');
      const stepKey = parts[0].slice(1); // 'step_1'
      const output = stepOutputs[stepKey];
      if (output === undefined || output === null) return '';

      if (parts.length > 1) {
        const subField = parts.slice(1).join('.');
        if (subField === 'data' && (output as Record<string, unknown>)?.data === undefined) {
          return typeof output === 'string' ? output : JSON.stringify(output);
        }
        if (typeof output === 'object') {
          const sub = (output as Record<string, unknown>)[subField];
          if (sub !== undefined && sub !== null) {
            return typeof sub === 'string' ? sub : JSON.stringify(sub);
          }
        }
      }
      return typeof output === 'string' ? output : JSON.stringify(output);
    }

    return expr;
  }
}

export const workflowEngine = new WorkflowEngine();
