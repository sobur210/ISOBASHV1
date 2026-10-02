# Code Workspace — Phase 0 Audit and Architecture Proposal

Date: 2026-10-02
Scope: read-only audit. No feature code was written. The only changes in this phase are
the port consolidation described in §6 and the OpenRouter provider verification in §7.

---

## 1. Executive summary — five findings that change the plan

| # | Finding | Consequence |
|---|---------|-------------|
| 1 | **`AccessService` does not exist.** There is no plan, quota, or entitlement model anywhere in the repo. | The mission's Ground Rule 2 ("reuse the existing AccessService") cannot be satisfied. Server-side plan limits must be *built*, not reused. Everything that depends on limits (Phase 1 nav gating, Phase 3 session caps, Phase 5 daily run/token limits) moves later or ships against a new `AccessService`. |
| 2 | **Container isolation is impossible on this machine.** | Phase 3 (sandboxed terminal) is not buildable as specified. Per mission rule 4, the build is limited to editor + file tools with command execution disabled. Detail and evidence in §5. |
| 3 | **The monorepo is npm workspaces, not pnpm.** `package-lock.json` only, no `pnpm-lock.yaml` (pnpm 12.4.2 is installed but unused). | Use `npm`. Introducing pnpm would be an unrelated, risky change. |
| 4 | **`AiProvider` has no tool-calling surface.** No `tools` field on `AiRequest`, no tool-call variant on `AiStreamChunk`. | The provider contract must be extended in Phase 4/5 before the agent can call tools natively. The existing `responseFormat: 'json'` seam is the fallback for models that cannot. |
| 5 | **No feature-flag mechanism exists.** | Phase 1's flag system is net-new code on both sides. |

---

## 2. Inventory: Projects and Files

### 2.1 Frontend

| Surface | Path | Verdict |
|---|---|---|
| Projects page | `apps/frontend/app/app/projects/page.tsx` (16 lines — thin wrapper) | WORKS |
| Projects panel | `apps/frontend/components/projects-panel.tsx` (442 lines) | WORKS — task board + project CRUD |
| Files page | `apps/frontend/app/app/files/page.tsx` (16 lines — thin wrapper) | WORKS |
| Files panel | `apps/frontend/components/files-panel.tsx` | WORKS — upload, list, download, delete, knowledge search |
| Nav entries | `apps/frontend/app/app/layout.tsx:22-30` — `Workspace, Chat, Research, Agents, Projects, Files, Media, Billing, Settings` | WORKS (mobile mirror in `components/mobile-nav.tsx`) |
| Landing card 1 | `apps/frontend/components/marketing/feature-section.tsx:53` — "Document Analysis" | WORKS |
| Landing card 2 | `apps/frontend/components/marketing/feature-section.tsx:67` — "Projects & Collaboration" | **MISLEADING COPY** — claims team sharing; there is no sharing, invitation, or collaborator model anywhere in the schema |
| Landing preview chip | `apps/frontend/components/marketing/dashboard-preview.tsx:24` — "Projects" | WORKS |
| Footer links | `apps/frontend/components/marketing/marketing-footer.tsx` | WORKS |

### 2.2 Backend

**Projects** — `apps/backend/src/projects/`
- `projects.controller.ts:19` `@Controller('projects')`, `:20` `@UseGuards(AuthGuard)`
- Routes: `GET /projects`, `GET /projects/:id`, `POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`, `POST /projects/:id/tasks`, `PATCH /projects/tasks/:taskId`, `DELETE /projects/tasks/:taskId`
- `projects.service.ts`, `projects.module.ts`, `dto/`
- Verdict: **WORKS**, but it is a task board. `Project` has no filesystem, no root path, no workspace concept.

