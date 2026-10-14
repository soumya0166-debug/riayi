'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');

            if (isInline) {
              return (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            }

            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');

            return <CodeBlock language={language} code={codeString} />;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="markdown-link"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="markdown-table-wrapper">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
