'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { AVAILABLE_MODELS } from '@/config/models';

/**
 * Model Indicator: Displays the active centralized AI model badge.
 * Model switching is removed to enforce a single centralized AI service.
 */
export function ModelSelector() {
  const currentModel = AVAILABLE_MODELS[0] || {
    name: 'RIYAI (Gemini)',
    badge: 'Gemini',
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <div
        className="model-picker-trigger"
        style={{
          cursor: 'default',
          userSelect: 'none',
          padding: '0.35rem 0.65rem',
          gap: '0.45rem',
        }}
        title="RIYAI is powered by Google Gemini"
      >
        <Sparkles size={14} color="var(--riyai-accent)" />
        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{currentModel.name}</span>
        <span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>
          {currentModel.badge}
        </span>
      </div>
    </div>
  );
}