**Files** — `apps/backend/src/files/`
- `files.controller.ts:33` `@Controller('files')`, `:34` `@UseGuards(AuthGuard)`, rate limits on `:83` and `:125`
- Routes: `GET /files/capabilities`, `GET /files`, `GET /files/:id`, `GET /files/:id/text`, `GET /files/:id/download`, `POST /files`, `POST /files/:id/reindex`, `DELETE /files/:id`
- `knowledge.controller.ts:8` `@Controller('knowledge')` — `GET /knowledge/search`, `GET /knowledge/stats`
- Services: `files.service.ts`, `file-processor.service.ts`, `document-extractor.service.ts`, `text-chunker.ts`, `embedding.service.ts`, `file-kinds.ts`
- Verdict: **WORKS** as a document/knowledge store. It is upload-and-index, **not** an editor: no read-modify-write of a path, no tree, no rename/move, no zip.

Live proof (all through the always-on API on 3001): `/projects` → 401, `/files` → 401, `/files/capabilities` → 401, `/knowledge/stats` → 401. Routes exist and are guarded.

### 2.3 Database

`prisma/schema.prisma` — migrations through `20260930023621_phase15_video_queue`.

- `Project` (:146), `Task` (:168), `StoredFile` (:361), `FileChunk` (:408)
- `StoredFile` already encodes the right instinct: `originalName` is documented as *"Never used as a path: the bytes live under `relativePath`, which the server generates and validates."* `@@unique([userId, sha256])` gives per-user content identity.
- `Project` is referenced by `StoredFile`, `Agent`, `AgentRun` (via `Task`), `Conversation` — so it is load-bearing. **Do not drop the table.** Feature-flag it off, exactly as the mission requires.
- Name collisions to avoid in new models: none on `Workspace`; `Agent`, `AgentRun`, `AgentStep`, `MemoryEntry` all already exist and will be **reused**, not re-created.

### 2.4 Existing code a Code Workspace should reuse

- `apps/backend/src/shared/storage/storage.service.ts:41` `StorageService.resolve(kind, relative)` already rejects absolute paths and `..`. It is the right *shape* but not strong enough on its own: it does not reject NUL bytes and does not verify real-path containment, so a symlink inside a root escapes it. The Phase 2 path utility must be a hardened sibling, not a re-implementation with different rules.
- Storage kinds today: `upload | media | temp | logs | cache | knowledge` (`storage.service.ts:7`), roots from `UPLOAD_ROOT`/`MEDIA_ROOT`/`TEMP_ROOT`/`LOGS_ROOT`/`CACHE_ROOT`/`KNOWLEDGE_ROOT`, all outside the web root under `C:/laragon/www/ISOBASH-DATA`.
- **No command execution exists anywhere.** `grep child_process|spawn(|execSync|docker|node-pty` across `apps/backend/src` and `apps/worker/src` returns nothing. The sandbox is greenfield, which is good: there is no insecure precedent to inherit.

---

## 3. Integration points to reuse

### 3.1 Auth and session
- `apps/backend/src/auth/auth.guard.ts:7` `AuthGuard` reads the httpOnly cookie (`AUTH_COOKIE_NAME`); `apps/backend/src/auth/current-user.decorator.ts:5` `@CurrentUser()`.
- `roles.guard.ts:9` `RolesGuard` + `roles.decorator.ts:6` `@Roles(...roles)` — the admin bypass mechanism.
- Session model: `Session` table (schema:134), 30-day expiry, bcrypt password hash.
- Frontend: `apps/frontend/lib/auth-server.ts` (server components). **Constraint from `apps/frontend/AGENTS.md`: do not restructure `app/layout.tsx` or `lib/auth-server.ts` for a feature task.**
- SSE routes additionally require an `x-client-session` header (`chat.controller.ts:46-49`) — the Code Workspace agent stream must do the same, because EventSource cannot set headers and the frontend uses fetch-based streaming.

