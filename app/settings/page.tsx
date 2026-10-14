'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Brain, Trash2, Edit2, Check, X, Plus } from 'lucide-react';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { useTheme } from '@/hooks/useTheme';
import { useChat } from '@/features/chat/ChatContext';
import { AVAILABLE_MODELS } from '@/config/models';
import { Button } from '@/components/common/Button';
import { MemoryType } from '@/types/memory';
import { ResponseStyle } from '@/types/preference';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const {
    selectedModelId,
    setSelectedModelId,
    memories,
    memoryEnabled,
    responseStyle,
    toggleMemoryEnabled,
    setResponseStyle,
    addMemory,
    editMemory,
    deleteMemory,
    clearAllMemories,
  } = useChat();

  const [clearMemoryConfirm, setClearMemoryConfirm] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryType, setNewMemoryType] = useState<MemoryType>('preference');

  const handleStartEdit = (id: string, currentText: string) => {
    setEditingMemoryId(id);
    setEditContent(currentText);
  };

  const handleSaveEdit = async (id: string) => {
    if (editContent.trim()) {
      await editMemory(id, editContent.trim());
    }
    setEditingMemoryId(null);
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    await addMemory(newMemoryText.trim(), newMemoryType);
    setNewMemoryText('');
  };

  return (
    <div className="landing-container" style={{ minHeight: '100vh' }}>
      <LandingHeader />

      <main style={{ maxWidth: '840px', width: '100%', margin: '2rem auto', padding: '0 1.5rem', flex: 1 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/chat" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
            <ArrowLeft size={16} /> Back to Chat Workspace
          </Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>RIYAI Settings</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Configure your RIYAI assistant environment, memory intelligence, appearance, and local storage.
          </p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Section: Memory & Personalization */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Brain size={18} color="var(--accent-primary)" />
              <h2 className="settings-section-title" style={{ margin: 0 }}>Memory & Personalization</h2>
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Control what RIYAI remembers about you across conversations. Memory is private to your profile and never overrides your immediate prompts.
            </p>

            <div className="settings-item">
              <div>
                <div className="settings-item-label">Persistent Memory</div>
                <div className="settings-item-desc">Remember working context, projects, and style preferences across conversations</div>
              </div>
              <Button
                variant={memoryEnabled ? 'primary' : 'secondary'}
                size="sm"
                onClick={toggleMemoryEnabled}
              >
                {memoryEnabled ? 'Memory ON' : 'Memory OFF'}
              </Button>
            </div>

            <div className="settings-item">
              <div>
                <div className="settings-item-label">Default Response Style</div>
                <div className="settings-item-desc">Preference applied to responses unless overridden in your prompt</div>
              </div>
              <select
                className="input-field"
                style={{ width: '130px', padding: '0.4rem 0.6rem', fontSize: 'var(--font-size-xs)' }}
                value={responseStyle}
                onChange={(e) => setResponseStyle(e.target.value as ResponseStyle)}
              >
                <option value="concise">Concise</option>
                <option value="balanced">Balanced</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>

            {/* Add Memory Manually */}
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: '0.5rem' }}>
                Teach RIYAI Context
              </div>
              <form
                onSubmit={handleAddMemory}
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
              >
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. My primary stack is Next.js and TypeScript"
                  value={newMemoryText}
                  onChange={(e) => setNewMemoryText(e.target.value)}
                  style={{ flex: 1, minWidth: '240px', fontSize: 'var(--font-size-xs)', padding: '0.45rem 0.75rem' }}
                />
                <select
                  className="input-field"
                  value={newMemoryType}
                  onChange={(e) => setNewMemoryType(e.target.value as MemoryType)}
                  style={{ width: '120px', fontSize: 'var(--font-size-xs)', padding: '0.45rem 0.5rem' }}
                >
                  <option value="preference">Preference</option>
                  <option value="project">Project</option>
                  <option value="instruction">Rule</option>
                  <option value="goal">Goal</option>
                  <option value="fact">Fact</option>
                </select>
                <Button type="submit" variant="primary" size="sm" disabled={!newMemoryText.trim()}>
                  <Plus size={14} /> Add Memory
                </Button>
              </form>
            </div>

            {/* Saved Memories List */}
            <div style={{ marginTop: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem',
                }}
              >
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  Saved Memories ({memories.length})
                </span>
                {memories.length > 0 && (
                  <>
                    {clearMemoryConfirm ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          clearAllMemories();
                          setClearMemoryConfirm(false);
                        }}
                        style={{ color: 'var(--status-error)', fontSize: '0.75rem' }}
                      >
                        Confirm Clear All
                      </Button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setClearMemoryConfirm(true)}
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Clear All
                      </button>
                    )}
                  </>
                )}
              </div>

              {memories.length === 0 ? (
                <div
                  style={{
                    padding: '1.25rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  No memories saved yet. RIYAI automatically retains useful working context when you chat (or via commands like &quot;Remember that...&quot;).
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {memories.map((mem) => {
                    const isEditing = editingMemoryId === mem.id;
                    return (
                      <div
                        key={mem.id}
                        style={{
                          padding: '0.65rem 0.85rem',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '2px' }}>
                            <span
                              className="badge badge-accent"
                              style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}
                            >
                              {mem.memoryType}
                            </span>
                          </div>

                          {isEditing ? (
                            <input
                              type="text"
                              className="input-field"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              style={{ fontSize: 'var(--font-size-xs)', padding: '0.35rem 0.5rem', marginTop: '4px' }}
                            />
                          ) : (
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                              {mem.content}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn-icon"
                                style={{ width: '26px', height: '26px' }}
                                onClick={() => handleSaveEdit(mem.id)}
                                title="Save changes"
                              >
                                <Check size={14} color="var(--status-success)" />
                              </button>
                              <button
                                type="button"
                                className="btn-icon"
                                style={{ width: '26px', height: '26px' }}
                                onClick={() => setEditingMemoryId(null)}
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn-icon"
                                style={{ width: '26px', height: '26px' }}
                                onClick={() => handleStartEdit(mem.id, mem.content)}
                                title="Edit memory"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon"
                                style={{ width: '26px', height: '26px' }}
                                onClick={() => deleteMemory(mem.id)}
                                title="Delete memory"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Section: Appearance & Theme */}
          <section>
            <h2 className="settings-section-title">Appearance & Theme</h2>
            <div className="settings-item">
              <div>
                <div className="settings-item-label">Interface Theme</div>
                <div className="settings-item-desc">Select dark or light color scheme</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                  variant={theme === 'dark' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                >
                  Dark
                </Button>
                <Button
                  variant={theme === 'light' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setTheme('light')}
                >
                  Light
                </Button>
              </div>
            </div>
          </section>

          {/* Section: AI Engine */}
          <section>
            <h2 className="settings-section-title">AI Engine Configuration</h2>
            <div className="settings-item">
              <div>
                <div className="settings-item-label">Selected Model</div>
                <div className="settings-item-desc">Preferred reasoning architecture</div>
              </div>
              <select
                className="input-field"
                style={{ width: '220px', padding: '0.4rem 0.6rem', fontSize: 'var(--font-size-xs)' }}
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-item">
              <div>
                <div className="settings-item-label">Server-side LLM Integration</div>
                <div className="settings-item-desc">OpenAI streaming endpoints active via /api/chat</div>
              </div>
              <span className="badge badge-accent">Connected & Streaming</span>
            </div>
          </section>

          {/* Section: Session & Privacy */}
          <section>
            <h2 className="settings-section-title">Session & Privacy</h2>
            <div className="settings-item">
              <div>
                <div className="settings-item-label">Local Workspace Data</div>
                <div className="settings-item-desc">Reset browser conversations cache</div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.localStorage.clear();
                    window.location.reload();
                  }
                }}
              >
                Clear Local Storage
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

