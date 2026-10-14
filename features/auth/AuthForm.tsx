'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { useAuth } from './AuthContext';
import { authService } from '@/services/auth/authService';
import { formatErrorMessage } from '@/lib/errors';

export type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { signIn, signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (mode === 'signin') {
        await signIn({ email, password });
        router.push('/chat');
      } else if (mode === 'signup') {
        await signUp({ name, email, password });
        router.push('/chat');
      } else if (mode === 'forgot') {
        const res = await authService.requestPasswordReset({ email });
        setSuccessMessage(res.message);
      } else if (mode === 'reset') {
        await authService.confirmPasswordReset({ token, newPassword });
        setSuccessMessage('Password reset successfully. You can now sign in.');
      }
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <Link href="/" className="brand-logo-mark" style={{ width: '38px', height: '38px', fontSize: '1rem' }}>
          R
        </Link>
        <h1 className="auth-title">
          {mode === 'signin' && 'Welcome back to RIYAI'}
          {mode === 'signup' && 'Create your RIYAI account'}
          {mode === 'forgot' && 'Reset your password'}
          {mode === 'reset' && 'Create new password'}
        </h1>
        <p className="auth-subtitle">
          {mode === 'signin' && 'Sign in to access your persistent AI conversations.'}
          {mode === 'signup' && 'Join RIYAI to experience your personal intelligent companion.'}
          {mode === 'forgot' && "Enter your email and we'll send recovery instructions."}
          {mode === 'reset' && 'Enter your reset token and your new secure password.'}
        </p>
      </div>

      <div className="auth-notice">
        <strong>Phase 1 Architectural Notice:</strong> UI and authentication contracts are ready.
        Live OAuth & session cookies will connect via server-side NextAuth/Supabase in Phase 2.
      </div>

      {error && (
        <div
          style={{
            padding: '0.65rem',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--status-error)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--status-error)',
            fontSize: '0.8rem',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: '0.65rem',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid var(--status-success)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--status-success)',
            fontSize: '0.8rem',
            marginBottom: '1rem',
          }}
        >
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        {mode === 'signup' && (
          <Input
            label="Full Name"
            type="text"
            required
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}

        {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
          <Input
            label="Email Address"
            type="email"
            required
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}

        {(mode === 'signin' || mode === 'signup') && (
          <Input
            label="Password"
            type="password"
            required
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}

        {mode === 'reset' && (
          <>
            <Input
              label="Reset Token"
              type="text"
              required
              placeholder="Paste security token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Input
              label="New Password"
              type="password"
              required
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          style={{ marginTop: '0.5rem', width: '100%' }}
        >
          {mode === 'signin' && 'Sign In'}
          {mode === 'signup' && 'Create Account'}
          {mode === 'forgot' && 'Send Instructions'}
          {mode === 'reset' && 'Set New Password'}
        </Button>
      </form>

      {mode === 'signin' && (
        <div className="auth-links">
          <Link href="/auth/forgot-password" className="auth-link">
            Forgot password?
          </Link>
          <Link href="/auth/signup" className="auth-link">
            Need an account? Sign up
          </Link>
        </div>
      )}

      {mode === 'signup' && (
        <div className="auth-links" style={{ justifyContent: 'center' }}>
          <span>Already have an account?&nbsp;</span>
          <Link href="/auth/signin" className="auth-link">
            Sign in
          </Link>
        </div>
      )}

      {(mode === 'forgot' || mode === 'reset') && (
        <div className="auth-links" style={{ justifyContent: 'center' }}>
          <Link href="/auth/signin" className="auth-link">
            Back to Sign In
          </Link>
        </div>
      )}

      <div className="auth-divider">or explore without an account</div>

      <Link href="/chat" className="btn btn-secondary" style={{ width: '100%' }}>
        Continue as Guest to Workspace
      </Link>
    </div>
  );
}
