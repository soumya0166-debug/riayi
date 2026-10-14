import { NextResponse } from 'next/server';
import { DatasetStorageService } from '@/services/training/datasetStorage';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const datasetStorage = new DatasetStorageService();

export async function POST() {
  try {
    const dataset = await datasetStorage.importExistingMathDataset();
    const preview = datasetStorage.getDatasetPreview(dataset.id, 5);

    return NextResponse.json({
      success: true,
      message: 'Successfully imported OpenMathReasoning dataset (280 train, 35 val, 35 test samples).',
      dataset,
      preview,
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
