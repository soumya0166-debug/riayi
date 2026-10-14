'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Database,
  Sliders,
  Play,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  FileText,
  Trash2,
  Eye,
  RefreshCw,
  Terminal,
  Activity,
  Layers,
  ArrowLeft,
  Download,
  ExternalLink,
  ChevronRight,
  Zap,
  Info,
  Server,
  Sparkles,
  Brain,
} from 'lucide-react';
import {
  DatasetMetadata,
  DatasetRecord,
  DatasetTaskType,
  TrainingRun,
  SupportedBaseModel,
  ModelEvaluationReport,
  OllamaServiceStatus,
  CSVColumnMapping,
} from '@/types/training';
import SelfLearningCenter from '@/components/learning/SelfLearningCenter';
import '@/styles/training.css';

export default function TrainingWorkspacePage() {
  const [activeTab, setActiveTab] = useState<
    'datasets' | 'tuning' | 'dashboard' | 'evaluation' | 'integration' | 'self_learning'
  >('self_learning');

  // Datasets State
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Upload Form State
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadTaskType, setUploadTaskType] = useState<DatasetTaskType>('mathematical_reasoning');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [enableCsvMapping, setEnableCsvMapping] = useState(false);
  const [csvPromptCol, setCsvPromptCol] = useState('instruction');
  const [csvInputCol, setCsvInputCol] = useState('input');
  const [csvOutputCol, setCsvOutputCol] = useState('output');
  const [csvSplitCol, setCsvSplitCol] = useState('split');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview Drawer
  const [previewDatasetId, setPreviewDatasetId] = useState<string | null>(null);
  const [previewDatasetName, setPreviewDatasetName] = useState<string>('');
  const [previewRecords, setPreviewRecords] = useState<DatasetRecord[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Fine-Tuning State
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [baseModel, setBaseModel] = useState<SupportedBaseModel>('Qwen/Qwen2.5-0.5B-Instruct');
  const [epochs, setEpochs] = useState<number>(3);
  const [learningRate, setLearningRate] = useState<number>(0.0002);
  const [batchSize, setBatchSize] = useState<number>(2);
  const [gradAccum, setGradAccum] = useState<number>(4);
  const [loraRank, setLoraRank] = useState<number>(16);
  const [loraAlpha, setLoraAlpha] = useState<number>(32);
  const [quantization, setQuantization] = useState<'4bit' | '8bit' | 'none'>('4bit');
  const [isCreatingRun, setIsCreatingRun] = useState(false);

  // Training Runs & Dashboard
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [currentRun, setCurrentRun] = useState<TrainingRun | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // Evaluation Benchmark
  const [evalReport, setEvalReport] = useState<ModelEvaluationReport | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [isEvaluatingLocal, setIsEvaluatingLocal] = useState(false);

  // Local Ollama Status & Inference
  const [ollamaStatus, setOllamaStatus] = useState<OllamaServiceStatus | null>(null);
  const [loadingOllama, setLoadingOllama] = useState(false);
  const [testPrompt, setTestPrompt] = useState('What is 12 * 13? Show your step-by-step calculation.');
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('qwen2.5:0.5b');
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testLatencySec, setTestLatencySec] = useState<number | null>(null);
  const [isTestingInference, setIsTestingInference] = useState(false);
  const [modelfileCode, setModelfileCode] = useState<string>('');

  // Initial Load
  useEffect(() => {
    fetchDatasets();
    fetchRuns();
    fetchOllamaStatus();
    fetchEvaluationReport();
  }, []);

  // Update current run when selectedRunId changes
  useEffect(() => {
    if (selectedRunId) {
      const found = runs.find((r) => r.id === selectedRunId);
      if (found) setCurrentRun(found);
    } else if (runs.length > 0) {
      setSelectedRunId(runs[0].id);
      setCurrentRun(runs[0]);
    }
  }, [selectedRunId, runs]);

  // Sync selected dataset for tuning
  useEffect(() => {
    if (!selectedDatasetId && datasets.length > 0) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [datasets, selectedDatasetId]);

  // Fetch Datasets
  async function fetchDatasets() {
    try {
      setLoadingDatasets(true);
      const res = await fetch('/api/training/datasets');
      const data = await res.json();
      if (data.success) {
        setDatasets(data.datasets);
      }
    } catch (err) {
      console.error('Failed to fetch datasets:', err);
    } finally {
      setLoadingDatasets(false);
    }
  }

  // Fetch Runs
  async function fetchRuns() {
    try {
      setLoadingRuns(true);
      const res = await fetch('/api/training/runs');
      const data = await res.json();
      if (data.success) {
        setRuns(data.runs);
      }
    } catch (err) {
      console.error('Failed to fetch training runs:', err);
    } finally {
      setLoadingRuns(false);
    }
  }

  // Fetch Ollama Status
  async function fetchOllamaStatus() {
    try {
      setLoadingOllama(true);
      const res = await fetch('/api/training/models');
      const data = await res.json();
      if (data.success) {
        setOllamaStatus(data.status);
        if (data.status.installedModels?.length > 0) {
          setSelectedOllamaModel(data.status.installedModels[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to check Ollama status:', err);
    } finally {
      setLoadingOllama(false);
    }
  }

  // Fetch Evaluation Report
  async function fetchEvaluationReport() {
    try {
      setLoadingEval(true);
      const res = await fetch('/api/training/evaluate');
      const data = await res.json();
      if (data.success) {
        setEvalReport(data.report);
      }
    } catch (err) {
      console.error('Failed to fetch evaluation report:', err);
    } finally {
      setLoadingEval(false);
    }
  }

  // Handle File Upload
  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    setUploadSuccess(null);

    if (!selectedFile) {
      setUploadError('Please select a .jsonl, .json, or .csv dataset file.');
      return;
    }

    if (!uploadName.trim()) {
      setUploadError('Please enter a descriptive name for this dataset.');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', uploadName.trim());
      formData.append('description', uploadDesc.trim());
      formData.append('taskType', uploadTaskType);

      if (enableCsvMapping && selectedFile.name.endsWith('.csv')) {
        const mapping: CSVColumnMapping = {
          promptColumn: csvPromptCol.trim(),
          inputColumn: csvInputCol.trim() || undefined,
          outputColumn: csvOutputCol.trim(),
          splitColumn: csvSplitCol.trim() || undefined,
        };
        formData.append('columnMapping', JSON.stringify(mapping));
      }

      const res = await fetch('/api/training/datasets', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Dataset upload failed.');
      }

      setUploadSuccess(`Dataset "${data.dataset.name}" imported successfully with ${data.dataset.stats.totalRecords} valid records.`);
      setSelectedFile(null);
      setUploadName('');
      setUploadDesc('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      fetchDatasets();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  }

  // Import Existing OpenMathReasoning Dataset
  async function handleImportMathDataset() {
    try {
      setUploadError(null);
      setUploadSuccess(null);
      setIsUploading(true);

      const res = await fetch('/api/training/datasets/import-math', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to import OpenMathReasoning dataset.');
      }

      setUploadSuccess('Successfully imported OpenMathReasoning benchmark dataset (280 train, 35 val, 35 test samples).');
      fetchDatasets();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  }

  // Delete Dataset
  async function handleDeleteDataset(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete dataset "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/training/datasets/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchDatasets();
      }
    } catch (err) {
      console.error('Failed to delete dataset:', err);
    }
  }

  // View Dataset Preview
  async function handleViewPreview(id: string, name: string) {
    try {
      setIsLoadingPreview(true);
      setPreviewDatasetId(id);
      setPreviewDatasetName(name);
      const res = await fetch(`/api/training/datasets/${id}?limit=20`);
      const data = await res.json();
      if (data.success) {
        setPreviewRecords(data.preview || []);
      }
    } catch (err) {
      console.error('Failed to fetch preview:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  }

  // Create Training Run & Download Colab Notebook
  async function handleCreateRunAndDownloadNotebook() {
    if (!selectedDatasetId) {
      alert('Please select a dataset first.');
      return;
    }
    try {
      setIsCreatingRun(true);
      const res = await fetch('/api/training/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: selectedDatasetId,
          baseModel,
          hyperparameters: {
            baseModel,
            epochs,
            learningRate,
            batchSize,
            gradientAccumulationSteps: gradAccum,
            loraRank,
            loraAlpha,
            quantization,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create training run.');
      }

      const run = data.run as TrainingRun;
      await fetchRuns();
      setSelectedRunId(run.id);

      // Trigger download of the customized Colab notebook
      window.location.href = `/api/training/runs/${run.id}/notebook`;
      setActiveTab('dashboard');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreatingRun(false);
    }
  }

  // Run Test Inference
  async function handleTestInference() {
    try {
      setIsTestingInference(true);
      setTestOutput(null);
      setTestLatencySec(null);

      const res = await fetch('/api/training/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-inference',
          modelName: selectedOllamaModel,
          testPrompt,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestOutput(data.response);
        setTestLatencySec(data.latencySec);
      } else {
        setTestOutput(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      setTestOutput(`Inference request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTestingInference(false);
    }
  }

  // Generate Modelfile
  async function handleGenerateModelfile() {
    try {
      const res = await fetch('/api/training/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-modelfile',
          modelName: selectedOllamaModel,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setModelfileCode(data.modelfile);
      }
    } catch (err) {
      console.error('Failed to generate modelfile:', err);
    }
  }

  // Run Live Local Evaluation
  async function handleRunLocalEval() {
    try {
      setIsEvaluatingLocal(true);
      const res = await fetch('/api/training/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelName: selectedOllamaModel,
          sampleLimit: 5,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEvalReport(data.report);
      } else {
        alert(`Evaluation error: ${data.error}`);
      }
    } catch (err) {
      alert(`Local evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsEvaluatingLocal(false);
    }
  }

  return (
    <div className="training-workspace">
      {/* Workspace Header */}
      <header className="training-header">
        <div className="training-title-group">
          <Link href="/chat" className="btn btn-ghost btn-sm" style={{ padding: '0.4rem 0.6rem' }} title="Back to Chat">
            <ArrowLeft size={16} />
            <span>Chat</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              RIYAI Model Studio &amp; Fine-Tuning
            </h1>
            <span className="training-badge">Phase 4</span>
          </div>
        </div>

        {/* Ollama Health Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: 'var(--font-size-xs)',
              background: 'var(--bg-secondary)',
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: ollamaStatus?.isAvailable ? 'var(--status-success)' : 'var(--status-warning)',
                boxShadow: ollamaStatus?.isAvailable ? '0 0 8px #10b981' : 'none',
              }}
            />
            <span>
              Ollama: {ollamaStatus?.isAvailable ? 'Online (Localhost:11434)' : 'Offline'}
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="training-nav-tabs">
            <button
              className={`training-nav-tab ${activeTab === 'datasets' ? 'active' : ''}`}
              onClick={() => setActiveTab('datasets')}
            >
              <Database size={15} />
              <span>Datasets</span>
            </button>
            <button
              className={`training-nav-tab ${activeTab === 'tuning' ? 'active' : ''}`}
              onClick={() => setActiveTab('tuning')}
            >
              <Sliders size={15} />
              <span>LoRA &amp; Colab</span>
            </button>
            <button
              className={`training-nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <Activity size={15} />
              <span>Dashboard</span>
            </button>
            <button
              className={`training-nav-tab ${activeTab === 'evaluation' ? 'active' : ''}`}
              onClick={() => setActiveTab('evaluation')}
            >
              <CheckCircle2 size={15} />
              <span>Evaluation</span>
            </button>
            <button
              className={`training-nav-tab ${activeTab === 'integration' ? 'active' : ''}`}
              onClick={() => setActiveTab('integration')}
            >
              <Server size={15} />
              <span>Model Integration</span>
            </button>
            <button
              className={`training-nav-tab ${activeTab === 'self_learning' ? 'active' : ''}`}
              onClick={() => setActiveTab('self_learning')}
              style={{
                background:
                  activeTab === 'self_learning'
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(124, 58, 237, 0.25) 100%)'
                    : undefined,
                borderColor: activeTab === 'self_learning' ? 'rgba(99, 102, 241, 0.5)' : undefined,
                color: activeTab === 'self_learning' ? '#a5b4fc' : undefined,
              }}
            >
              <Brain size={15} style={{ color: '#818cf8' }} />
              <span style={{ fontWeight: 600 }}>Self-Learning Engine</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="training-content">
        {/* ============================================================ */}
        {/* TAB 0: SELF-LEARNING ENGINE & MLOPS DASHBOARD */}
        {/* ============================================================ */}
        {activeTab === 'self_learning' && <SelfLearningCenter />}

        {/* ============================================================ */}
        {/* TAB 1: DATASET UPLOAD & MANAGEMENT */}
        {/* ============================================================ */}
        {activeTab === 'datasets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Top Alert & Action */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
                  Dataset Management &amp; Validation
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
                  Upload custom instruction or reasoning datasets (.jsonl, .json, .csv) with schema checks, duplicate filtering, and zero-leakage split partitions.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleImportMathDataset}
                disabled={isUploading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Sparkles size={15} style={{ color: 'var(--riyai-accent)' }} />
                <span>Import Existing OpenMathReasoning Split</span>
              </button>
            </div>

            {/* Notification Banners */}
            {uploadError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: 'var(--font-size-sm)' }}>
                <AlertTriangle size={17} style={{ flexShrink: 0 }} />
                <span>{uploadError}</span>
              </div>
            )}
            {uploadSuccess && (
              <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#86efac', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: 'var(--font-size-sm)' }}>
                <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {/* Upload Box Card */}
            <div className="training-card">
              <div className="training-card-header">
                <div className="training-card-title">
                  <UploadCloud size={20} style={{ color: 'var(--riyai-accent)' }} />
                  <span>Upload Dataset File</span>
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>Max 50MB &bull; UTF-8 Enforced</span>
              </div>

              <form onSubmit={handleUpload}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div className="form-group">
                    <label className="form-label">Dataset Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Mathematics Olympiad Step-by-Step"
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Task Type</label>
                    <select
                      className="form-select"
                      value={uploadTaskType}
                      onChange={(e) => setUploadTaskType(e.target.value as DatasetTaskType)}
                    >
                      <option value="mathematical_reasoning">Mathematical Reasoning (CoT)</option>
                      <option value="general_instruction">General Instruction Following</option>
                      <option value="code_generation">Code &amp; System Architecture</option>
                      <option value="multi_turn_chat">Multi-Turn Dialogue</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Description &amp; Origin</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Brief description of training data sources, licence, or domain focus..."
                    value={uploadDesc}
                    onChange={(e) => setUploadDesc(e.target.value)}
                  />
                </div>

                {/* Drag and Drop Zone */}
                <div
                  className={`upload-dropzone ${isDragging ? 'drag-active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.[0]) {
                      setSelectedFile(e.dataTransfer.files[0]);
                      if (!uploadName) setUploadName(e.dataTransfer.files[0].name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jsonl,.json,.csv"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setSelectedFile(e.target.files[0]);
                        if (!uploadName) setUploadName(e.target.files[0].name.replace(/\.[^/.]+$/, ''));
                      }
                    }}
                  />
                  <div className="upload-icon-wrapper">
                    <UploadCloud size={28} />
                  </div>
                  <div>
                    {selectedFile ? (
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--riyai-accent)', fontSize: 'var(--font-size-base)' }}>
                          {selectedFile.name}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          {(selectedFile.size / 1024).toFixed(1)} KB &bull; Click or drag to replace
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--font-size-base)' }}>
                          Click to browse or drag &amp; drop dataset file
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          Accepts .jsonl (Instruction / Chat / CoT), .json, or .csv
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* CSV Column Mapping Option */}
                {selectedFile?.name.endsWith('.csv') && (
                  <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={enableCsvMapping}
                        onChange={(e) => setEnableCsvMapping(e.target.checked)}
                      />
                      <span>Enable Custom CSV Column Mapping</span>
                    </label>

                    {enableCsvMapping && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                        <div className="form-group">
                          <label className="form-label">Prompt / Instruction Column *</label>
                          <input type="text" className="form-input" value={csvPromptCol} onChange={(e) => setCsvPromptCol(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Input / Context Column</label>
                          <input type="text" className="form-input" value={csvInputCol} onChange={(e) => setCsvInputCol(e.target.value)} placeholder="(Optional)" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Output / Answer Column *</label>
                          <input type="text" className="form-input" value={csvOutputCol} onChange={(e) => setCsvOutputCol(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Split Column</label>
                          <input type="text" className="form-input" value={csvSplitCol} onChange={(e) => setCsvSplitCol(e.target.value)} placeholder="(train/val/test)" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isUploading || !selectedFile}
                    style={{ minWidth: 160 }}
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw size={15} className="spin" />
                        <span>Validating &amp; Ingesting...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud size={16} />
                        <span>Upload &amp; Partition Dataset</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Available Datasets Table */}
            <div className="training-card">
              <div className="training-card-header">
                <div className="training-card-title">
                  <FileText size={20} style={{ color: 'var(--riyai-accent)' }} />
                  <span>Configured Datasets ({datasets.length})</span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={fetchDatasets}>
                  <RefreshCw size={14} />
                  <span>Refresh</span>
                </button>
              </div>

              {datasets.length === 0 ? (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  No datasets imported yet. Upload your first dataset or import the OpenMathReasoning split above.
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Dataset Name</th>
                        <th>Task Type</th>
                        <th>Format</th>
                        <th>Total Records</th>
                        <th>Split (Train / Val / Test)</th>
                        <th>Duplicates Filtered</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasets.map((ds) => (
                        <tr key={ds.id}>
                          <td style={{ fontWeight: 600 }}>{ds.name}</td>
                          <td>
                            <span style={{ fontSize: 'var(--font-size-xs)', background: 'var(--bg-secondary)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                              {ds.taskType}
                            </span>
                          </td>
                          <td style={{ textTransform: 'uppercase', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                            {ds.format}
                          </td>
                          <td style={{ fontWeight: 700 }}>{ds.stats.totalRecords.toLocaleString()}</td>
                          <td>
                            <span style={{ color: '#86efac' }}>{ds.stats.trainRecords}</span> /{' '}
                            <span style={{ color: '#93c5fd' }}>{ds.stats.valRecords}</span> /{' '}
                            <span style={{ color: '#fca5a5' }}>{ds.stats.testRecords}</span>
                          </td>
                          <td style={{ color: ds.stats.duplicatesRemoved > 0 ? 'var(--status-warning)' : 'var(--text-tertiary)' }}>
                            {ds.stats.duplicatesRemoved}
                          </td>
                          <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                            {new Date(ds.createdAt).toLocaleDateString()}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '0.25rem 0.5rem' }}
                                onClick={() => handleViewPreview(ds.id, ds.name)}
                                title="Preview Records"
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ padding: '0.25rem 0.6rem', fontSize: 'var(--font-size-xs)' }}
                                onClick={() => {
                                  setSelectedDatasetId(ds.id);
                                  setActiveTab('tuning');
                                }}
                              >
                                Train
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '0.25rem 0.5rem', color: 'var(--status-error)' }}
                                onClick={() => handleDeleteDataset(ds.id, ds.name)}
                                title="Delete Dataset"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Preview Modal / Drawer */}
            {previewDatasetId && (
              <div className="training-card" style={{ borderColor: 'var(--riyai-accent)' }}>
                <div className="training-card-header">
                  <div className="training-card-title">
                    <Eye size={18} style={{ color: 'var(--riyai-accent)' }} />
                    <span>Sample Records Preview: {previewDatasetName}</span>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreviewDatasetId(null)}>
                    Close Preview
                  </button>
                </div>

                {isLoadingPreview ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Loading preview records...
                  </div>
                ) : (
                  <div className="data-table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>Split</th>
                          <th style={{ width: 300 }}>Instruction / Problem</th>
                          <th>Output / Reasoning Response</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRecords.map((r, i) => (
                          <tr key={i}>
                            <td>
                              <span
                                style={{
                                  fontSize: 'var(--font-size-xs)',
                                  fontWeight: 600,
                                  color: r.split === 'train' ? '#86efac' : r.split === 'val' ? '#93c5fd' : '#fca5a5',
                                }}
                              >
                                {r.split?.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ whiteSpace: 'normal', fontSize: 'var(--font-size-xs)' }}>
                              {r.problem || r.instruction || (r.messages ? r.messages[0]?.content : '')}
                            </td>
                            <td style={{ whiteSpace: 'normal', fontSize: 'var(--font-size-xs)' }}>
                              {r.generated_solution || r.output || (r.messages ? r.messages[r.messages.length - 1]?.content : '')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: FINE-TUNING CONFIGURATION & COLAB GENERATOR */}
        {/* ============================================================ */}
        {activeTab === 'tuning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
                LoRA Fine-Tuning &amp; Google Colab Exporter
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
                Configure Qwen2.5 Parameter-Efficient Fine-Tuning (LoRA / QLoRA) with response-only loss masking. Generates a self-contained, pinned-dependency Jupyter notebook ready for free cloud GPU training.
              </p>
            </div>

            {/* Hardware Advisory Banner */}
            <div className="hardware-callout">
              <AlertTriangle size={20} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '0.2rem' }}>
                  Hardware Architecture Safeguard (Intel Core i3-1005G1 &bull; 8 GB RAM)
                </strong>
                <span>
                  Your host machine operates with dual-core CPU processing without a dedicated NVIDIA CUDA GPU. Fine-tuning a 0.5B or 1.5B LLM locally would lead to severe memory saturation and thermal throttling. RIYAI automatically prepares a fully customized Google Colab notebook configured for a free T4 GPU (16 GB VRAM) with 4-bit NF4 quantization.
                </span>
              </div>
            </div>

            {/* Hyperparameter Configuration Card */}
            <div className="training-card">
              <div className="training-card-header">
                <div className="training-card-title">
                  <Sliders size={20} style={{ color: 'var(--riyai-accent)' }} />
                  <span>Hyperparameter &amp; Model Selection</span>
                </div>
                <span className="training-badge">Response-Only Loss Masking</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                <div className="form-group">
                  <label className="form-label">Training Dataset</label>
                  <select
                    className="form-select"
                    value={selectedDatasetId}
                    onChange={(e) => setSelectedDatasetId(e.target.value)}
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.stats.trainRecords} train / {d.stats.valRecords} val)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Base Model Architecture</label>
                  <select
                    className="form-select"
                    value={baseModel}
                    onChange={(e) => setBaseModel(e.target.value as SupportedBaseModel)}
                  >
                    <option value="Qwen/Qwen2.5-0.5B-Instruct">Qwen2.5-0.5B-Instruct (Recommended &bull; Fast on T4)</option>
                    <option value="Qwen/Qwen2.5-1.5B-Instruct">Qwen2.5-1.5B-Instruct (High Cognitive Depth)</option>
                    <option value="Qwen/Qwen2.5-3B-Instruct">Qwen2.5-3B-Instruct (Requires A100 GPU)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Training Epochs</label>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={10}
                    value={epochs}
                    onChange={(e) => setEpochs(parseInt(e.target.value, 10) || 3)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Learning Rate</label>
                  <input
                    type="number"
                    step="0.00005"
                    className="form-input"
                    value={learningRate}
                    onChange={(e) => setLearningRate(parseFloat(e.target.value) || 0.0002)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Per-Device Batch Size</label>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={8}
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 2)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Gradient Accumulation Steps</label>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={16}
                    value={gradAccum}
                    onChange={(e) => setGradAccum(parseInt(e.target.value, 10) || 4)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">LoRA Rank (r)</label>
                  <select
                    className="form-select"
                    value={loraRank}
                    onChange={(e) => {
                      const r = parseInt(e.target.value, 10);
                      setLoraRank(r);
                      setLoraAlpha(r * 2);
                    }}
                  >
                    <option value={8}>r = 8 (Minimal memory footprint)</option>
                    <option value={16}>r = 16 (Standard &bull; Recommended)</option>
                    <option value={32}>r = 32 (Higher representation capacity)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Quantization</label>
                  <select
                    className="form-select"
                    value={quantization}
                    onChange={(e) => setQuantization(e.target.value as any)}
                  >
                    <option value="4bit">4-bit BitsAndBytes (QLoRA &bull; Fits in 6GB VRAM)</option>
                    <option value="8bit">8-bit BitsAndBytes (Higher precision)</option>
                    <option value="none">Full 16-bit BF16 (Requires 16GB+ VRAM)</option>
                  </select>
                </div>
              </div>

              {/* Action: Generate Run & Download Colab */}
              <div style={{ marginTop: '2rem', padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>
                    Export Customized Google Colab Notebook
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Bundles dataset splits, Hugging Face transformers, PEFT LoRA, and automated Ollama export scripts.
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateRunAndDownloadNotebook}
                  disabled={isCreatingRun || datasets.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}
                >
                  {isCreatingRun ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                  <span>Generate &amp; Download .ipynb</span>
                </button>
              </div>
            </div>

            {/* Step-by-Step Execution Guide */}
            <div className="training-card">
              <div className="training-card-header">
                <div className="training-card-title">
                  <Play size={18} style={{ color: 'var(--riyai-accent)' }} />
                  <span>How to Run Training in Google Colab (4 Simple Steps)</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div className="stat-box">
                  <div className="stat-box-label">Step 1</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Open Google Colab</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Go to <a href="https://colab.research.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--riyai-accent)' }}>colab.research.google.com</a> and upload the downloaded <code>.ipynb</code> file.
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-label">Step 2</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Select T4 GPU</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    In Colab menu: <em>Runtime &rarr; Change runtime type &rarr; T4 GPU (free)</em>.
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-label">Step 3</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Run All Cells</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Click <em>Runtime &rarr; Run all</em>. Training loss logs and validation benchmarks will stream live.
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-label">Step 4</div>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Download Adapter</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Download the exported <code>riyai_lora_adapter.zip</code> or GGUF file from the Colab file tree to integrate into Ollama.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: REAL TRAINING DASHBOARD */}
        {/* ============================================================ */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
                  Real Training Run Dashboard
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
                  Track live execution states, empirical loss trajectories, and training logs.
                </p>
              </div>

              {runs.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Select Run:</label>
                  <select
                    className="form-select"
                    value={selectedRunId}
                    onChange={(e) => setSelectedRunId(e.target.value)}
                    style={{ minWidth: 240 }}
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {runs.length === 0 ? (
              <div className="training-card" style={{ padding: '3rem', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)' }}>No training runs created yet.</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveTab('tuning')}>
                  Configure New Run in LoRA &amp; Colab Tab
                </button>
              </div>
            ) : currentRun ? (
              <>
                {/* Status Stepper */}
                <div className="training-card">
                  <div className="training-card-header">
                    <div className="training-card-title">
                      <Activity size={18} style={{ color: 'var(--riyai-accent)' }} />
                      <span>{currentRun.name}</span>
                    </div>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: 9999,
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background:
                          currentRun.status === 'completed'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : currentRun.status === 'failed'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(0, 210, 180, 0.15)',
                        color:
                          currentRun.status === 'completed'
                            ? 'var(--status-success)'
                            : currentRun.status === 'failed'
                            ? 'var(--status-error)'
                            : 'var(--riyai-accent)',
                      }}
                    >
                      {currentRun.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Real States Stepper */}
                  <div className="status-stepper">
                    {[
                      { key: 'dataset_validation', label: '1. Dataset Validation' },
                      { key: 'training_preparation', label: '2. Colab Prep' },
                      { key: 'training_in_progress', label: '3. GPU Training' },
                      { key: 'evaluation_in_progress', label: '4. Evaluation' },
                      { key: 'completed', label: '5. Completed' },
                    ].map((step, idx) => {
                      const stateOrder = [
                        'dataset_validation',
                        'training_preparation',
                        'training_in_progress',
                        'evaluation_in_progress',
                        'completed',
                      ];
                      const currentIdx = stateOrder.indexOf(currentRun.status);
                      const isPast = currentIdx > idx || currentRun.status === 'completed';
                      const isCurrent = currentRun.status === step.key;

                      return (
                        <div key={step.key} className="status-step">
                          <div className={`step-node ${isPast ? 'completed' : isCurrent ? 'current' : ''}`}>
                            {isPast ? '✓' : idx + 1}
                          </div>
                          <span className={`step-label ${isCurrent ? 'active' : ''}`}>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Stat Metrics Grid */}
                  <div className="stat-grid" style={{ marginTop: '1.5rem' }}>
                    <div className="stat-box">
                      <div className="stat-box-label">Current Epoch</div>
                      <div className="stat-box-value">
                        {currentRun.metrics.currentEpoch} / {currentRun.metrics.totalEpochs}
                      </div>
                    </div>

                    <div className="stat-box">
                      <div className="stat-box-label">Training Step</div>
                      <div className="stat-box-value">
                        {currentRun.metrics.currentStep} / {currentRun.metrics.totalSteps || 100}
                      </div>
                    </div>

                    <div className="stat-box">
                      <div className="stat-box-label">Current Train Loss</div>
                      <div className="stat-box-value" style={{ color: 'var(--riyai-accent)' }}>
                        {currentRun.metrics.currentTrainLoss !== undefined
                          ? currentRun.metrics.currentTrainLoss.toFixed(4)
                          : 'Awaiting Run'}
                      </div>
                    </div>

                    <div className="stat-box">
                      <div className="stat-box-label">Best Validation Loss</div>
                      <div className="stat-box-value" style={{ color: '#93c5fd' }}>
                        {currentRun.metrics.bestValLoss !== undefined
                          ? currentRun.metrics.bestValLoss.toFixed(4)
                          : 'Pending'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Empirical Loss History Table */}
                <div className="training-card">
                  <div className="training-card-header">
                    <div className="training-card-title">
                      <Layers size={18} style={{ color: 'var(--riyai-accent)' }} />
                      <span>Empirical Loss Trajectory ({currentRun.lossHistory.length} checkpoints)</span>
                    </div>
                  </div>

                  {currentRun.lossHistory.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                      No metric points logged yet. When Colab executes training steps, live losses stream into this dashboard.
                    </div>
                  ) : (
                    <div className="data-table-container" style={{ maxHeight: 240, overflowY: 'auto' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Step</th>
                            <th>Epoch</th>
                            <th>Training Loss</th>
                            <th>Validation Loss</th>
                            <th>Learning Rate</th>
                            <th>Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentRun.lossHistory.slice(-15).map((pt, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600 }}>#{pt.step}</td>
                              <td>{pt.epoch.toFixed(2)}</td>
                              <td style={{ color: 'var(--riyai-accent)' }}>{pt.trainLoss?.toFixed(4) ?? '-'}</td>
                              <td style={{ color: '#93c5fd' }}>{pt.valLoss?.toFixed(4) ?? '-'}</td>
                              <td>{pt.learningRate?.toExponential(2) ?? '-'}</td>
                              <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                                {new Date(pt.timestamp).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Execution Logs Terminal */}
                <div className="training-card">
                  <div className="training-card-header">
                    <div className="training-card-title">
                      <Terminal size={18} style={{ color: 'var(--riyai-accent)' }} />
                      <span>Execution Logs</span>
                    </div>
                  </div>
                  <div className="log-terminal">
                    {currentRun.logs.map((logLine, idx) => (
                      <div key={idx} className="log-line">
                        {logLine}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: EVALUATION BENCHMARK COMPARISON */}
        {/* ============================================================ */}
        {activeTab === 'evaluation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
                  Held-Out Evaluation Benchmark
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
                  Zero-leakage test split evaluation. Compares baseline predictions against fine-tuned model outputs on strictly held-out problems.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleRunLocalEval}
                disabled={isEvaluatingLocal || !ollamaStatus?.isAvailable}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {isEvaluatingLocal ? <RefreshCw size={15} className="spin" /> : <Play size={15} />}
                <span>Evaluate Local Qwen Model on Test Split</span>
              </button>
            </div>

            {/* Metric Comparison Cards */}
            {evalReport && (
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-box-label">Baseline Accuracy ({evalReport.baseModelName})</div>
                  <div className="stat-box-value" style={{ color: 'var(--text-primary)' }}>
                    {evalReport.baseExactMatchAcc.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Avg Latency: {evalReport.baseAvgLatencySec.toFixed(1)}s
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-label">Fine-Tuned Accuracy ({evalReport.finetunedModelName})</div>
                  <div className="stat-box-value" style={{ color: 'var(--riyai-accent)' }}>
                    {evalReport.finetunedExactMatchAcc > 0 ? `${evalReport.finetunedExactMatchAcc.toFixed(1)}%` : 'Ready to Run'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Avg Latency: {evalReport.finetunedAvgLatencySec > 0 ? `${evalReport.finetunedAvgLatencySec.toFixed(1)}s` : '-'}
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-label">Accuracy Improvement</div>
                  <div
                    className="stat-box-value"
                    style={{
                      color:
                        evalReport.accuracyImprovementPct > 0
                          ? 'var(--status-success)'
                          : evalReport.accuracyImprovementPct < 0
                          ? 'var(--status-error)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {evalReport.accuracyImprovementPct > 0 ? `+${evalReport.accuracyImprovementPct.toFixed(1)}%` : `${evalReport.accuracyImprovementPct.toFixed(1)}%`}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Held-Out Test Samples: {evalReport.testSampleCount}
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-label">Symbolic Flag Review</div>
                  <div className="stat-box-value" style={{ color: 'var(--status-warning)' }}>
                    {evalReport.unreliableSymbolicCount}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Flagged for manual inspection
                  </div>
                </div>
              </div>
            )}

            {/* Per-Example Comparison Table */}
            {evalReport && (
              <div className="training-card">
                <div className="training-card-header">
                  <div className="training-card-title">
                    <CheckCircle2 size={18} style={{ color: 'var(--riyai-accent)' }} />
                    <span>Held-Out Test Problem Inspection ({evalReport.samples.length} items)</span>
                  </div>
                </div>

                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th style={{ width: 340 }}>Problem Statement</th>
                        <th style={{ width: 140 }}>Expected Answer</th>
                        <th>Model Prediction</th>
                        <th style={{ width: 110 }}>Result</th>
                        <th style={{ width: 220 }}>Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalReport.samples.map((s) => (
                        <tr key={s.index}>
                          <td style={{ fontWeight: 600 }}>{s.index}</td>
                          <td style={{ whiteSpace: 'normal', fontSize: 'var(--font-size-xs)' }}>{s.problem}</td>
                          <td style={{ fontWeight: 600, color: 'var(--riyai-accent)', fontSize: 'var(--font-size-xs)' }}>
                            {s.expectedAnswer}
                          </td>
                          <td style={{ whiteSpace: 'normal', fontSize: 'var(--font-size-xs)' }}>
                            {s.finetunedPrediction || s.baseModelPrediction}
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 700,
                                padding: '0.2rem 0.5rem',
                                borderRadius: 4,
                                background: s.isEquivalent ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: s.isEquivalent ? 'var(--status-success)' : 'var(--status-error)',
                              }}
                            >
                              {s.isEquivalent ? 'PASSED' : 'MISMATCH'}
                            </span>
                          </td>
                          <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                            {s.comparisonRationale}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: MODEL INTEGRATION & LOCAL INFERENCE */}
        {/* ============================================================ */}
        {activeTab === 'integration' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
                Local Inference &amp; Ollama Model Integration
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
                Manage local open-weight model instances, test inference latency on-device, and import your fine-tuned LoRA adapters directly into RIYAI.
              </p>
            </div>

            {/* Ollama Service Status Card */}
            <div className="training-card">
              <div className="training-card-header">
                <div className="training-card-title">
                  <Server size={20} style={{ color: 'var(--riyai-accent)' }} />
                  <span>Ollama Local Runner Status</span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={fetchOllamaStatus}>
                  <RefreshCw size={14} />
                  <span>Check Status</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="stat-box">
                  <div className="stat-box-label">Runner State</div>
                  <div className="stat-box-value" style={{ color: ollamaStatus?.isAvailable ? 'var(--status-success)' : 'var(--status-warning)' }}>
                    {ollamaStatus?.isAvailable ? 'Running' : 'Offline'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    {ollamaStatus?.endpoint || 'http://localhost:11434'}
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-label">Installed Models</div>
                  <div className="stat-box-value">
                    {ollamaStatus?.installedModels?.length || 0}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Local weights available
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-box-label">Runner Version</div>
                  <div className="stat-box-value" style={{ fontSize: 'var(--font-size-md)' }}>
                    {ollamaStatus?.version || '0.1.x+'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                    OpenAI / NDJSON compatible
                  </div>
                </div>
              </div>

              {/* Installed Models List */}
              {ollamaStatus?.installedModels && ollamaStatus.installedModels.length > 0 && (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Model Name</th>
                        <th>File Size</th>
                        <th>Parameter Size</th>
                        <th>Quantization</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ollamaStatus.installedModels.map((m) => (
                        <tr key={m.name}>
                          <td style={{ fontWeight: 600 }}>{m.name}</td>
                          <td>{(m.sizeBytes / (1024 * 1024)).toFixed(0)} MB</td>
                          <td>{m.parameterSize}</td>
                          <td>{m.quantizationLevel}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 'var(--font-size-xs)', padding: '0.2rem 0.6rem' }}
                              onClick={() => {
                                setSelectedOllamaModel(m.name);
                              }}
                            >
                              Select for Test
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Interactive Live Inference Tester */}
            <div className="training-card">
              <div className="training-card-header">
                <div className="training-card-title">
                  <Zap size={20} style={{ color: 'var(--riyai-accent)' }} />
                  <span>Interactive Local Inference Tester</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Target:</span>
                  <select
                    className="form-select"
                    value={selectedOllamaModel}
                    onChange={(e) => setSelectedOllamaModel(e.target.value)}
                    style={{ padding: '0.35rem 0.65rem' }}
                  >
                    {ollamaStatus?.installedModels?.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Test Prompt</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleTestInference}
                  disabled={isTestingInference || !ollamaStatus?.isAvailable}
                >
                  {isTestingInference ? (
                    <>
                      <RefreshCw size={15} className="spin" />
                      <span>Generating Tokens...</span>
                    </>
                  ) : (
                    <>
                      <Play size={15} />
                      <span>Execute Test Inference</span>
                    </>
                  )}
                </button>
              </div>

              {testOutput && (
                <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    <span>Model Response:</span>
                    {testLatencySec !== null && <span>Inference Latency: <strong>{testLatencySec}s</strong></span>}
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', margin: 0, color: 'var(--text-primary)' }}>
                    {testOutput}
                  </pre>
                </div>
              )}
            </div>

            {/* Model Import Workflow & Modelfile Generator */}
            <div className="training-card">
              <div className="training-card-header">
                <div className="training-card-title">
                  <Database size={20} style={{ color: 'var(--riyai-accent)' }} />
                  <span>Adapter Import Workflow &amp; Modelfile Generator</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleGenerateModelfile}
                >
                  Generate Modelfile
                </button>
              </div>

              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
                After downloading your trained LoRA adapter from Google Colab, use Ollama's <code>Modelfile</code> engine to package and register the fine-tuned model for local inference:
              </p>

              <div style={{ background: '#050608', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: '#86efac' }}>
                {modelfileCode || `# Sample Modelfile for Fine-Tuned Qwen2.5
FROM qwen2.5:0.5b
# ADAPTER ./riyai_lora_adapter
PARAMETER temperature 0.6
PARAMETER top_p 0.95
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"

SYSTEM """You are RIYAI, an advanced reasoning AI assistant. Solve problems systematically."""
`}
              </div>

              <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                <strong>Terminal Import Command:</strong><br />
                <code>ollama create riyai-qwen-finetuned -f Modelfile</code>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
