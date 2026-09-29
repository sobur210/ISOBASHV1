// Runtime verification for Phase 10: agents, governed tools, memory, projects.
// Covers: the tool catalogue, project + task CRUD with ownership isolation,
// agent CRUD with tool/project validation, the memory store, one real agent run
// (model plan -> tool execution -> synthesis, with rows persisted and audited),
// cooperative cancellation, and the socket.io user-room authorization that agent
// progress is delivered over.
// Requires the full stack (backend :3001, PostgreSQL, Redis) and DATABASE_URL in .env.
// A reachable language provider is required: the run is a genuine model call, not a stub.
//
// Each run uses throwaway identities, so the script is re-runnable.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("../node_modules/pg");
const { io } = require("../node_modules/socket.io-client");

const API = process.env.API_URL || "http://localhost:3001";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];

const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookieFrom(res, name) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.match(`${name}=([^;]+)`)?.[1] ?? null;
}

const run = randomUUID().slice(0, 8);
const emailA = `p10-a-${run}@isobash.dev`;
const emailB = `p10-b-${run}@isobash.dev`;
const password = "verify-pass-123";
const xff = `198.51.${100 + (run.charCodeAt(0) % 50)}.${1 + (run.charCodeAt(1) % 250)}`;

const jsonHeaders = (cookie) => ({
  "content-type": "application/json",
  "x-forwarded-for": xff,
  ...(cookie ? { cookie: `isobash_session=${cookie}` } : {}),
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, path, { cookie, body } = {}) {
  // The supervisor restarts the API occasionally and undici throws ECONNRESET on a
  // closed keep-alive socket; retrying a few times keeps a transport blip from
  // masquerading as a product failure.
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: jsonHeaders(cookie),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: res.status, body: parsed, res };
    } catch (error) {
      lastError = error;
      await sleep(300 * (attempt + 1));
    }
  }
  throw lastError;
}

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/** Poll a run until it reaches a terminal state or the budget runs out. */
async function awaitRun(cookie, runId, { attempts = 60, intervalMs = 2000 } = {}) {
  let latest = null;
  for (let i = 0; i < attempts; i += 1) {
    const res = await api("GET", `/agents/runs/${runId}`, { cookie });
    latest = res.body;
    if (TERMINAL.has(latest?.status)) return latest;
    await sleep(intervalMs);
  }
  return latest;
}

console.log("== Phase 10: agents, tools, memory, projects ==");

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

console.log("\n== Tool catalogue ==");

const tools = await api("GET", "/ai/tools");
const catalogue = Array.isArray(tools.body) ? tools.body : [];
check("GET /ai/tools returns the governed catalogue", tools.status === 200 && catalogue.length >= 5, `status=${tools.status} count=${catalogue.length}`);
check(
  "every tool declares a JSON schema, a risk class, a timeout and an argument ceiling",
  catalogue.length > 0 &&
    catalogue.every(
      (tool) =>
        tool.parameters?.type === "object" &&
        typeof tool.risk === "string" &&
        Number.isInteger(tool.timeoutMs) &&
        tool.timeoutMs > 0 &&
        Number.isInteger(tool.maxArgumentLength) &&
        tool.maxArgumentLength > 0,
    ),
);
check(
  "the Phase 10 capabilities are present (datetime, math, memory read/write, task create)",
  ["datetime.now", "math.evaluate", "memory.search", "memory.write", "task.create"].every((name) =>
    catalogue.some((tool) => tool.name === name),
  ),
  catalogue.map((tool) => tool.name).join(", "),
);
check("every tool is audited", catalogue.length > 0 && catalogue.every((tool) => tool.audited === true));

console.log("\n== Authentication gate ==");

for (const [method, path] of [
  ["GET", "/projects"],
  ["GET", "/agents"],
  ["GET", "/memory"],
]) {
  const res = await api(method, path);
  check(`${method} ${path} without a session is rejected (401)`, res.status === 401, `status=${res.status}`);
}

console.log("\n== Identities ==");

const registerA = await api("POST", "/auth/register", {
  body: { email: emailA, password, name: "Phase Ten A" },
});
const cookieA = cookieFrom(registerA.res, "isobash_session");
const userA = registerA.body?.user ?? {};
check("owner account registered", registerA.status === 201 && Boolean(cookieA), `status=${registerA.status}`);

