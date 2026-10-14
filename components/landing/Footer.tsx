'use client';

import React from 'react';
import Link from 'next/link';
import { siteConfig } from '@/config/site';

export function Footer() {
  return (
    <footer className="landing-footer">
      <div>
        <span>&copy; {new Date().getFullYear()} {siteConfig.name} Platform. All rights reserved.</span>
      </div>
      <div style={{ display: 'flex', gap: '1.25rem' }}>
        <Link href="/chat" style={{ color: 'var(--text-secondary)' }}>
          Workspace
        </Link>
        <Link href="/auth/signin" style={{ color: 'var(--text-secondary)' }}>
          Authentication
        </Link>
        <Link href="/settings" style={{ color: 'var(--text-secondary)' }}>
          Settings
        </Link>
      </div>
    </footer>
  );
}
