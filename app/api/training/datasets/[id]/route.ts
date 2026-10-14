import { NextRequest, NextResponse } from 'next/server';
import { DatasetStorageService } from '@/services/training/datasetStorage';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const datasetStorage = new DatasetStorageService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const details = datasetStorage.getDatasetDetails(id, limit);

    return NextResponse.json({
      success: true,
      dataset: details.metadata,
      preview: details.preview,
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
    datasetStorage.deleteDataset(id);

    return NextResponse.json({
      success: true,
      message: `Dataset ${id} deleted successfully.`,
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
