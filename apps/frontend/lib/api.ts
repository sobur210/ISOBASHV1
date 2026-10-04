/**
 * Browser-visible API base URL. The NEXT_PUBLIC_ prefix is inlined into the
 * client bundle by Next.js at build time, so this must be set in
 * apps/frontend/.env.local (documented in apps/frontend/.env.example). Local
 * development falls back to the backend's local port; production does not.
 */
import { API_URL } from "./config";

export { API_URL };

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

/**
 * `DELETE` that returns the updated body.
 *
 * The billing downgrade answers 200 with the new subscription rather than an
 * empty body, so it cannot use `deleteJsonAuthed`, which discards the response.
 */
async function deleteJsonReturning<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json", ...sessionHeaders() },
  });
  if (res.status === 401) {
    throw new Error("AUTH_REQUIRED: Sign in to use this area.");
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, `Request failed with status ${res.status}`));
  }
  return (await res.json()) as T;
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
    credentials: "include",
    headers: { "content-type": "application/json", accept: "text/event-stream", ...sessionHeaders() },
    body: JSON.stringify({ input, conversationId, model }),
  });

  // A failed stream carries a normal JSON error envelope, not NDJSON frames, so
  // reading it as a stream would yield an empty conversation with no cause.
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, `Chat request failed with status ${response.status}`));
  }
  if (!response.body) {
    throw new Error("The chat stream returned no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = async () => {
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

/* Phase 12 files & documents, and the knowledge index built from them. */

export type FileKind = "text" | "markdown" | "csv" | "json" | "html" | "pdf" | "image" | "archive" | "binary";

export type FileStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type FileChunkSummary = {
  ordinal: number;
  characters: number;
  tokenEstimate: number;
  embeddingModel: string | null;
  embeddedAt: string | null;
};

export type FileRecord = {
  id: string;
  originalName: string;
  extension: string;
  kind: FileKind;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  error: string | null;
  warning: string | null;
  extractable: boolean;
  characters: number;
  chunkCount: number;
  truncated: boolean;
  embeddingModel: string | null;
  embeddedAt: string | null;
  processedAt: string | null;
  projectId: number | null;
  createdAt: string;
  chunks?: FileChunkSummary[];
};

export type FileText = {
  id: string;
  characters: number;
  truncated: boolean;
  warning: string | null;
  error: string | null;
  text: string;
  chunkCount: number;
};

export type EmbeddingAvailability = {
  available: boolean;
  provider?: string | null;
  model?: string | null;
  dimensions?: number | null;
  detail: string;
};

export type FileCapabilities = {
  upload: {
    maxBytes: number;
    maxFilesPerUser: number;
    maxTotalBytesPerUser: number;
    types: { extension: string; kind: FileKind; mimeType: string; extractable: boolean }[];
    detail: string;
  };
  extraction: {
    text: boolean;
    markdown: boolean;
    csv: boolean;
    json: boolean;
    html: boolean;
    pdf: boolean;
    images: boolean;
    officeAndArchives: boolean;
    maxExtractedCharacters: number;
    maxChunksPerFile: number;
    chunkSize: number;
    chunkOverlap: number;
    detail: string;
  };
  embeddings: EmbeddingAvailability;
  knowledge: {
    chunkCount: number;
    embeddedChunks: number;
    storedFiles: number;
    searchCandidateLimit: number;
    detail: string;
  };
};

export type KnowledgeHit = {
  chunkId: string;
  ordinal: number;
  fileId: string;
  fileName: string;
  kind: FileKind;
  score: number;
  keywordScore: number | null;
  vectorScore: number | null;
  matchedBy: "keyword" | "vector" | "hybrid";
  characters: number;
  snippet: string;
};

export type KnowledgeSearch = {
  query: string;
  terms: string[];
  mode: "keyword" | "vector" | "hybrid";
  detail: string;
  hits: KnowledgeHit[];
  candidatesConsidered: number;
  tookMs: number;
};

export type KnowledgeStats = {
  files: number;
  chunks: number;
  embeddedChunks: number;
  characters: number;
  storedBytes: number;
  filesByKind: Partial<Record<FileKind, number>>;
  filesByStatus: Partial<Record<FileStatus, number>>;
  embeddings: EmbeddingAvailability;
  searchCandidateLimit: number;
};

export type ProjectSummary = { id: number; name: string };

export async function fetchFileCapabilities(signal?: AbortSignal): Promise<FileCapabilities> {
  return getJsonAuthed<FileCapabilities>("/files/capabilities", signal);
}

export async function fetchFiles(
  query: { status?: FileStatus; kind?: FileKind; projectId?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<FileRecord[]> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.kind) params.set("kind", query.kind);
  if (query.projectId !== undefined) params.set("projectId", String(query.projectId));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const suffix = params.toString();
  return getJsonAuthed<FileRecord[]>(`/files${suffix ? `?${suffix}` : ""}`, signal);
}

export async function fetchFile(id: string, signal?: AbortSignal): Promise<FileRecord> {
  return getJsonAuthed<FileRecord>(`/files/${id}`, signal);
}

export async function fetchFileText(id: string, limit?: number, signal?: AbortSignal): Promise<FileText> {
  const suffix = limit === undefined ? "" : `?limit=${limit}`;
  return getJsonAuthed<FileText>(`/files/${id}/text${suffix}`, signal);
}

/**
 * Multipart upload. The browser must set the multipart boundary itself, so the
 * Content-Type header is deliberately absent here.
 */
export async function uploadFile(file: File, projectId?: number): Promise<FileRecord> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (projectId !== undefined) form.append("projectId", String(projectId));

  const res = await fetch(`${API_URL}/files`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", ...sessionHeaders() },
    body: form,
  });
  if (res.status === 401) {
    throw new Error("AUTH_REQUIRED: Sign in to upload files.");
  }
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, `Upload failed with status ${res.status}`));
  }
  return (await res.json()) as FileRecord;
}

