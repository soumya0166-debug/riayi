'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import { useChat } from '@/features/chat/ChatContext';
import { MessageItem } from './MessageItem';
import { WelcomeScreen } from './WelcomeScreen';

export function MessageList() {
  const { messages, isLoadingMessages, isGenerating } = useChat();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const userHasScrolledUpRef = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
    setIsAtBottom(true);
    userHasScrolledUpRef.current = false;
  }, []);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceToBottom < 100;

    setIsAtBottom(atBottom);
    userHasScrolledUpRef.current = !atBottom;
  };

  useEffect(() => {
    // Only auto-scroll down if user hasn't explicitly scrolled up to read earlier text
    if (!userHasScrolledUpRef.current) {
      scrollToBottom(false);
    }
  }, [messages, isGenerating, scrollToBottom]);

  if (isLoadingMessages) {
    return (
      <div
        className="chat-messages-container"
        style={{ alignItems: 'center', justifyContent: 'center' }}
        role="status"
        aria-live="polite"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            color: 'var(--text-secondary)',
            padding: '2.5rem 2rem',
            borderRadius: '16px',
            background: 'var(--bg-surface-elevated, rgba(255, 255, 255, 0.02))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
            maxWidth: '340px',
            textAlign: 'center',
          }}
        >
          <div
            className="brand-logo-mark animate-pulse-subtle"
            style={{
              width: '44px',
              height: '44px',
              fontSize: '1.25rem',
              boxShadow: '0 0 24px rgba(99, 102, 241, 0.3)',
            }}
          >
            R
          </div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Restoring Conversation
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              Loading context, message history & smart memory...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="chat-messages-container">
        <WelcomeScreen />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="chat-messages-container"
      role="log"
      aria-live="polite"
      style={{ position: 'relative' }}
    >
      <div className="chat-messages-inner">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={bottomRef} style={{ height: '1px' }} />
      </div>

      {!isAtBottom && (
        <button
          type="button"
          className="jump-to-latest-btn"
          onClick={() => scrollToBottom(true)}
          aria-label="Jump to latest message"
        >
          <ArrowDown size={14} />
          <span>Jump to latest</span>
        </button>
      )}
    </div>
  );
}
