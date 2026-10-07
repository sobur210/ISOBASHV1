const { execSync } = require('child_process');
const { existsSync, readFileSync, unlinkSync } = require('fs');
const path = require('path');

const ports = [3000, 3001, 3002, 3003, 3004, 3005];
const pids = new Set();
const backendLock = path.resolve(__dirname, '..', '.dev-backend.lock');

if (existsSync(backendLock)) {
  const backendPid = Number(readFileSync(backendLock, 'utf8').trim());
  if (Number.isInteger(backendPid) && backendPid > 0) {
    console.log(`[clean-dev] Stopping backend watcher PID ${backendPid}.`);
    pids.add(backendPid);
  }
}

function run(command) {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (error) {
    return error.stdout || '';
  }
}

function removeBackendLock() {
  try {
    unlinkSync(backendLock);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const output = run('netstat -ano');

for (const line of (output || '').split(/\r?\n/)) {
  const match = line.match(/LISTENING\s+(\d+)/i) || line.match(/:\s*(\d+)\s*$/);
  const portMatch = line.match(/:(\d{4,5})\s+.*LISTENING/i) || line.match(/:(\d{4,5})\s+.*\b\d+\b/i);
  if (!portMatch) continue;
  const port = Number(portMatch[1]);
  if (!ports.includes(port)) continue;
  const pid = match ? Number(match[1]) : null;
  if (pid && !Number.isNaN(pid)) pids.add(pid);
}

if (pids.size === 0) {
  console.log('[clean-dev] No stale listeners found on app ports.');
  removeBackendLock();
  process.exit(0);
}

for (const pid of [...pids].sort((a, b) => a - b)) {
  try {
    console.log(`[clean-dev] Stopping stale process PID ${pid} on a dev port.`);
    execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'inherit' });
  } catch {
    // Ignore; the process may already have exited.
  }
}

console.log('[clean-dev] Finished clearing stale dev processes.');
removeBackendLock();
