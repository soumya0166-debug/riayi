import { NextRequest, NextResponse } from 'next/server';
import { knowledgeService } from '@/services/knowledge/knowledgeService';
import { FILE_LIMITS } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: 'Invalid form data payload.' },
        { status: 400 }
      );
    }

    const file = formData.get('file') as File | null;
    const userId = (formData.get('userId') as string) || 'guest_user_default';
    const conversationId = (formData.get('conversationId') as string) || undefined;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided in upload request.' },
        { status: 400 }
      );
    }

    // 1. Validate File Size (Empty & Maximum)
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Cannot upload empty file (0 bytes).' },
        { status: 400 }
      );
    }

    if (file.size > FILE_LIMITS.MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File exceeds maximum allowed size of ${FILE_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
        },
        { status: 413 }
      );
    }

    // 2. Validate File Extension / MIME Type and sanitize name
    const rawFilename = file.name || 'unnamed_file';
    // Protect against path traversal
    const sanitizedFilename = rawFilename
      .replace(/^.*[\\/]/, '')
      .replace(/[<>:"|?*]/g, '_')
      .slice(0, 255);

    const ext = `.${sanitizedFilename.split('.').pop()?.toLowerCase() || ''}`;
    const isExtensionSupported = (FILE_LIMITS.SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);

    if (!isExtensionSupported && !file.type.startsWith('image/')) {
      return NextResponse.json(
        {
          error: `File type '${ext}' is not supported. Supported formats: PDF, DOCX, TXT, MD, CSV, XLSX, PNG, JPG, WEBP.`,
        },
        { status: 415 }
      );
    }

    // 3. Read Binary Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Ingest via KnowledgeService (Text Extraction, Scanned PDF OCR Detection, Chunks & Dense Embeddings)
    const ingestResult = await knowledgeService.ingestFile({
      userId,
      conversationId,
      originalName: sanitizedFilename,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      buffer,
    });

    if (ingestResult.file.status === 'error') {
      return NextResponse.json(
        {
          error: ingestResult.file.errorMessage || 'Failed to extract content from document.',
          file: ingestResult.file,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(ingestResult);
  } catch (error: unknown) {
    console.error('File upload error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal file processing error.',
      },
      { status: 500 }
    );
  }
}
