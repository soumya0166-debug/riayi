'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserSession } from '@/types/user';
import { SignInCredentials, SignUpCredentials } from '@/types/auth';
import { authService } from '@/services/auth/authService';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (creds: SignInCredentials) => Promise<void>;
  signUp: (creds: SignUpCredentials) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession>({
    user: null,
    isAuthenticated: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const active = await authService.getSession();
        setSession(active);
      } catch {
        // Fallback to unauthenticated guest
        setSession({ user: null, isAuthenticated: false });
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, []);

  const signIn = async (creds: SignInCredentials) => {
    setIsLoading(true);
    try {
      const resp = await authService.signIn(creds);
      setSession({ user: resp.user, isAuthenticated: true });
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (creds: SignUpCredentials) => {
    setIsLoading(true);
    try {
      const resp = await authService.signUp(creds);
      setSession({ user: resp.user, isAuthenticated: true });
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    await authService.signOut();
    setSession({ user: null, isAuthenticated: false });
  };

  return (
    <AuthContext.Provider
      value={{
        user: session.user,
        isAuthenticated: session.isAuthenticated,
        isLoading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