const registerB = await api("POST", "/auth/register", {
  body: { email: emailB, password, name: "Phase Ten B" },
});
const cookieB = cookieFrom(registerB.res, "isobash_session");
const userB = registerB.body?.user ?? {};
check("second account registered for the ownership checks", registerB.status === 201 && Boolean(cookieB), `status=${registerB.status}`);

console.log("\n== Projects and tasks ==");

const emptyProject = await api("POST", "/projects", { cookie: cookieA, body: { name: "   " } });
check("a blank project name is rejected (400)", emptyProject.status === 400, `status=${emptyProject.status}`);

const project = await api("POST", "/projects", {
  cookie: cookieA,
  body: { name: "Phase Ten Project", description: "Verification workspace" },
});
check("POST /projects creates a project", project.status === 201 && Number.isInteger(project.body?.id), `status=${project.status}`);
const projectId = project.body?.id;

const projectList = await api("GET", "/projects", { cookie: cookieA });
check(
  "GET /projects lists the project with its task and agent counts",
  projectList.status === 200 &&
    projectList.body.some(
      (row) => row.id === projectId && Array.isArray(row.tasks) && row._count?.agents === 0,
    ),
);

const task1 = await api("POST", `/projects/${projectId}/tasks`, {
  cookie: cookieA,
  body: { title: "First task", description: "Created by the verifier" },
});
const task2 = await api("POST", `/projects/${projectId}/tasks`, { cookie: cookieA, body: { title: "Second task" } });
check(
  "tasks are appended in order (order 1, 2)",
  task1.status === 201 && task2.status === 201 && task1.body.order === 1 && task2.body.order === 2,
  `orders=${task1.body?.order},${task2.body?.order}`,
);

const renames = await api("PATCH", `/projects/tasks/${task1.body.id}`, {
  cookie: cookieA,
  body: { status: "IN_PROGRESS" },
});
check("PATCH /projects/tasks/:id advances the task status", renames.status === 200 && renames.body.status === "IN_PROGRESS", `status=${renames.status}`);

const noopStatus = await api("PATCH", `/projects/tasks/${task1.body.id}`, { cookie: cookieA, body: { status: "IN_PROGRESS" } });
check("re-applying the current task status is refused (400)", noopStatus.status === 400, `status=${noopStatus.status}`);

const badStatus = await api("PATCH", `/projects/tasks/${task1.body.id}`, { cookie: cookieA, body: { status: "SHIPPED" } });
check("an unknown task status is rejected by validation (400)", badStatus.status === 400, `status=${badStatus.status}`);

const foreignProject = await api("GET", `/projects/${projectId}`, { cookie: cookieB });
check("another user cannot read the project (404)", foreignProject.status === 404, `status=${foreignProject.status}`);

const foreignList = await api("GET", "/projects", { cookie: cookieB });
check(
  "another user's project list excludes it",
  foreignList.status === 200 && foreignList.body.every((row) => row.id !== projectId),
);

const foreignTask = await api("PATCH", `/projects/tasks/${task1.body.id}`, { cookie: cookieB, body: { status: "DONE" } });
check("another user cannot mutate a task through its project (404)", foreignTask.status === 404, `status=${foreignTask.status}`);

const stillInProgress = await api("GET", `/projects/${projectId}`, { cookie: cookieA });
check(
  "the rejected cross-user write left the task untouched",
  stillInProgress.body?.tasks?.find((task) => task.id === task1.body.id)?.status === "IN_PROGRESS",
);

console.log("\n== Memory ==");

const blankMemory = await api("POST", "/memory", { cookie: cookieA, body: { content: "   " } });
check("blank memory content is rejected (400)", blankMemory.status === 400, `status=${blankMemory.status}`);

const badKind = await api("POST", "/memory", { cookie: cookieA, body: { content: "x", kind: "RUMOUR" } });
check("an unknown memory kind is rejected (400)", badKind.status === 400, `status=${badKind.status}`);

