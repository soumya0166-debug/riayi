import { NextRequest, NextResponse } from 'next/server';
import { TrainingRunManager } from '@/services/training/trainingRunManager';
import { TrainingStatus, ModelEvaluationReport } from '@/types/training';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const runManager = new TrainingRunManager();

export async function POST(
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

    const {
      step,
      epoch,
      trainLoss,
      valLoss,
      learningRate,
      totalSteps,
      totalEpochs,
      elapsedTimeSec,
      message,
      status,
      errorDetails,
      evaluationReport,
    } = body;

    // If an evaluation report is submitted upon completion
    if (evaluationReport) {
      await runManager.saveEvaluationReport(id, evaluationReport as ModelEvaluationReport);
    }

    // If a status override is explicitly requested
    if (status) {
      await runManager.updateStatus(id, status as TrainingStatus, errorDetails);
    }

    // If step metrics are provided
    let updatedRun;
    if (step !== undefined && epoch !== undefined) {
      updatedRun = await runManager.recordStep(id, {
        step,
        epoch,
        trainLoss,
        valLoss,
        learningRate,
        totalSteps,
        totalEpochs,
        elapsedTimeSec,
        message,
      });
    } else {
      updatedRun = await runManager.getRun(id);
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
