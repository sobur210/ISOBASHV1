#!/usr/bin/env node
/**
 * ISOBASH local service supervisor.
 *
 * Problem it solves: the ISOBASH stack (API, worker, web) used to be started by
 * hand and died silently. Two real failure modes made the API "unreachable":
 *   1. `nest start --watch` spawns the compiled entry without the `.js` extension
 *      -> `Cannot find module '<repo>\\apps\\backend\\dist\\main'`.
 *   2. Nest init hooks awaited Redis/PostgreSQL forever -> the HTTP port was
 *      never bound and nothing was logged.
 *
 * This supervisor is the single always-on entry point. It:
 *   - takes a single-instance lock so two copies can never fight over the ports
 *   - clears stale listeners on the app ports before binding
 *   - ensures infrastructure is up (PostgreSQL service, Redis, Ollama)
 *   - builds backend/worker/web artifacts when they are missing
 *   - runs API + worker + web as supervised child processes
 *   - health-probes each service and restarts it when it dies or stops answering
 *   - writes a machine-readable status file and rotating logs outside the repo
 *
 * Windows auto-start is wired through `install`, which registers a Scheduled Task
 * (AtStartup + AtLogOn) that runs `service.mjs start` hidden, so the API is back
 * by itself after a reboot with nobody logged in.
 *
 * Usage: node scripts/service.mjs <doctor|start|stop|restart|status|logs|rebuild|install|uninstall>
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const IS_WINDOWS = process.platform === 'win32';
const LOG_MAX_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function loadEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileEnv = loadEnvFile(join(REPO_ROOT, '.env'));
const env = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;
const envBool = (key, fallback) => {
  const raw = env(key, undefined);
  if (raw === undefined) return fallback;
  return String(raw).toLowerCase() === 'true';
};
const envNumber = (key, fallback) => {
  const raw = Number(env(key, undefined));
  return Number.isFinite(raw) ? raw : fallback;
};

const DATA_ROOT = env('DATA_ROOT', join(REPO_ROOT, '..', 'ISOBASH-DATA'));
const LOGS_ROOT = env('LOGS_ROOT', join(DATA_ROOT, 'logs'));
const RUN_ROOT = env('SERVICE_RUN_ROOT', join(DATA_ROOT, 'run'));
const SERVICE_LOG_DIR = join(LOGS_ROOT, 'service');
const LOCK_FILE = join(RUN_ROOT, 'supervisor.lock');
const STATUS_FILE = join(RUN_ROOT, 'service-status.json');
const SUPERVISOR_LOG = join(SERVICE_LOG_DIR, 'supervisor.log');

const API_PORT = envNumber('PORT', 3001);
const WEB_PORT = envNumber('WEB_PORT', 3000);
const DATABASE_URL = env('DATABASE_URL', '');
const REDIS_URL = env('REDIS_URL', 'redis://127.0.0.1:6379');
const OLLAMA_BASE_URL = env('OLLAMA_BASE_URL', 'http://127.0.0.1:11434');

const HEALTH_INTERVAL_MS = envNumber('SERVICE_HEALTH_INTERVAL_MS', 15_000);
const PROBE_TIMEOUT_MS = envNumber('SERVICE_PROBE_TIMEOUT_MS', 6_000);
const PROBE_FAILURE_THRESHOLD = envNumber('SERVICE_PROBE_FAILURE_THRESHOLD', 3);
const RESTART_BACKOFF_MAX_MS = envNumber('SERVICE_RESTART_BACKOFF_MAX_MS', 30_000);
const STABLE_UPTIME_MS = envNumber('SERVICE_STABLE_UPTIME_MS', 120_000);
const KILL_STALE = envBool('SERVICE_KILL_STALE', true);
const AUTOBUILD = envBool('SERVICE_AUTOBUILD', true);
const WEB_MODE = env('SERVICE_WEB_MODE', 'production');
const MANAGE_INFRA = envBool('SERVICE_MANAGE_INFRA', true);
const MANAGE_OLLAMA = envBool('SERVICE_MANAGE_OLLAMA', true);
const REDIS_SERVER_PATH = env('REDIS_SERVER_PATH', '');
const REDIS_DATA_DIR = env('REDIS_DATA_DIR', 'C:/laragon/Isobash-Redis');
const OLLAMA_BIN = env('OLLAMA_BIN', '');
const OLLAMA_MODELS = env('OLLAMA_MODELS', '');
const TASK_NAME = env('SERVICE_TASK_NAME', 'ISOBASH-Service');

const APP_PORTS = [API_PORT, WEB_PORT];

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

for (const dir of [LOGS_ROOT, RUN_ROOT, SERVICE_LOG_DIR]) {
  mkdirSync(dir, { recursive: true });
}

function logLine(level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta } : {}),
  };
  const line = `${JSON.stringify(entry)}\n`;
  process.stdout.write(line);
  try {
    if (existsSync(SUPERVISOR_LOG) && statSync(SUPERVISOR_LOG).size > LOG_MAX_BYTES) {
      renameSync(SUPERVISOR_LOG, `${SUPERVISOR_LOG}.1`);
    }
    writeFileSync(SUPERVISOR_LOG, line, { flag: 'a' });
  } catch {
    // Logging must never take the supervisor down.
  }
}

const log = {
  info: (msg, meta) => logLine('info', msg, meta),
  warn: (msg, meta) => logLine('warn', msg, meta),
  error: (msg, meta) => logLine('error', msg, meta),
};

function rotateIfNeeded(path) {
  try {
    if (existsSync(path) && statSync(path).size > LOG_MAX_BYTES) renameSync(path, `${path}.1`);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Process / port helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isPortOpen(port, host = '127.0.0.1', timeout = 1_200) {
  return new Promise((resolvePromise) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function waitForPort(port, timeoutMs, host = '127.0.0.1', label = `port ${port}`) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port, host)) return true;
    await sleep(500);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.`);
}

function parseEndpoint(url, fallbackPort) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: Number(parsed.port || fallbackPort) };
  } catch {
    return { host: '127.0.0.1', port: fallbackPort };
  }
}

function pidsOnPort(port) {
  if (!IS_WINDOWS) return [];
  const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return [];
  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!new RegExp(`:${port}\\s`).test(line) || !/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

function killTree(pid, { force = true } = {}) {
  if (!pid) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', [force ? '/F' : '/T', '/PID', String(pid), ...(force ? ['/T'] : [])], {
      stdio: 'ignore',
    });
    return;
  }
  try {
    process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    /* already gone */
  }
}

