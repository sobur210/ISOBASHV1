import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, SessionUser, apiUrl } from "./auth";

export async function requireUser(redirectTo = "/login"): Promise<SessionUser> {
  const user = await getUser();
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}

export async function requireAdmin(redirectTo = "/app"): Promise<SessionUser> {
  const user = await requireUser("/login");
  if (user.role !== "ADMIN") {
    redirect(redirectTo);
  }
  return user;
}

export async function getUser(): Promise<SessionUser | null> {
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

  return null;
}