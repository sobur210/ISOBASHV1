export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      if (body.error?.message) {
        message = `${body.error.code ?? "ERROR"}: ${body.error.message}`;
      }
    } catch {
      // keep the generic message when the body is not JSON
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}