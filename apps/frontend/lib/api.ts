export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const SESSION_KEY = "isobash_client_session";

export function getClientSession(): string {
  if (typeof window === "undefined") return "";
  let session = window.localStorage.getItem(SESSION_KEY);
  if (!session) {
    session = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, session);
  }
  return session;
}

export function sessionHeaders(): Record<string, string> {
  return { "x-client-session": getClientSession() };
}

export type ApiErrorBody = { error?: { code?: string; message?: string; status?: number } };

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    signal,
    headers: { Accept: "application/json", ...sessionHeaders() },
  });

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, `Request failed with status ${res.status}`));
  }

  return (await res.json()) as T;
}

export async function getJsonAuthed<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    signal,
    credentials: "include",
    headers: { Accept: "application/json", ...sessionHeaders() },
  });

  if (res.status === 401) {
    throw new Error("AUTH_REQUIRED: Sign in as an administrator to view this area.");
  }
  if (res.status === 403) {
    throw new Error("FORBIDDEN: Administrator access required.");
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, `Request failed with status ${res.status}`));
  }

  return (await res.json()) as T;
}

export async function deleteJson(path: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    signal,
    headers: { Accept: "application/json", ...sessionHeaders() },
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, `Request failed with status ${res.status}`));
  }
}

export async function sendJsonAuthed<T>(
  path: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    signal,
    credentials: "include",
    headers: { "content-type": "application/json", Accept: "application/json", ...sessionHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new Error("AUTH_REQUIRED: Sign in to use this area.");
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, `Request failed with status ${res.status}`));
  }
  return (await res.json()) as T;
}

export async function deleteJsonAuthed(path: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    signal,
    credentials: "include",
    headers: { Accept: "application/json", ...sessionHeaders() },
  });
  if (res.status === 401) {
    throw new Error("AUTH_REQUIRED: Sign in to use this area.");
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, `Request failed with status ${res.status}`));
  }
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body.error?.message) {
      return `${body.error.code ?? "ERROR"}: ${body.error.message}`;
    }
  } catch {
    // fall through to the generic message
  }
  return fallback;
}

export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; conversationTitle: string; userMessageId: string }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; conversationId: string; provider: string; model: string }
  | { type: "error"; code: string; message: string; messageId?: string };

export async function streamChat(
  input: string,
  conversationId?: string,
  signal?: AbortSignal,
  model?: string,
): Promise<{ response: Response; onEvent: (handler: (event: ChatStreamEvent) => void) => void; consume: () => Promise<void> }> {
  const response = await fetch(`${API_URL}/chat/stream`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", accept: "text/event-stream", ...sessionHeaders() },
    body: JSON.stringify({ input, conversationId, model }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = async () => {
    if (!reader) return;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          onEvent(JSON.parse(line) as ChatStreamEvent);
        } catch {
          // ignore malformed frames
        }
      }
    }
  };

  let onEvent: (event: ChatStreamEvent) => void = () => {};
  return { response, onEvent: (handler) => (onEvent = handler), consume };
}

export type ConversationItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: { role: string; content: string; createdAt: string }[];
};

export type MessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
  createdAt: string;
};

export async function fetchConversations(signal?: AbortSignal): Promise<ConversationItem[]> {
  return getJson<ConversationItem[]>("/chat/conversations", signal);
}

export type ConversationDetail = { conversation: ConversationItem; messages: MessageItem[] };

export async function fetchConversation(id: string, signal?: AbortSignal): Promise<ConversationDetail> {
  return getJson<ConversationDetail>(`/chat/conversations/${id}`, signal);
}

export async function deleteConversation(id: string, signal?: AbortSignal): Promise<void> {
  return deleteJson(`/chat/conversations/${id}`, signal);
}

export type ProviderInfo = {
  provider: string;
  status: string;
  capabilities: string[];
  detail?: string;
};

export async function fetchProviders(signal?: AbortSignal): Promise<ProviderInfo[]> {
  return getJson<ProviderInfo[]>("/ai/providers", signal);
}
/* Phase 11 research: retrieval-backed answers with structured citations. */

export type ResearchSourceStatus = "PENDING" | "FETCHED" | "REJECTED" | "FAILED";

export type ResearchSessionStatus =
  | "PENDING"
  | "SEARCHING"
  | "RETRIEVING"
  | "ANSWERING"
  | "COMPLETED"
  | "FAILED";

export type ResearchSource = {
  id: string;
  url: string;
  finalUrl: string | null;
  title: string | null;
  host: string | null;
  status: ResearchSourceStatus;
  detail: string | null;
  httpStatus: number | null;
  characters: number;
  origin: string;
  fetchedAt: string | null;
};

export type ResearchCitation = {
  id: string;
  marker: string;
  quote: string;
  verified: boolean;
  sourceId: string;
  source?: { url: string; title: string | null; host: string | null };
};

export type ResearchSession = {
  id: string;
  question: string;
  status: ResearchSessionStatus;
  answer: string | null;
  error: string | null;
  noEvidence: boolean;
  retrieval: string;
  queries: string[];
  provider: string | null;
  model: string | null;
  createdAt: string;
  finishedAt: string | null;
  sources: ResearchSource[];
  citations: ResearchCitation[];
  _count?: { sources: number; citations: number };
};

export type ResearchCapabilities = {
  search: { available: boolean; provider: string | null; detail: string };
  retrieval: {
    available: boolean;
    privateHostsAllowed: boolean;
    maxSources: number;
    maxCharactersPerSource: number;
    fetchTimeoutMs: number;
    detail: string;
  };
};

export async function fetchResearchCapabilities(signal?: AbortSignal): Promise<ResearchCapabilities> {
  return getJsonAuthed<ResearchCapabilities>("/research/capabilities", signal);
}

export async function fetchResearchSessions(signal?: AbortSignal): Promise<ResearchSession[]> {
  return getJsonAuthed<ResearchSession[]>("/research", signal);
}

export async function fetchResearchSession(id: string, signal?: AbortSignal): Promise<ResearchSession> {
  return getJsonAuthed<ResearchSession>(`/research/${id}`, signal);
}

export async function startResearch(input: {
  question: string;
  urls?: string[];
  model?: string;
}): Promise<ResearchSession> {
  return sendJsonAuthed<ResearchSession>("/research", input);
}

export async function deleteResearchSession(id: string, signal?: AbortSignal): Promise<void> {
  return deleteJsonAuthed(`/research/${id}`, signal);
}
