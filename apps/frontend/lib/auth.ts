import { API_URL } from "./config";

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
  return API_URL;
}