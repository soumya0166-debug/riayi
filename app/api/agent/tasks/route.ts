import { NextRequest, NextResponse } from 'next/server';
import { agentOrchestrator } from '@/services/agents/agentOrchestrator';
import { dbService } from '@/services/database/clientDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agent/tasks?userId=...&taskId=...
 * Retrieve all tasks for a user, or a specific task by ID.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';
    const taskId = searchParams.get('taskId');

    if (taskId) {
      const task = await dbService.getTaskById(taskId, userId);
      if (!task) {
        return NextResponse.json({ error: `Task "${taskId}" not found.` }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    const tasks = await dbService.getTasks(userId);
    return NextResponse.json({ tasks, count: tasks.length });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve tasks.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent/tasks
 * Create and execute an autonomous agent task.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const { prompt, userId = 'guest_user_default', conversationId, idempotencyKey } = body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Task prompt is required.' }, { status: 400 });
    }

    const task = await agentOrchestrator.planAndExecute({
      userId,
      prompt: prompt.trim(),
      conversationId,
      idempotencyKey,
    });

    return NextResponse.json({ task });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Task execution failed.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agent/tasks?taskId=...&userId=...&action=cancel|delete
 * Cancel or delete a task.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const userId = searchParams.get('userId') || 'guest_user_default';
    const action = searchParams.get('action') || 'delete';

    if (!taskId) {
      return NextResponse.json({ error: 'taskId parameter is required.' }, { status: 400 });
    }

    if (action === 'cancel') {
      const task = await agentOrchestrator.cancelTask(taskId, userId);
      return NextResponse.json({ success: true, task });
    }

    await dbService.deleteTask(taskId, userId);
    return NextResponse.json({ success: true, message: `Task "${taskId}" deleted.` });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to modify task.' },
      { status: 500 }
    );
  }
}
