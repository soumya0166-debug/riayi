import { NextRequest, NextResponse } from 'next/server';
import { workflowEngine } from '@/services/workflows/workflowEngine';
import { dbService } from '@/services/database/clientDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agent/workflows?userId=...
 * List available workflows and workflow execution history.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';
    const view = searchParams.get('view'); // 'runs' | 'definitions'

    if (view === 'runs') {
      const runs = await dbService.getWorkflowRuns(userId);
      return NextResponse.json({ runs, count: runs.length });
    }

    const workflows = await workflowEngine.getAvailableWorkflows(userId);
    return NextResponse.json({ workflows, count: workflows.length });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve workflows.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent/workflows
 * Execute a workflow with provided inputs.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const { workflowId, inputs = {}, userId = 'guest_user_default', conversationId } = body;

    if (!workflowId || typeof workflowId !== 'string') {
      return NextResponse.json({ error: 'workflowId is required.' }, { status: 400 });
    }

    const run = await workflowEngine.executeWorkflow(workflowId, inputs, {
      userId,
      conversationId,
    });

    return NextResponse.json({ run });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Workflow execution failed.' },
      { status: 500 }
    );
  }
}