export async function reindexFile(id: string, projectId: number | null): Promise<FileRecord> {
  return sendJsonAuthed<FileRecord>(`/files/${id}/reindex`, { projectId });
}

export async function deleteFile(id: string, signal?: AbortSignal): Promise<void> {
  return deleteJsonAuthed(`/files/${id}`, signal);
}

export function downloadFileUrl(id: string): string {
  return `${API_URL}/files/${id}/download`;
}

export async function fetchKnowledgeStats(signal?: AbortSignal): Promise<KnowledgeStats> {
  return getJsonAuthed<KnowledgeStats>("/knowledge/stats", signal);
}

export async function searchKnowledge(
  query: { q: string; limit?: number; kind?: FileKind; projectId?: number },
  signal?: AbortSignal,
): Promise<KnowledgeSearch> {
  const params = new URLSearchParams({ q: query.q });
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.kind) params.set("kind", query.kind);
  if (query.projectId !== undefined) params.set("projectId", String(query.projectId));
  return getJsonAuthed<KnowledgeSearch>(`/knowledge/search?${params.toString()}`, signal);
}

export async function fetchProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
  return getJsonAuthed<ProjectSummary[]>("/projects", signal);
}

/* Projects and their task board. */

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "FAILED" | "CANCELLED";

export type ProjectTask = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  order: number;
  result: string | null;
  assigneeId: number | null;
  agentRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCounts = { agents: number; conversations: number; memories: number };

export type Project = ProjectSummary & {
  description: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: ProjectTask[];
  _count?: { agents?: number; conversations?: number; memories?: number } | ProjectCounts;
};

export async function fetchProjectList(signal?: AbortSignal): Promise<Project[]> {
  return getJsonAuthed<Project[]>("/projects", signal);
}

export async function fetchProject(id: number, signal?: AbortSignal): Promise<Project> {
  return getJsonAuthed<Project>(`/projects/${id}`, signal);
}

