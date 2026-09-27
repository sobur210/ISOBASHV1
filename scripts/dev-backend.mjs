#!/usr/bin/env node
/**
 * ISOBASH backend development runner.
 *
 * Why this exists instead of `nest start --watch`:
 * @nestjs/cli 10.4 `StartAction.spawnChildProcess()` spawns the compiled entry
 * point WITHOUT the `.js` extension (`node dist/main`). Node never resolves
 * extensionless CommonJS paths, so the API dies immediately with
 * `Error: Cannot find module '<repo>\\apps\\backend\\dist\\main'`.
 * That is what made the backend "unreachable".
 *
 * This runner does the deterministic equivalent:
 *   1. `nest build --watch`  -> recompiles on change
 *   2. `node --watch dist/main.js` -> runs the real compiled artifact
 * Both children are torn down together, and the API is (re)started only after
 * the entry file actually exists on disk.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const backendDir = join(repoRoot, 'apps', 'backend');
const entryFile = join(backendDir, 'dist', 'main.js');
const isWindows = process.platform === 'win32';

const bin = (name) => (isWindows ? `${name}.cmd` : name);
const nestBin = join(repoRoot, 'node_modules', '.bin', bin('nest'));

const children = new Set();
let shuttingDown = false;

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'inherit',
    shell: isWindows,
    windowsHide: true,
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    console.error(`[dev-backend] ${options.label ?? command} exited (code=${code} signal=${signal}).`);
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
    const free = () => {
      socket.destroy();
      resolvePromise(true);
    };
    socket.on('error', free);
    socket.on('timeout', free);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  const nestCommand = existsSync(nestBin) ? nestBin : bin('nest');
  console.log('[dev-backend] starting TypeScript watcher (nest build --watch)');
  run(nestCommand, ['build', '--watch'], { cwd: backendDir, label: 'nest build --watch' });

  await waitForEntry();
  if (!(await portFree(3001))) {
    console.warn('[dev-backend] port 3001 is already in use; run `npm run clean:dev` if startup fails.');
  }
  console.log('[dev-backend] starting API (node --watch dist/main.js)');
  run(process.execPath, ['--enable-source-maps', '--watch', entryFile], { cwd: backendDir, label: 'api' });
}

main().catch((error) => {
  console.error(`[dev-backend] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});
