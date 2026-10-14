import { NextRequest, NextResponse } from 'next/server';
import { TrainingRunManager } from '@/services/training/trainingRunManager';
import { TrainingStatus } from '@/types/training';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const runManager = new TrainingRunManager();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const run = await runManager.getRun(id);

    if (!run) {
      return NextResponse.json(
        { success: false, error: `Training run '${id}' not found.` },
        { status: 404 }
      );
    }

    const evaluationReport = await runManager.getEvaluationReport(id);

    return NextResponse.json({
      success: true,
      run,
      evaluationReport,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Request body is required.' },
        { status: 400 }
      );
    }

    let updatedRun;
    if (body.status) {
      updatedRun = await runManager.updateStatus(
        id,
        body.status as TrainingStatus,
        body.errorDetails
      );
    } else {
      updatedRun = await runManager.updateRun(id, body);
    }

    return NextResponse.json({
      success: true,
      run: updatedRun,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await runManager.deleteRun(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Training run '${id}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Training run '${id}' deleted successfully.`,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}
