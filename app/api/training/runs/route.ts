import { NextRequest, NextResponse } from 'next/server';
import { TrainingRunManager } from '@/services/training/trainingRunManager';
import { DatasetStorageService } from '@/services/training/datasetStorage';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const runManager = new TrainingRunManager();
const datasetStorage = new DatasetStorageService();

export async function GET() {
  try {
    const runs = await runManager.listRuns();
    return NextResponse.json({ success: true, runs });
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
    if (!body || !body.datasetId) {
      return NextResponse.json(
        { success: false, error: 'datasetId is required to start a training run.' },
        { status: 400 }
      );
    }

    const { datasetId, name, baseModel, hyperparameters } = body;

    // Verify dataset exists
    const datasetDetails = datasetStorage.getDatasetDetails(datasetId, 1);
    const datasetName = datasetDetails.metadata.name;

    const run = await runManager.createRun({
      datasetId,
      datasetName,
      name,
      baseModel,
      hyperparameters,
    });

    return NextResponse.json({
      success: true,
      run,
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
