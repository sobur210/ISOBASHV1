#!/usr/bin/env node
/*
 * Finds gateway route collisions.
 *
 * `next.config.ts` forwards unmatched paths to the API with an `afterFiles`
 * rewrite. `afterFiles` is checked *after* the filesystem, so whenever a frontend
 * page and a backend controller route have the same path, the page wins and the
 * API is never reached. The frontend then gets HTML where it expected JSON, and
 * the panel fails at runtime with no compile-time warning.
 *
 * Nothing about that failure is obvious from either side, so this check runs in
 * `verify:routes` and compares both route tables directly.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FRONTEND_APP = "apps/frontend/app";
const BACKEND_SRC = "apps/backend/src";

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("@") || entry.name === "node_modules") continue;
      walk(path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

function pageRoutes() {
  const routes = new Map();
  for (const file of walk(FRONTEND_APP)) {
    if (!/(^|[\\/])page\.(tsx|jsx|js)$/.test(file)) continue;
    const relative = file.slice(FRONTEND_APP.length).replace(/[\\/]page\.(tsx|jsx|js)$/, "").replace(/\\/g, "/");
    const route = relative === "" ? "/" : relative;
    routes.set(route.replace(/\/$/, "") || "/", file);
  }
  return routes;
}

function apiRoutes() {
  const routes = new Map();
  for (const file of walk(BACKEND_SRC)) {
    if (!file.endsWith(".controller.ts")) continue;
    const source = readFileSync(file, "utf8");
    const controller = source.match(/@Controller\(\s*["'`]([^"'`]*)/)?.[1] ?? "";
    const className = source.match(/export class (\w+)/)?.[1] ?? "?";
    const base = controller.replace(/^\/+|\/+$/g, "");
    const decorator = /@(Get|Post|Put|Patch|Delete)\(\s*(?:["'`]([^"'`]*)|([A-Za-z]+)\s*\))/g;
    let match;
    while ((match = decorator.exec(source)) !== null) {
      const segment = match[2] !== undefined ? match[2] : (match[3] ?? "");
      const route = "/" + [base, segment].filter(Boolean).join("/").replace(/\/+$/, "");
      const normalized = route || "/";
      if (!routes.has(normalized)) routes.set(normalized, []);
      routes.get(normalized).push(`${className} (${file})`);
    }
  }
  return routes;
}

const pages = pageRoutes();
const api = apiRoutes();
const collisions = [];
for (const [route, owners] of api) {
  if (pages.has(route)) collisions.push({ route, page: pages.get(route), owners });
}

console.log(`frontend page routes: ${pages.size}, backend controller routes: ${api.size}`);
if (collisions.length === 0) {
  console.log("no page route shadows an API route");
} else {
  console.error(`\n${collisions.length} collision(s): the frontend page is served, the API is unreachable\n`);
  for (const { route, page, owners } of collisions.sort((a, b) => a.route.localeCompare(b.route))) {
    console.error(`  ${route}`);
    console.error(`    page: ${page}`);
    for (const owner of owners) console.error(`    api : ${owner}`);
  }
  process.exitCode = 1;
}