export async function createProject(input: { name: string; description?: string }): Promise<Project> {
  return sendJsonAuthed<Project>("/projects", input);
}

export async function updateProject(
  id: number,
  input: { name?: string; description?: string },
): Promise<Project> {
  return sendJsonAuthed<Project>(`/projects/${id}`, input, "PATCH");
}

export async function deleteProject(id: number, signal?: AbortSignal): Promise<void> {
  return deleteJsonAuthed(`/projects/${id}`, signal);
}

export async function addProjectTask(
  projectId: number,
  input: { title: string; description?: string },
): Promise<ProjectTask> {
  return sendJsonAuthed<ProjectTask>(`/projects/${projectId}/tasks`, input);
}

export async function updateProjectTask(
  taskId: number,
  input: { title?: string; description?: string; status?: TaskStatus; result?: string },
): Promise<ProjectTask> {
  return sendJsonAuthed<ProjectTask>(`/projects/tasks/${taskId}`, input, "PATCH");
}

export async function deleteProjectTask(taskId: number, signal?: AbortSignal): Promise<void> {
  return deleteJsonAuthed(`/projects/tasks/${taskId}`, signal);
}

/* Agents, their runs, and the steps a run actually executed. */

export type AgentRunStatus =
  | "PENDING"
  | "PLANNING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AgentStepStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

export type AgentStep = {
  id: string;
  position: number;
  title: string;
  tool: string | null;
  input: unknown;
  output: string | null;
  error: string | null;
  status: AgentStepStatus;
  durationMs: number | null;
  createdAt: string;
};

export type AgentRun = {
  id: string;
  status: AgentRunStatus;
  input: string;
  output: string | null;
  error: string | null;
  plan: unknown;
  provider: string | null;
  model: string | null;
  stepsExecuted: number;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  agentId: string;
  steps?: AgentStep[];
  agent?: { id: string; name: string };
};

export type Agent = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  providerModel: string | null;
  maxSteps: number;
  toolNames: string[];
  memoryEnabled: boolean;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: number; name: string } | null;
  _count?: { runs: number; memories: number };
};

export type AgentInput = {
  name: string;
  description?: string;
  instructions?: string;
  providerModel?: string;
  maxSteps?: number;
  toolNames?: string[];
  memoryEnabled?: boolean;
  projectId?: number;
};

export async function fetchAgents(signal?: AbortSignal): Promise<Agent[]> {
  return getJsonAuthed<Agent[]>("/agents", signal);
}

export async function fetchAgent(id: string, signal?: AbortSignal): Promise<Agent> {
  return getJsonAuthed<Agent>(`/agents/${id}`, signal);
}

export async function createAgent(input: AgentInput): Promise<Agent> {
  return sendJsonAuthed<Agent>("/agents", input);
}

export async function updateAgent(
  id: string,
  input: Partial<AgentInput> & { projectId?: number | null },
): Promise<Agent> {
  return sendJsonAuthed<Agent>(`/agents/${id}`, input, "PATCH");
}

export async function deleteAgent(id: string, signal?: AbortSignal): Promise<void> {
  return deleteJsonAuthed(`/agents/${id}`, signal);
}

export async function fetchAgentRuns(id: string, signal?: AbortSignal): Promise<AgentRun[]> {
  return getJsonAuthed<AgentRun[]>(`/agents/${id}/runs`, signal);
}

export async function fetchAgentRun(runId: string, signal?: AbortSignal): Promise<AgentRun> {
  return getJsonAuthed<AgentRun>(`/agents/runs/${runId}`, signal);
}

export async function startAgentRun(id: string, input: string): Promise<AgentRun> {
  return sendJsonAuthed<AgentRun>(`/agents/${id}/runs`, { input });
}

export async function cancelAgentRun(runId: string): Promise<AgentRun> {
  return sendJsonAuthed<AgentRun>(`/agents/runs/${runId}/cancel`, {});
}

/* Phase 13 media: image generation runs and the stored media library. */

