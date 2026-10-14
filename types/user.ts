export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  user: User | null;
  isAuthenticated: boolean;
  token?: string;
  expiresAt?: string;
}