function processAlive(pid) {
  if (!pid) return false;
  if (!IS_WINDOWS) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  const result = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
  return result.status === 0 && Boolean(result.stdout) && result.stdout.includes(String(pid));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.stdio ?? 'inherit',
      shell: IS_WINDOWS,
      windowsHide: true,
    });
    if (options.stdio === 'pipe') {
      let out = '';
      child.stdout?.on('data', (chunk) => {
        out += chunk.toString();
      });
      child.on('close', (code) => resolvePromise({ code, out }));
      return;
    }
    child.on('close', (code) => resolvePromise({ code }));
  });
}

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------

function readLock() {
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function acquireLock() {
  const existing = readLock();
  if (existing && processAlive(existing.pid)) {
    return { ok: false, pid: existing.pid };
  }
  writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
  return { ok: true };
}

function releaseLock() {
  const existing = readLock();
  if (existing && existing.pid === process.pid) {
    try {
      rmSync(LOCK_FILE, { force: true });
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

function findRedisServer() {
  if (REDIS_SERVER_PATH && existsSync(REDIS_SERVER_PATH)) return REDIS_SERVER_PATH;
  const candidates = [
    'C:/laragon/bin/redis/redis-x64-5.0.14.1/redis-server.exe',
    'C:/laragon/bin/redis/redis-x64-5.0.9.1/redis-server.exe',
    'C:/Program Files/Redis/redis-server.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
}

function findOllama() {
  if (OLLAMA_BIN && existsSync(OLLAMA_BIN)) return OLLAMA_BIN;
  const candidates = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe') : '',
    'C:/Program Files/Ollama/ollama.exe',
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? '';
}

/**
 * Resolve the directory holding the pulled Ollama models.
 *
 * The scheduled task runs as SYSTEM, whose `%USERPROFILE%` is
 * `C:\Windows\System32\config\systemprofile` and therefore has no `.ollama`
 * folder. Without an explicit OLLAMA_MODELS the server would start with an empty
 * model directory and every local request would fail with "model not found".
 * We honour OLLAMA_MODELS, then the current profile, then any other user profile
 * that actually has models on disk.
 */
function findOllamaModels() {
  if (OLLAMA_MODELS && existsSync(OLLAMA_MODELS)) return OLLAMA_MODELS;
  const candidates = [];
  if (process.env.USERPROFILE) candidates.push(join(process.env.USERPROFILE, '.ollama', 'models'));
  const usersDir = 'C:/Users';
  try {
    for (const entry of readDirSafe(usersDir)) {
      if (entry === 'Public' || entry === 'Default' || entry.startsWith('.')) continue;
      candidates.push(join(usersDir, entry, '.ollama', 'models'));
    }
  } catch {
    /* ignore */
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
}

async function ensurePostgres() {
  if (!DATABASE_URL) return;
  const { host, port } = parseEndpoint(DATABASE_URL, 5432);
  if (await isPortOpen(port, host === 'localhost' ? '127.0.0.1' : host)) return;
  log.warn('PostgreSQL is not accepting connections; attempting to start the Windows service.');
  if (!IS_WINDOWS) {
    log.error('PostgreSQL is down and service management is only implemented for Windows.');
    return;
  }
  const services = spawnSync('sc', ['query', 'state=', 'all'], { encoding: 'utf8' });
  const match = (services.stdout ?? '').match(/SERVICE_NAME:\s*(postgresql[\w-]*)/i);
  if (!match) {
    log.error('No PostgreSQL Windows service found. Start PostgreSQL manually, then run `npm run service:start`.');
    return;
  }
  spawnSync('sc', ['start', match[1]], { stdio: 'ignore' });
  try {
    await waitForPort(port, 60_000, host === 'localhost' ? '127.0.0.1' : host, 'PostgreSQL');
    log.info('PostgreSQL started.');
  } catch (error) {
    log.error(`PostgreSQL did not come up: ${error.message}`);
  }
}

async function ensureRedis() {
  const { host, port } = parseEndpoint(REDIS_URL, 6379);
  if (await isPortOpen(port, host)) return;
  const binary = findRedisServer();
  if (!binary) {
    log.error(`Redis is not running on ${port} and no redis-server binary was found. Set REDIS_SERVER_PATH in .env.`);
    return;
  }
  mkdirSync(REDIS_DATA_DIR, { recursive: true });
  const logPath = join(SERVICE_LOG_DIR, 'redis.log');
  rotateIfNeeded(logPath);
  const out = openSync(logPath, 'a');
  const child = spawn(binary, ['--port', String(port), '--bind', '127.0.0.1', '--dir', REDIS_DATA_DIR], {
    cwd: REPO_ROOT,
    stdio: ['ignore', out, out],
    detached: true,
    windowsHide: true,
  });
  child.unref();
  try {
    await waitForPort(port, 30_000, host, 'Redis');
    log.info('Redis started.', { pid: child.pid, port });
  } catch (error) {
    log.error(`Redis did not come up: ${error.message}`);
  }
}

async function ensureOllama() {
  const { host, port } = parseEndpoint(OLLAMA_BASE_URL, 11434);
  if (await isPortOpen(port, host)) return;
  if (!MANAGE_OLLAMA) {
    log.warn(`Ollama is not running on ${port} and SERVICE_MANAGE_OLLAMA=false.`);
    return;
  }
  const binary = findOllama();
  if (!binary) {
    log.warn('Ollama is not running and no ollama.exe was found. Local AI will report as offline (honest failure).');
    return;
  }
  const logPath = join(SERVICE_LOG_DIR, 'ollama.log');
  rotateIfNeeded(logPath);
  const out = openSync(logPath, 'a');
  const childEnv = {};
  const modelsDir = findOllamaModels();
  if (modelsDir) childEnv.OLLAMA_MODELS = modelsDir;
  const child = spawn(binary, ['serve'], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...childEnv },
    stdio: ['ignore', out, out],
    detached: true,
    windowsHide: true,
  });
  child.unref();
  try {
    await waitForPort(port, 45_000, host, 'Ollama');
    log.info('Ollama started.', { pid: child.pid, port, models: modelsDir || 'default' });
  } catch (error) {
    log.error(`Ollama did not come up: ${error.message}`);
  }
}

async function ensureInfrastructure() {
  if (!MANAGE_INFRA) {
    log.info('SERVICE_MANAGE_INFRA=false; skipping infrastructure management.');
    return;
  }
  await ensurePostgres();
  await ensureRedis();
  await ensureOllama();
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

const BACKEND_ENTRY = join(REPO_ROOT, 'apps', 'backend', 'dist', 'main.js');
const WORKER_ENTRY = join(REPO_ROOT, 'apps', 'worker', 'dist', 'main.js');
const WEB_BUILD_ID = join(REPO_ROOT, 'apps', 'frontend', '.next', 'BUILD_ID');

function newestMtime(dir) {
  let newest = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readDirSafe(current)) {
      const full = join(current, entry);
      const stat = statSafe(full);
      if (!stat) continue;
      if (stat.isDirectory()) stack.push(full);
      else newest = Math.max(newest, stat.mtimeMs);
    }
  }
  return newest;
}

function readDirSafe(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function statSafe(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function isStale(sourceDir, artifact) {
  const artifactStat = statSafe(artifact);
  if (!artifactStat) return true;
  return newestMtime(sourceDir) > artifactStat.mtimeMs;
}

/** Resolve `npm` without a shell so child args are never concatenated into a command line. */
function npmCommand() {
  if (!IS_WINDOWS) return 'npm';
  const candidate = join(dirname(process.execPath), 'npm.cmd');
  return existsSync(candidate) ? candidate : 'npm';
}

async function ensureArtifacts({ force = false } = {}) {
  const npm = npmCommand();
  const tasks = [];
  if (force || isStale(join(REPO_ROOT, 'apps', 'backend', 'src'), BACKEND_ENTRY)) {
    tasks.push({ name: 'backend', args: ['run', 'build:backend'] });
  }
  if (force || isStale(join(REPO_ROOT, 'apps', 'worker', 'src'), WORKER_ENTRY)) {
    tasks.push({ name: 'worker', args: ['run', 'build:worker'] });
  }
  if (WEB_MODE === 'production' && (force || !existsSync(WEB_BUILD_ID))) {
    tasks.push({ name: 'frontend', args: ['run', 'build:frontend'] });
  }
  if (!tasks.length) {
    log.info('Build artifacts are present and up to date.');
    return true;
  }
  if (!force && !AUTOBUILD) {
    log.error(`Missing or stale artifacts (${tasks.map((t) => t.name).join(', ')}) and SERVICE_AUTOBUILD=false.`);
    return false;
  }
  for (const task of tasks) {
    log.info(`Building ${task.name}...`);
    const { code } = await runCommand(npm, task.args, { stdio: 'inherit' });
    if (code !== 0) {
      log.error(`Build failed for ${task.name} (exit ${code}).`);
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Supervised services
// ---------------------------------------------------------------------------

const nextBin = () => {
  const candidates = [
    join(REPO_ROOT, 'apps', 'frontend', 'node_modules', 'next', 'dist', 'bin', 'next'),
    join(REPO_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? 'next';
};

function serviceDefinitions() {
  return [
    {
      name: 'api',
      description: 'ISOBASH NestJS API',
      command: process.execPath,
      args: ['--enable-source-maps', BACKEND_ENTRY],
      cwd: REPO_ROOT,
      env: {},
      probe: { url: `http://127.0.0.1:${API_PORT}/health`, expect: [200] },
      critical: true,
    },
    {
      name: 'worker',
      description: 'ISOBASH BullMQ worker',
      command: process.execPath,
      args: [WORKER_ENTRY],
      cwd: REPO_ROOT,
      env: {},
      probe: null,
      critical: false,
    },
    {
      name: 'web',
      description: 'ISOBASH Next.js web',
      command: process.execPath,
      args:
        WEB_MODE === 'development'
          ? [nextBin(), 'dev', '--port', String(WEB_PORT)]
          : [nextBin(), 'start', '--port', String(WEB_PORT)],
      cwd: join(REPO_ROOT, 'apps', 'frontend'),
      env: WEB_MODE === 'development' ? { NODE_ENV: 'development' } : { NODE_ENV: 'production' },
      probe: { url: `http://127.0.0.1:${WEB_PORT}/`, expect: [200, 307, 302] },
      critical: true,
    },
  ];
}

class ManagedService {
  constructor(definition) {
    this.definition = definition;
    this.child = null;
    this.state = 'stopped';
    this.restarts = 0;
    this.lastError = null;
    this.startedAt = null;
    this.consecutiveProbeFailures = 0;
    this.lastProbeAt = null;
    this.lastProbeOk = null;
    this.nextStartAt = 0;
    this.logFd = null;
  }

  get name() {
    return this.definition.name;
  }

  logFile() {
    return join(SERVICE_LOG_DIR, `${this.name}.log`);
  }

  start() {
    if (this.child) return;
    if (Date.now() < this.nextStartAt) return;
    const logPath = this.logFile();
    rotateIfNeeded(logPath);
    // A real file descriptor is required: createWriteStream has `fd: null` until
    // its async open completes, which spawn() rejects as an invalid stdio value.
    const fd = openSync(logPath, 'a');
    this.logFd = fd;
    writeSync(fd, `\n=== start ${new Date().toISOString()} (${this.definition.description}) ===\n`);
    const child = spawn(this.definition.command, this.definition.args, {
      cwd: this.definition.cwd,
      env: { ...process.env, ...this.definition.env },
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    });
    this.child = child;
    this.state = 'running';
    this.startedAt = Date.now();
    this.consecutiveProbeFailures = 0;
    log.info(`Started ${this.name}.`, { pid: child.pid, log: logPath });

    child.on('exit', (code, signal) => {
      this.child = null;
      this.closeLog();
      this.state = 'crashed';
      this.lastError = `exited code=${code} signal=${signal ?? 'none'}`;
      log.error(`${this.name} ${this.lastError}.`, { log: logPath });
      this.scheduleRestart();
    });
    child.on('error', (error) => {
      this.child = null;
      this.closeLog();
      this.state = 'crashed';
      this.lastError = error.message;
      log.error(`${this.name} failed to spawn: ${error.message}`);
      this.scheduleRestart();
    });
  }

  closeLog() {
    if (this.logFd === null) return;
    try {
      closeSync(this.logFd);
    } catch {
      /* already closed */
    }
    this.logFd = null;
  }

  scheduleRestart() {
    if (this.stopping) return;
    const uptime = this.startedAt ? Date.now() - this.startedAt : 0;
    if (uptime > STABLE_UPTIME_MS) this.restarts = 0;
    this.restarts += 1;
    const backoff = Math.min(1000 * 2 ** (this.restarts - 1), RESTART_BACKOFF_MAX_MS);
    this.nextStartAt = Date.now() + backoff;
    log.warn(`Restarting ${this.name} in ${backoff}ms (restart #${this.restarts}).`);
    setTimeout(() => this.start(), backoff).unref?.();
  }

  async probe() {
    if (!this.definition.probe) return;
    if (!this.child) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(this.definition.probe.url, { signal: controller.signal, redirect: 'manual' });
      const ok = this.definition.probe.expect.includes(response.status);
      this.lastProbeAt = new Date().toISOString();
      this.lastProbeOk = ok;
      if (ok) {
        if (this.consecutiveProbeFailures > 0) log.info(`${this.name} recovered.`);
        this.consecutiveProbeFailures = 0;
        if (this.state !== 'running') this.state = 'running';
      } else {
        this.consecutiveProbeFailures += 1;
        log.warn(`${this.name} probe returned HTTP ${response.status} (${this.definition.probe.url}).`);
      }
    } catch (error) {
      this.lastProbeAt = new Date().toISOString();
      this.lastProbeOk = false;
      this.consecutiveProbeFailures += 1;
      log.warn(`${this.name} probe failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
    if (this.consecutiveProbeFailures >= PROBE_FAILURE_THRESHOLD) {
      this.lastError = `failed ${PROBE_FAILURE_THRESHOLD} consecutive health probes`;
      log.error(`${this.name} ${this.lastError}; restarting the process.`);
      this.restarts = 0;
      this.stopChild();
      this.state = 'unhealthy';
      this.scheduleRestart();
    }
  }

  stopChild() {
    if (!this.child) return;
    const pid = this.child.pid;
    try {
      this.child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    if (IS_WINDOWS) killTree(pid);
    this.child = null;
    this.closeLog();
  }

  snapshot() {
    return {
      name: this.name,
      description: this.definition.description,
      state: this.state,
      pid: this.child?.pid ?? null,
      restarts: this.restarts,
      uptimeMs: this.startedAt && this.child ? Date.now() - this.startedAt : 0,
      lastProbeAt: this.lastProbeAt,
      lastProbeOk: this.lastProbeOk,
      lastError: this.lastError,
      log: this.logFile(),
    };
  }
}

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

let services = [];
let shuttingDown = false;
let statusTimer = null;
let healthTimer = null;

function writeStatus(extra = {}) {
  const payload = {
    service: 'isobash-service-supervisor',
    pid: process.pid,
    updatedAt: new Date().toISOString(),
    mode: { web: WEB_MODE, autostartManaged: MANAGE_INFRA },
    endpoints: {
      web: `http://localhost:${WEB_PORT}`,
      api: `http://localhost:${API_PORT}`,
    },
    services: services.map((service) => service.snapshot()),
    ...extra,
  };
  try {
    writeFileSync(STATUS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    log.error(`Unable to write status file: ${error.message}`);
  }
}

async function runSupervisor() {
  const lock = acquireLock();
  if (!lock.ok) {
    log.error(`Another ISOBASH supervisor is already running (pid ${lock.pid}). Nothing to do.`);
    process.exit(0);
  }
  log.info('ISOBASH service supervisor starting.', { pid: process.pid, repoRoot: REPO_ROOT });

  if (KILL_STALE) {
    for (const port of APP_PORTS) {
      for (const pid of pidsOnPort(port)) {
        if (pid === process.pid) continue;
        log.warn(`Port ${port} is held by pid ${pid}; stopping it so ISOBASH can bind.`);
        killTree(pid);
      }
    }
    await sleep(1_000);
  }

  await ensureInfrastructure();

  if (!(await ensureArtifacts())) {
    log.error('Artifacts are unavailable; retrying in 60s.');
    setTimeout(() => runCommand(process.execPath, [join(SCRIPT_DIR, 'service.mjs'), 'start']), 60_000).unref?.();
  }

  services = serviceDefinitions().map((definition) => new ManagedService(definition));
  for (const service of services) service.start();

  healthTimer = setInterval(() => {
    for (const service of services) service.probe().catch(() => undefined);
  }, HEALTH_INTERVAL_MS);
  healthTimer.unref?.();

  statusTimer = setInterval(() => writeStatus(), 10_000);
  writeStatus({ state: 'running' });
  log.info('ISOBASH services launched.', {
    web: `http://localhost:${WEB_PORT}`,
    api: `http://localhost:${API_PORT}`,
  });

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal}; stopping ISOBASH services.`);
    clearInterval(healthTimer);
    clearInterval(statusTimer);
    for (const service of services) {
      service.stopping = true;
      service.stopChild();
    }
    writeStatus({ state: 'stopped' });
    releaseLock();
    await sleep(500);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    log.error(`Supervisor uncaught exception: ${error.stack ?? error.message}`);
  });
  process.on('unhandledRejection', (reason) => {
    log.error(`Supervisor unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function readStatus() {
  try {
    return JSON.parse(readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function supervisorPid() {
  const lock = readLock();
  return lock && processAlive(lock.pid) ? lock.pid : null;
}

async function cmdStart() {
  await runSupervisor();
}

async function cmdStop() {
  const pid = supervisorPid();
  let stopped = true;
  if (!pid) {
    log.info('No running ISOBASH supervisor found.');
  } else {
    log.info(`Stopping supervisor pid ${pid}.`);
    // /F is required: a detached node process has no window to close, so a
    // graceful taskkill silently does nothing and the supervisor survives.
    if (IS_WINDOWS) spawnSync('taskkill', ['/F', '/PID', String(pid), '/T'], { stdio: 'ignore' });
    else process.kill(pid, 'SIGTERM');
    for (let i = 0; i < 20 && processAlive(pid); i += 1) await sleep(250);
    stopped = !processAlive(pid);
    if (!stopped) {
      log.error(
        `Could not stop supervisor pid ${pid}. It is most likely running as SYSTEM from the ` +
          '"ISOBASH-Service" scheduled task. Re-run this command from an elevated PowerShell ' +
          '(or run: Start-ScheduledTask to hand control back to the task).',
      );
    }
  }
  // Always clear stale app-port listeners, otherwise the next start cannot bind.
  for (const port of APP_PORTS) {
    for (const stalePid of pidsOnPort(port)) {
      log.warn(`Stopping stale listener pid ${stalePid} on port ${port}.`);
      killTree(stalePid);
    }
  }
  try {
    rmSync(STATUS_FILE, { force: true });
  } catch {
    /* ignore */
  }
  log.info(stopped ? 'ISOBASH services stopped.' : 'ISOBASH services partially stopped (see errors above).');
  if (!stopped) process.exitCode = 1;
}

async function cmdStatus() {
  const status = readStatus();
  const pid = supervisorPid();
  if (!pid) {
    log.info('Supervisor: NOT running.');
  } else {
    log.info(`Supervisor: running (pid ${pid}).`);
  }
  const ports = {};
  for (const port of [...APP_PORTS, parseEndpoint(DATABASE_URL, 5432).port, parseEndpoint(REDIS_URL, 6379).port]) {
    ports[port] = (await isPortOpen(port)) ? 'open' : 'closed';
  }
  log.info('Ports:', ports);
  if (status) {
    for (const service of status.services ?? []) {
      log.info(`  ${service.name.padEnd(7)} ${String(service.state).padEnd(10)} pid=${service.pid ?? '-'} restarts=${service.restarts} probe=${service.lastProbeOk ?? 'n/a'} ${service.lastError ?? ''}`);
    }
    log.info(`Status file: ${STATUS_FILE}`);
  }
  if (!pid) process.exitCode = 1;
}

async function cmdDoctor() {
  log.info('ISOBASH doctor');
  const checks = [];
  const apiEntry = existsSync(BACKEND_ENTRY);
  const workerEntry = existsSync(WORKER_ENTRY);
  const webBuild = existsSync(WEB_BUILD_ID);
  checks.push(['backend artifact', apiEntry, BACKEND_ENTRY]);
  checks.push(['worker artifact', workerEntry, WORKER_ENTRY]);
  checks.push(['web build', webBuild, WEB_BUILD_ID]);
  const db = parseEndpoint(DATABASE_URL, 5432);
  const redis = parseEndpoint(REDIS_URL, 6379);
  const ollama = parseEndpoint(OLLAMA_BASE_URL, 11434);
  checks.push(['postgres', await isPortOpen(db.port, db.host), `${db.host}:${db.port}`]);
  checks.push(['redis', await isPortOpen(redis.port, redis.host), `${redis.host}:${redis.port}`]);
  checks.push(['ollama', await isPortOpen(ollama.port, ollama.host), `${ollama.host}:${ollama.port}`]);
  checks.push(['web port', await isPortOpen(WEB_PORT), String(WEB_PORT)]);
  checks.push(['api port', await isPortOpen(API_PORT), String(API_PORT)]);
  const redisBinary = findRedisServer();
  checks.push(['redis-server binary', Boolean(redisBinary), redisBinary || 'not found (set REDIS_SERVER_PATH)']);
  const ollamaBinary = findOllama();
  checks.push(['ollama binary', Boolean(ollamaBinary), ollamaBinary || 'not found']);
  for (const [name, ok, detail] of checks) {
    log.info(`  ${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(22)} ${detail}`);
  }
  const apiHealth = await fetch(`http://127.0.0.1:${API_PORT}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    .then((r) => (r.ok ? `HTTP ${r.status}` : `HTTP ${r.status}`))
    .catch((error) => `unreachable (${error.message})`);
  log.info(`  API /health: ${apiHealth}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}

async function cmdRebuild() {
  log.info('Rebuilding all artifacts...');
  await cmdStop();
  const ok = await ensureArtifacts({ force: true });
  if (!ok) {
    log.error('Rebuild failed.');
    process.exitCode = 1;
    return;
  }
  log.info('Rebuild complete. Run `npm run service:start` (or wait for the scheduled task) to relaunch.');
}

async function cmdLogs() {
  const tail = (path, lines = 40) => {
    try {
      const content = readFileSync(path, 'utf8').split(/\r?\n/);
      log.info(`--- ${path} (last ${lines} lines) ---`);
      for (const line of content.slice(-lines)) if (line.trim()) process.stdout.write(`${line}\n`);
    } catch (error) {
      log.warn(`Cannot read ${path}: ${error.message}`);
    }
  };
  tail(SUPERVISOR_LOG, 60);
  for (const name of ['api', 'worker', 'web']) tail(join(SERVICE_LOG_DIR, `${name}.log`), 25);
}

function cmdInstall() {
  const script = join(SCRIPT_DIR, 'win', 'install-autostart.ps1');
  if (!existsSync(script)) {
    log.error(`Missing ${script}`);
    process.exitCode = 1;
    return;
  }
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-TaskName', TASK_NAME],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}

function cmdUninstall() {
  const script = join(SCRIPT_DIR, 'win', 'uninstall-autostart.ps1');
  if (!existsSync(script)) {
    log.error(`Missing ${script}`);
    process.exitCode = 1;
    return;
  }
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-TaskName', TASK_NAME],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}

const COMMANDS = {
  doctor: cmdDoctor,
  start: cmdStart,
  stop: cmdStop,
  restart: async () => {
    await cmdStop();
    await sleep(1_500);
    await runSupervisor();
  },
  status: cmdStatus,
  logs: cmdLogs,
  rebuild: cmdRebuild,
  install: cmdInstall,
  uninstall: cmdUninstall,
};

const command = process.argv[2] ?? 'status';
const handler = COMMANDS[command];
if (!handler) {
  log.error(`Unknown command "${command}". Expected one of: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(2);
}
handler().catch((error) => {
  log.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
