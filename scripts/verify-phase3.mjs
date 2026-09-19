import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { loadConfig } from '../apps/backend/dist/shared/config/configuration.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env') });

const API_URL = process.env.API_URL || 'http://localhost:3001';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('== Configuration ==');
  try {
    const cfg = loadConfig();
    const roots = Object.values(cfg.storage);
    const allExist = roots.every((dir) => existsSync(dir));
    record('env validated + storage roots resolved', allExist, `dataRoot=${cfg.storage.dataRoot}`);
  } catch (error) {
    record('env validated + storage roots resolved', false, error.message);
  }

  console.log('\n== Health with component checks ==');
  try {
    const res = await fetch(`${API_URL}/health`);
    const body = await res.json();
    const db = body.components?.find((c) => c.name === 'database');
    const redis = body.components?.find((c) => c.name === 'redis');
    record('GET /health components', res.ok && body.status === 'ok' && db?.status === 'ok' && redis?.status === 'ok',
      `database=${db?.status} redis=${redis?.status}`);
  } catch (error) {
    record('GET /health components', false, error.message);
  }

  console.log('\n== Error handling ==');
  try {
    const res = await fetch(`${API_URL}/ai/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capability: 'nope', input: '' }),
    });
    const body = await res.json();
    record('400 VALIDATION_FAILED', res.status === 400 && body.error?.code === 'VALIDATION_FAILED',
      `code=${body.error?.code}`);
  } catch (error) {
    record('400 VALIDATION_FAILED', false, error.message);
  }
  try {
    const res = await fetch(`${API_URL}/does-not-exist`);
    const body = await res.json();
    record('404 NOT_FOUND', res.status === 404 && body.error?.code === 'NOT_FOUND',
      `code=${body.error?.code}`);
  } catch (error) {
    record('404 NOT_FOUND', false, error.message);
  }
  try {
    const res = await fetch(`${API_URL}/health`);
    const requestId = res.headers.get('x-request-id');
    record('x-request-id header', Boolean(requestId), requestId ?? 'missing');
  } catch (error) {
    record('x-request-id header', false, error.message);
  }

  console.log('\n== Realtime gateway ==');
  const { io } = await import('socket.io-client');
  await new Promise((done) => {
    const socket = io(API_URL, { transports: ['websocket'], timeout: 8000 });
    const timer = setTimeout(() => {
      record('Socket.IO ping/pong', false, 'timeout');
      socket.close();
      done();
    }, 10000);
    socket.on('connect', () => socket.emit('ping', { phase: 3 }));
    socket.on('pong', () => {
      clearTimeout(timer);
      record('Socket.IO ping/pong', true, 'received pong');
      socket.close();
      done();
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      record('Socket.IO ping/pong', false, error.message);
      done();
    });
  });

  console.log('\n== Web surface ==');
  for (const route of ['/', '/app', '/admin']) {
    try {
      const res = await fetch(`${WEB_URL}${route}`);
      record(`GET ${route}`, res.ok, `HTTP ${res.status}`);
    } catch (error) {
      record(`GET ${route}`, false, error.message);
    }
  }

  console.log('\n== Summary ==');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});