### 3.2 Access control — **does not exist**
- Present: `apps/backend/src/security/rate-limit.guard.ts` + `rate-limit.service.ts`, Redis-backed, 13 guarded routes, hardcoded windows (`6/15m`, `10/15m`, `20/15m`, `30/15m`, `60/15m`, `120/15m`, `6/60m`).
- `User` (schema:88) has `role: ADMIN | USER` and **no plan field**.
- There is no daily quota, no entitlement, no per-plan limit table, no `AccessService` symbol in the repo.
- **Proposal:** build `apps/backend/src/access/` with `AccessService` as the single server-side authority: `can(user, capability)`, `consume(user, meter, units)` with Redis day-bucket counters, admin bypass by role, and a `FeatureDisabled` structured error. One place, so the UI never has to enforce anything.

### 3.3 Model routing and the provider contract
- `apps/backend/src/ai/ai-router.service.ts`, `provider.registry.ts`, `model.registry.ts`, `capability.registry.ts`.
- `provider.types.ts:242` `interface AiProvider`: `health()`, `execute()`, optional `embed()`, `generateImage()`, `generateVideo()`, `stream()`.
- `provider.types.ts:11` `AiRequest` — **no `tools` field**. `provider.types.ts:44` `AiStreamChunk` — `delta | done | error` only, **no tool-call chunk**.
- `provider.types.ts:23` `responseFormat?: 'text' | 'json'` — already documented as *"what makes agent planning and tool calling real instead of a model output being regex-scraped for JSON."* This is the fallback seam, already used by the existing agent runner.
- `AiProviderError` (`provider.types.ts:256`) carries machine-readable `code` — reuse it for every tool and quota failure.

### 3.4 Streaming transport — two mechanisms already exist
- **SSE**: `chat.controller.ts:46` `POST /chat/stream`, `text/event-stream`, `AbortController` tied to `req.on('close')`, frames from `ChatService.frame`. This is the model to copy for agent step streaming — it already cancels the provider on disconnect.
- **Socket.IO**: `apps/backend/src/realtime/realtime.gateway.ts:22` `@WebSocketGateway({ cors: true })`, events `ping`, `join-room`, `task-created`, `notification`, with `handleConnection`/`handleDisconnect`.
- **Caveat to verify in Phase 3**: `@WebSocketGateway({ cors: true })` is permissive, and `handleConnection` needs an auth check — I have not yet confirmed the gateway rejects unauthenticated sockets. Flagged, not changed.

### 3.5 Tools — a governed registry already exists
- `apps/backend/src/ai/tools.registry.ts:38` `AiToolsRegistry` enforces, in order: *allow-list → payload size → authorize → validate → timeout → audit*. Each tool declares `name, description, parameters, risk, timeoutMs, maxArgumentLength, audit`.
- `apps/backend/src/ai/tools/tool.types.ts`: `ToolRisk = 'low'|'medium'|'high'`, `ToolActor`, `ToolContext`, `ToolDeps`, `ToolResult`, `ToolDefinition`, `AnyToolDefinition`.
- Current catalogue (`tools/builtin-tools.ts`): `datetime.now`, `math.evaluate`, `memory.search`, `memory.write`, `task.create`. **Five tools, none of them filesystem tools.**
- **This is the single best reuse in the repo.** Phase 4 tools register here and inherit the whole enforcement envelope for free. Do not build a second tool framework.

### 3.6 Agents and memory
- `Agent` (schema:191) already has `providerModel`, `maxSteps`, `toolNames`, `memoryEnabled`.
- `AgentRun` (schema:215): `status, input, plan Json, provider, model, stepsExecuted, cancelRequestedAt, startedAt, finishedAt`.
- `AgentStep` (schema:242): `position, title, tool, input Json, output, error, status, durationMs`, `@@unique([runId, position])`.
- `AgentRunStatus` and `AgentStepStatus` enums (schema:18, :27) already model cancel.
- `apps/backend/src/memory/` — `GET /memory`, `GET /memory/stats`, `POST /memory`, `MemoryEntry` (schema:261). Per-user scoping is the existing convention.
- **Reuse verdict:** Phase 5 needs no new persistence tables for sessions/steps. It adds `workspaceId` and a tool-call payload column at most.

