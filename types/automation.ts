export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface ToolExecutionContext {
  userId: string;
  taskId?: string;
  conversationId?: string;
  abortSignal?: AbortSignal;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  outputSchema?: Record<string, unknown>;
  riskLevel: RiskLevel;
  requiredPermissions: string[];
  timeoutMs: number;
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  id: string;
  taskId: string;
  userId: string;
  stepIndex: number;
  toolName: string;
  riskLevel: 'MEDIUM' | 'HIGH';
  actionDescription: string;
  parameters: Record<string, unknown>;
  approvalToken: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
}

export type TaskStepStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'rejected';

export interface TaskStep {
  id: string;
  stepIndex: number;
  title: string;
  toolName: string;
  parameters: Record<string, unknown>;
  status: TaskStepStatus;
  riskLevel: RiskLevel;
  result?: unknown;
  error?: string;
  approvalRequestId?: string;
  startedAt?: string;
  completedAt?: string;
}

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentTask {
  id: string;
  userId: string;
  conversationId?: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  steps: TaskStep[];
  currentStepIndex: number;
  summary?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  idempotencyKey?: string;
}

export interface WorkflowStepDefinition {
  id: string;
  title: string;
  toolName: string;
  paramMapping: Record<string, string>;
  riskLevel: RiskLevel;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  triggerType: 'manual' | 'conversation' | 'document_upload';
  inputSchema: Record<string, { type: string; description: string; required?: boolean }>;
  steps: WorkflowStepDefinition[];
  requiredPermissions: string[];
  retryPolicy: { maxRetries: number; backoffMs: number };
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  userId: string;
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'waiting_approval' | 'cancelled';
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface IntentClassificationResult {
  intent: 'workflow_automation' | 'doc_summary' | 'rag_query' | 'report_generation' | 'memory_store' | 'general_chat';
  confidence: number;
  matchedKeywords: string[];
  suggestedWorkflowId?: string;
}
