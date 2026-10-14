import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DatasetFormat,
  DatasetMetadata,
  DatasetRecord,
  DatasetStats,
  DatasetTaskType,
  CSVColumnMapping,
  DatasetSplitName,
} from '@/types/training';
import { AppError } from '@/lib/errors';

const DATASETS_BASE_DIR = path.join(process.cwd(), 'storage', 'datasets');

// Security helper: ensure ID is safe against path traversal
function sanitizeId(id: string): string {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new AppError('Invalid dataset identifier format.', 'VALIDATION_ERROR', 400);
  }
  return id;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export class DatasetStorageService {
  constructor() {
    ensureDir(DATASETS_BASE_DIR);
  }

  private getDatasetDir(id: string): string {
    const cleanId = sanitizeId(id);
    const resolvedPath = path.resolve(DATASETS_BASE_DIR, cleanId);
    if (!resolvedPath.startsWith(path.resolve(DATASETS_BASE_DIR))) {
      throw new AppError('Path traversal detected.', 'FORBIDDEN', 403);
    }
    return resolvedPath;
  }

  /**
   * Parse CSV text respecting quoted commas and line breaks.
   */
  public parseCSV(csvContent: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;

    for (let i = 0; i < csvContent.length; i++) {
      const char = csvContent[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        currentLine += char;
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && csvContent[i + 1] === '\n') {
          i++;
        }
        if (currentLine.trim()) {
          lines.push(currentLine);
        }
        currentLine = '';
      } else {
        currentLine += char;
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine);
    }

    if (lines.length < 2) {
      throw new AppError('CSV must contain a header row and at least one data row.', 'VALIDATION_ERROR', 400);
    }

    const parseLine = (line: string): string[] => {
      const tokens: string[] = [];
      let token = '';
      let inside = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inside && line[i + 1] === '"') {
            token += '"';
            i++;
          } else {
            inside = !inside;
          }
        } else if (c === ',' && !inside) {
          tokens.push(token.trim());
          token = '';
        } else {
          token += c;
        }
      }
      tokens.push(token.trim());
      return tokens;
    };

    const headers = parseLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  /**
   * Detect record format automatically from keys.
   */
  public detectFormat(sample: Record<string, unknown>): DatasetFormat {
    if (Array.isArray(sample.messages)) {
      return 'chat';
    }
    if (sample.instruction !== undefined || sample.output !== undefined) {
      return 'instruction';
    }
    if (sample.problem !== undefined || sample.generated_solution !== undefined) {
      return 'cot';
    }
    return 'instruction';
  }

  /**
   * Normalize an incoming record into a standardized training structure.
   */
  public normalizeRecord(
    raw: Record<string, unknown>,
    index: number,
    csvMapping?: CSVColumnMapping
  ): DatasetRecord | null {
    const id = typeof raw.id === 'string' ? raw.id : `rec_${index + 1}_${crypto.randomBytes(3).toString('hex')}`;

    // Handle CSV mapping if provided
    if (csvMapping) {
      const instruction = String(raw[csvMapping.promptColumn] || '').trim();
      const input = csvMapping.inputColumn ? String(raw[csvMapping.inputColumn] || '').trim() : '';
      const output = String(raw[csvMapping.outputColumn] || '').trim();
      const splitVal = csvMapping.splitColumn ? String(raw[csvMapping.splitColumn] || '').trim().toLowerCase() : undefined;
      const split: DatasetSplitName = splitVal === 'val' || splitVal === 'validation' ? 'val' : splitVal === 'test' ? 'test' : 'train';

      if (!instruction && !output) {
        return null;
      }

      return {
        id,
        instruction,
        input: input || undefined,
        output,
        split,
        tokenCountEst: Math.ceil((instruction.length + input.length + output.length) / 4),
      };
    }

    // Chat format: messages array
    if (Array.isArray(raw.messages) && raw.messages.length > 0) {
      const messages = (raw.messages as Array<{ role?: string; content?: string }>).filter(
        (m) => m && typeof m.content === 'string' && m.content.trim().length > 0
      ).map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user') as 'system' | 'user' | 'assistant',
        content: m.content!.trim(),
      }));

      const hasUser = messages.some((m) => m.role === 'user');
      const hasAssistant = messages.some((m) => m.role === 'assistant');
      if (!hasUser || !hasAssistant) {
        return null;
      }

      const totalChars = messages.reduce((acc, m) => acc + m.content.length, 0);
      return {
        id,
        messages,
        split: (raw.split as DatasetSplitName) || 'train',
        tokenCountEst: Math.ceil(totalChars / 4),
      };
    }

    // CoT / OpenMathReasoning format
    if (raw.problem !== undefined || raw.generated_solution !== undefined) {
      const problem = String(raw.problem || '').trim();
      const solution = String(raw.generated_solution || raw.solution || '').trim();
      const expected = String(raw.expected_answer || raw.answer || '').trim();

      if (!problem || (!solution && !expected)) {
        return null;
      }

      const output = solution || expected;
      return {
        id,
        problem,
        generated_solution: solution,
        expected_answer: expected,
        instruction: problem,
        output,
        split: (raw.split as DatasetSplitName) || 'train',
        tokenCountEst: Math.ceil((problem.length + output.length) / 4),
      };
    }

    // Instruction format
    const instruction = String(raw.instruction || raw.prompt || raw.question || '').trim();
    const input = String(raw.input || raw.context || '').trim();
    const output = String(raw.output || raw.response || raw.answer || '').trim();

    if (!instruction || !output) {
      return null;
    }

    return {
      id,
      instruction,
      input: input || undefined,
      output,
      split: (raw.split as DatasetSplitName) || 'train',
      tokenCountEst: Math.ceil((instruction.length + input.length + output.length) / 4),
    };
  }

  /**
   * Process and partition raw records into train/val/test splits.
   */
  public partitionSplits(
    records: DatasetRecord[],
    trainRatio = 0.8,
    valRatio = 0.1
  ): {
    records: DatasetRecord[];
    stats: DatasetStats;
  } {
    // 1. Deduplicate by hash of prompt + output
    const seenHashes = new Set<string>();
    const uniqueRecords: DatasetRecord[] = [];
    let duplicatesRemoved = 0;

    for (const rec of records) {
      const key = rec.messages
        ? rec.messages.map((m) => `${m.role}:${m.content}`).join('||')
        : `${rec.instruction || rec.problem || ''}||${rec.input || ''}||${rec.output || rec.generated_solution || ''}`;

      const hash = crypto.createHash('md5').update(key.trim()).digest('hex');
      if (seenHashes.has(hash)) {
        duplicatesRemoved++;
        continue;
      }
      seenHashes.add(hash);
      uniqueRecords.push(rec);
    }

    // 2. Check if records already have predefined splits
    const alreadySplit = uniqueRecords.filter((r) => r.split && ['train', 'val', 'test'].includes(r.split));
    if (alreadySplit.length === uniqueRecords.length) {
      const train = uniqueRecords.filter((r) => r.split === 'train').length;
      const val = uniqueRecords.filter((r) => r.split === 'val').length;
      const test = uniqueRecords.filter((r) => r.split === 'test').length;

      const totalChars = uniqueRecords.reduce((acc, r) => acc + (r.instruction?.length || 0) + (r.output?.length || 0), 0);
      const totalTokens = uniqueRecords.reduce((acc, r) => acc + (r.tokenCountEst || 0), 0);

      return {
        records: uniqueRecords,
        stats: {
          totalRecords: uniqueRecords.length,
          trainRecords: train,
          valRecords: val,
          testRecords: test,
          duplicatesRemoved,
          missingFieldsCount: 0,
          avgLengthChars: Math.round(totalChars / (uniqueRecords.length || 1)),
          totalTokensEst: totalTokens,
        },
      };
    }

    // 3. Deterministic split using hash modulo
    const trainCount = Math.floor(uniqueRecords.length * trainRatio);
    const valCount = Math.floor(uniqueRecords.length * valRatio);

    const splitRecords = uniqueRecords.map((rec, i) => {
      let split: DatasetSplitName = 'train';
      if (i >= trainCount + valCount) {
        split = 'test';
      } else if (i >= trainCount) {
        split = 'val';
      }
      return { ...rec, split };
    });

    const train = splitRecords.filter((r) => r.split === 'train').length;
    const val = splitRecords.filter((r) => r.split === 'val').length;
    const test = splitRecords.filter((r) => r.split === 'test').length;

    const totalChars = splitRecords.reduce((acc, r) => acc + (r.instruction?.length || 0) + (r.output?.length || 0), 0);
    const totalTokens = splitRecords.reduce((acc, r) => acc + (r.tokenCountEst || 0), 0);

    return {
      records: splitRecords,
      stats: {
        totalRecords: splitRecords.length,
        trainRecords: train,
        valRecords: val,
        testRecords: test,
        duplicatesRemoved,
        missingFieldsCount: 0,
        avgLengthChars: Math.round(totalChars / (splitRecords.length || 1)),
        totalTokensEst: totalTokens,
      },
    };
  }

  /**
   * Save a verified dataset to disk with metadata and separate split files.
   */
  public async saveDataset(
    name: string,
    description: string,
    taskType: DatasetTaskType,
    rawRecords: DatasetRecord[],
    options: {
      source: 'uploaded' | 'imported_math' | 'custom';
      originalFileName?: string;
      fileSizeBytes?: number;
      trainRatio?: number;
      valRatio?: number;
    }
  ): Promise<DatasetMetadata> {
    const id = `ds_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const datasetDir = this.getDatasetDir(id);
    ensureDir(datasetDir);

    const { records, stats } = this.partitionSplits(
      rawRecords,
      options.trainRatio ?? 0.8,
      options.valRatio ?? 0.1
    );

    if (records.length === 0) {
      throw new AppError('Dataset does not contain any valid, non-empty records.', 'VALIDATION_ERROR', 400);
    }

    const detectedFormat = records[0].messages ? 'chat' : records[0].problem ? 'cot' : 'instruction';

    const metadata: DatasetMetadata = {
      id,
      name: name.trim(),
      description: description.trim(),
      taskType,
      format: detectedFormat,
      version: 1,
      recordCount: records.length,
      stats,
      source: options.source,
      originalFileName: options.originalFileName,
      fileSizeBytes: options.fileSizeBytes || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save metadata
    fs.writeFileSync(path.join(datasetDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');

    // Save full dataset jsonl
    const fullJsonl = records.map((r) => JSON.stringify(r)).join('\n');
    fs.writeFileSync(path.join(datasetDir, 'full.jsonl'), fullJsonl, 'utf-8');

    // Save individual splits
    const trainRecords = records.filter((r) => r.split === 'train');
    const valRecords = records.filter((r) => r.split === 'val');
    const testRecords = records.filter((r) => r.split === 'test');

    fs.writeFileSync(path.join(datasetDir, 'train.jsonl'), trainRecords.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');
    fs.writeFileSync(path.join(datasetDir, 'val.jsonl'), valRecords.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');
    fs.writeFileSync(path.join(datasetDir, 'test.jsonl'), testRecords.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    return metadata;
  }

  /**
   * List all saved datasets on disk.
   */
  public listDatasets(): DatasetMetadata[] {
    ensureDir(DATASETS_BASE_DIR);
    const dirs = fs.readdirSync(DATASETS_BASE_DIR);
    const datasets: DatasetMetadata[] = [];

    for (const d of dirs) {
      try {
        const metaPath = path.join(DATASETS_BASE_DIR, d, 'metadata.json');
        if (fs.existsSync(metaPath)) {
          const meta: DatasetMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          datasets.push(meta);
        }
      } catch {
        // Skip malformed directories
      }
    }

    return datasets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Get dataset details along with preview samples.
   */
  public getDatasetDetails(id: string, previewLimit = 15): {
    metadata: DatasetMetadata;
    preview: DatasetRecord[];
  } {
    const datasetDir = this.getDatasetDir(id);
    const metaPath = path.join(datasetDir, 'metadata.json');
    const fullPath = path.join(datasetDir, 'full.jsonl');

    if (!fs.existsSync(metaPath) || !fs.existsSync(fullPath)) {
      throw new AppError(`Dataset with ID '${id}' was not found.`, 'NOT_FOUND', 404);
    }

    const metadata: DatasetMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const preview = lines.slice(0, previewLimit).map((l) => JSON.parse(l));

    return { metadata, preview };
  }

  /**
   * Get raw records for a specific split.
   */
  public getSplitRecords(id: string, split: DatasetSplitName): DatasetRecord[] {
    const datasetDir = this.getDatasetDir(id);
    const splitPath = path.join(datasetDir, `${split}.jsonl`);
    if (!fs.existsSync(splitPath)) {
      throw new AppError(`Split '${split}' for dataset '${id}' was not found.`, 'NOT_FOUND', 404);
    }
    const content = fs.readFileSync(splitPath, 'utf-8');
    return content.split('\n').filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
  }

  /**
   * Delete a dataset safely.
   */
  public deleteDataset(id: string): boolean {
    const datasetDir = this.getDatasetDir(id);
    if (!fs.existsSync(datasetDir)) {
      throw new AppError(`Dataset '${id}' does not exist.`, 'NOT_FOUND', 404);
    }
    fs.rmSync(datasetDir, { recursive: true, force: true });
    return true;
  }

  /**
   * Import the existing 280 train, 35 val, and 35 test samples from math_training/data.
   */
  public async importExistingMathDataset(): Promise<DatasetMetadata> {
    const mathDataDir = path.join(process.cwd(), 'math_training', 'data');
    const trainPath = path.join(mathDataDir, 'train.jsonl');
    const valPath = path.join(mathDataDir, 'val.jsonl');
    const testPath = path.join(mathDataDir, 'test.jsonl');

    if (!fs.existsSync(trainPath) || !fs.existsSync(valPath) || !fs.existsSync(testPath)) {
      throw new AppError(
        'Existing mathematical reasoning dataset files not found in math_training/data/.',
        'NOT_FOUND',
        404
      );
    }

    const records: DatasetRecord[] = [];

    const loadSplit = (filePath: string, split: DatasetSplitName) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      for (let i = 0; i < lines.length; i++) {
        const raw = JSON.parse(lines[i]);
        const norm = this.normalizeRecord(raw, records.length);
        if (norm) {
          norm.split = split;
          records.push(norm);
        }
      }
    };

    loadSplit(trainPath, 'train');
    loadSplit(valPath, 'val');
    loadSplit(testPath, 'test');

    const totalBytes =
      fs.statSync(trainPath).size + fs.statSync(valPath).size + fs.statSync(testPath).size;

    return this.saveDataset(
      'OpenMathReasoning Benchmark (Held-Out Evaluated)',
      'Curated mathematical reasoning split from MontenTech/OpenMathReasoning (CC-BY-4.0). Includes 280 training samples, 35 validation samples, and 35 strictly held-out test samples with step-by-step reasoning.',
      'reasoning',
      records,
      {
        source: 'imported_math',
        originalFileName: 'OpenMathReasoning_cot_split.jsonl',
        fileSizeBytes: totalBytes,
      }
    );
  }

  /**
   * Get preview samples for a dataset.
   */
  public getDatasetPreview(id: string, limit = 5): DatasetRecord[] {
    return this.getDatasetDetails(id, limit).preview;
  }

  /**
   * Ingest uploaded file contents (JSONL, JSON, CSV), validate schemas, and save with partition splits.
   */
  public async parseAndSaveUploadedDataset(params: {
    name: string;
    description: string;
    taskType: DatasetTaskType;
    fileContent: string;
    originalFilename: string;
    columnMapping?: CSVColumnMapping;
  }): Promise<{ metadata: DatasetMetadata; preview: DatasetRecord[] }> {
    const filename = params.originalFilename.toLowerCase();
    const records: DatasetRecord[] = [];

    if (filename.endsWith('.jsonl')) {
      const lines = params.fileContent.split('\n').filter((l) => l.trim().length > 0);
      for (let i = 0; i < lines.length; i++) {
        try {
          const raw = JSON.parse(lines[i]);
          const norm = this.normalizeRecord(raw, i);
          if (norm) records.push(norm);
        } catch {
          // ignore corrupted lines
        }
      }
    } else if (filename.endsWith('.csv')) {
      const parsed = this.parseCSV(params.fileContent);
      for (let i = 0; i < parsed.rows.length; i++) {
        const norm = this.normalizeRecord(parsed.rows[i], i, params.columnMapping);
        if (norm) records.push(norm);
      }
    } else if (filename.endsWith('.json')) {
      let rawJson: any;
      try {
        rawJson = JSON.parse(params.fileContent);
      } catch {
        throw new AppError('Invalid JSON structure in dataset file.', 'VALIDATION_ERROR', 400);
      }
      const rawList = Array.isArray(rawJson) ? rawJson : Array.isArray(rawJson.data) ? rawJson.data : [rawJson];
      for (let i = 0; i < rawList.length; i++) {
        const norm = this.normalizeRecord(rawList[i], i);
        if (norm) records.push(norm);
      }
    }

    if (records.length === 0) {
      throw new AppError(
        'No valid training records could be extracted. Please check the dataset schema or CSV column mapping.',
        'VALIDATION_ERROR',
        400
      );
    }

    const metadata = await this.saveDataset(
      params.name,
      params.description,
      params.taskType,
      records,
      {
        source: 'uploaded',
        originalFileName: params.originalFilename,
        fileSizeBytes: Buffer.byteLength(params.fileContent, 'utf-8'),
      }
    );

    const preview = this.getDatasetPreview(metadata.id, 5);
    return { metadata, preview };
  }
}

export const datasetStorageService = new DatasetStorageService();

