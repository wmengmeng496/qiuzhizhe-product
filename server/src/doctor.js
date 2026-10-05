import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { pool, checkDatabase } from './db.js';
import { config } from './config.js';

function connect(host, port, secure, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let finished = false;
    const socket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
      : net.connect({ host, port });
    const finish = (result) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ ...result, latencyMs: Date.now() - startedAt });
    };
    socket.setTimeout(timeoutMs, () => finish({ reachable: false, code: 'TIMEOUT' }));
    socket.once('error', (error) => finish({ reachable: false, code: error.code || 'CONNECT_ERROR' }));
    socket.once(secure ? 'secureConnect' : 'connect', () => finish({ reachable: true }));
  });
}

const database = await checkDatabase();
let ai = { configured: Boolean(config.ai.key), reachable: false, code: 'NOT_CONFIGURED' };
try {
  const url = new URL(config.ai.url);
  const addresses = await dns.lookup(url.hostname, { all: true });
  const connection = await connect(url.hostname, Number(url.port || (url.protocol === 'https:' ? 443 : 80)), url.protocol === 'https:');
  ai = { configured: Boolean(config.ai.key), host: url.hostname, addresses, ...connection };
} catch (error) {
  ai = { configured: Boolean(config.ai.key), reachable: false, code: error.code || 'INVALID_AI_URL' };
}

console.log(JSON.stringify({ database, ai }, null, 2));
await pool.end();
if (!database.ready || !ai.configured || !ai.reachable) process.exitCode = 1;