const memory1 = await api("POST", "/memory", {
  cookie: cookieA,
  body: { content: "The owner prefers concise answers in every tool output.", kind: "PREFERENCE" },
});
const memory2 = await api("POST", "/memory", {
  cookie: cookieA,
  body: { content: "Deployments run from the nightly pipeline on Linux hosts.", kind: "FACT" },
});
check("POST /memory stores a typed entry", memory1.status === 201 && memory1.body?.kind === "PREFERENCE", `status=${memory1.status}`);

const searched = await api("GET", "/memory?q=deployments", { cookie: cookieA });
check(
  "GET /memory?q= filters by keyword",
  searched.status === 200 && searched.body.length === 1 && searched.body[0].id === memory2.body.id,
  `matches=${searched.body?.length}`,
);

const stats = await api("GET", "/memory/stats", { cookie: cookieA });
check(
  "GET /memory/stats counts entries by kind",
  stats.status === 200 && stats.body.total === 2 && stats.body.byKind.PREFERENCE === 1 && stats.body.byKind.FACT === 1,
  JSON.stringify(stats.body),
);

const foreignMemory = await api("DELETE", `/memory/${memory1.body.id}`, { cookie: cookieB });
check("another user cannot delete a memory (404)", foreignMemory.status === 404, `status=${foreignMemory.status}`);

const ownMemory = await api("DELETE", `/memory/${memory1.body.id}`, { cookie: cookieA });
check("the owner can delete a memory (204)", ownMemory.status === 204, `status=${ownMemory.status}`);

console.log("\n== Agents ==");

const unknownTool = await api("POST", "/agents", {
  cookie: cookieA,
  body: { name: "Bad Tool Agent", toolNames: ["rm.rf"] },
});
check("an agent cannot be created with an unknown tool (400)", unknownTool.status === 400, `status=${unknownTool.status}`);

const tooManyTools = await api("POST", "/agents", {
  cookie: cookieA,
  body: { name: "Greedy Agent", toolNames: Array.from({ length: 13 }, (_, i) => `tool.${i}`) },
});
check("more than 12 tools is rejected (400)", tooManyTools.status === 400, `status=${tooManyTools.status}`);

const tooManySteps = await api("POST", "/agents", { cookie: cookieA, body: { name: "Marathon", maxSteps: 99 } });
check("maxSteps above the ceiling is rejected (400)", tooManySteps.status === 400, `status=${tooManySteps.status}`);

const foreignProjectAgent = await api("POST", "/agents", {
  cookie: cookieA,
  body: { name: "Stolen Workspace", projectId: 999999 },
});
check("binding an agent to a project the caller does not own is refused (400)", foreignProjectAgent.status === 400, `status=${foreignProjectAgent.status}`);

const agent = await api("POST", "/agents", {
  cookie: cookieA,
  body: {
    name: "Verification Agent",
    description: "Runs a real plan and calls one real tool",
    instructions: "Use math.evaluate for arithmetic. Never invent a result you did not compute.",
    maxSteps: 2,
    toolNames: ["math.evaluate", "datetime.now"],
    memoryEnabled: true,
    projectId,
  },
});
const agentId = agent.body?.id;
check(
  "POST /agents creates an agent scoped to the caller's project",
  agent.status === 201 && agent.body?.projectId === projectId && agent.body?.toolNames?.length === 2,
  `status=${agent.status}`,
);

const agentList = await api("GET", "/agents", { cookie: cookieA });
check(
  "GET /agents includes the project and run counts",
  agentList.status === 200 &&
    agentList.body.some((row) => row.id === agentId && row.project?.id === projectId && row._count?.runs === 0),
);

const foreignAgentRead = await api("GET", `/agents/${agentId}`, { cookie: cookieB });
check("another user cannot read the agent (404)", foreignAgentRead.status === 404, `status=${foreignAgentRead.status}`);

const foreignAgentRun = await api("POST", `/agents/${agentId}/runs`, { cookie: cookieB, body: { input: "steal" } });
check("another user cannot start a run on the agent (404)", foreignAgentRun.status === 404, `status=${foreignAgentRun.status}`);

const agentUpdate = await api("PATCH", `/agents/${agentId}`, { cookie: cookieA, body: { maxSteps: 3, memoryEnabled: false } });
check("PATCH /agents/:id updates the configuration", agentUpdate.status === 200 && agentUpdate.body.maxSteps === 3 && agentUpdate.body.memoryEnabled === false, `status=${agentUpdate.status}`);

