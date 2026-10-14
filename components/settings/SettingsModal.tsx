'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  User,
  Cpu,
  Shield,
  Moon,
  Sun,
  Brain,
  Trash2,
  Edit2,
  Check,
  X,
  Plus,
  Folder,
  FileText,
  Table,
  FileCode,
  ArrowUpRight,
  Server,
  Zap,
  Search,
  Lock,
  UploadCloud,
  Eye,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useTheme } from '@/hooks/useTheme';
import { useChat } from '@/features/chat/ChatContext';
import { useAuth } from '@/features/auth/AuthContext';
import { dbService } from '@/services/database/clientDb';
import { AVAILABLE_MODELS } from '@/config/models';
import { Button } from '@/components/common/Button';
import { MemoryType } from '@/types/memory';
import { ResponseStyle, ExplanationLevel, TonePreference, UserPreference } from '@/types/preference';
import { checkPrivacy } from '@/services/memory/privacyScreening';
import { StoredFile } from '@/types/attachment';

type SettingsTab = 'general' | 'memory' | 'files' | 'account' | 'ai' | 'privacy';

export function SettingsModal() {
  const { user } = useAuth();
  const currentUserId = user?.id || 'guest_user_default';

  const {
    isSettingsOpen,
    setIsSettingsOpen,
    selectedModelId,
    setSelectedModelId,
    memories,
    memoryEnabled,
    responseStyle,
    explanationLevel,
    tone,
    customInstructions,
    toggleMemoryEnabled,
    setResponseStyle,
    setExplanationLevel,
    setTone,
    setCustomInstructions,
    addMemory,
    editMemory,
    deleteMemory,
    clearAllMemories,
    userFiles,
    deleteUserFile,
    renameUserFile,
    uploadFiles,
    isUploadingFiles,
    uploadError,
    setComposerText,
  } = useChat();

  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearMemoryConfirm, setClearMemoryConfirm] = useState(false);

  // Documents & Knowledge states (Phase 7)
  const [fileSearchFilter, setFileSearchFilter] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [selectedDetailFile, setSelectedDetailFile] = useState<StoredFile | null>(null);
  const [deleteConfirmFileId, setDeleteConfirmFileId] = useState<string | null>(null);
  const [fileUploadStatus, setFileUploadStatus] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleUploadFromModal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileUploadStatus('Processing document...');
      try {
        const uploaded = await uploadFiles(e.target.files);
        if (uploaded.length > 0) {
          const first = uploaded[0];
          if (first.status === 'ocr_required') {
            setFileUploadStatus('Scanned PDF detected: OCR is required to extract text.');
          } else {
            setFileUploadStatus(`Successfully added "${first.name}" (${first.chunkCount || 0} chunks).`);
          }
        }
      } catch (err: unknown) {
        setFileUploadStatus(err instanceof Error ? err.message : 'Upload failed.');
      }
      setTimeout(() => setFileUploadStatus(null), 6000);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStartRename = (file: StoredFile) => {
    setEditingFileId(file.id);
    setEditFileName(file.name);
  };

  const handleSaveRename = async (fileId: string) => {
    if (editFileName.trim()) {
      await renameUserFile(fileId, editFileName.trim());
    }
    setEditingFileId(null);
  };

  const filteredFiles = userFiles.filter((f) => {
    if (!fileSearchFilter.trim()) return true;
    return f.name.toLowerCase().includes(fileSearchFilter.toLowerCase());
  });

  // AI Provider configuration state (Single centralized Gemini model)
  const [providerTimeoutSec, setProviderTimeoutSec] = useState(30);
  const [maxTransientRetries, setMaxTransientRetries] = useState(1);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Memory & Personalization states
  const [memorySearchFilter, setMemorySearchFilter] = useState('');
  const [memoryTypeFilter, setMemoryTypeFilter] = useState<string>('all');
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [localInstructions, setLocalInstructions] = useState(customInstructions || '');
  const [instructionSaveStatus, setInstructionSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (customInstructions !== undefined) {
      setLocalInstructions(customInstructions);
    }
  }, [customInstructions, isSettingsOpen]);

  useEffect(() => {
    if (isSettingsOpen) {
      dbService.getUserPreferences(currentUserId).then((prefs) => {
        if (prefs.providerTimeoutMs) setProviderTimeoutSec(Math.round(prefs.providerTimeoutMs / 1000));
        if (typeof prefs.maxTransientRetries === 'number') setMaxTransientRetries(prefs.maxTransientRetries);
      });
    }
  }, [isSettingsOpen, currentUserId]);

  const handleUpdateProviderPref = async (updates: Partial<UserPreference>) => {
    await dbService.updateUserPreferences(currentUserId, updates);
    setSaveStatus('Saved');
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleSaveInstructions = async () => {
    await setCustomInstructions(localInstructions.trim());
    setInstructionSaveStatus('Saved');
    setTimeout(() => setInstructionSaveStatus(null), 2000);
  };

  // Inline editing state for memories
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Add new memory manually
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryType, setNewMemoryType] = useState<MemoryType>('preference');

  const handleStartEdit = (id: string, currentText: string) => {
    setEditingMemoryId(id);
    setEditContent(currentText);
  };

  const handleSaveEdit = async (id: string) => {
    if (editContent.trim()) {
      const privacyCheck = checkPrivacy(editContent.trim());
      if (privacyCheck.isSensitive) {
        setPrivacyError('For your security and privacy, RIYAI does not store passwords, API keys, or sensitive credentials in memory.');
        setTimeout(() => setPrivacyError(null), 5000);
        return;
      }
      await editMemory(id, editContent.trim());
    }
    setEditingMemoryId(null);
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;

    const privacyCheck = checkPrivacy(newMemoryText.trim());
    if (privacyCheck.isSensitive) {
      setPrivacyError('For your security and privacy, RIYAI does not store passwords, API keys, or sensitive credentials in memory.');
      setTimeout(() => setPrivacyError(null), 5000);
      return;
    }
    setPrivacyError(null);

    await addMemory(newMemoryText.trim(), newMemoryType);
    setNewMemoryText('');
  };

  const handleClearData = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      window.location.reload();
    }
  };

  // Filtered memory list
  const filteredMemories = memories.filter((mem) => {
    const matchesSearch =
      !memorySearchFilter.trim() ||
      mem.content.toLowerCase().includes(memorySearchFilter.toLowerCase().trim());
    const matchesType = memoryTypeFilter === 'all' || mem.memoryType === memoryTypeFilter;
    return matchesSearch && matchesType;
  });


  return (
    <Modal
      isOpen={isSettingsOpen}
      onClose={() => {
        setIsSettingsOpen(false);
        setClearConfirm(false);
        setClearMemoryConfirm(false);
        setEditingMemoryId(null);
      }}
      title="RIYAI Settings"
    >
      <div className="settings-container">
        {/* Settings Navigation Sidebar */}
        <div className="settings-sidebar">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Sliders size={16} />
            <span>General</span>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'memory' ? 'active' : ''}`}
            onClick={() => setActiveTab('memory')}
          >
            <Brain size={16} />
            <span>Memory & AI</span>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            <Folder size={16} />
            <span>My Files ({userFiles.length})</span>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <User size={16} />
            <span>Account</span>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Cpu size={16} />
            <span>Model Config</span>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            <Shield size={16} />
            <span>Privacy</span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="settings-content-area">
          {activeTab === 'general' && (
            <div>
              <h3 className="settings-section-title">General Preferences</h3>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Interface Theme</div>
                  <div className="settings-item-desc">Choose between dark and light appearance</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    variant={theme === 'dark' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setTheme('dark')}
                  >
                    <Moon size={14} /> Dark
                  </Button>
                  <Button
                    variant={theme === 'light' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setTheme('light')}
                  >
                    <Sun size={14} /> Light
                  </Button>
                </div>
              </div>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Display Language</div>
                  <div className="settings-item-desc">Select interface locale and dialect</div>
                </div>
                <select
                  className="input-field"
                  style={{ width: '130px', padding: '0.4rem 0.6rem', fontSize: 'var(--font-size-xs)' }}
                  defaultValue="en"
                >
                  <option value="en">English (US)</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="ja">日本語</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div>
              <h3 className="settings-section-title">Memory & Personalization</h3>

              {/* Global Memory Toggle */}
              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Persistent Memory</div>
                  <div className="settings-item-desc">
                    Remember working context, projects, goals, and style preferences across conversations
                  </div>
                </div>
                <Button
                  variant={memoryEnabled ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={toggleMemoryEnabled}
                >
                  {memoryEnabled ? 'Memory ON' : 'Memory OFF'}
                </Button>
              </div>

              {/* Personalization Grid: Response Style, Explanation Level, Tone */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.75rem',
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {/* Response Style */}
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Response Style
                  </div>
                  <select
                    className="input-field"
                    style={{ width: '100%', padding: '0.4rem 0.5rem', fontSize: 'var(--font-size-xs)' }}
                    value={responseStyle}
                    onChange={(e) => setResponseStyle(e.target.value as ResponseStyle)}
                  >
                    <option value="concise">Concise (Direct & minimal)</option>
                    <option value="balanced">Balanced (Clear & structured)</option>
                    <option value="detailed">Detailed (Thorough deep-dive)</option>
                  </select>
                </div>

                {/* Explanation Level */}
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Explanation Level
                  </div>
                  <select
                    className="input-field"
                    style={{ width: '100%', padding: '0.4rem 0.5rem', fontSize: 'var(--font-size-xs)' }}
                    value={explanationLevel || 'intermediate'}
                    onChange={(e) => setExplanationLevel(e.target.value as ExplanationLevel)}
                  >
                    <option value="beginner">Beginner (Gentle, terminology explained)</option>
                    <option value="intermediate">Intermediate (Pragmatic & applied)</option>
                    <option value="expert">Expert (Advanced design & zero fluff)</option>
                  </select>
                </div>

                {/* Tone Preference */}
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Conversational Tone
                  </div>
                  <select
                    className="input-field"
                    style={{ width: '100%', padding: '0.4rem 0.5rem', fontSize: 'var(--font-size-xs)' }}
                    value={tone || 'friendly'}
                    onChange={(e) => setTone(e.target.value as TonePreference)}
                  >
                    <option value="friendly">Friendly & encouraging</option>
                    <option value="professional">Professional & precise</option>
                    <option value="academic">Academic & rigorous</option>
                    <option value="casual">Casual & conversational</option>
                  </select>
                </div>
              </div>

              {/* Custom Assistant Directives */}
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                    Custom Assistant Directives
                  </span>
                  {instructionSaveStatus && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--status-success)', fontWeight: 500 }}>
                      ✓ {instructionSaveStatus}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="e.g. Always write production TypeScript without semicolons; format code snippets clearly."
                    value={localInstructions}
                    onChange={(e) => setLocalInstructions(e.target.value)}
                    style={{ flex: 1, fontSize: 'var(--font-size-xs)', padding: '0.45rem 0.6rem', resize: 'vertical' }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSaveInstructions}
                    style={{ alignSelf: 'flex-start', fontSize: 'var(--font-size-xs)' }}
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* Privacy Safeguard Notice */}
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.6rem 0.75rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <Lock size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
                <span>
                  <strong>Privacy Safeguard:</strong> All memories and preferences are strictly isolated to your account. RIYAI automatically screens and refuses to store passwords, API keys, or sensitive credentials.
                </span>
              </div>

              {/* Add Memory Manually */}
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Teach RIYAI Context
                </div>
                <form
                  onSubmit={handleAddMemory}
                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                >
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. My primary stack is Next.js and TypeScript"
                    value={newMemoryText}
                    onChange={(e) => setNewMemoryText(e.target.value)}
                    style={{ flex: 1, fontSize: 'var(--font-size-xs)', padding: '0.45rem 0.75rem' }}
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
                    <Plus size={14} /> Add
                  </Button>
                </form>
                {privacyError && (
                  <div style={{ color: 'var(--status-error)', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                    {privacyError}
                  </div>
                )}
              </div>

              {/* Search & Filter Toolbar */}
              <div
                style={{
                  marginTop: '1.25rem',
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                }}
              >
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search
                    size={13}
                    style={{
                      position: 'absolute',
                      left: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search saved memories..."
                    value={memorySearchFilter}
                    onChange={(e) => setMemorySearchFilter(e.target.value)}
                    style={{
                      width: '100%',
                      paddingLeft: '26px',
                      fontSize: 'var(--font-size-xs)',
                      paddingTop: '0.35rem',
                      paddingBottom: '0.35rem',
                    }}
                  />
                </div>
                <select
                  className="input-field"
                  value={memoryTypeFilter}
                  onChange={(e) => setMemoryTypeFilter(e.target.value)}
                  style={{ width: '110px', fontSize: 'var(--font-size-xs)', padding: '0.35rem 0.5rem' }}
                >
                  <option value="all">All Types</option>
                  <option value="preference">Preference</option>
                  <option value="project">Project</option>
                  <option value="instruction">Rule</option>
                  <option value="goal">Goal</option>
                  <option value="fact">Fact</option>
                </select>
              </div>

              {/* Saved Memories List */}
              <div style={{ marginTop: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.75rem',
                  }}
                >
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    Saved Memories ({filteredMemories.length}{memories.length !== filteredMemories.length ? ` of ${memories.length}` : ''})
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

                {filteredMemories.length === 0 ? (
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
                    {memories.length === 0
                      ? 'No memories saved yet. RIYAI naturally remembers useful working context when you chat (or use commands like "Remember that...").'
                      : 'No memories match your search filter.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
                    {filteredMemories.map((mem) => {
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

              {/* Natural Language Commands Guide */}
              <div
                style={{
                  marginTop: '1.25rem',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.75rem',
                  color: 'var(--text-tertiary)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  💬 Natural Memory Commands in Chat
                </div>
                <div>• &quot;Remember that my project is called RIYAI&quot; — stores or updates context</div>
                <div>• &quot;Forget that I use Python&quot; — removes matching memory</div>
                <div>• &quot;What do you remember about me?&quot; — summarizes all saved memories</div>
                <div>• &quot;Clear all memories&quot; — wipes saved context completely</div>
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 className="settings-section-title" style={{ margin: 0 }}>
                  Documents & Knowledge Intelligence (RAG)
                </h3>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isUploadingFiles}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {isUploadingFiles ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />}
                  <span>{isUploadingFiles ? 'Processing...' : 'Upload Document'}</span>
                </Button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUploadFromModal}
                accept=".pdf,.txt,.md,.markdown,.docx,.csv,.xlsx,application/pdf,text/plain,text/markdown"
                style={{ display: 'none' }}
                multiple
              />

              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginBottom: '1rem' }}>
                Upload PDFs, Markdown, and text documents to empower RIYAI with grounded semantic search and verifiable source citations. Documents are private and scoped strictly to your account.
              </p>

              {/* Status and Error Banners */}
              {isUploadingFiles && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 0.85rem',
                    backgroundColor: 'rgba(0, 210, 180, 0.08)',
                    border: '1px solid rgba(0, 210, 180, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--riyai-accent)',
                    fontSize: 'var(--font-size-xs)',
                    marginBottom: '1rem',
                  }}
                >
                  <Loader2 size={14} className="spin" />
                  <span>Extracting document text, generating vector chunks, and indexing knowledge...</span>
                </div>
              )}

              {fileUploadStatus && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 0.85rem',
                    backgroundColor: fileUploadStatus.includes('OCR') ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    border: fileUploadStatus.includes('OCR') ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    color: fileUploadStatus.includes('OCR') ? 'var(--status-warning, #f59e0b)' : 'var(--status-success, #10b981)',
                    fontSize: 'var(--font-size-xs)',
                    marginBottom: '1rem',
                  }}
                >
                  {fileUploadStatus.includes('OCR') ? <AlertTriangle size={14} /> : <Check size={14} />}
                  <span>{fileUploadStatus}</span>
                </div>
              )}

              {uploadError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 0.85rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--status-error)',
                    fontSize: 'var(--font-size-xs)',
                    marginBottom: '1rem',
                  }}
                >
                  <AlertTriangle size={14} />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Document Search Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search
                    size={13}
                    style={{
                      position: 'absolute',
                      left: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search documents by name..."
                    value={fileSearchFilter}
                    onChange={(e) => setFileSearchFilter(e.target.value)}
                    style={{
                      width: '100%',
                      paddingLeft: '26px',
                      fontSize: 'var(--font-size-xs)',
                      paddingTop: '0.35rem',
                      paddingBottom: '0.35rem',
                    }}
                  />
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  {filteredFiles.length} file{filteredFiles.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Documents List */}
              {userFiles.length === 0 ? (
                <div
                  style={{
                    padding: '2.5rem 1.5rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No documents in your knowledge base yet</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>
                    Click here or use the button above to upload PDF, Markdown, Text, or Spreadsheet files.
                  </div>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div
                  style={{
                    padding: '1.5rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  No documents match your search &quot;{fileSearchFilter}&quot;.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '360px', overflowY: 'auto' }}>
                  {filteredFiles.map((f) => {
                    const isEditing = editingFileId === f.id;
                    const isDeleting = deleteConfirmFileId === f.id;

                    return (
                      <div
                        key={f.id}
                        style={{
                          padding: '0.75rem 1rem',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                          {f.category === 'document' ? (
                            <FileText size={20} color="var(--riyai-accent)" style={{ flexShrink: 0 }} />
                          ) : f.category === 'spreadsheet' ? (
                            <Table size={20} color="#10b981" style={{ flexShrink: 0 }} />
                          ) : (
                            <FileCode size={20} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                          )}

                          <div style={{ minWidth: 0, flex: 1 }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px' }}>
                                <input
                                  type="text"
                                  className="input-field"
                                  value={editFileName}
                                  onChange={(e) => setEditFileName(e.target.value)}
                                  style={{ fontSize: 'var(--font-size-xs)', padding: '0.3rem 0.5rem', width: '100%' }}
                                />
                                <button
                                  type="button"
                                  className="btn-icon"
                                  style={{ width: '26px', height: '26px' }}
                                  onClick={() => handleSaveRename(f.id)}
                                  title="Save file name"
                                >
                                  <Check size={14} color="var(--status-success)" />
                                </button>
                                <button
                                  type="button"
                                  className="btn-icon"
                                  style={{ width: '26px', height: '26px' }}
                                  onClick={() => setEditingFileId(null)}
                                  title="Cancel rename"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div
                                style={{
                                  fontSize: 'var(--font-size-sm)',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={f.name}
                              >
                                {f.name}
                              </div>
                            )}

                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: 'var(--font-size-xs)',
                                color: 'var(--text-tertiary)',
                                marginTop: '3px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span>{(f.size / 1024).toFixed(0)} KB</span>
                              <span>•</span>
                              <span>{f.pageCount || 1} page{(f.pageCount || 1) > 1 ? 's' : ''}</span>
                              <span>•</span>
                              <span>{f.chunkCount || 0} chunks</span>
                              <span>•</span>

                              {/* Status Badges */}
                              {f.status === 'ready' && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                    color: '#10b981',
                                    fontWeight: 600,
                                  }}
                                >
                                  Ready
                                </span>
                              )}
                              {f.status === 'ocr_required' && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                    color: '#f59e0b',
                                    fontWeight: 600,
                                  }}
                                  title="Scanned PDF detected. OCR is required to extract text from images."
                                >
                                  OCR Required
                                </span>
                              )}
                              {f.status === 'processing' && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(0, 210, 180, 0.15)',
                                    color: 'var(--riyai-accent)',
                                    fontWeight: 600,
                                  }}
                                >
                                  Indexing...
                                </span>
                              )}
                              {f.status === 'error' && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                    color: 'var(--status-error)',
                                    fontWeight: 600,
                                  }}
                                  title={f.errorMessage}
                                >
                                  Error
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ width: '28px', height: '28px' }}
                            onClick={() => setSelectedDetailFile(f)}
                            title="View document details & extracted text"
                          >
                            <Eye size={13} />
                          </button>

                          <button
                            type="button"
                            className="btn-icon"
                            style={{ width: '28px', height: '28px' }}
                            onClick={() => handleStartRename(f)}
                            title="Rename document"
                          >
                            <Edit2 size={13} />
                          </button>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setComposerText(`Please analyze the document "${f.name}" and provide a concise summary of its main points.`);
                              setIsSettingsOpen(false);
                            }}
                            title="Ask about this document in chat"
                          >
                            <ArrowUpRight size={13} /> Chat
                          </Button>

                          {isDeleting ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                deleteUserFile(f.id);
                                setDeleteConfirmFileId(null);
                              }}
                              style={{ color: 'var(--status-error)', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                            >
                              Confirm
                            </Button>
                          ) : (
                            <button
                              type="button"
                              className="btn-icon"
                              style={{ width: '28px', height: '28px' }}
                              onClick={() => setDeleteConfirmFileId(f.id)}
                              title="Delete document and purge RAG chunks"
                            >
                              <Trash2 size={13} color="var(--status-error)" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Document Details Modal Dialog */}
              {selectedDetailFile && (
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      maxWidth: '620px',
                      width: '100%',
                      maxHeight: '85vh',
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '1.25rem',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={18} color="var(--riyai-accent)" />
                        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-md)' }}>
                          Document Intelligence Details
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => setSelectedDetailFile(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '0.65rem',
                          backgroundColor: 'var(--bg-canvas, rgba(0,0,0,0.2))',
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 'var(--font-size-xs)',
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--text-tertiary)' }}>File Name: </span>
                          <span style={{ fontWeight: 600 }}>{selectedDetailFile.name}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-tertiary)' }}>Original Name: </span>
                          <span>{selectedDetailFile.originalName}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-tertiary)' }}>Size: </span>
                          <span>{(selectedDetailFile.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-tertiary)' }}>MIME Type: </span>
                          <span>{selectedDetailFile.mimeType}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-tertiary)' }}>Pages: </span>
                          <span>{selectedDetailFile.pageCount || 1}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-tertiary)' }}>RAG Chunks: </span>
                          <span>{selectedDetailFile.chunkCount || 0} chunks</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-tertiary)' }}>Status: </span>
                          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                            {selectedDetailFile.status}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-tertiary)' }}>Tokens: </span>
                          <span>~{selectedDetailFile.tokenCount || 0} tokens</span>
                        </div>
                      </div>

                      {selectedDetailFile.errorMessage && (
                        <div
                          style={{
                            padding: '0.65rem',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--status-error)',
                            fontSize: 'var(--font-size-xs)',
                          }}
                        >
                          <strong>Notice:</strong> {selectedDetailFile.errorMessage}
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                          Extracted Text Preview:
                        </div>
                        <div
                          style={{
                            maxHeight: '220px',
                            overflowY: 'auto',
                            backgroundColor: 'var(--bg-canvas, rgba(0,0,0,0.3))',
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.75rem',
                            lineHeight: 1.5,
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {selectedDetailFile.extractedText || 'No extracted text available for this document.'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: '0.5rem' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedDetailFile(null)}
                      >
                        Close
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setComposerText(`Please analyze "${selectedDetailFile.name}" and explain its main conclusions.`);
                          setSelectedDetailFile(null);
                          setIsSettingsOpen(false);
                        }}
                      >
                        Ask in Chat
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'account' && (
            <div>
              <h3 className="settings-section-title">Account & Authentication</h3>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Active Session</div>
                  <div className="settings-item-desc">Currently exploring as a local workspace guest</div>
                </div>
                <span className="badge badge-accent">Guest Explorer</span>
              </div>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Cloud Synchronization</div>
                  <div className="settings-item-desc">Sync conversations across desktop and mobile devices</div>
                </div>
                <span className="settings-badge-unsupported">Configured in Phase 4</span>
              </div>

              <div className="settings-item" style={{ paddingTop: '1.5rem' }}>
                <div>
                  <div className="settings-item-label">Authentication Provider</div>
                  <div className="settings-item-desc">
                    Ready to attach NextAuth / Supabase in Phase 4
                  </div>
                </div>
                <a href="/auth/signin" className="btn btn-secondary btn-sm">
                  View Auth UI
                </a>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 className="settings-section-title" style={{ margin: 0 }}>AI Service & Engine Configuration</h3>
                {saveStatus && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Check size={12} /> {saveStatus}
                  </span>
                )}
              </div>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Primary AI Service</div>
                  <div className="settings-item-desc">Centralized intelligence provider for all conversations</div>
                </div>
                <span className="badge badge-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={11} /> Google Gemini
                </span>
              </div>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Active Reasoning Model</div>
                  <div className="settings-item-desc">High-speed multimodal cognitive reasoning engine</div>
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  RIYAI (Gemini)
                </span>
              </div>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Provider Timeout (seconds)</div>
                  <div className="settings-item-desc">Maximum wait duration before considering a request unresponsive</div>
                </div>
                <input
                  type="number"
                  min="5"
                  max="120"
                  className="input-field"
                  style={{ width: '90px', padding: '0.4rem 0.6rem', fontSize: 'var(--font-size-xs)' }}
                  value={providerTimeoutSec}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 30;
                    setProviderTimeoutSec(val);
                    handleUpdateProviderPref({ providerTimeoutMs: val * 1000 });
                  }}
                />
              </div>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Transient Error Retry Limit</div>
                  <div className="settings-item-desc">Retries for temporary rate limits (never retries daily quota)</div>
                </div>
                <input
                  type="number"
                  min="0"
                  max="3"
                  className="input-field"
                  style={{ width: '90px', padding: '0.4rem 0.6rem', fontSize: 'var(--font-size-xs)' }}
                  value={maxTransientRetries}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 0;
                    setMaxTransientRetries(val);
                    handleUpdateProviderPref({ maxTransientRetries: val });
                  }}
                />
              </div>

              <div style={{ marginTop: '1rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md, 8px)', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', fontSize: '0.72rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Security & Privacy:</strong> API keys are securely stored on the server environment and are never transmitted to or accessible from browser code.
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div>
              <h3 className="settings-section-title">Data & Privacy Controls</h3>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Local Data Storage</div>
                  <div className="settings-item-desc">Conversations stored securely in client storage</div>
                </div>
                <span className="badge badge-accent">Local Browser Only</span>
              </div>

              <div className="settings-item">
                <div>
                  <div className="settings-item-label">Clear All Workspace Data</div>
                  <div className="settings-item-desc">Permanently remove local conversations, memories, and settings</div>
                </div>
                {clearConfirm ? (
                  <Button variant="ghost" size="sm" onClick={handleClearData} style={{ color: 'var(--status-error)' }}>
                    Confirm Clear All
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setClearConfirm(true)}>
                    <Trash2 size={13} /> Clear Data
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
