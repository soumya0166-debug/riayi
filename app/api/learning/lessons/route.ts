import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/services/database/clientDb';
import { lessonExtractor } from '@/services/learning/lessonExtractor';
import { formatErrorMessage } from '@/lib/errors';
import { LessonStatus } from '@/types/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';
    const status = searchParams.get('status') as LessonStatus | undefined;
    const taskType = searchParams.get('taskType') || undefined;

    const lessons = await dbService.getLearnedLessons(userId, {
      status,
      taskType,
    });

    return NextResponse.json({
      success: true,
      lessons,
      count: lessons.length,
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
    const body = await req.json().catch(() => null);
    if (!body || !body.lessonId || !body.action) {
      return NextResponse.json(
        { success: false, error: 'lessonId and action ("approve" | "reject" | "rollback") are required.' },
        { status: 400 }
      );
    }

    const userId = body.userId || 'guest_user_default';
    const approverId = body.approverId || 'admin_user';

    let updatedLesson = null;
    if (body.action === 'approve') {
      updatedLesson = await lessonExtractor.approveLesson(body.lessonId, userId, approverId);
    } else if (body.action === 'reject') {
      updatedLesson = await lessonExtractor.rejectLesson(body.lessonId, userId);
    } else if (body.action === 'rollback') {
      updatedLesson = await lessonExtractor.rollbackLesson(body.lessonId, userId, body.notes);
    } else {
      return NextResponse.json(
        { success: false, error: `Invalid action: ${body.action}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      action: body.action,
      lesson: updatedLesson,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Lesson ID is required for deletion.' },
        { status: 400 }
      );
    }

    await dbService.deleteLearnedLesson(id, userId);
    return NextResponse.json({
      success: true,
      message: `Learned lesson ${id} permanently deleted.`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
