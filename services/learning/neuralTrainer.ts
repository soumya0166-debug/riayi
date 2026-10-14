import {
  ModelCheckpoint,
  ModelHyperparameters,
  CuratedDatasetVersion,
  TrainingLossPoint,
  LearningExperience,
} from '@/types/learning';
import { dbService } from '@/services/database/clientDb';
import { generateId } from '@/lib/utils';

export const DEFAULT_RANKER_HYPERPARAMETERS: ModelHyperparameters = {
  inputDimension: 6,
  hiddenDimension1: 16,
  hiddenDimension2: 8,
  learningRate: 0.02,
  batchSize: 8,
  epochs: 15,
  l2Reg: 0.001,
  dropoutRate: 0.1,
  earlyStoppingPatience: 4,
};

export class NeuralTrainer {
  /**
   * Train a task-specific neural re-ranking model using backpropagation
   * and mini-batch Adam optimization on a versioned dataset.
   */
  public async trainNeuralRanker(params: {
    dataset: CuratedDatasetVersion;
    hyperparameters?: Partial<ModelHyperparameters>;
    versionTag?: string;
  }): Promise<ModelCheckpoint> {
    const { dataset } = params;
    const hp: ModelHyperparameters = {
      ...DEFAULT_RANKER_HYPERPARAMETERS,
      ...(params.hyperparameters || {}),
    };

    const startTime = Date.now();

    // 1. Prepare Training & Validation Vectors
    const trainData = this.extractFeatureMatrix(dataset.splits.train);
    const valData = this.extractFeatureMatrix(dataset.splits.validation);

    if (trainData.length === 0) {
      throw new Error('Training split is empty. Cannot train neural ranker without examples.');
    }

    // 2. Initialize Model Weights using Xavier initialization
    let weights = this.initializeWeights(hp);

    // Adam optimizer states
    const adamState = this.initializeAdamState(hp);

    const lossHistory: TrainingLossPoint[] = [];
    let bestValLoss = Infinity;
    let bestWeights = this.cloneWeights(weights);
    let patienceCounter = 0;

    // 3. Training Loop across Epochs
    for (let epoch = 1; epoch <= hp.epochs; epoch++) {
      // Shuffle training batch
      this.shuffle(trainData);

      let epochTrainLoss = 0;
      const numBatches = Math.max(1, Math.ceil(trainData.length / hp.batchSize));

      for (let b = 0; b < numBatches; b++) {
        const batch = trainData.slice(b * hp.batchSize, (b + 1) * hp.batchSize);
        if (batch.length === 0) continue;

        // Forward Pass & Gradients
        const { batchLoss, grads } = this.computeBatchGradients(batch, weights, hp);
        epochTrainLoss += batchLoss;

        // Adam parameter update step
        weights = this.adamStep(weights, grads, adamState, hp);
      }

      const avgTrainLoss = epochTrainLoss / numBatches;

      // Evaluate Validation Loss
      const valLoss = valData.length > 0 ? this.computeDatasetLoss(valData, weights, hp) : avgTrainLoss;

      lossHistory.push({
        epoch,
        trainLoss: Number(avgTrainLoss.toFixed(5)),
        valLoss: Number(valLoss.toFixed(5)),
      });

      // Early stopping check
      if (valLoss < bestValLoss) {
        bestValLoss = valLoss;
        bestWeights = this.cloneWeights(weights);
        patienceCounter = 0;
      } else {
        patienceCounter++;
        if (patienceCounter >= hp.earlyStoppingPatience) {
          // Early stopping triggered
          break;
        }
      }
    }

    // 4. Create and Save Checkpoint
    const modelVersion = params.versionTag || `v${Date.now().toString().slice(-4)}`;
    const checkpointId = `checkpoint_ranker_${modelVersion}_${generateId('mdl')}`;

    const checkpoint: ModelCheckpoint = {
      id: checkpointId,
      version: modelVersion,
      task: 'retrieval_ranking',
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      hyperparameters: hp,
      weights: bestWeights,
      trainHistory: lossHistory,
      finalTrainLoss: lossHistory[lossHistory.length - 1]?.trainLoss || 0,
      finalValLoss: Number(bestValLoss.toFixed(5)),
      trainedAt: new Date().toISOString(),
      trainingDurationMs: Date.now() - startTime,
    };

    await dbService.saveModelCheckpoint(checkpoint);
    return checkpoint;
  }

