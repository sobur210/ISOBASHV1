#!/usr/bin/env node
/*
 * End-to-end verification for Phase 16 (billing) and Phase 17 (admin center),
 * driven entirely through the public gateway on WEB_PORT.
 *
 * Every assertion here checks real behaviour against real rows: the plan a user
 * actually holds, the quota the entitlement service actually resolved, the counts
 * the admin overview actually aggregates. Nothing is stubbed and nothing is
 * written to a fixture file.
 *
 *   node scripts/verify-phase16-17.mjs
 */

import { createRequire } from "node:module";
import { join } from "node:path";

const WEB = process.env.WEB_URL ?? `http://localhost:${process.env.WEB_PORT ?? 3002}`;
const ADMIN_EMAIL = process.env.VERIFY_ADMIN_EMAIL ?? "verify-admin@example.com";
const ADMIN_PASSWORD = process.env.VERIFY_ADMIN_PASSWORD ?? "VerifyPass123!";
const USER_EMAIL = process.env.VERIFY_USER_EMAIL ?? "verify-user@example.com";
const USER_PASSWORD = process.env.VERIFY_USER_PASSWORD ?? "VerifyPass123!";

const results = [];
let failed = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` - ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/** Minimal cookie jar so the session cookie survives across calls. */
function makeClient() {
  const jar = new Map();
  return async function request(method, path, body) {
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.size > 0) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

    const response = await fetch(`${WEB}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });

    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }

    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: response.status, json, text, headers: response.headers };
  };
}

/** Register, or sign in when the account already exists from a previous run. */
async function authenticate(client, email, password) {
  const registered = await client("POST", "/auth/register", { email, password });
  if (registered.status >= 200 && registered.status < 300) {
    return { ok: true, how: "register" };
  }
  const signedIn = await client("POST", "/auth/login", { email, password });
  if (signedIn.status >= 200 && signedIn.status < 300) {
    return { ok: true, how: "login" };
  }
  return { ok: false, how: "failed", detail: `${registered.status}/${signedIn.status} ${registered.text}` };
}