### 3.7 Audit, admin, storage, flags
- `apps/backend/src/security/audit.service.ts:18` `AuditService.log()`; categories `AUTH | AUTHORIZATION | ADMIN | SECURITY` (`:5`); table `AuditEvent` (schema:118). Live at `POST`-guarded routes; `AiToolsRegistry` already audits.
- Admin: `apps/backend/src/admin/` + `apps/frontend/app/admin/{users,analytics,settings}` + `components/system-health-panel.tsx`.
- Storage: `StorageService` (§2.4).
- **Feature flags: none.** `grep FEATURE_` across backend and frontend returns nothing.

---

## 4. Environment (measured, not assumed)

| Item | Value |
|---|---|
| OS | Windows 11 Pro, build 22621 |
| Machine | HP EliteBook 840 G3 |
| CPU | Intel i5-6300U — 2 cores / 4 threads @ 2.40 GHz |
| RAM | 7.9 GB total, **0.8 GB free at measurement time** |
| Disk C: | 113.8 GB free of 237.7 GB |
| Node | v24.19.0 |
| npm | 11.17.0 (11 workspaces; `package-lock.json`) |
| pnpm | 12.4.2 installed but the repo has no pnpm lockfile — **use npm** |
| Docker | **not installed** (`docker: command not found`) |
| podman | not installed |
| WSL | binary present, **no distribution installed** (`wsl -l -v` prints usage) |
| VT-x in firmware | **`VirtualizationFirmwareEnabled: False`** |
| Hypervisor present | **False** |
| Ollama | running on 11434 — `llama3.2:latest`, `nomic-embed-text:latest` |
| PostgreSQL / Redis | 5432 / 6380, both live; `/health` reports both `ok` |

Baseline gates, all green after the port change:
```
npm run typecheck   → clean (backend + frontend)
npm run lint        → clean
npx jest (backend)  → 9 suites, 130/130 tests passed, 33.4 s
```

---

## 5. Sandbox recommendation — isolation is not available here

Mission Phase 0.4 prefers one rootless container per workspace session. That is impossible on
this machine, and the reason is firmware, not configuration:

- VT-x is disabled in the BIOS (`VirtualizationFirmwareEnabled: False`, `HypervisorPresent: False`).
- With no hypervisor, WSL2, Hyper-V and Docker Desktop cannot start even if installed.
- Docker and podman are absent, and there is no WSL distribution to install them into.

Enabling VT-x requires a BIOS change and a reboot that I cannot perform, and it is the machine
owner's decision. **I am not proposing to run agent commands on the host** — mission rule 4
forbids it and I agree with the rule.

**Recommendation: build the workspace, editor and file tool layer now; ship `run_command` as an
explicitly disabled capability.** Concretely:

- `SandboxService` exists in Phase 3 with a real `available: false` and a machine-readable reason
  (`SANDBOX_UNAVAILABLE_NO_HYPERVISOR`). It is not a stub that pretends: `POST` of a command
  returns HTTP 501 with that code, and the terminal UI shows that reason instead of a prompt.
- The agent tool `run_command` is registered with `risk: 'high'` and short-circuits to that same
  structured error. Its schema, limits and tests are written and pass; only execution is refused.
- Phases 2, 4, 5, 6 proceed in full. Phase 3 becomes "editor-side terminal UI, disabled" and the
  container work is deferred to the first machine with VT-x, with no rework to the layers below it.

The alternative — a host-side allow-listed shell — is rejected: an allow-list does not contain an
agent that writes its own files, and `rm -rf` on Windows is not the risk, arbitrary read of
`APP_SECRET` out of `.env` is.

---

## 6. Port consolidation (the change made in this phase)

Goal: port 3000 must never be bound again; 3002 is the single always-on public entry with a
working backend behind it.

Cause of the 3000 reappearance: `scripts/service.mjs` defaulted `WEB_PORT` to 3000. The SYSTEM-owned
supervisor had already loaded that value, so every restart of the `web` service re-bound 3000 —
changing code on disk did not change the running supervisor.