  /**
   * Run forward-pass inference on a feature vector using a trained checkpoint.
   */
  public predict(
    features: {
      vectorSimilarity: number;
      keywordCoverage: number;
      proximityBonus: number;
      queryLengthNorm?: number;
      chunkLengthNorm?: number;
      exactTitleMatch?: number;
    },
    checkpoint: ModelCheckpoint
  ): number {
    const x = [
      features.vectorSimilarity,
      features.keywordCoverage,
      features.proximityBonus,
      features.queryLengthNorm ?? 0.5,
      features.chunkLengthNorm ?? 0.5,
      features.exactTitleMatch ?? 0,
    ];

    const { output } = this.forward(x, checkpoint.weights);
    return Number(output.toFixed(4));
  }

  // ==========================================
  // Neural Network Mathematical Operations
  // ==========================================

  private forward(
    x: number[],
    w: ModelCheckpoint['weights']
  ): { h1: number[]; h2: number[]; output: number } {
    // Hidden Layer 1: ReLU(W1 * x + b1)
    const h1: number[] = new Array(w.b1.length);
    for (let i = 0; i < w.b1.length; i++) {
      let sum = w.b1[i];
      for (let j = 0; j < x.length; j++) {
        sum += w.W1[i][j] * x[j];
      }
      h1[i] = Math.max(0, sum); // ReLU
    }

    // Hidden Layer 2: ReLU(W2 * h1 + b2)
    const h2: number[] = new Array(w.b2.length);
    for (let i = 0; i < w.b2.length; i++) {
      let sum = w.b2[i];
      for (let j = 0; j < h1.length; j++) {
        sum += w.W2[i][j] * h1[j];
      }
      h2[i] = Math.max(0, sum); // ReLU
    }

    // Output Layer: Sigmoid(W3 * h2 + b3)
    let outSum = w.b3;
    for (let j = 0; j < h2.length; j++) {
      outSum += w.W3[j] * h2[j];
    }
    const output = 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, outSum))));

    return { h1, h2, output };
  }

  private computeBatchGradients(
    batch: Array<{ x: number[]; y: number }>,
    w: ModelCheckpoint['weights'],
    hp: ModelHyperparameters
  ): { batchLoss: number; grads: any } {
    const dW1 = w.W1.map((row) => row.map(() => 0));
    const db1 = w.b1.map(() => 0);
    const dW2 = w.W2.map((row) => row.map(() => 0));
    const db2 = w.b2.map(() => 0);
    const dW3 = w.W3.map(() => 0);
    let db3 = 0;

    let batchLoss = 0;
    const eps = 1e-7;

    for (const { x, y } of batch) {
      const { h1, h2, output } = this.forward(x, w);

      // Binary Cross-Entropy Loss
      const loss = -(y * Math.log(output + eps) + (1 - y) * Math.log(1 - output + eps));
      batchLoss += loss;

      // Output gradient: dL/d(outSum) = (output - y)
      const dOut = output - y;
      db3 += dOut;

      // Layer 3 weights gradient
      const dh2: number[] = new Array(h2.length).fill(0);
      for (let j = 0; j < h2.length; j++) {
        dW3[j] += dOut * h2[j];
        dh2[j] += dOut * w.W3[j];
      }

      // Layer 2 gradients (with ReLU backprop)
      const dh1: number[] = new Array(h1.length).fill(0);
      for (let i = 0; i < h2.length; i++) {
        const dRelu = h2[i] > 0 ? dh2[i] : 0;
        db2[i] += dRelu;
        for (let j = 0; j < h1.length; j++) {
          dW2[i][j] += dRelu * h1[j];
          dh1[j] += dRelu * w.W2[i][j];
        }
      }

      // Layer 1 gradients (with ReLU backprop)
      for (let i = 0; i < h1.length; i++) {
        const dRelu = h1[i] > 0 ? dh1[i] : 0;
        db1[i] += dRelu;
        for (let j = 0; j < x.length; j++) {
          dW1[i][j] += dRelu * x[j];
        }
      }
    }

    const n = batch.length;
    // Normalize gradients by batch size and apply L2 regularization
    return {
      batchLoss: batchLoss / n,
      grads: {
        dW1: dW1.map((row, i) => row.map((v, j) => v / n + hp.l2Reg * w.W1[i][j])),
        db1: db1.map((v) => v / n),
        dW2: dW2.map((row, i) => row.map((v, j) => v / n + hp.l2Reg * w.W2[i][j])),
        db2: db2.map((v) => v / n),
        dW3: dW3.map((v, j) => v / n + hp.l2Reg * w.W3[j]),
        db3: db3 / n,
      },
    };
  }

  private adamStep(
    w: ModelCheckpoint['weights'],
    grads: any,
    state: any,
    hp: ModelHyperparameters
  ): ModelCheckpoint['weights'] {
    const beta1 = 0.9;
    const beta2 = 0.999;
    const eps = 1e-8;
    state.t += 1;

    const lr = hp.learningRate;
    const correction1 = 1 - Math.pow(beta1, state.t);
    const correction2 = 1 - Math.pow(beta2, state.t);

    const updateMatrix = (wMat: number[][], gMat: number[][], mMat: number[][], vMat: number[][]) => {
      return wMat.map((row, i) =>
        row.map((val, j) => {
          mMat[i][j] = beta1 * mMat[i][j] + (1 - beta1) * gMat[i][j];
          vMat[i][j] = beta2 * vMat[i][j] + (1 - beta2) * gMat[i][j] * gMat[i][j];
          const mHat = mMat[i][j] / correction1;
          const vHat = vMat[i][j] / correction2;
          return val - (lr * mHat) / (Math.sqrt(vHat) + eps);
        })
      );
    };

    const updateVector = (wVec: number[], gVec: number[], mVec: number[], vVec: number[]) => {
      return wVec.map((val, i) => {
        mVec[i] = beta1 * mVec[i] + (1 - beta1) * gVec[i];
        vVec[i] = beta2 * vVec[i] + (1 - beta2) * gVec[i] * gVec[i];
        const mHat = mVec[i] / correction1;
        const vHat = vVec[i] / correction2;
        return val - (lr * mHat) / (Math.sqrt(vHat) + eps);
      });
    };

    const newW1 = updateMatrix(w.W1, grads.dW1, state.mW1, state.vW1);
    const newB1 = updateVector(w.b1, grads.db1, state.mb1, state.vb1);
    const newW2 = updateMatrix(w.W2, grads.dW2, state.mW2, state.vW2);
    const newB2 = updateVector(w.b2, grads.db2, state.mb2, state.vb2);
    const newW3 = updateVector(w.W3, grads.dW3, state.mW3, state.vW3);

    state.mb3 = beta1 * state.mb3 + (1 - beta1) * grads.db3;
    state.vb3 = beta2 * state.vb3 + (1 - beta2) * grads.db3 * grads.db3;
    const mb3Hat = state.mb3 / correction1;
    const vb3Hat = state.vb3 / correction2;
    const newB3 = w.b3 - (lr * mb3Hat) / (Math.sqrt(vb3Hat) + eps);

    return {
      W1: newW1,
      b1: newB1,
      W2: newW2,
      b2: newB2,
      W3: newW3,
      b3: newB3,
    };
  }

  private computeDatasetLoss(
    dataset: Array<{ x: number[]; y: number }>,
    w: ModelCheckpoint['weights'],
    hp: ModelHyperparameters
  ): number {
    let total = 0;
    const eps = 1e-7;
    for (const { x, y } of dataset) {
      const { output } = this.forward(x, w);
      total += -(y * Math.log(output + eps) + (1 - y) * Math.log(1 - output + eps));
    }
    return total / dataset.length;
  }

  private initializeWeights(hp: ModelHyperparameters): ModelCheckpoint['weights'] {
    const xavier = (fanIn: number, fanOut: number) => {
      const limit = Math.sqrt(6 / (fanIn + fanOut));
      return (Math.random() * 2 - 1) * limit;
    };

    const W1: number[][] = [];
    for (let i = 0; i < hp.hiddenDimension1; i++) {
      const row: number[] = [];
      for (let j = 0; j < hp.inputDimension; j++) {
        row.push(xavier(hp.inputDimension, hp.hiddenDimension1));
      }
      W1.push(row);
    }

    const W2: number[][] = [];
    for (let i = 0; i < hp.hiddenDimension2; i++) {
      const row: number[] = [];
      for (let j = 0; j < hp.hiddenDimension1; j++) {
        row.push(xavier(hp.hiddenDimension1, hp.hiddenDimension2));
      }
      W2.push(row);
    }

    const W3: number[] = [];
    for (let j = 0; j < hp.hiddenDimension2; j++) {
      W3.push(xavier(hp.hiddenDimension2, 1));
    }

    return {
      W1,
      b1: new Array(hp.hiddenDimension1).fill(0.01),
      W2,
      b2: new Array(hp.hiddenDimension2).fill(0.01),
      W3,
      b3: 0.0,
    };
  }

  private initializeAdamState(hp: ModelHyperparameters) {
    return {
      t: 0,
      mW1: Array.from({ length: hp.hiddenDimension1 }, () => new Array(hp.inputDimension).fill(0)),
      vW1: Array.from({ length: hp.hiddenDimension1 }, () => new Array(hp.inputDimension).fill(0)),
      mb1: new Array(hp.hiddenDimension1).fill(0),
      vb1: new Array(hp.hiddenDimension1).fill(0),
      mW2: Array.from({ length: hp.hiddenDimension2 }, () => new Array(hp.hiddenDimension1).fill(0)),
      vW2: Array.from({ length: hp.hiddenDimension2 }, () => new Array(hp.hiddenDimension1).fill(0)),
      mb2: new Array(hp.hiddenDimension2).fill(0),
      vb2: new Array(hp.hiddenDimension2).fill(0),
      mW3: new Array(hp.hiddenDimension2).fill(0),
      vW3: new Array(hp.hiddenDimension2).fill(0),
      mb3: 0,
      vb3: 0,
    };
  }

  private extractFeatureMatrix(records: LearningExperience[]): Array<{ x: number[]; y: number }> {
    const list: Array<{ x: number[]; y: number }> = [];

    for (const r of records) {
      if (r.features && r.features.label !== undefined) {
        list.push({
          x: [
            r.features.vectorSimilarity ?? 0.5,
            r.features.keywordCoverage ?? 0.5,
            r.features.proximityBonus ?? 0.0,
            r.features.queryLengthNorm ?? Math.min(1, r.inputQuery.length / 50),
            r.features.chunkLengthNorm ?? Math.min(1, (r.contextSnippet?.length || 200) / 1000),
            r.features.exactTitleMatch ?? 0,
          ],
          y: r.features.label,
        });
      } else {
        // Synthesize features from experience fields
        const y = r.outcome === 'positive' ? 1 : 0;
        const qLenNorm = Math.min(1, r.inputQuery.length / 50);
        const snippetLenNorm = Math.min(1, (r.contextSnippet?.length || 200) / 1000);
        list.push({
          x: [0.6, 0.5, 0.05, qLenNorm, snippetLenNorm, 0],
          y,
        });
      }
    }

    return list;
  }

  private cloneWeights(w: ModelCheckpoint['weights']): ModelCheckpoint['weights'] {
    return {
      W1: w.W1.map((r) => [...r]),
      b1: [...w.b1],
      W2: w.W2.map((r) => [...r]),
      b2: [...w.b2],
      W3: [...w.W3],
      b3: w.b3,
    };
  }

  private shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

export const neuralTrainer = new NeuralTrainer();
