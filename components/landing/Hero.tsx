'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, ShieldCheck, Cpu, Compass } from 'lucide-react';
import { siteConfig } from '@/config/site';

export function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-badge">
        <span className="landing-badge-dot" />
        <span>Phase 1 Architecture Foundation • Production-Ready Core</span>
      </div>

      <h1 className="landing-title">
        <span className="gradient-text">RIYAI</span>
        <br />
        Your intelligent companion.
      </h1>

      <p className="landing-subtitle">
        Engineered for clarity, depth, and fluid interaction. RIYAI bridges human intuition
        with next-generation machine reasoning through a bespoke, distraction-free environment.
      </p>

      <div className="landing-cta-group">
        <Link href="/chat" className="btn btn-primary btn-lg">
          <span>Enter Workspace</span>
          <ArrowRight size={18} />
        </Link>

        <Link href="/auth/signup" className="btn btn-secondary btn-lg">
          <span>Create Account</span>
        </Link>
      </div>

      <div className="landing-features-grid">
        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Sparkles size={20} />
          </div>
          <h2 className="feature-title">Intuitive Cognition</h2>
          <p className="feature-desc">
            Bespoke interaction surface designed for non-linear thinking, system reasoning, and creative engineering.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Cpu size={20} />
          </div>
          <h2 className="feature-title">Modular AI Abstraction</h2>
          <p className="feature-desc">
            Universal adapter architecture ready to plug into Anthropic, OpenAI, or Google models without client rewrites.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <ShieldCheck size={20} />
          </div>
          <h2 className="feature-title">Privacy-Centric Trust</h2>
          <p className="feature-desc">
            Clean client isolation with strictly server-guarded keys and zero third-party telemetry in Phase 1.
          </p>
        </div>
      </div>
    </section>
  );
}
