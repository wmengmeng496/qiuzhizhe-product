import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolve configuration relative to the server package, not the caller's cwd.
dotenv.config({ path: path.join(serverDir, '.env'), override: false });
dotenv.config({ path: path.resolve(serverDir, '../.env'), override: false });

// If HTTP_PROXY or http_proxy is set in environment, configure undici dispatcher
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) {
  try {
    const { setGlobalDispatcher, ProxyAgent } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch {}
}

