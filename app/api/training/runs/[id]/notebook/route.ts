import { NextRequest, NextResponse } from 'next/server';
import { TrainingRunManager } from '@/services/training/trainingRunManager';
import { DatasetStorageService } from '@/services/training/datasetStorage';
import { ColabNotebookGenerator } from '@/services/training/colabNotebookGenerator';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const runManager = new TrainingRunManager();
const datasetStorage = new DatasetStorageService();

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

    const trainRecords = datasetStorage.getSplitRecords(run.datasetId, 'train');
    const valRecords = datasetStorage.getSplitRecords(run.datasetId, 'val');
    const testRecords = datasetStorage.getSplitRecords(run.datasetId, 'test');

    const host = req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const callbackUrl = `${proto}://${host}/api/training/runs/${run.id}/logs`;

    const notebookJson = ColabNotebookGenerator.generateNotebook(
      run,
      trainRecords,
      valRecords,
      testRecords,
      callbackUrl
    );

    const filename = `riayai_finetune_${run.hyperparameters.baseModel.split('/')[1] || 'qwen'}_${run.id}.ipynb`;

    return new Response(notebookJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ipynb+json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
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
