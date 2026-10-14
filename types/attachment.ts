export type SupportedMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/msword'
  | 'text/plain'
  | 'text/markdown'
  | 'text/csv'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.ms-excel'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif';

export type FileCategory = 'document' | 'spreadsheet' | 'image' | 'text';

export type FileProcessingStatus = 'uploading' | 'processing' | 'ready' | 'error' | 'ocr_required';

/**
 * Primary model representing a stored file attachment.
 */
export interface StoredFile {
  id: string; // file_<nanoid>
  userId: string;
  conversationId?: string;
  messageId?: string;
  name: string;
  originalName: string;
  size: number; // bytes
  mimeType: string;
  category: FileCategory;
  status: FileProcessingStatus;
  errorMessage?: string;
  isScanned?: boolean;
  ocrRequired?: boolean;
  dataUrl?: string; // base64 data URL for images or preview
  extractedText?: string;
  tokenCount?: number;
  chunkCount?: number;
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Backward compatibility alias for Phase 1 Attachment interface.
 */
export type Attachment = StoredFile;

/**
 * Individual chunk of text extracted from a stored file for RAG retrieval.
 */
export interface FileChunk {
  id: string; // chk_<nanoid>
  fileId: string;
  userId: string;
  conversationId?: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  sectionTitle?: string;
  tokenEstimate: number;
  embedding?: number[]; // Dense vector embedding for semantic search
  createdAt: string;
}

/**
 * Source attribution reference attached to an assistant response.
 */
export interface SourceReference {
  fileId: string;
  fileName: string;
  pageNumber?: number;
  sectionTitle?: string;
  excerpt: string;
}

/**
 * Result returned by KnowledgeService search.
 */
export interface ChunkSearchResult {
  chunk: FileChunk;
  relevanceScore: number;
  vectorScore?: number;
  keywordScore?: number;
  sourceReference: string; // e.g. "financial_report.pdf — Page 4"
}

/**
 * Ingestion result from KnowledgeService.
 */
export interface KnowledgeIngestResult {
  file: StoredFile;
  chunks: FileChunk[];
  previewText?: string;
}

