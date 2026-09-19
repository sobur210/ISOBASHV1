export const AUTH_COOKIE_NAME = 'isobash_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'USER';
  createdAt: string;
};

export type AuthSession = { id: string; expiresAt: Date; userId: number };