| File | Change |
|---|---|
| `scripts/service.mjs:93` | `envNumber('WEB_PORT', 3000)` → `3002` |
| `.env` | added `WEB_PORT=3002` and `SERVICE_WEB_MODE=development` with the reason |
| `.env.example` | same two keys; `CORS_ORIGINS` example no longer suggests `127.0.0.1:3000` |
| `scripts/verify-phase{5,6,7,8}.mjs` | header comments `:3000` → `:3002` |
| `scripts/win/install-autostart.ps1:158` | task description `web (3000)` → `web (3002)` |
| `docs/LOCAL-DEVELOPMENT.md:51` | login URL → `http://localhost:3002/login` |

Process consolidation (the machine was running two Next servers and a spare API at once, which is
also what was eating the 0.8 GB of free RAM):
- killed the hand-started `next dev` that held 3002 (PIDs 18676/8552)
- killed the spare gateway API on 3006 (PID 12020)
- restarted the supervisor elevated so it re-read `.env`

`SERVICE_WEB_MODE=development` makes the supervised web run `next dev --port 3002`. Reason: this
stack is under active development, and `next start` would serve a stale `.next`. One Next server
instead of two also removes the memory pressure that `memory.md` records as the cause of past
verification failures. Set it to `production` to go back to `next start`.

Evidence after the restart:
```
netstat  : 3000 absent; 3001 -> API; 3002 -> web
GET http://localhost:3002/           -> 200
GET http://localhost:3002/health     -> 200  {"status":"ok","service":"isobash-api",
                                               "components":[{"name":"database","status":"ok"},
                                                             {"name":"redis","status":"ok"}]}
GET http://localhost:3001/health     -> 200
GET http://localhost:3002/api/auth/me -> 404 with a backend error envelope
        ({"error":{"code":"NOT_FOUND","requestId":"d3532305-...","path":"/api/auth/me"}})
service-status.json -> "mode": {"web": "development"}, "endpoints": {"web": "http://localhost:3002"}
```
The 404 is deliberate evidence: the request reached the NestJS process through the Next rewrite
(`apps/frontend/next.config.ts:34`), complete with its own error envelope and request id. The
gateway chain is real.

---

## 7. OpenRouter — key verified, free models only

Your key is in `.env` as `OPENROUTER_API_KEY_CODE_AGENT` (a second key,
`OPENROUTER_API_IMAGE_VIDEO`, exists for media and is out of scope for the agent).

**No paid model was called at any point.** Only `GET /api/v1/models` and `GET /api/v1/key`
(metadata, no inference) and three `POST /chat/completions` calls, each pinned to a `:free` model,
each returning `"cost": 0`.

The key authenticates: `GET /api/v1/key` returns its own record
(`is_management_key: false`, `is_provisioning_key: false`, `usage: 0`).

First correction worth recording: my initial check looked for `OPENROUTER_API_KEY=`, which does not
exist, so the shell passed an empty token and OpenRouter's **public** `/models` endpoint answered
200. That 200 proved nothing. The real verification is the `/key` call above.

Free-model capability probe (the evidence the agent design needs):

| Model | Tool calling | Cost |
|---|---|---|
| `cohere/north-mini-code:free` | **native** — `finish_reason: tool_calls`, `fn=read_file`, `args={"path": "src/index.ts"}` | `$0` |
| `poolside/laguna-s-2.1:free` | none — answered as prose, `finish_reason: stop` | `$0` |
| `qwen/qwen3.8-27b:free` | `429 Provider returned error` at test time | `$0` |

Two conclusions that shape Phase 5:
1. A free coding model with **real** tool calling exists, so the agent does not need the JSON
   fallback to be its primary path. Default the code agent to `cohere/north-mini-code:free`.
