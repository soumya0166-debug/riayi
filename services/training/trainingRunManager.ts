import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  TrainingRun,
  TrainingStatus,
  TrainingHyperparameters,
  TrainingRunMetrics,
  TrainingMetricPoint,
  ModelEvaluationReport,
  SupportedBaseModel,
} from '@/types/training';
import { AppError } from '@/lib/errors';

const TRAINING_RUNS_DIR = path.join(process.cwd(), 'storage', 'training_runs');

function sanitizeId(id: string): string {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new AppError('Invalid training run identifier.', 'VALIDATION_ERROR', 400);
  }
  return id;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export const DEFAULT_HYPERPARAMETERS: TrainingHyperparameters = {
  baseModel: 'Qwen/Qwen2.5-0.5B-Instruct',
  epochs: 3,
  learningRate: 2e-4,
  batchSize: 2,
  gradientAccumulationSteps: 4,
  loraRank: 16,
  loraAlpha: 32,
  loraDropout: 0.05,
  maxSequenceLength: 1024,
  targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
  quantization: '4bit',
  useGradientCheckpointing: true,
  warmupRatio: 0.1,
  weightDecay: 0.01,
};

export class TrainingRunManager {
  constructor() {
    ensureDir(TRAINING_RUNS_DIR);
  }

  private getRunPath(id: string): string {
    const cleanId = sanitizeId(id);
    const resolvedPath = path.resolve(TRAINING_RUNS_DIR, `${cleanId}.json`);
    if (!resolvedPath.startsWith(path.resolve(TRAINING_RUNS_DIR))) {
      throw new AppError('Path traversal detected in training run ID.', 'FORBIDDEN', 403);
    }
    return resolvedPath;
  }

