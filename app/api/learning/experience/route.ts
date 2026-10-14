import { NextRequest, NextResponse } from 'next/server';
import { experienceCollector } from '@/services/learning/experienceCollector';
import { dbService } from '@/services/database/clientDb';
import { formatErrorMessage } from '@/lib/errors';
import { ExperienceCategory, QualityStatus } from '@/types/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';
    const category = searchParams.get('category') as ExperienceCategory | undefined;
    const status = searchParams.get('status') as QualityStatus | undefined;

    const experiences = await experienceCollector.getExperiences(userId, {
      category: category || undefined,
      status: status || undefined,
    });

    return NextResponse.json({
      success: true,
      experiences,
      count: experiences.length,
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
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Request body required' },
        { status: 400 }
      );
    }

    const userId = body.userId || 'guest_user_default';
    const { type } = body;

    let saved = null;

    if (type === 'feedback') {
      saved = await experienceCollector.collectFeedback({
        userId,
        inputQuery: body.inputQuery || '',
        responseSnippet: body.responseSnippet || '',
        rating: body.rating ?? 1,
        feedbackText: body.feedbackText,
        taskCategory: body.taskCategory || 'response_quality',
      });
    } else if (type === 'correction') {
      saved = await experienceCollector.collectCorrection({
        userId,
        inputQuery: body.inputQuery || '',
        originalOutput: body.originalOutput || '',
        correctedOutput: body.correctedOutput || '',
        taskCategory: body.taskCategory || 'response_quality',
      });
    } else if (type === 'retrieval') {
      saved = await experienceCollector.collectRetrievalFeedback({
        userId,
        inputQuery: body.inputQuery || '',
        chunkId: body.chunkId || '',
        fileId: body.fileId || '',
        chunkSnippet: body.chunkSnippet || '',
        isRelevant: Boolean(body.isRelevant),
        rankPosition: body.rankPosition || 1,
        features: body.features,
      });
    } else if (type === 'task_outcome') {
      saved = await experienceCollector.collectTaskOutcome({
        userId,
        toolName: body.toolName || '',
        taskCategory: body.taskCategory || 'tool_selection',
        inputQuery: body.inputQuery || '',
        success: Boolean(body.success),
        durationMs: body.durationMs || 0,
        outputSnippet: body.outputSnippet,
      });
    } else {
      return NextResponse.json(
        { success: false, error: `Invalid experience type: ${type}` },
        { status: 400 }
      );
    }

    if (!saved) {
      return NextResponse.json({
        success: true,
        optedOut: true,
        message: 'Experience dropped because user has opted out of learning data collection.',
      });
    }

    return NextResponse.json({
      success: true,
      experience: saved,
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
    const clearAll = searchParams.get('clearAll') === 'true';

    if (clearAll) {
      await experienceCollector.clearAllUserExperiences(userId);
      return NextResponse.json({
        success: true,
        message: `All learning experiences for user ${userId} have been permanently deleted.`,
      });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Experience ID or clearAll=true is required.' },
        { status: 400 }
      );
    }

    await experienceCollector.deleteExperience(id, userId);
    return NextResponse.json({
      success: true,
      message: `Experience ${id} permanently deleted.`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
