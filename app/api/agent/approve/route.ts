import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/services/database/clientDb';
import { agentOrchestrator } from '@/services/agents/agentOrchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agent/approve?userId=...&taskId=...
 * Get approval requests for a user/task.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';
    const taskId = searchParams.get('taskId') || undefined;

    const approvals = await dbService.getApprovalRequests(userId, taskId);
    return NextResponse.json({ approvals, count: approvals.length });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve approval requests.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent/approve
 * Submit decision ('approve' | 'reject') for an approval request.
 * Enforces cryptographic approval token binding and single-use semantics.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const { approvalId, approvalToken, decision, userId = 'guest_user_default' } = body;

    if (!approvalId || !decision) {
      return NextResponse.json(
        { error: 'approvalId and decision ("approve" | "reject") are required.' },
        { status: 400 }
      );
    }

    const approval = await dbService.getApprovalRequestById(approvalId, userId);
    if (!approval) {
      return NextResponse.json(
        { error: `Approval request "${approvalId}" not found or unauthorized.` },
        { status: 404 }
      );
    }

    // 1. Check if already decided
    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: `Approval request "${approvalId}" has already been ${approval.status}. Cannot reuse approvals.` },
        { status: 409 }
      );
    }

    // 2. Check Expiration
    if (new Date(approval.expiresAt).getTime() < Date.now()) {
      approval.status = 'expired';
      await dbService.saveApprovalRequest(approval);
      return NextResponse.json(
        { error: 'Approval request has expired. Re-trigger the task to generate a new approval.' },
        { status: 410 }
      );
    }

    // 3. Cryptographic Token Binding Check
    if (approval.approvalToken !== approvalToken) {
      return NextResponse.json(
        { error: 'Invalid approval token provided. Action execution rejected.' },
        { status: 403 }
      );
    }

    if (decision === 'reject') {
      approval.status = 'rejected';
      approval.decidedAt = new Date().toISOString();
      await dbService.saveApprovalRequest(approval);

      // Cancel corresponding task step
      const task = await dbService.getTaskById(approval.taskId, userId);
      if (task) {
        if (task.steps[approval.stepIndex]) {
          task.steps[approval.stepIndex].status = 'rejected';
          task.steps[approval.stepIndex].error = 'Action was rejected by user.';
        }
        task.status = 'cancelled';
        task.error = 'Task cancelled because step approval was rejected.';
        await dbService.saveTask(task);
      }

      return NextResponse.json({
        success: true,
        status: 'rejected',
        message: 'Action rejected. Step and task have been halted.',
      });
    }

    if (decision === 'approve') {
      approval.status = 'approved';
      approval.decidedAt = new Date().toISOString();
      await dbService.saveApprovalRequest(approval);

      // Resume execution of task
      const resumedTask = await agentOrchestrator.resumeTask(approval.taskId, userId);

      return NextResponse.json({
        success: true,
        status: 'approved',
        message: 'Action approved and executed.',
        task: resumedTask,
      });
    }

    return NextResponse.json({ error: 'Invalid decision value. Must be "approve" or "reject".' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process approval.' },
      { status: 500 }
    );
  }
}
