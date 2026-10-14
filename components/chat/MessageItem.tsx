'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  FileText,
  Table,
  FileCode,
  BookOpen,
  Zap,
} from 'lucide-react';
import { Message } from '@/types/message';
import { Avatar } from '@/components/common/Avatar';
import { formatTimestamp } from '@/lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useChat } from '@/features/chat/ChatContext';

export function MessageItem({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);

  const {
    activeAssistantMessageId,
    isGenerating,
    regenerateResponse,
    retryMessage,
  } = useChat();

  const isUser = message.role === 'user';
  const isStreaming = activeAssistantMessageId === message.id;
  const isError = message.metadata?.status === 'error';
  const errorMessage = message.metadata?.errorMessage;
  const sources = message.metadata?.sources;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? (
          <Avatar name="You" />
        ) : (
          <div
            className="brand-logo-mark"
            style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}
          >
            R
          </div>
        )}
      </div>

      <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
        <div className="message-content">
          {isUser ? (
            <div>
              {/* User Attached Files Preview */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="message-attachments-container">
                  {message.attachments.map((att) => {
                    if (att.category === 'image' && att.dataUrl) {
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={att.id}
                          src={att.dataUrl}
                          alt={att.name}
                          className="message-attachment-image"
                        />
                      );
                    }
                    return (
                      <div key={att.id} className="message-attachment-card">
                        {att.category === 'document' ? (
                          <FileText size={15} color="var(--riyai-accent)" />
                        ) : att.category === 'spreadsheet' ? (
                          <Table size={15} color="#10b981" />
                        ) : (
                          <FileCode size={15} color="var(--text-secondary)" />
                        )}
                        <span style={{ fontWeight: 500 }}>{att.name}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                          ({(att.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {message.content}
            </div>
          ) : (
            <>
              {message.content ? (
                <>
                  <MarkdownRenderer content={message.content} />
                  {isStreaming && <span className="streaming-cursor" />}

                  {/* Document Intelligence Citations */}
                  {sources && sources.length > 0 && !isStreaming && (
                    <div className="message-sources-wrapper">
                      <div className="message-sources-header">
                        <BookOpen size={13} />
                        <span>Sources ({sources.length})</span>
                      </div>
                      <div className="message-sources-list">
                        {sources.map((s, idx) => (
                          <div key={idx} className="message-source-item">
                            <span className="source-bullet">•</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {s.fileName}
                            </span>
                            {s.pageNumber ? (
                              <span style={{ color: 'var(--text-tertiary)' }}>
                                — Page {s.pageNumber}
                              </span>
                            ) : null}
                            {s.sectionTitle ? (
                              <span style={{ color: 'var(--text-tertiary)' }}>
                                — {s.sectionTitle}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : isStreaming ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.9rem',
                  }}
                >
                  <span>Thinking</span>
                  <span className="streaming-cursor" />
                </div>
              ) : null}

              {isError && (
                <div className="message-error-banner">
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, lineHeight: 1.4 }}>
                      {errorMessage || "RIYAI couldn't complete that response. Please try again."}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => retryMessage(message.id)}
                      disabled={isGenerating}
                      style={{ marginTop: '0.5rem', gap: '0.35rem' }}
                    >
                      <RotateCw size={12} />
                      <span>Retry</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="message-meta">
          <span>{formatTimestamp(message.createdAt)}</span>

          {!isUser && (
            <span
              className="message-provider-tag"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.12rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.68rem',
                fontWeight: 600,
                letterSpacing: '0.02em',
                backgroundColor: 'rgba(168, 85, 247, 0.12)',
                color: '#c084fc',
                border: '1px solid rgba(168, 85, 247, 0.25)',
              }}
            >
              RIYAI — Gemini
            </span>
          )}

          {!isUser && (
            <div className="message-actions">
              {message.content && (
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: '26px', height: '26px' }}
                  onClick={handleCopy}
                  title={copied ? 'Copied to clipboard' : 'Copy message'}
                  aria-label="Copy response"
                >
                  {copied ? (
                    <Check size={13} color="var(--status-success)" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              )}

              {!isStreaming && !isError && (
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: '26px', height: '26px' }}
                  disabled={isGenerating}
                  onClick={() => regenerateResponse(message.id)}
                  title="Regenerate response"
                  aria-label="Regenerate response"
                >
                  <RotateCw size={13} />
                </button>
              )}

              {!isStreaming && message.content && (
                <>
                  <button
                    type="button"
                    className={`btn-icon ${feedback === 'positive' ? 'active' : ''}`}
                    style={{ width: '26px', height: '26px' }}
                    onClick={() =>
                      setFeedback(feedback === 'positive' ? null : 'positive')
                    }
                    title="Helpful response"
                    aria-label="Thumbs up"
                  >
                    <ThumbsUp size={13} />
                  </button>

                  <button
                    type="button"
                    className={`btn-icon ${feedback === 'negative' ? 'active' : ''}`}
                    style={{ width: '26px', height: '26px' }}
                    onClick={() =>
                      setFeedback(feedback === 'negative' ? null : 'negative')
                    }
                    title="Unhelpful response"
                    aria-label="Thumbs down"
                  >
                    <ThumbsDown size={13} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