export type MediaGenerationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type MediaKind = "IMAGE" | "VIDEO";

export type MediaAsset = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** Phase 14: playback length read from the container, null when unreadable. */
  durationMs: number | null;
  /** Phase 14: whether the container declares an audio track. */
  hasAudio: boolean | null;
  sha256: string;
  note: string | null;
  prompt: string | null;
  /** The expanded prompt actually sent to the renderer. Null when nothing expanded it. */
  enhancedPrompt: string | null;
  /** The style preset id applied, null when none. */
  style: string | null;
  aspectRatio: string | null;
  provider: string | null;
  model: string | null;
  generationId: string | null;
  videoGenerationId: string | null;
  projectId: number | null;
  createdAt: string;
};

export type ImageGeneration = {
  id: string;
  /** Exactly what the caller typed. */
  prompt: string;
  /** The expanded prompt actually sent to the renderer. Null when nothing expanded it. */
  enhancedPrompt: string | null;
  /** The style preset id applied, null when none. */
  style: string | null;
  aspectRatio: string | null;
  requestedCount: number;
  status: MediaGenerationStatus;
  error: string | null;
  errorCode: string | null;
  warning: string | null;
  finishReason: string | null;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  projectId: number | null;
  assets: MediaAsset[];
  _count?: { assets: number };
};

export type MediaModelOption = {
  id: string;
  provider: string;
  /** An alias is pickable by hand but is never chosen automatically. */
  autoSelectable: boolean;
  aliasOf: string | null;
};

export type MediaProviderState = {
  provider: string;
  status: "healthy" | "unconfigured" | "unavailable";
  healthDetail: string | null;
  circuit: "closed" | "open" | "half-open";
  stats: {
    provider: string;
    totalRequests: number;
    totalFailures: number;
    successRate: number;
    avgLatencyMs: number | null;
    lastFailureCode?: string;
  };
};

export type MediaStyleOption = { id: string; label: string };

export type MediaCapabilities = {
  generation: {
    available: boolean;
    allProvidersHealthy: boolean;
    providers: MediaProviderState[];
    models: MediaModelOption[];
    aspectRatios: string[];
    /** Style presets, sourced from the server so the picker cannot drift. */
    styles: MediaStyleOption[];
    /** Whether a text model is registered to run the prompt enhancer. */
    enhancementAvailable: boolean;
    maxPromptCharacters: number;
    maxImagesPerRequest: number;
    maxImageBytes: number;
    maxAssetsPerUser: number;
    maxTotalBytesPerUser: number;
    generationsPerHour: number;
    detail: string;
  };
  moderation: { enforced: string; detail: string };
  video: {
    available: boolean;
    allProvidersHealthy: boolean;
    providers: MediaProviderState[];
    models: MediaModelOption[];
    aspectRatios: string[];
    durations: number[];
    maxPromptCharacters: number;
    maxVideoBytes: number;
    generationsPerHour: number;
    maxConcurrent: number;
    containers: string[];
    imageToVideo: boolean;
    detail: string;
    imageToVideoDetail: string;
  };
  lastFailure: {
    id: string;
    errorCode: string | null;
    error: string | null;
    finishReason: string | null;
    createdAt: string;
  } | null;
  lastVideoFailure: {
    id: string;
    errorCode: string | null;
    error: string | null;
    finishReason: string | null;
    createdAt: string;
  } | null;
  usage: { assets: number; storedBytes: number; generations: number; videoGenerations: number };
};

export async function fetchMediaCapabilities(signal?: AbortSignal): Promise<MediaCapabilities> {
  return getJsonAuthed<MediaCapabilities>("/media/capabilities", signal);
}

export async function fetchImageGenerations(
  query: { status?: MediaGenerationStatus; projectId?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ImageGeneration[]> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.projectId !== undefined) params.set("projectId", String(query.projectId));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const suffix = params.toString();
  return getJsonAuthed<ImageGeneration[]>(`/media/generations${suffix ? `?${suffix}` : ""}`, signal);
}

