import { SessionUser, apiUrl } from "./auth";

export async function getCurrentUser(signal?: AbortSignal): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${apiUrl()}/auth/me`, { credentials: "include", cache: "no-store", signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { user?: SessionUser | null };
    return body.user ?? null;
  } catch {
    return null;
  }
}

export type CredentialsResult = { user: SessionUser } | { mfaRequired: true; mfaToken: string } | { error: string };

export async function submitCredentials(
  path: "/auth/login" | "/auth/register",
  body: { email: string; password: string; name?: string },
): Promise<CredentialsResult> {
  try {
    const res = await fetch(`${apiUrl()}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { error: payload?.error?.message ?? `Request failed (${res.status})` };
    }
    const payload = (await res.json()) as { user?: SessionUser; mfaRequired?: boolean; mfaToken?: string };
    if (payload.mfaRequired && payload.mfaToken) {
      return { mfaRequired: true, mfaToken: payload.mfaToken };
    }
    if (!payload.user) {
      return { error: "The API returned an unexpected response." };
    }
    return { user: payload.user };
  } catch {
    return { error: "The API is unreachable. Is the backend running?" };
  }
}

export async function verifyMfaToken(token: string, code: string): Promise<{ user: SessionUser } | { error: string }> {
  try {
    const res = await fetch(`${apiUrl()}/auth/mfa/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, code }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { error: payload?.error?.message ?? `Request failed (${res.status})` };
    }
    const payload = (await res.json()) as { user: SessionUser };
    return { user: payload.user };
  } catch {
    return { error: "The API is unreachable. Is the backend running?" };
  }
}