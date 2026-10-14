'use client';

import React from 'react';
import {
  HelpCircle,
  Code2,
  FileText,
  Lightbulb,
  PenTool,
  Sparkles,
} from 'lucide-react';
import { siteConfig } from '@/config/site';
import { useChat } from '@/features/chat/ChatContext';

const iconMap = {
  HelpCircle: HelpCircle,
  Code2: Code2,
  FileText: FileText,
  Lightbulb: Lightbulb,
  PenTool: PenTool,
  Sparkles: Sparkles,
};

export function WelcomeScreen() {
  const { populateComposer } = useChat();

  return (
    <div className="welcome-container">
      <div className="welcome-glyph" aria-hidden="true">
        <Sparkles size={32} />
      </div>

      <h1 className="welcome-headline">What can RIYAI help you explore?</h1>
      <p className="welcome-subtitle">
        Your intelligent companion for reasoning, synthesis, engineering, and creative flow.
      </p>

      <div className="prompts-grid" role="region" aria-label="Starter exploration prompts">
        {siteConfig.starterPrompts.map((item) => {
          const IconComponent = iconMap[item.icon as keyof typeof iconMap] || Sparkles;
          return (
            <div
              key={item.id}
              className="prompt-card"
              role="button"
              tabIndex={0}
              onClick={() => populateComposer(item.prompt)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  populateComposer(item.prompt);
                }
              }}
              title="Click to populate message input"
            >
              <div className="prompt-card-title">
                <IconComponent size={16} color="var(--riyai-accent)" />
                <span>{item.title}</span>
              </div>
              <div className="prompt-card-preview">{item.prompt}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
