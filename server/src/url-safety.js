import dns from 'node:dns/promises';
import net from 'node:net';
import { ApiError } from './errors.js';

const MAX_RESPONSE_BYTES = 2_000_000;
const PRIVATE_RANGES = [
  ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4],
];

function ipv4ToNumber(value) {
  return value.split('.').reduce((result, part) => (result * 256) + Number(part), 0) >>> 0;
}

function isPrivateIpv4(value) {
  const number = ipv4ToNumber(value);
  return PRIVATE_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (number & mask) === (ipv4ToNumber(base) & mask);
  });
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return Boolean(mapped) || normalized === '::1' || normalized === '::'
      || normalized.startsWith('fe8') || normalized.startsWith('fe9')
      || normalized.startsWith('fea') || normalized.startsWith('feb')
      || normalized.startsWith('fc') || normalized.startsWith('fd');
  }
  return true;
}

export async function assertPublicAllowedUrl(url, allowedDomains = []) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiError(400, '只支持 HTTP 或 HTTPS 链接');
  const hostname = url.hostname.toLowerCase();
  if (!allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new ApiError(400, '链接域名不在允许范围内');
  }
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ApiError(400, '链接域名无法解析');
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new ApiError(400, '链接地址不可访问');
  }
  return url;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError(504, '外部页面读取超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function readResponseText(response, maxBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new ApiError(413, '外部页面内容过大');
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, '外部页面内容过大');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