  public async createRun(params: {
    datasetId: string;
    datasetName: string;
    name?: string;
    baseModel?: SupportedBaseModel;
    hyperparameters?: Partial<TrainingHyperparameters>;
  }): Promise<TrainingRun> {
    const runId = `run_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    const hp: TrainingHyperparameters = {
      ...DEFAULT_HYPERPARAMETERS,
      ...(params.hyperparameters || {}),
      baseModel: params.baseModel || params.hyperparameters?.baseModel || DEFAULT_HYPERPARAMETERS.baseModel,
    };

    const initialMetrics: TrainingRunMetrics = {
      currentEpoch: 0,
      totalEpochs: hp.epochs,
      currentStep: 0,
      totalSteps: 0,
      elapsedTimeSec: 0,
      progressPct: 0,
    };

    const runName =
      params.name?.trim() ||
      `${hp.baseModel.split('/')[1] || 'Qwen'} LoRA on ${params.datasetName}`;

    const run: TrainingRun = {
      id: runId,
      name: runName,
      datasetId: params.datasetId,
      datasetName: params.datasetName,
      status: 'training_preparation',
      hyperparameters: hp,
      metrics: initialMetrics,
      lossHistory: [],
      artifacts: {
        ollamaModelName: `riyai-qwen-lora:${runId.slice(-6)}`,
      },
      logs: [`[${now}] Initialized training run "${runName}". Prepared hyperparameters and model configurations.`],
      createdAt: now,
      updatedAt: now,
    };

    const runPath = this.getRunPath(runId);
    fs.writeFileSync(runPath, JSON.stringify(run, null, 2), 'utf-8');
    return run;
  }

  public async getRun(id: string): Promise<TrainingRun | null> {
    const runPath = this.getRunPath(id);
    if (!fs.existsSync(runPath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(runPath, 'utf-8');
      return JSON.parse(data) as TrainingRun;
    } catch {
      return null;
    }
  }

  public async listRuns(): Promise<TrainingRun[]> {
    ensureDir(TRAINING_RUNS_DIR);
    const files = fs.readdirSync(TRAINING_RUNS_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('_eval.json'));
    const runs: TrainingRun[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(TRAINING_RUNS_DIR, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(data) as TrainingRun;
        if (parsed && parsed.id) {
          runs.push(parsed);
        }
      } catch {
        // Skip unparseable files
      }
    }

    return runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async updateRun(id: string, updates: Partial<TrainingRun>): Promise<TrainingRun> {
    const run = await this.getRun(id);
    if (!run) {
      throw new AppError(`Training run "${id}" not found.`, 'NOT_FOUND', 404);
    }

    const updatedRun: TrainingRun = {
      ...run,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const runPath = this.getRunPath(id);
    fs.writeFileSync(runPath, JSON.stringify(updatedRun, null, 2), 'utf-8');
    return updatedRun;
  }

  public async updateStatus(
    id: string,
    status: TrainingStatus,
    errorDetails?: string
  ): Promise<TrainingRun> {
    const run = await this.getRun(id);
    if (!run) {
      throw new AppError(`Training run "${id}" not found.`, 'NOT_FOUND', 404);
    }

    const now = new Date().toISOString();
    const logEntry = `[${now}] Status changed to "${status}"${errorDetails ? `: ${errorDetails}` : ''}`;
    const logs = [...run.logs, logEntry].slice(-500);

    return this.updateRun(id, {
      status,
      errorDetails: errorDetails !== undefined ? errorDetails : run.errorDetails,
      logs,
    });
  }

  public async recordStep(
    id: string,
    log: {
      step: number;
      epoch: number;
      trainLoss?: number;
      valLoss?: number;
      learningRate?: number;
      totalSteps?: number;
      totalEpochs?: number;
      elapsedTimeSec?: number;
      message?: string;
    }
  ): Promise<TrainingRun> {
    const run = await this.getRun(id);
    if (!run) {
      throw new AppError(`Training run "${id}" not found.`, 'NOT_FOUND', 404);
    }

    const now = new Date().toISOString();
    const newLossHistory = [...run.lossHistory];

    if (log.trainLoss !== undefined || log.valLoss !== undefined) {
      const point: TrainingMetricPoint = {
        step: log.step,
        epoch: log.epoch,
        trainLoss: log.trainLoss,
        valLoss: log.valLoss,
        learningRate: log.learningRate,
        timestamp: now,
      };
      newLossHistory.push(point);
    }

    const totalSteps = log.totalSteps || run.metrics.totalSteps || 100;
    const progressPct = totalSteps > 0 ? Math.min(100, Math.round((log.step / totalSteps) * 100)) : 0;

    const bestVal =
      log.valLoss !== undefined
        ? run.metrics.bestValLoss !== undefined
          ? Math.min(run.metrics.bestValLoss, log.valLoss)
          : log.valLoss
        : run.metrics.bestValLoss;

    const newMetrics: TrainingRunMetrics = {
      ...run.metrics,
      currentStep: log.step,
      currentEpoch: log.epoch,
      totalSteps,
      totalEpochs: log.totalEpochs || run.metrics.totalEpochs,
      currentTrainLoss: log.trainLoss !== undefined ? log.trainLoss : run.metrics.currentTrainLoss,
      currentValLoss: log.valLoss !== undefined ? log.valLoss : run.metrics.currentValLoss,
      bestValLoss: bestVal,
      elapsedTimeSec: log.elapsedTimeSec ?? run.metrics.elapsedTimeSec + 5,
      progressPct,
    };

    const newLogs = [...run.logs];
    if (log.message) {
      newLogs.push(`[${now}] ${log.message}`);
    } else if (log.trainLoss !== undefined) {
      newLogs.push(
        `[${now}] Step ${log.step}/${totalSteps} | Epoch ${log.epoch.toFixed(2)} | Loss: ${log.trainLoss.toFixed(4)}${
          log.valLoss !== undefined ? ` | Val Loss: ${log.valLoss.toFixed(4)}` : ''
        }`
      );
    }

    return this.updateRun(id, {
      status: run.status === 'training_preparation' ? 'training_in_progress' : run.status,
      metrics: newMetrics,
      lossHistory: newLossHistory.slice(-200), // retain last 200 points
      logs: newLogs.slice(-500),
    });
  }

  public async saveEvaluationReport(id: string, report: ModelEvaluationReport): Promise<void> {
    const cleanId = sanitizeId(id);
    const evalPath = path.resolve(TRAINING_RUNS_DIR, `${cleanId}_eval.json`);
    fs.writeFileSync(evalPath, JSON.stringify(report, null, 2), 'utf-8');

    // Also update run artifacts and mark completed
    await this.updateRun(id, {
      status: 'completed',
      artifacts: {
        ...(await this.getRun(id))?.artifacts,
        evaluationReportId: report.id,
      },
    });
  }

  public async getEvaluationReport(id: string): Promise<ModelEvaluationReport | null> {
    const cleanId = sanitizeId(id);
    const evalPath = path.resolve(TRAINING_RUNS_DIR, `${cleanId}_eval.json`);
    if (!fs.existsSync(evalPath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(evalPath, 'utf-8');
      return JSON.parse(data) as ModelEvaluationReport;
    } catch {
      return null;
    }
  }

  public async deleteRun(id: string): Promise<boolean> {
    const runPath = this.getRunPath(id);
    if (!fs.existsSync(runPath)) {
      return false;
    }
    fs.unlinkSync(runPath);

    const evalPath = path.resolve(TRAINING_RUNS_DIR, `${sanitizeId(id)}_eval.json`);
    if (fs.existsSync(evalPath)) {
      fs.unlinkSync(evalPath);
    }
    return true;
  }
}