export async function fetchImageGeneration(id: string, signal?: AbortSignal): Promise<ImageGeneration> {
  return getJsonAuthed<ImageGeneration>(`/media/generations/${id}`, signal);
}

export async function startImageGeneration(input: {
  prompt: string;
  style?: string;
  enhance?: boolean;
  aspectRatio?: string;
  count?: number;
  projectId?: number;
  model?: string;
}): Promise<ImageGeneration> {
  return sendJsonAuthed<ImageGeneration>("/media/generations", input);
}

export async function cancelImageGeneration(id: string): Promise<ImageGeneration> {
  return sendJsonAuthed<ImageGeneration>(`/media/generations/${id}/cancel`, {});
}

export async function deleteImageGeneration(id: string, signal?: AbortSignal): Promise<void> {
  return deleteJsonAuthed(`/media/generations/${id}`, signal);
}

/* Phase 14 video: one clip per run, text-to-video or animating a stored image. */

export type VideoGeneration = {
  id: string;
  prompt: string;
  aspectRatio: string | null;
  requestedSeconds: number;
  status: MediaGenerationStatus;
  error: string | null;
  errorCode: string | null;
  warning: string | null;
  finishReason: string | null;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  projectId: number | null;
  /** Set for image-to-video: the stored image used as the first frame. */
  sourceAssetId: string | null;
  assets: MediaAsset[];
  _count?: { assets: number };
};

export async function fetchVideoGenerations(
  query: { status?: MediaGenerationStatus; projectId?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<VideoGeneration[]> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.projectId !== undefined) params.set("projectId", String(query.projectId));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const suffix = params.toString();
  return getJsonAuthed<VideoGeneration[]>(`/media/video-generations${suffix ? `?${suffix}` : ""}`, signal);
}

export async function fetchVideoGeneration(id: string, signal?: AbortSignal): Promise<VideoGeneration> {
  return getJsonAuthed<VideoGeneration>(`/media/video-generations/${id}`, signal);
}

export async function startVideoGeneration(input: {
  prompt: string;
  aspectRatio?: string;
  seconds?: number;
  audio?: boolean;
  projectId?: number;
  model?: string;
  sourceAssetId?: string;
}): Promise<VideoGeneration> {
  return sendJsonAuthed<VideoGeneration>("/media/video-generations", input);
}

export async function cancelVideoGeneration(id: string): Promise<VideoGeneration> {
  return sendJsonAuthed<VideoGeneration>(`/media/video-generations/${id}/cancel`, {});
}

export async function deleteVideoGeneration(id: string, signal?: AbortSignal): Promise<void> {
  return deleteJsonAuthed(`/media/video-generations/${id}`, signal);
}