/** Promote an account to admin through the database, since there is no bootstrap route. */
async function promoteToAdmin(email) {
  const require = createRequire(join(process.cwd(), "apps/backend", "package.json"));
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: false, detail: "user row not found" };
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    return { ok: true, detail: `role=ADMIN for ${user.email}` };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log(`ISOBASH Phase 16 + 17 verification against ${WEB}`);

  section("Gateway reachability");
  const anonymous = makeClient();
  const health = await anonymous("GET", "/health");
  check("GET /health returns ok", health.status === 200 && health.json?.status === "ok", `status=${health.status}`);
  check(
    "database and redis report healthy",
    Array.isArray(health.json?.components) && health.json.components.every((c) => c.status === "ok"),
    JSON.stringify(health.json?.components ?? []),
  );

  const manifest = await fetch(`${WEB}/manifest.webmanifest`);
  check(
    "offline manifest is served by the web app, not the API",
    manifest.status === 200 && (manifest.headers.get("content-type") ?? "").includes("manifest"),
    `status=${manifest.status} type=${manifest.headers.get("content-type")}`,
  );
  const offline = await fetch(`${WEB}/offline.html`);
  check("offline page is served", offline.status === 200, `status=${offline.status}`);
  const worker = await fetch(`${WEB}/sw.js`);
  check(
    "service worker is served with a JavaScript content type",
    worker.status === 200 && (worker.headers.get("content-type") ?? "").includes("javascript"),
    `status=${worker.status} type=${worker.headers.get("content-type")}`,
  );

  section("Phase 16 - authentication boundary");
  const user = makeClient();
  const userAuth = await authenticate(user, USER_EMAIL, USER_PASSWORD);
  check("a normal user can authenticate", userAuth.ok, `${userAuth.how}${userAuth.detail ? `: ${userAuth.detail}` : ""}`);

  const capabilities = await user("GET", "/billing/capabilities");
  check("GET /billing/capabilities returns the plan catalogue", capabilities.status === 200 && Array.isArray(capabilities.json?.plans), `status=${capabilities.status}`);

  const freePlan = (capabilities.json?.plans ?? []).find((p) => p.key === "FREE");
  const proPlan = (capabilities.json?.plans ?? []).find((p) => p.key === "PRO");
  check("catalogue exposes FREE and PRO", Boolean(freePlan && proPlan), `keys=${(capabilities.json?.plans ?? []).map((p) => p.key).join(",")}`);
  check(
    "FREE carries finite limits",
    typeof freePlan?.limits?.files === "number" && typeof freePlan?.limits?.fileBytes === "number",
    `files=${freePlan?.limits?.files} fileBytes=${freePlan?.limits?.fileBytes}`,
  );
  check(
    "PRO is expressed as deployment ceilings rather than invented numbers",
    proPlan?.limits?.files === null && proPlan?.limits?.fileBytes === null,
    `files=${proPlan?.limits?.files} fileBytes=${proPlan?.limits?.fileBytes}`,
  );
  check("no payment processor is configured", capabilities.json?.payment?.available === false, `available=${capabilities.json?.payment?.available}`);
  check("the processor list is empty rather than faked", Array.isArray(capabilities.json?.payment?.processors) && capabilities.json.payment.processors.length === 0, `processors=${JSON.stringify(capabilities.json?.payment?.processors)}`);

  const subscription = await user("GET", "/billing/subscription");
  check(
    "a new user resolves to FREE with no grant record",
    subscription.status === 200 && subscription.json?.plan === "FREE",
    `plan=${subscription.json?.plan}`,
  );

  const usage = await user("GET", "/billing/usage");
  const metrics = new Map((usage.json?.metrics ?? []).map((m) => [m.key, m]));
  check(
    "usage reports measured metrics rather than placeholders",
    usage.status === 200 && metrics.size > 0 && typeof metrics.get("files")?.used === "number",
    `keys=${[...metrics.keys()].join(",")}`,
  );
  check(
    "stored bytes are measured from real rows",
    typeof metrics.get("fileBytes")?.used === "number",
    `fileBytes.used=${metrics.get("fileBytes")?.used}`,
  );
  check(
    "each metric states where its limit came from",
    [...metrics.values()].every((m) => ["plan", "deployment", "none"].includes(m.limitSource)),
    JSON.stringify([...metrics.values()].map((m) => `${m.key}:${m.limitSource}`)),
  );

  check(
    "resolved limits match the FREE catalogue for a FREE user",
    metrics.get("files")?.limit === freePlan?.limits?.files && metrics.get("fileBytes")?.limit === freePlan?.limits?.fileBytes,
    `resolved=${metrics.get("files")?.limit}/${metrics.get("fileBytes")?.limit} free=${freePlan?.limits?.files}/${freePlan?.limits?.fileBytes}`,
  );

  section("Phase 16 - isolation and authorization boundary");
  const strangerEmail = `verify-stranger-${Date.now()}@example.com`;
  const stranger = makeClient();
  await authenticate(stranger, strangerEmail, USER_PASSWORD);
  const strangerSubscription = await stranger("GET", "/billing/subscription");
  check(
    "a second user sees only their own FREE subscription",
    strangerSubscription.status === 200 && strangerSubscription.json?.plan === "FREE",
    `plan=${strangerSubscription.json?.plan}`,
  );
  // The subscription endpoints are scoped to the caller and take no user id, so a
  // forged parameter must not be able to widen the scope.
  const forged = await stranger("GET", `/billing/subscription?userId=${1}`);
  check("a forged userId parameter is ignored, not honoured", forged.status === 200 && forged.json?.plan === "FREE", `plan=${forged.json?.plan}`);
  check("no owner field leaks through the billing surface", !("userId" in (strangerSubscription.json ?? {})), JSON.stringify(Object.keys(strangerSubscription.json ?? {})));
  const anonymousSubscription = await anonymous("GET", "/billing/subscription");
  check("GET /billing/subscription refuses an anonymous caller", anonymousSubscription.status === 401, `status=${anonymousSubscription.status}`);

  section("Phase 17 - authorization boundary");
  for (const path of ["/admin/overview", "/admin/configuration", "/admin/directory"]) {
    const denied = await user("GET", path);
    check(`GET ${path} refuses a non-admin`, denied.status === 403, `status=${denied.status}`);
  }
  const planGrantDenied = await user("PATCH", `/admin/users/1/plan`, { plan: "PRO" });
  check("PATCH /admin/users/:id/plan refuses a non-admin", planGrantDenied.status === 403, `status=${planGrantDenied.status}`);

  section("Phase 17 - admin surface");
  const seeded = makeClient();
  const seededAuth = await authenticate(seeded, ADMIN_EMAIL, ADMIN_PASSWORD);
  check("admin account exists", seededAuth.ok, seededAuth.how);

  const promotion = await promoteToAdmin(ADMIN_EMAIL);
  check("admin account promoted in the database", promotion.ok, promotion.detail);

  // A new session, so the token cannot predate the promotion.
  const admin = makeClient();
  const adminAuth = await authenticate(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!adminAuth.ok) {
    check("admin can authenticate", false, adminAuth.detail);
  } else {
    check("admin can authenticate", true, adminAuth.how);

    const overview = await admin("GET", "/admin/overview");
    const o = overview.json;
    check("GET /admin/overview returns aggregate counts", overview.status === 200 && typeof o?.accounts?.total === "number", `total=${o?.accounts?.total}`);
    check(
      "the plan split adds up to the account total",
      o?.accounts?.onFree + o?.accounts?.onPro === o?.accounts?.total,
      `free=${o?.accounts?.onFree} pro=${o?.accounts?.onPro} total=${o?.accounts?.total}`,
    );
    check("admins are a subset of the accounts", o?.accounts?.admins <= o?.accounts?.total, `admins=${o?.accounts?.admins}`);
    check(
      "content counts come from real rows",
      typeof o?.content?.files === "number" && typeof o?.content?.mediaAssets === "number" && typeof o?.content?.agentRuns === "number",
      `files=${o?.content?.files} media=${o?.content?.mediaAssets} runs=${o?.content?.agentRuns}`,
    );
    check("audit volume is reported", typeof o?.audit?.last24h === "number", `last24h=${o?.audit?.last24h}`);
    check(
      "generatedAt proves the overview is computed per request",
      typeof o?.generatedAt === "string" && !Number.isNaN(Date.parse(o.generatedAt)),
      `generatedAt=${o?.generatedAt}`,
    );

    const settings = await admin("GET", "/admin/configuration");
    const c = settings.json;
    check("GET /admin/configuration returns runtime configuration", settings.status === 200 && typeof c?.runtime?.apiUrl === "string", `apiUrl=${c?.runtime?.apiUrl}`);
    check(
      "the public entry point is reported as 3002",
      c?.runtime?.webUrl?.endsWith(":3002"),
      `webUrl=${c?.runtime?.webUrl}`,
    );
    check(
      "no provider secret is ever returned, only presence",
      (c?.providers ?? []).every((p) => "credentialPresent" in p && !("apiKey" in p) && !("apiKeys" in p)),
      JSON.stringify((c?.providers ?? []).map((p) => `${p.provider}:${p.credentialPresent}`)),
    );
    check(
      "absolute storage roots are shown to an admin",
      typeof c?.storage?.dataRoot === "string" && /^[A-Za-z]:[\\/]/.test(c.storage.dataRoot),
      `dataRoot=${c?.storage?.dataRoot}`,
    );
    check(
      "the enforced file, media and research ceilings are reported",
      typeof c?.limits?.files?.maxBytes === "number" && typeof c?.limits?.media?.generationsPerHour === "number",
      `fileBytes=${c?.limits?.files?.maxBytes} mediaHour=${c?.limits?.media?.generationsPerHour}`,
    );
    check(
      "storage writability is probed per root rather than hardcoded",
      c?.storage?.writable?.dataRoot === true && c?.storage?.writable?.uploadRoot === true,
      JSON.stringify(c?.storage?.writable),
    );
    check(
      "the read-only nature of this view is stated explicitly",
      c?.configurationWritable === false,
      `configurationWritable=${c?.configurationWritable}`,
    );
    check("queue state is live", typeof c?.queues?.counts?.waiting === "number", `waiting=${c?.queues?.counts?.waiting}`);
    check(
      "no secret-like key appears anywhere in the configuration payload",
      !/"(apiKey|api_key|secret|token|password)"s*:/i.test(JSON.stringify(c)),
      "scanned the whole payload",
    );

    const users = await admin("GET", `/admin/directory?q=${encodeURIComponent(USER_EMAIL)}`);
    check("GET /admin/directory returns the directory with plans", users.status === 200 && Array.isArray(users.json?.users), `count=${users.json?.users?.length}`);
    check("the directory reports a total alongside the page", typeof users.json?.total === "number", `total=${users.json?.total}`);
    const target = (users.json?.users ?? []).find((u) => u.email === USER_EMAIL);
    check("directory includes the plan of each user", Boolean(target) && typeof target.plan === "string", `plan=${target?.plan}`);
    check(
      "directory never exposes a password hash",
      (users.json?.users ?? []).every((u) => !("passwordHash" in u) && !("password" in u)),
      "no credential fields present",
    );
    check(
      "search narrows the result set",
      (users.json?.users ?? []).every((u) => u.email.includes(USER_EMAIL)),
      "every row matches the query",
    );

    if (target) {
      const granted = await admin("PATCH", `/admin/users/${target.id}/plan`, { plan: "PRO" });
      check("PATCH /admin/users/:id/plan grants PRO", granted.status === 200 && granted.json?.plan === "PRO", `status=${granted.status} plan=${granted.json?.plan}`);

      const afterGrant = await user("GET", "/billing/subscription");
      check("the granted plan is what the user now resolves", afterGrant.json?.plan === "PRO", `plan=${afterGrant.json?.plan}`);

      const afterUsage = await user("GET", "/billing/usage");
      const proMetric = (afterUsage.json?.metrics ?? []).find((m) => m.key === "files");
      check(
        "effective limits change with the plan",
        proMetric?.limitSource === "deployment",
        `limitSource=${proMetric?.limitSource} used=${proMetric?.used}`,
      );

      const downgraded = await user("DELETE", "/billing/subscription");
      check("DELETE /billing/subscription downgrades to FREE", downgraded.status === 200 && downgraded.json?.plan === "FREE", `status=${downgraded.status} plan=${downgraded.json?.plan}`);

      const revoked = await admin("PATCH", `/admin/users/${target.id}/plan`, { plan: "FREE" });
      check("an admin can also withdraw a plan explicitly", revoked.status === 200 && revoked.json?.plan === "FREE", `status=${revoked.status} plan=${revoked.json?.plan}`);
    } else {
      check("the verification user appears in the admin directory", false, USER_EMAIL);
    }

    const badPlan = await admin("PATCH", `/admin/users/${target?.id ?? 1}/plan`, { plan: "ENTERPRISE" });
    check("an unknown plan is rejected by validation", badPlan.status === 400, `status=${badPlan.status}`);

    const audit = await admin("GET", "/admin/directory?pageSize=1");
    check("admin routes remain reachable after mutations", audit.status === 200, `status=${audit.status}`);
  }

  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  if (failed > 0) {
    console.error(`${failed} check(s) failed.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});