const backOn = await api("PATCH", `/agents/${agentId}`, { cookie: cookieA, body: { memoryEnabled: true } });
check("memory can be switched back on", backOn.status === 200 && backOn.body.memoryEnabled === true);

console.log("\n== Agent run (real model plan, real tool call) ==");

const blankRun = await api("POST", `/agents/${agentId}/runs`, { cookie: cookieA, body: { input: "   " } });
check("a run without input is rejected (400)", blankRun.status === 400, `status=${blankRun.status}`);

const started = await api("POST", `/agents/${agentId}/runs`, {
  cookie: cookieA,
  body: { input: "Compute 128 multiplied by 3 and divided by 4, then report the result." },
});
const runId = started.body?.id;
check(
  "POST /agents/:id/runs starts a run and returns real state (PENDING/PLANNING)",
  started.status === 201 && Boolean(runId) && ["PENDING", "PLANNING"].includes(started.body?.status),
  `status=${started.status} run=${started.body?.status}`,
);

const finished = await awaitRun(cookieA, runId);
check("the run reaches a terminal state", TERMINAL.has(finished?.status), `status=${finished?.status}`);
check(
  "the persisted plan is the model's own output, within the step budget",
  Array.isArray(finished?.plan) && finished.plan.length > 0 && finished.plan.length <= 3,
  JSON.stringify(finished?.plan),
);
check(
  "every persisted step is recorded in order with a status and a duration",
  Array.isArray(finished?.steps) &&
    finished.steps.length > 0 &&
    finished.steps.every((step, index) => step.position === index + 1 && step.durationMs !== null),
  JSON.stringify(finished?.steps?.map((step) => `${step.position}:${step.tool ?? "reasoning"}:${step.status}`)),
);
check("the run records the provider and model it used", Boolean(finished?.provider && finished?.model), `${finished?.provider}:${finished?.model}`);

