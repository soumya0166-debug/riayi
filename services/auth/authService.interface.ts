import {
  SignInCredentials,
  SignUpCredentials,
  AuthResponse,
  PasswordResetRequest,
  PasswordResetConfirm,
} from '@/types/auth';
import { UserSession } from '@/types/user';

export interface IAuthService {
  /**
   * Authenticate a user with email/password or third-party OAuth.
   */
  signIn(credentials: SignInCredentials): Promise<AuthResponse>;

  /**
   * Register a new user account.
   */
  signUp(credentials: SignUpCredentials): Promise<AuthResponse>;

  /**
   * Invalidate the current session and sign out.
   */
  signOut(): Promise<void>;

  /**
   * Retrieve the active user session or null if unauthenticated.
   */
  getSession(): Promise<UserSession>;

  /**
   * Send a password reset email/token.
   */
  requestPasswordReset(req: PasswordResetRequest): Promise<{ success: boolean; message: string }>;

  /**
   * Confirm password reset with token and new password.
   */
  confirmPasswordReset(req: PasswordResetConfirm): Promise<{ success: boolean }>;
}
