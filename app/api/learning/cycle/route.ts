import { NextRequest, NextResponse } from 'next/server';
import { learningScheduler } from '@/services/learning/learningScheduler';
import { formatErrorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = learningScheduler.getStatus();
    return NextResponse.json({
      success: true,
      status,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId || 'guest_user_default';

    if (body.action === 'pause') {
      learningScheduler.pause();
      return NextResponse.json({
        success: true,
        message: 'Learning cycle scheduler paused.',
        status: learningScheduler.getStatus(),
      });
    }

    if (body.action === 'resume') {
      learningScheduler.resume();
      return NextResponse.json({
        success: true,
        message: 'Learning cycle scheduler resumed.',
        status: learningScheduler.getStatus(),
      });
    }

    const result = await learningScheduler.runLearningCycle(userId, {
      minNewExamples: body.minNewExamples,
      taskCategory: body.taskCategory,
      autoPromoteIfAdmin: body.autoPromoteIfAdmin,
      forceTraining: body.forceTraining,
    });

    return NextResponse.json({
      success: result.status !== 'FAILED',
      result,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