if (finished?.status === "COMPLETED") {
  check("a completed run produces an answer and a finish timestamp", Boolean(finished.output) && Boolean(finished.finishedAt));
  check(
    "stepsExecuted matches the steps that actually ran",
    finished.stepsExecuted === finished.steps.filter((step) => ["SUCCEEDED", "FAILED"].includes(step.status)).length,
    `stepsExecuted=${finished.stepsExecuted}`,
  );
  const mathStep = finished.steps.find((step) => step.tool === "math.evaluate");
  if (mathStep?.status === "SUCCEEDED") {
    // The tool computed 128 * 3 / 4 itself; the model did not get to invent it.
    check(
      "the math tool returned its own computed value (96 for 128*3/4)",
      mathStep.output?.includes("96"),
      `output=${mathStep.output}`,
    );
  } else if (mathStep) {
    // A model that hands the tool a nonsense expression is a real failure and must
    // be recorded as one, with no output standing in for a result.
    check(
      "a step that failed records the real error and no output",
      mathStep.status === "FAILED" && Boolean(mathStep.error) && mathStep.output === null,
      `status=${mathStep.status} error=${mathStep.error}`,
    );
  } else {
    check(
      "the plan only used tools the agent was granted",
      finished.plan.every((step) => !step.tool || ["math.evaluate", "datetime.now"].includes(step.tool)),
      JSON.stringify(finished.plan),
    );
  }
  if (pool) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "AgentStep" WHERE "runId" = $1`,
      [runId],
    );
    check("the steps are rows in Postgres, not just the response", rows[0].n === finished.steps.length, `rows=${rows[0].n}`);

    const { rows: auditRows } = await pool.query(
      `SELECT action, metadata->>'tool' AS tool FROM "AuditEvent"
       WHERE category = 'SECURITY' AND action IN ('agent_tool_invoked', 'agent_tool_failed')
         AND metadata->>'runId' = $1`,
      [runId],
    );
    const audited = auditRows.map((row) => `${row.tool}:${row.action.replace("agent_tool_", "")}`);
    const succeeded = finished.steps.filter((step) => step.tool && step.status === "SUCCEEDED").length;
    const failed = finished.steps.filter((step) => step.tool && step.status === "FAILED").length;
    check(
      "every tool call is audited, whether it succeeded or failed",
      auditRows.filter((row) => row.action === "agent_tool_invoked").length === succeeded &&
        auditRows.filter((row) => row.action === "agent_tool_failed").length === failed,
      `audited=${audited.join(",") || "(no tool step)"}`,
    );
  }
} else {
  check(
    "a non-completed run fails honestly with an error instead of a fabricated answer",
    Boolean(finished?.error) && !finished?.output,
    `error=${finished?.error}`,
  );
}

const runsList = await api("GET", `/agents/${agentId}/runs`, { cookie: cookieA });
check("GET /agents/:id/runs returns the run with its steps", runsList.status === 200 && runsList.body.some((row) => row.id === runId && row.steps.length > 0));

const foreignRunRead = await api("GET", `/agents/runs/${runId}`, { cookie: cookieB });
check("another user cannot read the run (404)", foreignRunRead.status === 404, `status=${foreignRunRead.status}`);

console.log("\n== Cancellation ==");

const cancelStart = await api("POST", `/agents/${agentId}/runs`, {
  cookie: cookieA,
  body: { input: "Describe in detail the entire history of algebraic computation, step by step." },
});
const cancelRunId = cancelStart.body?.id;
const cancelAccepted = await api("POST", `/agents/runs/${cancelRunId}/cancel`, { cookie: cookieA });
check("POST /agents/runs/:id/cancel is accepted while the run is live", cancelAccepted.status === 200, `status=${cancelAccepted.status}`);

const cancelled = await awaitRun(cookieA, cancelRunId);
check("a cancelled run ends CANCELLED and keeps whatever it had already produced", cancelled?.status === "CANCELLED" && Boolean(cancelled.finishedAt), `status=${cancelled?.status} steps=${cancelled?.steps?.length}`);

const cancelTwice = await api("POST", `/agents/runs/${cancelRunId}/cancel`, { cookie: cookieA });
check("cancelling a finished run is refused (400)", cancelTwice.status === 400, `status=${cancelTwice.status}`);

const foreignCancel = await api("POST", `/agents/runs/${runId}/cancel`, { cookie: cookieB });
check("another user cannot cancel a run (404)", foreignCancel.status === 404, `status=${foreignCancel.status}`);

console.log("\n== Realtime authorization ==");

function connectSocket(cookie) {
  return new Promise((resolve, reject) => {
    const socket = io(API, {
      transports: ["websocket"],
      extraHeaders: cookie ? { cookie: `isobash_session=${cookie}` } : {},
    });
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 10_000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

// The Nest Socket.IO adapter emits a `{ event, data }` return value on `event` and
// ignores the ack callback, so responses are awaited as events.
function ask(socket, request, room) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${request} reply for ${room}`)), 10_000);
    socket.once(request, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.emit("join-room", room);
  });
}

const anonymous = await connectSocket(null);
const anonymousJoin = await ask(anonymous, "joined-room", `user:${userA.id}`);
check("a socket without a session cannot join a user room", anonymousJoin?.joined === false && anonymousJoin?.reason === "FORBIDDEN", JSON.stringify(anonymousJoin));
const foreignRoom = await ask(anonymous, "joined-room", "admin:lobby");
check("unknown room namespaces are refused", foreignRoom?.joined === false, JSON.stringify(foreignRoom));
anonymous.close();

const ownerSocket = await connectSocket(cookieA);
const ownRoom = await ask(ownerSocket, "joined-room", `user:${userA.id}`);
check("the owner joins their own user room", ownRoom?.joined === true, JSON.stringify(ownRoom));

const pong = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 8_000);
  ownerSocket.once("pong", (data) => {
    clearTimeout(timer);
    resolve(data);
  });
  ownerSocket.emit("ping", { at: Date.now() });
});
check("ping/pong still round-trips after the gateway change", pong?.at !== undefined, JSON.stringify(pong));

const intruderSocket = await connectSocket(cookieB);
const stolenRoom = await ask(intruderSocket, "joined-room", `user:${userA.id}`);
check("another authenticated user is refused the owner's user room", stolenRoom?.joined === false && stolenRoom?.reason === "FORBIDDEN", JSON.stringify(stolenRoom));

