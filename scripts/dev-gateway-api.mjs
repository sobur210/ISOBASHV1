#!/usr/bin/env node
/**
 * ISOBASH gateway API runner (the API behind the public http://localhost:3002 entry).
 *
 * This is the same two-step watcher as `dev-backend.mjs` — `tsc --watch` then
 * `node --watch` on the compiled artifact — with one difference that matters on
 * this machine: it emits into `dist-gateway/`, never `dist/`.
 *
 * Why a separate output directory:
 *   - `apps/backend/dist/` is what the SYSTEM-owned supervisor executes for the
 *     long-running API on port 3001. `Access is denied` on taskkill means that
 *     process cannot be stopped or reloaded from a normal shell, so writing over
 *     `dist/` under a live process is the one way to break something the current
 *     owner of the machine did not ask to be broken.
 *   - The public entry on 3002 must run the *newest* backend code to be a truthful
 *     entry point. Pointing the Next.js gateway (`INTERNAL_API_URL`) at this
 *     instance is what makes the current work visible on 3002 alone.
 *   - Two output directories also mean a build failure here cannot leave the 3001
 *     process with a half-written `dist/`.
 *
 * Usage:
 *   node scripts/dev-gateway-api.mjs            # listens on 3006
 *   GATEWAY_API_PORT=3007 node scripts/dev-gateway-api.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const backendDir = join(repoRoot, 'apps', 'backend');
const outDir = join(backendDir, 'dist-gateway');
const entryFile = join(outDir, 'main.js');
const projectFile = join(backendDir, 'tsconfig.gateway.json');
const isWindows = process.platform === 'win32';
const port = Number(process.env.GATEWAY_API_PORT ?? 3006);

const children = new Set();
let shuttingDown = false;

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'inherit',
    shell: options.shell ?? false,
    windowsHide: true,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    console.error(`[gateway-api] ${options.label ?? command} exited (code=${code} signal=${signal}).`);
    if (options.fatal !== false) shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 300).unref();
}

function waitForEntry(timeoutMs = 180_000) {
  const startedAt = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    const tick = () => {
      if (existsSync(entryFile)) return resolvePromise();
      if (Date.now() - startedAt > timeoutMs) {
        return rejectPromise(new Error(`Timed out waiting for ${entryFile} to be compiled.`));
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}

function portFree(port) {
  return new Promise((resolvePromise) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(700);
    socket.on('connect', () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolvePromise(true);
    });
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  if (await existsSync(join(backendDir, 'tsconfig.gateway.json')) === false) {
    throw new Error('apps/backend/tsconfig.gateway.json is missing.');
  }
  rmSync(entryFile, { force: true });

  console.log(`[gateway-api] compiling to dist-gateway (tsc --watch ${projectFile})`);
  run(process.execPath, [join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '--watch', '-p', projectFile], {
    cwd: backendDir,
    label: 'tsc --watch',
  });

  await waitForEntry();
  if (!(await portFree(port))) {
    console.warn(`[gateway-api] port ${port} is already in use; the API below will fail to bind.`);
  }
  console.log(`[gateway-api] starting API on port ${port} (node --watch dist-gateway/main.js)`);
  // `--watch-path` is scoped to the emitted output on purpose. Node's default
  // watch set is every file it has required, which on Windows includes a large
  // slice of node_modules; anything that touches those (an install, another
  // toolchain run) restarts the API for no reason.
  run(process.execPath, ['--enable-source-maps', '--watch-path', outDir, entryFile], {
    cwd: backendDir,
    label: 'api',
    env: { ...process.env, PORT: String(port), ISOBASH_GATEWAY_API: 'true' },
  });
}

main().catch((error) => {
  console.error(`[gateway-api] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});