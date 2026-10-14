'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  Pin,
  Trash2,
  Sliders,
  User as UserIcon,
  Database,
  Pencil,
  Check,
  X,
  Zap,
} from 'lucide-react';
import { useChat } from '@/features/chat/ChatContext';
import { Avatar } from '@/components/common/Avatar';
import { siteConfig } from '@/config/site';

export function Sidebar() {
  const {
    conversations,
    activeConversationId,
    sidebarCollapsed,
    toggleSidebar,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    searchQuery,
    setSearchQuery,
    createNewConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    togglePinConversation,
    setIsSettingsOpen,
    setIsAutomationOpen,
  } = useChat();

  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingConvId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = async (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) {
      await renameConversation(id, trimmed);
    }
    setEditingConvId(null);
  };

  const handleCancelRename = () => {
    setEditingConvId(null);
    setEditingTitle('');
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedConversations = filteredConversations.filter((c) => c.isPinned);
  const recentConversations = filteredConversations.filter((c) => !c.isPinned);

  return (
    <>
      {/* Mobile Drawer Overlay */}
      <div
        className={`mobile-drawer-overlay ${mobileDrawerOpen ? 'active' : ''}`}
        onClick={() => setMobileDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${
          mobileDrawerOpen ? 'mobile-open' : ''
        }`}
        aria-label="Main Navigation"
      >
        {/* Header with Logo */}
        <div className="sidebar-header">
          {!sidebarCollapsed && (
            <Link href="/" className="brand-wrapper">
              <div className="brand-logo-mark">R</div>
              <span className="brand-title">
                RIY<span className="accent-text">AI</span>
              </span>
            </Link>
          )}

          {sidebarCollapsed && (
            <Link href="/" className="brand-wrapper" style={{ margin: '0 auto' }}>
              <div className="brand-logo-mark">R</div>
            </Link>
          )}

          <button
            type="button"
            className="btn-icon"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ display: mobileDrawerOpen ? 'none' : 'flex' }}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Actions: New Chat & Search */}
        <div className="sidebar-actions">
          <button
            type="button"
            className="new-chat-btn"
            onClick={() => createNewConversation()}
            title="Start new conversation"
          >
            <Plus size={16} color="var(--riyai-accent)" />
            {!sidebarCollapsed && <span>New Chat</span>}
          </button>

          {!sidebarCollapsed && (
            <div className="search-input-wrapper">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search conversations"
              />
            </div>
          )}
        </div>

        {/* Conversation List */}
        <div className="sidebar-section">
          {!sidebarCollapsed && pinnedConversations.length > 0 && (
            <>
              <div className="sidebar-section-title">Pinned</div>
              {pinnedConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conv-item ${conv.id === activeConversationId ? 'active' : ''}`}
                  onClick={() => {
                    if (editingConvId !== conv.id) {
                      selectConversation(conv.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editingConvId !== conv.id) {
                      selectConversation(conv.id);
                    }
                  }}
                >
                  <Pin size={14} color="var(--riyai-accent)" style={{ flexShrink: 0, marginRight: '6px' }} />

                  {editingConvId === conv.id ? (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(conv.id);
                          if (e.key === 'Escape') handleCancelRename();
                        }}
                        autoFocus
                        style={{
                          background: 'var(--bg-input, rgba(0,0,0,0.3))',
                          border: '1px solid var(--color-primary, #6366f1)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                          padding: '2px 6px',
                          width: '100%',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ width: '22px', height: '22px' }}
                        onClick={() => handleSaveRename(conv.id)}
                        title="Save rename"
                      >
                        <Check size={12} color="var(--riyai-accent)" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ width: '22px', height: '22px' }}
                        onClick={handleCancelRename}
                        title="Cancel"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="conv-item-title">{conv.title}</span>
                      <div className="conv-item-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '24px', height: '24px' }}
                          onClick={() => handleStartRename(conv.id, conv.title)}
                          title="Rename"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '24px', height: '24px' }}
                          onClick={() => togglePinConversation(conv.id)}
                          title="Unpin"
                        >
                          <Pin size={12} color="var(--riyai-accent)" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '24px', height: '24px' }}
                          onClick={() => deleteConversation(conv.id)}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </>
          )}

          {!sidebarCollapsed && (
            <div className="sidebar-section-title">
              {pinnedConversations.length > 0 ? 'Recent' : 'Conversations'}
            </div>
          )}

          {recentConversations.length === 0 && pinnedConversations.length === 0 && !sidebarCollapsed && (
            <div style={{ padding: '0.85rem', fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              No chats yet. Start a new one above!
            </div>
          )}

          {recentConversations.map((conv) => (
            <div
              key={conv.id}
              className={`conv-item ${conv.id === activeConversationId ? 'active' : ''}`}
              onClick={() => {
                if (editingConvId !== conv.id) {
                  selectConversation(conv.id);
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editingConvId !== conv.id) {
                  selectConversation(conv.id);
                }
              }}
              title={sidebarCollapsed ? conv.title : undefined}
            >
              <MessageSquare size={15} style={{ flexShrink: 0, marginRight: sidebarCollapsed ? '0' : '6px' }} />
              {!sidebarCollapsed && (
                <>
                  {editingConvId === conv.id ? (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(conv.id);
                          if (e.key === 'Escape') handleCancelRename();
                        }}
                        autoFocus
                        style={{
                          background: 'var(--bg-input, rgba(0,0,0,0.3))',
                          border: '1px solid var(--color-primary, #6366f1)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                          padding: '2px 6px',
                          width: '100%',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ width: '22px', height: '22px' }}
                        onClick={() => handleSaveRename(conv.id)}
                        title="Save rename"
                      >
                        <Check size={12} color="var(--riyai-accent)" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ width: '22px', height: '22px' }}
                        onClick={handleCancelRename}
                        title="Cancel"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="conv-item-title">{conv.title}</span>
                      <div className="conv-item-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '24px', height: '24px' }}
                          onClick={() => handleStartRename(conv.id, conv.title)}
                          title="Rename chat"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '24px', height: '24px' }}
                          onClick={() => togglePinConversation(conv.id)}
                          title="Pin chat"
                        >
                          <Pin size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: '24px', height: '24px' }}
                          onClick={() => deleteConversation(conv.id)}
                          title="Delete chat"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer: Settings & Profile */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="btn-ghost"
            style={{ width: '100%', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: '0.5rem 0.6rem', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.65rem' }}
            onClick={() => setIsAutomationOpen(true)}
            title="Automations & AI Agents"
          >
            <Zap size={17} style={{ color: '#6366f1' }} />
            {!sidebarCollapsed && <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Automations</span>}
          </button>

          <Link
            href="/training"
            className="btn-ghost"
            style={{ width: '100%', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: '0.5rem 0.6rem', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.65rem' }}
            title="Model Studio & Fine-Tuning"
          >
            <Database size={17} style={{ color: 'var(--color-primary)' }} />
            {!sidebarCollapsed && <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Model Studio</span>}
          </Link>

          <button
            type="button"
            className="btn-ghost"
            style={{ width: '100%', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: '0.5rem 0.6rem' }}
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            <Settings size={17} />
            {!sidebarCollapsed && <span style={{ fontSize: 'var(--font-size-sm)' }}>Settings</span>}
          </button>

          <div
            className="user-profile-badge"
            onClick={() => setIsSettingsOpen(true)}
            title="User Profile"
            style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}
          >
            <Avatar name="Explorer" isAccent={true} />
            {!sidebarCollapsed && (
              <div className="user-profile-info">
                <span className="user-profile-name">Explorer</span>
                <span className="user-profile-role">Phase 1 Guest</span>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
