'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const displayLang = (language || 'code').toUpperCase();

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{displayLang}</span>
        <button
          type="button"
          className="code-block-copy-btn"
          onClick={handleCopy}
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check size={13} color="var(--status-success)" />
              <span style={{ color: 'var(--status-success)' }}>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="code-block-content">
        <pre tabIndex={0}>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
