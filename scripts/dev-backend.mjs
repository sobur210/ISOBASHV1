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
 * Nest replaces compiled files during watch builds. Watching main.js directly
 * can restart Node while that file is briefly absent, so the API is started or
 * restarted only after Nest reports a successful completed build.
 */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const backendDir = join(repoRoot, 'apps', 'backend');
const entryFile = join(backendDir, 'dist', 'main.js');
const lockFile = join(repoRoot, '.dev-backend.lock');

const nestScript = join(repoRoot, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');

const children = new Set();
const expectedExits = new WeakSet();
let shuttingDown = false;
let apiChild;
let lockHandle;

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    shell: false,
    windowsHide: true,
  });
  children.add(child);
  if (options.captureOutput) {
    const handleOutput = (chunk) => {
      process.stdout.write(chunk);
      options.onOutput?.(chunk.toString());
    };
    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);
  }
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    if (expectedExits.has(child)) {
      expectedExits.delete(child);
      options.onExit?.(code, signal);
      return;
    }
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

async function isApiHealthy(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    if (!response.ok) return false;
    const health = await response.json();
    return health.service === 'isobash-api' && health.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function tryAcquireLock() {
  try {
    lockHandle = openSync(lockFile, 'wx');
    writeFileSync(lockHandle, `${process.pid}\n`);
    return { acquired: true };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  let existingPid;
  try {
    existingPid = Number(readFileSync(lockFile, 'utf8').trim());
  } catch (error) {
    if (error?.code === 'ENOENT') return tryAcquireLock();
    throw error;
  }
  if (processIsRunning(existingPid)) return { acquired: false, pid: existingPid };

  try {
    unlinkSync(lockFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return tryAcquireLock();
}

function releaseLock() {
  if (lockHandle === undefined) return;
  closeSync(lockHandle);
  lockHandle = undefined;
  try {
    if (Number(readFileSync(lockFile, 'utf8').trim()) === process.pid) unlinkSync(lockFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error(`[dev-backend] unable to remove ${lockFile}: ${error.message}`);
  }
}

function waitForShutdown() {
  setInterval(() => {}, 60_000);
  return new Promise(() => {});
}

process.on('exit', releaseLock);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  if (!existsSync(nestScript)) {
    throw new Error(`Nest CLI entry was not found at ${nestScript}. Run npm install from the repository root.`);
  }

  let reportedWaiting = false;
  while (!shuttingDown) {
    if (await isApiHealthy(3001)) {
      console.log('[dev-backend] healthy API already running on port 3001; reusing it.');
      return waitForShutdown();
    }

    const lock = tryAcquireLock();
    if (lock.acquired) break;
    if (!reportedWaiting) {
      console.log(`[dev-backend] another backend watcher (PID ${lock.pid}) is starting; waiting for it.`);
      reportedWaiting = true;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  if (shuttingDown) return;

  const startApi = () => {
    if (!existsSync(entryFile)) {
      console.error(`[dev-backend] Nest reported a successful build, but ${entryFile} is missing.`);
      shutdown(1);
      return;
    }
    const launch = async () => {
      if (shuttingDown) return;
      // Every rebuild lands here, so this is also the guard for the case where
      // the supervisor (or a second watcher) took the port over while this
      // watcher was compiling: spawning anyway produces `EADDRINUSE`, an exit
      // code 1, and the crash-restart storm that made the API flap offline.
      if (!(await portFree(3001))) {
        if (await isApiHealthy(3001)) {
          externalApiAlreadyRunning = true;
          console.warn('[dev-backend] a healthy API already owns port 3001; not starting a duplicate.');
          return;
        }
        console.error('[dev-backend] port 3001 is occupied by a service that failed the ISOBASH health check.');
        shutdown(1);
        return;
      }
      console.log('[dev-backend] starting API (node dist/main.js)');
      apiChild = run(process.execPath, ['--enable-source-maps', entryFile], {
        cwd: backendDir,
        label: 'api',
      });
    };
    if (apiChild) {
      const previousApi = apiChild;
      apiChild = undefined;
      expectedExits.add(previousApi);
      previousApi.once('exit', launch);
      previousApi.kill('SIGTERM');
      return;
    }
    launch();
  };

  let outputBuffer = '';
  let initialBuildStarted = false;
  let initialApiCheckPending = false;
  let externalApiAlreadyRunning = false;
  console.log('[dev-backend] starting TypeScript watcher (nest build --watch)');
  run(process.execPath, [nestScript, 'build', '--watch'], {
    cwd: backendDir,
    label: 'nest build --watch',
    captureOutput: true,
    onOutput(chunk) {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!/Found 0 errors?\. Watching for file changes\./i.test(line)) continue;
        if (!initialBuildStarted) {
          initialBuildStarted = true;
          initialApiCheckPending = true;
          portFree(3001).then(async (free) => {
            if (!free) {
              if (await isApiHealthy(3001)) {
                externalApiAlreadyRunning = true;
                console.warn('[dev-backend] healthy API already running on port 3001; not starting a duplicate.');
                return;
              }
              console.error('[dev-backend] port 3001 is occupied by a service that failed the ISOBASH health check.');
              shutdown(1);
              return;
            }
            startApi();
          }).finally(() => {
            initialApiCheckPending = false;
          });
        } else if (externalApiAlreadyRunning) {
          console.log('[dev-backend] leaving the existing API process running.');
        } else if (initialApiCheckPending) {
          continue;
        } else {
          startApi();
        }
      }
    },
  });
}

main().catch((error) => {
  console.error(`[dev-backend] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});
