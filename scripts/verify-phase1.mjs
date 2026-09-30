import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { io } from 'socket.io-client';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env') });

const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

async function checkHttp(label, url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    record(label, res.ok, `HTTP ${res.status}`);
  } catch (error) {
    record(label, false, error.message);
  }
}

const frontendRoutes = [
  '/', '/login', '/register',
  '/app', '/app/chat', '/app/agents', '/app/projects', '/app/files', '/app/media', '/app/settings',
  '/admin', '/admin/users', '/admin/analytics', '/admin/settings',
];

async function main() {
  console.log('== Frontend routes ==');
  for (const route of frontendRoutes) {
    await checkHttp(`GET ${route}`, `${WEB_URL}${route}`);
  }

  console.log('\n== Backend ==');
  await checkHttp('GET /health', `${API_URL}/health`);
  try {
    const res = await fetch(`${API_URL}/health`);
    const body = await res.json();
    record('health payload', res.ok && body.status === 'ok', JSON.stringify({ status: body.status, service: body.service }));
  } catch (error) {
    record('health payload', false, error.message);
  }

  console.log('\n== AI provider bridge ==');
  try {
    const res = await fetch(`${API_URL}/ai/providers/health`);
    const providers = await res.json();
    const ollama = providers.find((p) => p.provider === 'ollama');
    record('GET /ai/providers/health', res.ok && ollama?.status === 'healthy', `ollama=${ollama?.status}`);
  } catch (error) {
    record('GET /ai/providers/health', false, error.message);
  }
  try {
    const res = await fetch(`${API_URL}/ai/models`);
    const models = await res.json();
    record('GET /ai/models', res.ok && models.some((m) => m.capabilities.includes('language')), `${models.length} model(s) registered`);
  } catch (error) {
    record('GET /ai/models', false, error.message);
  }
  try {
    const res = await fetch(`${API_URL}/ai/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capability: 'language', input: 'Reply with exactly: ISOBASH verify.' }),
    });
    const body = await res.json();
    record('POST /ai/generate', res.ok && typeof body.output === 'string' && body.output.length > 0, `provider=${body.provider} model=${body.model}`);
  } catch (error) {
    record('POST /ai/generate', false, error.message);
  }

  console.log('\n== Database (Prisma) ==');
  const prisma = new PrismaClient();
  try {
    const userCount = await prisma.user.count();
    record('Prisma query (count users)', true, `${userCount} users in db`);
  } catch (error) {
    record('Prisma query (count users)', false, error.message);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  console.log('\n== Queue (Redis + BullMQ + worker) ==');
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('isobash-queue', { connection });
  const queueEvents = new QueueEvents('isobash-queue', { connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }) });
  try {
    const pong = await connection.ping();
    record('Redis PING', pong === 'PONG', `via ${REDIS_URL.replace(/:\/\/.*@/, '://')}`);
    await queueEvents.waitUntilReady();
    const job = await queue.add('phase1-verify', { createdAt: new Date().toISOString() });
    let outcome;
    try {
      outcome = await job.waitUntilFinished(queueEvents, 15000);
    } catch {
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 500));
        const state = await job.getState();
        if (state === 'completed') { outcome = await job.returnvalue; break; }
        if (state === 'failed') break;
      }
    }
    record('BullMQ job processed by worker', outcome?.processed === true, `job ${job.id}`);
  } catch (error) {
    record('BullMQ job processed by worker', false, error.message);
  } finally {
    await queue.close().catch(() => {});
    await queueEvents.close().catch(() => {});
    await connection.quit().catch(() => {});
  }

  console.log('\n== Realtime (Socket.IO) ==');
  await new Promise((resolvePromise) => {
    const socket = io(API_URL, { transports: ['websocket'], timeout: 8000 });
    const timer = setTimeout(() => {
      record('Socket.IO ping/pong', false, 'timeout waiting for pong');
      socket.close();
      resolvePromise();
    }, 10000);
    socket.on('connect', () => socket.emit('ping', { at: Date.now() }));
    socket.on('pong', () => {
      clearTimeout(timer);
      record('Socket.IO ping/pong', true, 'received pong');
      socket.close();
      resolvePromise();
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      record('Socket.IO ping/pong', false, error.message);
      resolvePromise();
    });
  });

  console.log('\n== Summary ==');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) process.exitCode = 1;
  process.exit(process.exitCode || 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});