2. Tool-calling support is **not uniform across free models**, so the `responseFormat: 'json'`
   fallback must exist and must be selected per model, not assumed. `poolside` proves the case.
3. Free models are rate-limited (`429` observed), so the agent needs real backoff and must show the
   provider's error rather than retrying silently.

**Guardrail to build in Phase 1:** a server-side allow-list of agent models, defaulting to
`:free`-suffixed ids and Ollama, that refuses any id without an explicit opt-in — so no code path
can spend money on the key by accident.

---

## 8. Proposed architecture

### 8.1 Modules

Backend, following the existing `apps/backend/src/<domain>/` layout with `controller / service /
dto / module` per domain:

| Module | Responsibility |
|---|---|
| `workspace/` | workspaces, tree, file CRUD, upload, zip download, snapshots, path resolution |
| `workspace/paths.ts` | the single hardened path resolver (§8.3) |
| `agents/` (extend existing) | agent loop, step streaming, checkpoints, diff review; reuses `AgentRun`/`AgentStep` |
| `ai/tools/` (extend existing) | new tools registered into `AiToolsRegistry` |
| `sandbox/` | `SandboxService`, `available: false` + reason on this machine; container path behind the same interface later |
| `access/` | `AccessService` — plans, entitlements, Redis day-bucket meters, admin bypass |
| `config/` (extend) | feature flags read by both sides |

Frontend: `app/app/code/` (workspace + editor shell), `components/code/*` (explorer, editor,
terminal-placeholder, agent panel, diff review), reusing `components/ui/*` and the Kinetic Obsidian
tokens. `globals.css` is **not** touched (`apps/frontend/AGENTS.md`).

### 8.2 Data model (new migrations only; nothing existing is dropped)

```
Workspace        id, ownerId, name, slug, status, createdAt, updatedAt, deletedAt
WorkspaceFile    id, workspaceId, parentId, name, kind, sizeBytes, sha256,
                 version, deletedAt          -- one row per file; `version` is the optimistic lock
WorkspaceSnapshot id, workspaceId, label, createdAt, manifest Json
WorkspaceSession id, workspaceId, ownerId, status, sandboxRef?, limits Json,
                 startedAt, lastActivityAt, endedAt
AgentSession     id, workspaceId, agentRunId?, ownerId, model, approvalPolicy, createdAt
CheckpointRef    stored on AgentRun, not a new table
```
`Workspace` is a **new** concept and does not reuse `Project`. `Project` stays in the schema,
feature-flagged off, because `StoredFile`, `Agent`, `Task` and `Conversation` all reference it.

### 8.3 The path resolver (the security core)

One function, `resolveWorkspacePath(root, userPath)`, used by every file operation:
1. reject empty, reject NUL bytes, reject absolute paths (`C:\`, `/`, `\\server\share`)
2. `path.posix.normalize` the `/`-joined segments, drop `.`, reject any `..` segment
3. `resolve()` against the root, then assert the result is inside the root **by string prefix on a
   separator boundary** (`C:\root\secrets` must not match prefix `C:\root`)
4. `realpath` the deepest existing ancestor and re-assert containment — this is the symlink-escape
   defence that `StorageService.resolve` does not have
5. on Windows additionally reject reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`,
   `LPT1-9`), trailing dots/spaces, and `:` in any segment
