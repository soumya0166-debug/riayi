import { StoredFile, FileChunk, FileCategory } from '@/types/attachment';
import { FILE_LIMITS } from '@/lib/constants';
import { generateId } from '@/lib/utils';

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  isScanned?: boolean;
  ocrRequired?: boolean;
  metadata?: Record<string, unknown>;
}

export class ContentExtractor {
  /**
   * Determine file category based on MIME type or extension.
   */
  public static inferCategory(mimeType: string, filename: string): FileCategory {
    const lowerName = filename.toLowerCase();
    if (
      mimeType.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(lowerName)
    ) {
      return 'image';
    }
    if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType === 'text/csv' ||
      /\.(csv|xlsx|xls)$/i.test(lowerName)
    ) {
      return 'spreadsheet';
    }
    if (
      mimeType === 'application/pdf' ||
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('msword') ||
      /\.(pdf|docx|doc)$/i.test(lowerName)
    ) {
      return 'document';
    }
    return 'text';
  }

  /**
   * Extract text content from a binary buffer according to MIME type or file extension.
   */
  public static async extractFromBuffer(
    buffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<ExtractionResult> {
    if (!buffer || buffer.length === 0) {
      throw new Error('File is empty (0 bytes).');
    }

    const ext = filename.split('.').pop()?.toLowerCase() || '';

    // 1. PDF Documents
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      return this.extractFromPdf(buffer);
    }

    // 2. Word Documents (DOCX)
    if (
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('msword') ||
      ext === 'docx' ||
      ext === 'doc'
    ) {
      return this.extractFromDocx(buffer);
    }

    // 3. Spreadsheets (XLSX, XLS, CSV)
    if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType === 'text/csv' ||
      ext === 'xlsx' ||
      ext === 'xls' ||
      ext === 'csv'
    ) {
      return this.extractFromSpreadsheet(buffer, ext);
    }

    // 4. Plaintext / Markdown / Other Text
    return this.extractFromText(buffer);
  }

  /**
   * Extract text from PDF buffer using pdf-parse with scanned PDF detection.
   */
  private static async extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    // Quick integrity check for PDF magic bytes (%PDF-)
    const headerPrefix = buffer.slice(0, 1024).toString('latin1');
    if (!headerPrefix.includes('%PDF-')) {
      throw new Error('PDF file is corrupted or has an invalid header.');
    }

    try {
      // Dynamic import to avoid client bundle issues
      const pdfParseModule = await import('pdf-parse');

      // In pdf-parse v2+, PDFParse is an exported class
      if (pdfParseModule.PDFParse) {
        const parser = new pdfParseModule.PDFParse({ data: buffer });
        try {
          const textResult = await parser.getText();
          let infoResult: Record<string, unknown> | null = null;
          try {
            infoResult = (await parser.getInfo()) as unknown as Record<string, unknown>;
          } catch {
            // Ignore info extraction warning
          }
          const cleaned = this.sanitizeText(textResult.text || '');
          const pageCount = textResult.total || textResult.pages?.length || 1;
          const nonWhitespaceLength = cleaned.replace(/\s+/g, '').length;
          const isScanned = pageCount >= 1 && nonWhitespaceLength < 30;

          return {
            text: cleaned,
            pageCount,
            isScanned,
            ocrRequired: isScanned,
            metadata: {
              info: infoResult?.info,
              version: infoResult?.version,
              warning: isScanned
                ? 'Scanned PDF detected. OCR is required to extract text from images in this document.'
                : undefined,
            },
          };
        } finally {
          await parser.destroy().catch(() => {});
        }
      }

      // Legacy fallback (v1 function or default export)
      const legacyFn =
        (pdfParseModule as unknown as { default?: (buf: Buffer) => Promise<{ text: string; numpages?: number; info?: unknown; version?: unknown }> }).default ||
        (typeof pdfParseModule === 'function' ? (pdfParseModule as (buf: Buffer) => Promise<{ text: string; numpages?: number; info?: unknown; version?: unknown }>) : null);

      if (typeof legacyFn === 'function') {
        const data = await legacyFn(buffer);
        const cleaned = this.sanitizeText(data.text || '');
        const pageCount = data.numpages || 1;
        const nonWhitespaceLength = cleaned.replace(/\s+/g, '').length;
        const isScanned = pageCount >= 1 && nonWhitespaceLength < 30;

        return {
          text: cleaned,
          pageCount,
          isScanned,
          ocrRequired: isScanned,
          metadata: {
            info: data.info,
            version: data.version,
            warning: isScanned
              ? 'Scanned PDF detected. OCR is required to extract text from images in this document.'
              : undefined,
          },
        };
      }

      throw new Error('Unsupported pdf-parse module format');
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('PDF file is corrupted')) {
        throw err;
      }
      // Fallback: extract visible ASCII/UTF8 strings if pdf-parse encounters edge cases
      const fallbackText = this.extractPrintableStrings(buffer);
      if (!fallbackText || fallbackText.length < 10) {
        throw new Error('PDF file is corrupted or unreadable.');
      }
      return {
        text: fallbackText,
        pageCount: 1,
        metadata: { parseWarning: String(err) },
      };
    }
  }

  /**
   * Extract text from DOCX buffer using mammoth.
   */
  private static async extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
    try {
      const mammothModule = await import('mammoth');
      const mammoth = mammothModule.default || mammothModule;
      const result = await mammoth.extractRawText({ buffer });
      const cleaned = this.sanitizeText(result.value);
      return {
        text: cleaned,
        metadata: { warnings: result.messages },
      };
    } catch (err: unknown) {
      return {
        text: this.extractPrintableStrings(buffer) || 'Could not extract text from Word document.',
        metadata: { parseWarning: String(err) },
      };
    }
  }

  /**
   * Extract text and tabular structure from Spreadsheets using SheetJS (xlsx).
   */
  private static async extractFromSpreadsheet(
    buffer: Buffer,
    ext: string
  ): Promise<ExtractionResult> {
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default || xlsxModule;
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetsText: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        // Convert sheet to CSV format for structured tabular representation
        const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ' | ' });
        if (csv.trim()) {
          sheetsText.push(`### Sheet: ${sheetName}\n\n${csv}`);
        }
      }

      const combinedText = sheetsText.join('\n\n---\n\n');
      return {
        text: this.sanitizeText(combinedText),
        metadata: { sheetNames: workbook.SheetNames },
      };
    } catch {
      // Fallback for CSV: parse as UTF-8 string
      if (ext === 'csv') {
        return this.extractFromText(buffer);
      }
      return {
        text: this.extractPrintableStrings(buffer) || 'Could not parse spreadsheet data.',
      };
    }
  }

  /**
   * Extract plain text or markdown from buffer.
   */
  private static extractFromText(buffer: Buffer): ExtractionResult {
    const raw = buffer.toString('utf-8');
    return {
      text: this.sanitizeText(raw),
    };
  }

  /**
   * Sanitize text: remove NULL bytes, normalize newlines, trim excessive space.
   */
  public static sanitizeText(text: string): string {
    return text
      .replace(/\0/g, '') // Remove null characters
      .replace(/\r\n/g, '\n') // Normalize Windows newlines
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace
      .replace(/\n{3,}/g, '\n\n') // Collapse excessive blank lines
      .trim();
  }

  /**
   * Extract printable ASCII strings as a resilient fallback.
   */
  private static extractPrintableStrings(buffer: Buffer): string {
    const str = buffer.toString('latin1');
    const matches = str.match(/[\x20-\x7E\s]{4,}/g);
    if (!matches) return '';
    return matches.join(' ').replace(/\s{2,}/g, ' ').slice(0, 5000);
  }

  /**
   * Break extracted text into semantically cohesive, overlapping chunks.
   * Suitable for RAG retrieval without token bloat.
   */
  public static chunkContent(file: StoredFile, fullText: string): FileChunk[] {
    const text = this.sanitizeText(fullText);
    if (!text) return [];

    const targetSize = FILE_LIMITS.CHUNK_TARGET_CHARS; // ~1800 chars (~450 tokens)
    const overlap = FILE_LIMITS.CHUNK_OVERLAP_CHARS; // ~150 chars

    const chunks: FileChunk[] = [];
    let start = 0;
    let chunkIndex = 0;

    // Detect section or page hints
    const pageBreakRegex = /\f|--- Page (\d+) ---/g;
    const pages = text.split(pageBreakRegex);
    const hasExplicitPages = pages.length > 1;

    if (hasExplicitPages) {
      // Chunk per page with target size bounds
      let currentPage = 1;
      for (const pageContent of pages) {
        if (!pageContent.trim()) {
          currentPage++;
          continue;
        }

        const subChunks = this.splitTextIntoWindows(pageContent, targetSize, overlap);
        for (const sub of subChunks) {
          chunks.push({
            id: generateId('chk'),
            fileId: file.id,
            userId: file.userId,
            conversationId: file.conversationId,
            fileName: file.originalName || file.name,
            chunkIndex: chunkIndex++,
            content: sub.text,
            pageNumber: currentPage,
            sectionTitle: sub.heading,
            tokenEstimate: Math.ceil(sub.text.length / 4),
            createdAt: new Date().toISOString(),
          });
        }
        currentPage++;
      }
    } else {
      // Chunk overall text into sliding windows
      const subChunks = this.splitTextIntoWindows(text, targetSize, overlap);
      for (const sub of subChunks) {
        chunks.push({
          id: generateId('chk'),
          fileId: file.id,
          userId: file.userId,
          conversationId: file.conversationId,
          fileName: file.originalName || file.name,
          chunkIndex: chunkIndex++,
          content: sub.text,
          pageNumber: Math.floor(start / 3000) + 1,
          sectionTitle: sub.heading,
          tokenEstimate: Math.ceil(sub.text.length / 4),
          createdAt: new Date().toISOString(),
        });
      }
    }

    return chunks;
  }

  /**
   * Split a block of text into windows respecting paragraph, sentence, and word boundaries.
   */
  private static splitTextIntoWindows(
    text: string,
    targetSize: number,
    overlap: number
  ): Array<{ text: string; heading?: string }> {
    const results: Array<{ text: string; heading?: string }> = [];
    let start = 0;
    let currentHeading: string | undefined;

    while (start < text.length) {
      let end = Math.min(start + targetSize, text.length);

      // If we aren't at the very end of the text, seek a natural break boundary
      if (end < text.length) {
        // Try paragraph break
        const paraBreak = text.lastIndexOf('\n\n', end);
        if (paraBreak > start + targetSize * 0.6) {
          end = paraBreak;
        } else {
          // Try sentence break
          const sentenceBreak = text.lastIndexOf('. ', end);
          if (sentenceBreak > start + targetSize * 0.6) {
            end = sentenceBreak + 1;
          } else {
            // Try whitespace
            const spaceBreak = text.lastIndexOf(' ', end);
            if (spaceBreak > start + targetSize * 0.5) {
              end = spaceBreak;
            }
          }
        }
      }

      const chunkSlice = text.substring(start, end).trim();

      // Check if chunk slice starts with or contains a heading
      const headingMatch = chunkSlice.match(/^(?:#{1,4}\s+|###\s+Sheet:\s+)(.+)$/m);
      if (headingMatch) {
        currentHeading = headingMatch[1].trim();
      }

      if (chunkSlice.length > 0) {
        results.push({
          text: chunkSlice,
          heading: currentHeading,
        });
      }

      if (end >= text.length) {
        break;
      }

      // Step forward with overlap
      start = Math.max(end - overlap, start + 1);
    }

    return results;
  }
}
