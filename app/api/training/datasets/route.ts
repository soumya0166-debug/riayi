import { NextRequest, NextResponse } from 'next/server';
import { DatasetStorageService } from '@/services/training/datasetStorage';
import { CSVColumnMapping, DatasetTaskType } from '@/types/training';
import { formatErrorMessage, AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const datasetStorage = new DatasetStorageService();
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

export async function GET() {
  try {
    const datasets = await datasetStorage.listDatasets();
    return NextResponse.json({ success: true, datasets });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: formatErrorMessage(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const name = (formData.get('name') as string)?.trim();
    const description = (formData.get('description') as string)?.trim() || '';
    const taskType = ((formData.get('taskType') as string) || 'mathematical_reasoning') as DatasetTaskType;
    const columnMappingRaw = formData.get('columnMapping') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No dataset file was uploaded.' },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Dataset name is required.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File size exceeds the 50MB limit. Current size: ${(file.size / (1024 * 1024)).toFixed(1)}MB`,
        },
        { status: 400 }
      );
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.jsonl') && !filename.endsWith('.json') && !filename.endsWith('.csv')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file extension. Only .jsonl, .json, and .csv files are supported for training datasets.',
        },
        { status: 400 }
      );
    }

    // Encoding validation: Read buffer and decode as UTF-8
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let textContent: string;
    try {
      textContent = decoder.decode(arrayBuffer);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'File encoding error: The uploaded dataset is not valid UTF-8 text.',
        },
        { status: 400 }
      );
    }

    let columnMapping: CSVColumnMapping | undefined;
    if (columnMappingRaw) {
      try {
        columnMapping = JSON.parse(columnMappingRaw);
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid columnMapping JSON payload.' },
          { status: 400 }
        );
      }
    }

    const { metadata, preview } = await datasetStorage.parseAndSaveUploadedDataset({
      name,
      description,
      taskType,
      fileContent: textContent,
      originalFilename: file.name,
      columnMapping,
    });

    return NextResponse.json({
      success: true,
      dataset: metadata,
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
