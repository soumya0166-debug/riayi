import { NextRequest, NextResponse } from 'next/server';
import { dbService } from '@/services/database/clientDb';
import { knowledgeService } from '@/services/knowledge/knowledgeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/files/[id]?userId=...
 * Retrieve document details and associated chunks.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';

    if (!id) {
      return NextResponse.json({ error: 'File ID is required.' }, { status: 400 });
    }

    const file = await dbService.getFile(id, userId);
    if (!file) {
      return NextResponse.json(
        { error: 'Document not found or unauthorized access.' },
        { status: 404 }
      );
    }

    const chunks = await dbService.getChunksByFileId(id, userId);

    return NextResponse.json({
      file,
      chunks: chunks.map((c) => ({
        id: c.id,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle,
        tokenEstimate: c.tokenEstimate,
        excerpt: c.content.slice(0, 200),
      })),
      chunkCount: chunks.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve document details.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/files/[id]?userId=...
 * Rename document and cascade update its chunks.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';

    if (!id) {
      return NextResponse.json({ error: 'File ID is required.' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const newName = body?.name;

    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      return NextResponse.json(
        { error: 'A valid non-empty document name is required.' },
        { status: 400 }
      );
    }

    // Sanitize new name against path traversal
    const sanitizedName = newName.trim().replace(/^.*[\\/]/, '').replace(/[<>:"|?*]/g, '_').slice(0, 255);

    const updatedFile = await knowledgeService.renameDocument(id, userId, sanitizedName);

    return NextResponse.json({ success: true, file: updatedFile });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to rename document.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files/[id]?userId=...
 * Purge document, extracted content, and vector chunks.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'guest_user_default';

    if (!id) {
      return NextResponse.json({ error: 'File ID is required.' }, { status: 400 });
    }

    await knowledgeService.deleteKnowledge(id, userId);

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete file.' },
      { status: 500 }
    );
  }
}
