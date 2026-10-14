'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  ArrowUp,
  Paperclip,
  Mic,
  Globe,
  Code,
  Square,
  Brain,
  X,
  FileText,
  Table,
  FileCode,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useChat } from '@/features/chat/ChatContext';

export function Composer() {
  const {
    composerText,
    setComposerText,
    sendMessage,
    stopGeneration,
    isGenerating,
    memoryNotice,
    attachedFiles,
    isUploadingFiles,
    uploadError,
    uploadFiles,
    removeAttachment,
  } = useChat();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [composerText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if ((!composerText.trim() && attachedFiles.length === 0) || isGenerating) return;
    sendMessage(composerText);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = ''; // Reset input
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const canSubmit = (composerText.trim().length > 0 || attachedFiles.length > 0) && !isGenerating;

  return (
    <div className="composer-wrapper">
      <div
        className={`composer-box ${isDragging ? 'drag-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Memory notice badge */}
        {memoryNotice && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              color: 'var(--riyai-accent)',
              padding: '0.2rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--riyai-accent-subtle)',
              alignSelf: 'flex-start',
            }}
          >
            <Brain size={13} />
            <span>{memoryNotice}</span>
          </div>
        )}

        {/* Upload error banner */}
        {uploadError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              color: 'var(--status-error)',
              padding: '0.25rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              alignSelf: 'flex-start',
            }}
          >
            <AlertCircle size={13} />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Attached files preview chips */}
        {(attachedFiles.length > 0 || isUploadingFiles) && (
          <div className="composer-attachments-bar">
            {attachedFiles.map((file) => (
              <div key={file.id} className="attachment-chip">
                {file.category === 'image' && file.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={file.dataUrl}
                    alt={file.name}
                    className="attachment-chip-img-thumb"
                  />
                ) : file.category === 'document' ? (
                  <FileText size={15} color="var(--riyai-accent)" />
                ) : file.category === 'spreadsheet' ? (
                  <Table size={15} color="#10b981" />
                ) : (
                  <FileCode size={15} color="var(--text-secondary)" />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span className="attachment-chip-name">{file.name}</span>
                  <span className="attachment-chip-meta">
                    {(file.size / 1024).toFixed(0)} KB • {file.category}
                  </span>
                </div>

                <button
                  type="button"
                  className="attachment-remove-btn"
                  onClick={() => removeAttachment(file.id)}
                  title="Remove file"
                  aria-label={`Remove ${file.name}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            {isUploadingFiles && (
              <div
                className="attachment-chip"
                style={{ color: 'var(--riyai-accent)', borderStyle: 'dashed' }}
              >
                <Loader2 size={14} className="spin" />
                <span>Processing document...</span>
              </div>
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <textarea
          ref={textareaRef}
          className="composer-textarea"
          placeholder={
            isGenerating
              ? 'RIYAI is generating your response...'
              : attachedFiles.length > 0
              ? 'Ask a question or request a summary of the attached document(s)...'
              : 'Ask RIYAI anything or drag & drop files here...'
          }
          rows={1}
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          aria-label="Message prompt composer"
        />

        <div className="composer-toolbar">
          <div className="composer-tools-left">
            {/* Functional Attachment Button */}
            <div className="tooltip-container">
              <button
                type="button"
                className="composer-action-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating || isUploadingFiles}
                title="Attach files (PDF, DOCX, TXT, CSV, XLSX, Images)"
                aria-label="Attach file"
                style={{
                  color: attachedFiles.length > 0 ? 'var(--riyai-accent)' : undefined,
                }}
              >
                <Paperclip size={16} />
              </button>
              <div className="tooltip-box">Attach files / documents</div>
            </div>

            {/* Voice Input Placeholder */}
            <div className="tooltip-container">
              <button
                type="button"
                className="composer-action-btn"
                disabled
                title="Voice input (Reserved for Phase 5+)"
                aria-label="Voice input"
              >
                <Mic size={16} />
              </button>
              <div className="tooltip-box">Voice Mode (Phase 5+)</div>
            </div>

            {/* Web Search Tool Placeholder */}
            <div className="tooltip-container">
              <button
                type="button"
                className="composer-action-btn"
                disabled
                title="Web Search (Reserved for Phase 5+)"
                aria-label="Web search tool"
              >
                <Globe size={16} />
              </button>
              <div className="tooltip-box">Live Web (Phase 5+)</div>
            </div>

            {/* Code Interpreter Tool Placeholder */}
            <div className="tooltip-container">
              <button
                type="button"
                className="composer-action-btn"
                disabled
                title="Code Interpreter (Reserved for Phase 5+)"
                aria-label="Code interpreter tool"
              >
                <Code size={16} />
              </button>
              <div className="tooltip-box">Code Execution (Phase 5+)</div>
            </div>
          </div>

          <div className="composer-tools-right">
            {isGenerating ? (
              <button
                type="button"
                className="send-btn"
                onClick={stopGeneration}
                title="Stop generation"
                aria-label="Stop generation"
                style={{
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)',
                }}
              >
                <Square size={13} fill="#ffffff" color="#ffffff" />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                disabled={!canSubmit}
                onClick={handleSubmit}
                title="Send message (Enter)"
                aria-label="Send message"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="composer-disclaimer">
          RIYAI Intelligent Companion • Multimodal Intelligence & Document RAG Active
        </div>
      </div>
    </div>
  );
}

