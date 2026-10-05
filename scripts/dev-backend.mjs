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
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const backendDir = join(repoRoot, 'apps', 'backend');
const entryFile = join(backendDir, 'dist', 'main.js');

const nestScript = join(repoRoot, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');

const children = new Set();
const expectedExits = new WeakSet();
let shuttingDown = false;
let apiChild;

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

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  if (!existsSync(nestScript)) {
    throw new Error(`Nest CLI entry was not found at ${nestScript}. Run npm install from the repository root.`);
  }

  const startApi = () => {
    if (!existsSync(entryFile)) {
      console.error(`[dev-backend] Nest reported a successful build, but ${entryFile} is missing.`);
      shutdown(1);
      return;
    }
    const launch = () => {
      if (shuttingDown) return;
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
          portFree(3001).then((free) => {
            if (!free) {
              console.warn('[dev-backend] port 3001 is already in use; stop the duplicate backend process before restarting.');
            }
            startApi();
          });
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
