/// <reference types="node" />
import * as fs from 'fs';

const envPath = '.env';
const values: Record<string, string> = {};
for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
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
Object.assign(process.env, values);

async function testMagicHour() {
  try {
    const { MagicHourVideoProvider } = await import('./apps/backend/src/ai/magic-hour-video.provider.ts');
    const provider = new MagicHourVideoProvider();
    const health = await provider.health();
    const balance = await provider.readCreditBalance();
    console.log(JSON.stringify({
      provider: 'magic-hour',
      status: 'OK',
      healthStatus: health.status,
      balanceReadable: balance.readable,
      credits: balance.balance,
    }));
  } catch (error: any) {
    console.log(JSON.stringify({
      provider: 'magic-hour',
      status: 'ERR',
      message: error?.message || String(error),
      code: error?.code || 'n/a',
    }));
  }
}

async function testJson2Video() {
  try {
    const { Json2VideoProvider } = await import('./apps/backend/src/ai/json2video.provider.ts');
    const provider = new Json2VideoProvider();
    const health = await provider.health();
    const balance = await provider.readCreditBalance();
    console.log(JSON.stringify({
      provider: 'json2video',
      status: 'OK',
      healthStatus: health.status,
      balanceReadable: balance.readable,
      remainingSeconds: balance.balance,
    }));
  } catch (error: any) {
    console.log(JSON.stringify({
      provider: 'json2video',
      status: 'ERR',
      message: error?.message || String(error),
      code: error?.code || 'n/a',
    }));
  }
}

void (async () => {
  await testMagicHour();
  await testJson2Video();
})();