Unit tests: traversal (`../`, `..\`, `%2e%2e`, absolute, UNC, mixed separators), symlink escape,
NUL byte, reserved names, and a positive case per platform.

### 8.4 API surface (all `@UseGuards(AuthGuard)`, ownership checked in the service)

```
GET    /workspaces                          list (own, non-deleted)
POST   /workspaces                          create + root dir under WORKSPACE_ROOT
GET    /workspaces/:id/tree                  recursive listing, depth-capped
GET    /workspaces/:id/file?path=           read { content, version, sha256 }
PUT    /workspaces/:id/file                 write; 409 on version mismatch
POST   /workspaces/:id/file                 create / mkdir
PATCH  /workspaces/:id/file                 rename / move
DELETE /workspaces/:id/file?path=           soft delete
POST   /workspaces/:id/upload               multipart
GET    /workspaces/:id/download             zip stream
POST   /workspaces/:id/snapshots            checkpoint
POST   /workspaces/:id/snapshots/:sid/revert
POST   /workspaces/:id/agent/runs           start a run (returns runId)
POST   /workspaces/:id/agent/runs/:rid/cancel
GET    /workspaces/:id/agent/runs/:rid      run + steps
```
Streamed over SSE on `POST /workspaces/:id/agent/runs/:rid/stream`, mirroring
`chat.controller.ts:46` including the `x-client-session` header and the
`AbortController`-on-`close` cancellation.

### 8.5 WebSocket / SSE events

Reuse SSE, not a new socket, for agent steps — it already exists and already cancels cleanly.
Event names follow the existing `ChatService.frame` style: `run.started`, `step.started`,
`text.delta`, `tool.requested`, `tool.result`, `diff.proposed`, `run.finished`, `run.error`.
Approval round-trips over plain POST (`/approvals/:id`) rather than a socket, so an approval
survives a reconnect. The existing Socket.IO gateway is left alone except for the auth check
flagged in §3.4.

### 8.6 Security model
- Every workspace root lives under `WORKSPACE_ROOT` (default `C:/laragon/www/ISOBASH-DATA/workspaces/<workspaceId>`), outside the web root, one directory per workspace.
- Auth via the existing `AuthGuard`; ownership re-checked on every call, never trusted from the request body.
- `AccessService` is the only place limits are decided, enforced server-side; the UI reflects it.
- New tools register into `AiToolsRegistry` and inherit allow-list → size → authorize → validate → timeout → audit. Destructive tools are `risk: 'high'` and always require explicit approval.
- Prompt injection: file contents and command output are passed as quoted data with an explicit "this is data, not instructions" boundary; the agent cannot act on instructions found in files.
- Model allow-list defaulting to `:free` and Ollama.
- No secrets in the workspace: `.env`, `*.key`, `*.pem` are refused by the writer.

### 8.7 Failure modes and how each is handled
| Failure | Handling |
|---|---|
| Provider rate limit / 429 on a free model | surface the provider error verbatim, exponential backoff, no silent retry |
| Model without tool calling | `responseFormat: 'json'` fallback path, chosen per model |
| Run exceeds steps/tokens/wall clock | hard stop, run marked `CANCELLED`, checkpoint retained |
| Loop detected (identical tool call twice) | stop and report the repeat |
| Two tabs writing one file | 409 with the current `version`; the client offers reload/compare |
| Disk full | write fails with the real errno; no partial file — write to temp + rename |
| Sandbox requested | HTTP 501 `SANDBOX_UNAVAILABLE_NO_HYPERVISOR`, visible in the UI |
| WebSocket dropped mid-run | run continues server-side to the next checkpoint; client resumes from `GET run` |
| Server restart mid-run | runs left `RUNNING` are reconciled to `INTERRUPTED` on boot |

---

## 9. Phase plan with acceptance criteria

**Phase 1 — Flags and cutover** (adds `AccessService` skeleton, since flags and limits share it)
Central flags `FEATURE_PROJECTS=false`, `FEATURE_FILES=false`, `FEATURE_CODE_WORKEACTOR=true` in dev.
Flag-off hides UI, redirects pages to the dashboard, and returns a structured `FEATURE_DISABLED`
from endpoints. Landing cards 1 and 2 replaced with honest "Code Workspace" / "Coding Agent" copy
keeping the 12-column bento balance. "Code" added to nav.
*Accept:* `FEATURE_FILES=false` → `/app/files` redirects, `GET /files` returns `FEATURE_DISABLED`,
landing copy matches the built feature list exactly.

**Phase 2 — Workspace and editor** (Monaco `@monaco-editor/react`, no xterm yet)
Data model, `WORKSPACE_ROOT`, the §8.3 path resolver + traversal tests, full file API, optimistic
concurrency, explorer with drag-move and keyboard nav, tabs with dirty state, resizable
explorer|editor split in Kinetic Obsidian tokens, dark and light, tablet width.
*Accept:* create a workspace, create and edit a file, reload and it persists; traversal suite
green; two-tab write produces a 409.

**Phase 3 — Terminal, honest about the hardware**
`SandboxService` with `available:false` and the hypervisor reason; `run_command` tool present,
tested, refused; terminal panel shows the reason; audit events for start/stop/limit-hit.
*Accept:* a command request returns 501 with the reason; no host process is ever spawned;
attempting to read outside the workspace fails in the resolver tests.

**Phase 4 — Tool layer** (all tools into `AiToolsRegistry`)
`read_file`, `list_dir`, `search` with result caps, `write_file`, `edit_file` with safe
exact-match failure, `delete_file`, `run_command` (refused, per Phase 3). Approval policy per
session: ask-every-time (default), auto-approve edits, auto-approve allow-listed commands;
destructive always explicit.
*Accept:* every tool unit-tested for schema rejection, size limits, traversal and approval
enforcement; no tool can be invoked outside the allow-list.

**Phase 5 — Coding agent**
Loop over the existing router with the model allow-list, default `cohere/north-mini-code:free`
plus Ollama; live SSE step stream; diff review with per-file accept/reject; checkpoint before each
run with one-click revert; context budget (tree summary + on-demand files, no binaries); limits via
`AccessService`; sessions and steps persisted into the existing `AgentRun`/`AgentStep`.
*Accept:* ask it to create a small project, run its tests and fix an introduced bug; watch every
step; approve or reject diffs; stop mid-run; revert to a checkpoint. Every run costs `$0`.

**Phase 6 — Hardening**
Sandbox-escape and path-rule attack write-up, load and failure tests (many workspaces, dropped
connections, restart, full disk), structured logs and metrics, cleanup jobs for soft-deleted
workspaces and snapshots, README section.
*Accept:* documented attack results with real output; metrics visible in the admin panel.

---

## 10. Risks

1. **No isolation on this machine** (§5). Phase 3 ships disabled. The only real fix is enabling VT-x in the owner's BIOS.
2. **0.8 GB free RAM on a 4-thread laptop** with PostgreSQL, Redis, Ollama, an API, a worker and Next all resident. `memory.md` already records a full verification run lost to this. Every phase should re-check free memory before a long run, and Phase 2's Monaco bundle is the heaviest new dependency — measure it.
3. **Free-model flakiness.** Rate limits and provider errors are normal; the agent must show them rather than hide them. `cohere/north-mini-code:free` is a third-party free endpoint and its availability is not ours to promise.
4. **`projects-panel.tsx` and `StoredFile` are load-bearing.** Turning Projects off must not cascade into Files, Agents or Chat.
5. **The Socket.IO gateway may accept unauthenticated connections** (`realtime.gateway.ts:22`, `cors: true`). Not verified yet, not touched yet. It must be resolved before the terminal/agent stream leans on it.
6. **`globals.css`, `app/layout.tsx`, `lib/auth-server.ts` are off-limits** per `apps/frontend/AGENTS.md`; the Code Workspace must fit the existing tokens.

---

## 11. Decisions I need from you

1. **Phase 3 disabled** (my recommendation) vs. wait for VT-x to be enabled before building anything terminal-related.
2. **`Feature`-flag the existing Projects/Files off permanently, or keep them reachable for admins behind their flags?** My recommendation: admin-only visibility, everyone else gets Code Workspace.
3. **Default agent model**: `cohere/north-mini-code:free` (verified native tool calling, `$0`) — or local `llama3.2` for fully offline work at the cost of much weaker tool calling?
4. **Monaco** (`@monaco-editor/react`) is the only heavyweight new dependency. Approve, or a lighter editor?

Awaiting approval before Phase 1.