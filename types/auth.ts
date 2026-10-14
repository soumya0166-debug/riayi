import { User } from './user';

export interface SignInCredentials {
  email: string;
  password?: string;
  provider?: 'credentials' | 'google' | 'github';
}

export interface SignUpCredentials {
  name: string;
  email: string;
  password?: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}
