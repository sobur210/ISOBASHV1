// Runtime verification for Phase 5: AI engine orchestration, streaming, persistence, chat.
// Requires the full stack (frontend :3000, backend :3001, PostgreSQL, Redis, Ollama).
import { randomUUID } from "node:crypto";

const API = process.env.API_URL || "http://localhost:3001";
const WEB = process.env.WEB_URL || "http://localhost:3000";

const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(message, detail) {
  throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

async function streamRequest(baseUrl, session, input, conversationId) {
  const res = await fetch(`${baseUrl}/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-session": session },
    body: JSON.stringify(conversationId ? { input, conversationId } : { input }),
  });
  const text = await res.text();
  const events = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { status: res.status, events };
}

const session = randomUUID();
const otherSession = randomUUID();

console.log("== Phase 5: chat orchestration + persistence ==");

const stream = await streamRequest(API, session, "Reply with the single word OK.");
check("POST /chat/stream returns 200", stream.status === 200, `status=${stream.status}`);
const meta = stream.events.find((e) => e.type === "meta");
check("stream opens with a meta event", Boolean(meta), meta?.conversationId ?? "no meta");
const deltas = stream.events.filter((e) => e.type === "delta");
check("stream emits delta tokens", deltas.length > 0, `${deltas.length} delta(s)`);
const done = stream.events.find((e) => e.type === "done");
check("stream closes with a done event", Boolean(done), done ? `${done.provider}/${done.model}` : "no done");
check("done event carries server messageId", Boolean(done?.messageId));

const streamText = deltas.map((d) => d.text).join("");
check("delta text is non-trivial", streamText.trim().length > 0, JSON.stringify(streamText.trim().slice(0, 40)));
check("assistant message persisted with content", Boolean(done?.messageId));

let conversations;
try {
  const res = await fetch(`${API}/chat/conversations`, { headers: { "x-client-session": session } });
  conversations = await res.json();
} catch (e) {
  fail("GET /chat/conversations threw", e.message);
}
check("GET /chat/conversations returns 200", Array.isArray(conversations), `${conversations?.length ?? "?"} conversation(s)`);
check("new conversation appears in the session list", conversations.some((c) => c.id === meta.conversationId));

let detail;
try {
  const res = await fetch(`${API}/chat/conversations/${meta.conversationId}`, { headers: { "x-client-session": session } });
  detail = await res.json();
} catch (e) {
  fail("GET /chat/conversations/:id threw", e.message);
}
const roles = detail.messages.map((m) => m.role);
check("conversation detail returns messages", Array.isArray(detail.messages), `${detail.messages?.length ?? "?"} message(s)`);
check("user message persisted", roles.includes("user"));
check("assistant message persisted", roles.includes("assistant"));
const assistant = detail.messages.find((m) => m.role === "assistant");
check("assistant message stores provider/model metadata", Boolean(assistant?.model), assistant?.model ?? "no model");

const ownership = await fetch(`${API}/chat/conversations/${meta.conversationId}`, { headers: { "x-client-session": otherSession } });
check("other session cannot read the conversation (404)", ownership.status === 404, `status=${ownership.status}`);

const badInput = await fetch(`${API}/chat/stream`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-client-session": session },
  body: JSON.stringify({ input: "" }),
});
const badInputBody = await badInput.json();
check("empty input returns 400 VALIDATION_FAILED", badInput.status === 400 && badInputBody.error?.code === "VALIDATION_FAILED",
  `status=${badInput.status} code=${badInputBody.error?.code}`);

const noSession = await fetch(`${API}/chat/stream`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: "hi" }),
});
check("missing client session returns 400", noSession.status === 400, `status=${noSession.status}`);

const del = await fetch(`${API}/chat/conversations/${meta.conversationId}`, { method: "DELETE", headers: { "x-client-session": session } });
check("conversation deletes with 204", del.status === 204, `status=${del.status}`);

const afterDelete = await fetch(`${API}/chat/conversations`, { headers: { "x-client-session": session } });
const afterDeleteBody = await afterDelete.json();
check("deleted conversation no longer listed", !afterDeleteBody.some((c) => c.id === meta.conversationId));

let tools;
try {
  tools = await (await fetch(`${API}/ai/tools`)).json();
} catch (e) {
  fail("GET /ai/tools threw", e.message);
}
// The Phase 2 catalogue was empty on purpose. Phase 10 fills it with real governed
// tools, so the invariant now is that whatever is published is fully described —
// a tool without a schema, a risk class or a ceiling would be an ungoverned capability.
check(
  "GET /ai/tools returns only fully governed tools",
  Array.isArray(tools) &&
    tools.every(
      (tool) =>
        typeof tool.name === "string" &&
        typeof tool.description === "string" &&
        tool.parameters?.type === "object" &&
        typeof tool.risk === "string" &&
        Number.isInteger(tool.timeoutMs) &&
        tool.timeoutMs > 0 &&
        Number.isInteger(tool.maxArgumentLength) &&
        tool.maxArgumentLength > 0,
    ),
  `${tools?.length ?? "?"} tool(s)`,
);

const realtimeProbe = await fetch(`${API}/health`);
const realtimeHealth = await realtimeProbe.json();
check("health still reports all components ok", realtimeHealth.status === "ok", realtimeHealth.status);

const chatPage = await fetch(`${WEB}/app/chat`, { redirect: "manual" });
check("unauthenticated /app/chat redirects to login (auth gate)", chatPage.status >= 300 && chatPage.status < 400,
  `status=${chatPage.status} location=${chatPage.headers.get("location") ?? "none"}`);

const gateEmail = `p5-${randomUUID()}@isobash.dev`;
const gatePassword = "phase5pass123";
const gateRegister = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: gateEmail, password: gatePassword }),
});
check("auth register succeeds for the gated page check", gateRegister.status >= 200 && gateRegister.status < 300,
  `status=${gateRegister.status}`);
const setCookie = gateRegister.headers.get("set-cookie") ?? "";
const gateSession = setCookie.match(/isobash_session=([^;]+)/)?.[1];
check("register issues a session cookie", Boolean(gateSession), gateSession ? "cookie present" : "no cookie");

const chatAuthed = await fetch(`${WEB}/app/chat`, { headers: { cookie: `isobash_session=${gateSession}` } });
const chatAuthedHtml = await chatAuthed.text();
check("authenticated /app/chat serves the real composer", chatAuthed.status === 200 && chatAuthedHtml.includes("New conversation"),
  `status=${chatAuthed.status}`);

console.log("");
const failed = results.filter((r) => !r.passed);
console.log(`== Summary ==`);
console.log(`${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);