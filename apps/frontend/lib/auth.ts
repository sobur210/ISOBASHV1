export const AUTH_COOKIE_NAME = "isobash_session";

export type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  mfaEnabled: boolean;
  createdAt: string;
};

export function apiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}