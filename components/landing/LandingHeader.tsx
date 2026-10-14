'use client';

import React from 'react';
import Link from 'next/link';
import { Sun, Moon, ArrowRight } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export function LandingHeader() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="landing-header">
      <Link href="/" className="brand-wrapper">
        <div className="brand-logo-mark">R</div>
        <span className="brand-title">
          RIY<span className="accent-text">AI</span>
        </span>
      </Link>
 
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          type="button"
          className="btn-icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <Link href="/training" className="btn btn-ghost btn-sm">
          Model Studio
        </Link>

        <Link href="/auth/signin" className="btn btn-ghost btn-sm">
          Sign In
        </Link>

        <Link href="/chat" className="btn btn-primary btn-sm">
          <span>Launch Workspace</span>
          <ArrowRight size={14} />
        </Link>
      </div>
    </header>
  );
}
