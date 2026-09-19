import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, SessionUser, apiUrl } from "./auth";

export async function requireUser(redirectTo = "/login"): Promise<SessionUser> {
  const store = await cookies();
  const sessionId = store.get(AUTH_COOKIE_NAME)?.value;

  if (sessionId) {
    try {
      const res = await fetch(`${apiUrl()}/auth/me`, {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${sessionId}` },
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as { user?: SessionUser | null };
        if (body.user) {
          return body.user;
        }
      }
    } catch {
      // backend temporarily unreachable — treated as unauthenticated below
    }
  }

  redirect(redirectTo);
}