const events = [];
ownerSocket.on("agent:run", (payload) => events.push(payload));

const liveRun = await api("POST", `/agents/${agentId}/runs`, {
  cookie: cookieA,
  body: { input: "Report the current server date and time, then state it plainly." },
});
const liveRunId = liveRun.body?.id;
const liveFinished = await awaitRun(cookieA, liveRunId);
await sleep(500);

const statuses = events.filter((event) => event.runId === liveRunId).map((event) => event.status);
check(
  "run progress is delivered to the owner's user room",
  statuses.includes("PLANNING") &&
    statuses.includes(liveFinished.status) &&
    (liveFinished.status !== "COMPLETED" || statuses.includes("RUNNING")),
  `events=${statuses.join(">")} final=${liveFinished.status}`,
);
check(
  "every progress event names the agent and the run",
  events.filter((event) => event.runId === liveRunId).every((event) => Boolean(event.agentId)),
);

let leaked = 0;
intruderSocket.on("agent:run", () => {
  leaked += 1;
});
await sleep(500);
check("no run event reaches the refused socket", leaked === 0, `leaked=${leaked}`);

if (liveFinished?.status === "COMPLETED") {
  const nowStep = liveFinished.steps.find((step) => step.tool === "datetime.now");
  if (nowStep) {
    const reported = /(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(nowStep.output ?? "")?.[1];
    check(
      "the datetime tool reported the server clock, not a model guess",
      Boolean(reported) && Math.abs(Date.parse(reported) - Date.now()) < 120_000,
      `reported=${reported}`,
    );
  }
}

ownerSocket.close();
intruderSocket.close();

console.log("\n== Agent cleanup ==");

if (pool) {
  // Checked before the delete: an agent-scoped summary is cascaded away with its agent.
  const { rows: summaryRows } = await pool.query(
    `SELECT count(*)::int AS n FROM "MemoryEntry"
     WHERE "userId" = $1 AND kind = 'SUMMARY' AND source = 'agent_run' AND "sourceId" = $2`,
    [userA.id, runId],
  );
  check(
    "a completed run wrote its own summary back to the memory store, tagged with the run id",
    finished?.status !== "COMPLETED" || summaryRows[0].n === 1,
    `summaries=${summaryRows[0].n} run=${finished?.status}`,
  );
}

const removed = await api("DELETE", `/agents/${agentId}`, { cookie: cookieA });
check("DELETE /agents/:id removes the agent (204)", removed.status === 204, `status=${removed.status}`);

const goneGet = await api("GET", `/agents/${agentId}`, { cookie: cookieA });
check("the deleted agent is gone (404)", goneGet.status === 404, `status=${goneGet.status}`);

if (pool) {
  const { rows: cascadeRows } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM "AgentRun" WHERE "agentId" = $1) AS runs,
       (SELECT count(*)::int FROM "AgentStep" s WHERE s."runId" IN (SELECT id FROM "AgentRun" WHERE "agentId" = $1)) AS steps,
       (SELECT count(*)::int FROM "MemoryEntry" WHERE "agentId" = $1) AS memories`,
    [agentId],
  );
  check(
    "deleting an agent cascades its runs, steps and agent-scoped memories",
    cascadeRows[0].runs === 0 && cascadeRows[0].steps === 0 && cascadeRows[0].memories === 0,
    JSON.stringify(cascadeRows[0]),
  );

  console.log("\n== Cleanup ==");
  await pool.query(`DELETE FROM "Session" WHERE "userId" = ANY($1)`, [[userA.id, userB.id]]);
  await pool.query(`DELETE FROM "Project" WHERE "ownerId" = ANY($1)`, [[userA.id, userB.id]]);
  await pool.query(`DELETE FROM "User" WHERE id = ANY($1)`, [[userA.id, userB.id]]);
  console.log("(throwaway test users removed; audit events retained as evidence)");
} else {
  console.log("(skipped DB checks + cleanup — DATABASE_URL not found in .env)");
}

console.log("");
const failed = results.filter((r) => !r.passed);
console.log("== Summary ==");
console.log(`${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("");
  for (const row of failed) console.log(`FAILED: ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
}
await pool?.end();
process.exit(failed.length ? 1 : 0);
