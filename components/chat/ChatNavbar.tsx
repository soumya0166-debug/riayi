'use client';

import React, { useState } from 'react';
import { Menu, Settings, Sun, Moon, Trash2, Pin, Pencil, Check, X, Zap } from 'lucide-react';
import { useChat } from '@/features/chat/ChatContext';
import { ModelSelector } from './ModelSelector';
import { useTheme } from '@/hooks/useTheme';

export function ChatNavbar() {
  const {
    activeConversation,
    setMobileDrawerOpen,
    setIsSettingsOpen,
    setIsAutomationOpen,
    clearCurrentConversation,
    togglePinConversation,
    renameConversation,
  } = useChat();
  const { theme, toggleTheme } = useTheme();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');

  const handleStartEditing = () => {
    if (activeConversation) {
      setEditingTitle(activeConversation.title);
      setIsEditingTitle(true);
    }
  };

  const handleSaveTitle = async () => {
    const trimmed = editingTitle.trim();
    if (trimmed && activeConversation) {
      await renameConversation(activeConversation.id, trimmed);
    }
    setIsEditingTitle(false);
  };

  return (
    <header className="chat-navbar">
      <div className="chat-navbar-left">
        <button
          type="button"
          className="btn-icon mobile-menu-trigger"
          onClick={() => setMobileDrawerOpen(true)}
          title="Open menu"
          aria-label="Open sidebar menu"
        >
          <Menu size={20} />
        </button>

        <ModelSelector />

        {activeConversation && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            {isEditingTitle ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  autoFocus
                  style={{
                    background: 'var(--bg-input, rgba(0,0,0,0.3))',
                    border: '1px solid var(--color-primary, #6366f1)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    padding: '2px 8px',
                    width: '180px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: '22px', height: '22px' }}
                  onClick={handleSaveTitle}
                  title="Save title"
                >
                  <Check size={12} color="var(--riyai-accent, #6366f1)" />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: '22px', height: '22px' }}
                  onClick={() => setIsEditingTitle(false)}
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    maxWidth: '220px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
                  }}
                  onClick={handleStartEditing}
                  title="Click to rename"
                >
                  {activeConversation.title}
                </span>
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: '22px', height: '22px' }}
                  onClick={handleStartEditing}
                  title="Rename chat"
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  style={{ width: '24px', height: '24px' }}
                  onClick={() => togglePinConversation(activeConversation.id)}
                  title={activeConversation.isPinned ? 'Unpin' : 'Pin'}
                >
                  <Pin
                    size={12}
                    color={activeConversation.isPinned ? 'var(--riyai-accent)' : 'inherit'}
                  />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="chat-navbar-right">
        {activeConversation && (
          <button
            type="button"
            className="btn-icon"
            onClick={clearCurrentConversation}
            title="Delete current conversation"
            aria-label="Delete current conversation"
          >
            <Trash2 size={16} />
          </button>
        )}

        <button
          type="button"
          className="btn-icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <button
          type="button"
          className="btn-icon"
          onClick={() => setIsAutomationOpen(true)}
          title="Automations & AI Agents"
          aria-label="Open automations"
          style={{ color: '#6366f1' }}
        >
          <Zap size={17} />
        </button>

        <button
          type="button"
          className="btn-icon"
          onClick={() => setIsSettingsOpen(true)}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings size={17} />
        </button>
      </div>
    </header>
  );
}
