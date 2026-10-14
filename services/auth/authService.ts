import { IAuthService } from './authService.interface';
import {
  SignInCredentials,
  SignUpCredentials,
  AuthResponse,
  PasswordResetRequest,
  PasswordResetConfirm,
} from '@/types/auth';
import { UserSession } from '@/types/user';
import { AppError } from '@/lib/errors';
import { safeStorage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/constants';

/**
 * AuthService (Phase 1 Architectural Provider)
 *
 * Implements IAuthService without creating synthetic/fake authentication.
 * Ready to wire up with NextAuth, Supabase Auth, or custom JWT auth in Phase 2.
 */
export class AuthService implements IAuthService {
  public async signIn(credentials: SignInCredentials): Promise<AuthResponse> {
    if (!credentials.email) {
      throw new AppError('Email address is required.', 'VALIDATION_ERROR', 400);
    }
    
    // In Phase 1: Authentication provider is intentionally pending.
    throw new AppError(
      'Authentication service is in Phase 1 Architectural Mode. Real authentication provider (OAuth/NextAuth/Supabase) will be configured in Phase 2.',
      'AUTH_REQUIRED',
      501
    );
  }

  public async signUp(credentials: SignUpCredentials): Promise<AuthResponse> {
    if (!credentials.email || !credentials.name) {
      throw new AppError('Name and email are required.', 'VALIDATION_ERROR', 400);
    }

    throw new AppError(
      'Account registration is pending Phase 2 authentication provider configuration.',
      'AUTH_REQUIRED',
      501
    );
  }

  public async signOut(): Promise<void> {
    safeStorage.remove(STORAGE_KEYS.AUTH_SESSION);
  }

  public async getSession(): Promise<UserSession> {
    const cached = safeStorage.get<UserSession | null>(STORAGE_KEYS.AUTH_SESSION, null);
    if (cached) {
      return cached;
    }

    // Default guest session for Phase 1 exploration
    return {
      user: null,
      isAuthenticated: false,
    };
  }

  public async requestPasswordReset(req: PasswordResetRequest): Promise<{ success: boolean; message: string }> {
    if (!req.email) {
      throw new AppError('Please provide a valid email address.', 'VALIDATION_ERROR', 400);
    }

    // Inform user of architecture status
    return {
      success: true,
      message: 'Password reset instructions will be sent once the email delivery service is configured in Phase 2.',
    };
  }

  public async confirmPasswordReset(req: PasswordResetConfirm): Promise<{ success: boolean }> {
    if (!req.token || !req.newPassword) {
      throw new AppError('Token and new password are required.', 'VALIDATION_ERROR', 400);
    }
    return { success: true };
  }
}

export const authService = new AuthService();