export async function fetchMediaAssets(
  query: { kind?: MediaKind; generationId?: string; projectId?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<MediaAsset[]> {
  const params = new URLSearchParams();
  if (query.kind) params.set("kind", query.kind);
  if (query.generationId) params.set("generationId", query.generationId);
  if (query.projectId !== undefined) params.set("projectId", String(query.projectId));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const suffix = params.toString();
  return getJsonAuthed<MediaAsset[]>(`/media/assets${suffix ? `?${suffix}` : ""}`, signal);
}

export async function deleteMediaAsset(id: string, signal?: AbortSignal): Promise<void> {
  return deleteJsonAuthed(`/media/assets/${id}`, signal);
}

/**
 * Video assembly, which is a different contract from clip generation and is
 * therefore reached on its own route: the caller supplies the scenes rather than a
 * prompt, the provider has no model to choose, and the balance it spends is whole
 * seconds of a grant that does not renew. Nothing here can be reused for
 * `POST /media/video-generations` and nothing there can be reused here.
 */
export type AssemblyCapabilities = {
  available: boolean;
  provider: string;
  status: "healthy" | "unconfigured" | "degraded";
  /** The provider's own words, including why the feature is off. */
  detail: string;
  resolutions: string[];
  maxSeconds: number;
  /** Seconds of renderable video left, or null when the provider will not say. */
  remainingSeconds: number | null;
  /** False when the balance could not be read, which is not the same as zero. */
  remainingReadable: boolean;
  voiceoverAvailable: boolean;
  watermarked: boolean;
  nonRenewing: boolean;
  maxBytes: number;
};

export type AssemblySceneInput = { heading: string; body: string };

export type AssemblyResult = {
  asset: MediaAsset & { note: string | null };
  /** JSON2Video's own project id, so a stuck render can be looked up later. */
  projectId: string;
  durationSeconds: number | null;
  remainingSeconds: number | null;
  recipe: { resolution?: string; scenes?: Array<{ elements?: Array<{ type?: string; duration?: number }> }> };
};

export async function fetchAssemblyCapabilities(signal?: AbortSignal): Promise<AssemblyCapabilities> {
  return getJsonAuthed<AssemblyCapabilities>("/media/assembly/capabilities", signal);
}

export async function startAssembly(input: {
  title: string;
  subtitle?: string;
  scenes: AssemblySceneInput[];
  voiceover?: boolean;
  outro?: string;
  resolution: string;
  source: "research" | "chat";
  sourceId?: string;
  projectId?: number;
}): Promise<AssemblyResult> {
  return sendJsonAuthed<AssemblyResult>("/media/assembly", input);
}

/** Served by an authenticated, checksum-verified route, so the cookie must ride along. */
export function mediaAssetUrl(id: string): string {
  return `${API_URL}/media/assets/${id}/file`;
}

export function mediaAssetDownloadUrl(id: string): string {
  return `${API_URL}/media/assets/${id}/file?download=1`;
}


/**
 * Phase 16 billing.
 *
 * `BillingCapabilities` is read without a session because it describes the
 * deployment rather than the caller; the subscription and usage reads are
 * credentialed and owner-scoped by the API.
 */
export type PlanLimits = {
  files: number | null;
  fileBytes: number | null;
  mediaAssets: number | null;
  mediaBytes: number | null;
};

export type BillingCapabilities = {
  plans: { key: string; name: string; summary: string; limits: PlanLimits }[];
  defaultPlan: string;
  payment: { available: boolean; processors: string[]; detail: string };
  selfService: { upgrade: boolean; downgrade: boolean; detail: string };
  enforced: Record<string, string>;
  deploymentCeilings: {
    files: number;
    fileBytes: number;
    mediaAssets: number;
    mediaBytes: number;
  };
};

export type BillingSubscription = {
  plan: string;
  name: string;
  isDefault: boolean;
  entitlements: {
    plan: string;
    limits: Record<"files" | "fileBytes" | "mediaAssets" | "mediaBytes", { value: number; source: string }>;
  };
  grantedAt: string | null;
  updatedAt: string | null;
  note: string | null;
  grantedBy: { id: number; email: string } | null;
  detail: string;
};

export type BillingUsage = {
  plan: string;
  measuredAt: string;
  window: { days: number; startedAt: string };
  metrics: {
    key: string;
    label: string;
    used: number;
    limit: number | null;
    limitSource: "plan" | "deployment" | "none";
    unit: "count" | "bytes";
    atLimit: boolean;
    detail: string;
  }[];
  detail: string;
};

export function fetchBillingCapabilities(signal?: AbortSignal): Promise<BillingCapabilities> {
  return getJson<BillingCapabilities>("/billing/capabilities", signal);
}

export function fetchBillingSubscription(signal?: AbortSignal): Promise<BillingSubscription> {
  return getJsonAuthed<BillingSubscription>("/billing/subscription", signal);
}

export function fetchBillingUsage(signal?: AbortSignal): Promise<BillingUsage> {
  return getJsonAuthed<BillingUsage>("/billing/usage", signal);
}

/** Self-service downgrade only. There is no self-service upgrade to call. */
export function downgradePlan(): Promise<BillingSubscription> {
  return deleteJsonReturning<BillingSubscription>("/billing/subscription");
}

/**
 * Phase 17 admin center.
 *
 * `AdminSettings` is read through `getJsonAuthed`, which turns a 401 or 403 into a
 * message naming the reason instead of a bare status.
 */
export type AdminOverview = {
  generatedAt: string;
  accounts: {
    total: number;
    admins: number;
    onFree: number;
    onPro: number;
    activeSessions: number;
    registeredLast24h: number;
  };
  content: {
    projects: number;
    conversations: number;
    messages: number;
    agents: number;
    agentRuns: number;
    researchSessions: number;
    files: number;
    mediaAssets: number;
  };
  audit: { last24h: number; last7d: number };
  detail: string;
};

/**
 * Storage roots are named explicitly rather than typed as `Record<string, string>`
 * intersected with the writability map. An intersection of an index signature with
 * `writable: Record<string, boolean>` widens every value to `string | Record<...>`,
 * which is unrenderable and silently forces a cast at the call site.
 */
export type AdminStorageRoots = {
  dataRoot: string;
  uploadRoot: string;
  mediaRoot: string;
  tempRoot: string;
  logsRoot: string;
  cacheRoot: string;
  knowledgeRoot: string;
  modelRoot: string;
};

export type AdminSettings = {
  runtime: {
    node: string;
    platform: string;
    uptimeSeconds: number;
    apiUrl: string;
    webUrl: string;
    corsOrigins: string[];
  };
  storage: AdminStorageRoots & {
    /**
     * Probed live with `W_OK` on every load; never a constant. Only the roots a
     * request actually writes to are probed — cache, knowledge and model roots are
     * created on demand and are legitimately absent on a fresh deployment.
     */
    writable: Partial<Record<keyof AdminStorageRoots, boolean>>;
    detail: string;
  };
  providers: {
    provider: string;
    enabled: boolean;
    baseUrl: string | null;
    model: string;
    embeddingModel: string;
    credentialPresent: boolean;
    credentialKind: string;
  }[];
  registeredProviders: string[];
  limits: Record<string, Record<string, unknown>>;
  queues: { counts: Record<string, number> | null; workers: number | null; ready: boolean; detail: string };
  /** Says this view is read-only. Not a statement about the machine: see `storage.writable`. */
  configurationWritable: false;
  detail: string;
};

export type AdminUserSummary = {
  id: number;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  plan: string;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  activeSessions: number;
};

export type AdminUserList = {
  users: AdminUserSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export function fetchAdminOverview(signal?: AbortSignal): Promise<AdminOverview> {
  return getJsonAuthed<AdminOverview>("/admin/overview", signal);
}

export function fetchAdminSettings(signal?: AbortSignal): Promise<AdminSettings> {
  return getJsonAuthed<AdminSettings>("/admin/configuration", signal);
}

export function fetchAdminUsers(
  params: { q?: string; role?: "ADMIN" | "USER"; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<AdminUserList> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.role) query.set("role", params.role);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString();
  return getJsonAuthed<AdminUserList>(`/admin/directory${suffix ? `?${suffix}` : ""}`, signal);
}

export function updateAdminUserRole(id: number, role: "ADMIN" | "USER"): Promise<AdminUserSummary> {
  return sendJsonAuthed<AdminUserSummary>(`/admin/users/${id}/role`, { role });
}

export function updateAdminUserPlan(
  id: number,
  plan: string,
  note?: string,
): Promise<{ userId: number; plan: string; entitlements: unknown }> {
  return sendJsonAuthed<{ userId: number; plan: string; entitlements: unknown }>(`/admin/users/${id}/plan`, {
    plan,
    ...(note ? { note } : {}),
  });
}

export function revokeAdminUserSessions(id: number): Promise<{ id: number; revokedSessions: number }> {
  return sendJsonAuthed<{ id: number; revokedSessions: number }>(`/admin/users/${id}/revoke-sessions`, {});
}
