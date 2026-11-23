import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dispatchMcpMessage, handleMcpDelete, handleMcpGet, hashToken, normalizeRedirectUri, normalizeRedirectUris, normalizeScopes, readOAuthClientCredentials, redirectUriMatches } from '../src/workbuddy.js';

test('WorkBuddy OAuth accepts HTTPS and localhost redirect URIs only', () => {
  assert.deepEqual(normalizeRedirectUris(['https://workbuddy.cn/callback']), ['https://workbuddy.cn/callback']);
  assert.deepEqual(normalizeRedirectUris(['https://oauth-callback.workbuddy.cn']), ['https://oauth-callback.workbuddy.cn/']);
  assert.deepEqual(normalizeRedirectUris(['http://127.0.0.1:3000/callback']), ['http://127.0.0.1:3000/callback']);
  assert.throws(() => normalizeRedirectUris(['http://example.com/callback']));
  assert.throws(() => normalizeRedirectUris(['not a URL']), (error) => error.status === 400);
});

test('WorkBuddy OAuth normalizes only equivalent redirect URIs', () => {
  assert.equal(normalizeRedirectUri('https://oauth-callback.workbuddy.cn'), normalizeRedirectUri('https://oauth-callback.workbuddy.cn/'));
  assert.equal(redirectUriMatches(['https://oauth-callback.workbuddy.cn/'], 'https://oauth-callback.workbuddy.cn'), true);
  assert.equal(redirectUriMatches(['https://oauth-callback.workbuddy.cn'], 'https://oauth-callback.workbuddy.cn/'), true);
  assert.equal(redirectUriMatches(['https://oauth-callback.workbuddy.cn/callback'], 'https://oauth-callback.workbuddy.cn/'), false);
  assert.equal(redirectUriMatches(['https://oauth-callback.workbuddy.cn/?state=1'], 'https://oauth-callback.workbuddy.cn/?state=2'), false);
});

test('WorkBuddy OAuth rejects unknown scopes and removes duplicates', () => {
  assert.deepEqual(normalizeScopes('profile resume.read profile'), ['profile', 'resume.read']);
  assert.throws(() => normalizeScopes('profile admin.write'));
});

test('WorkBuddy stores only deterministic token hashes', () => {
  const token = 'zyat_test-secret';
  assert.equal(hashToken(token), createHash('sha256').update(token).digest('hex'));
  assert.notEqual(hashToken(token), token);
});


test('WorkBuddy token endpoint accepts Basic and form client credentials', () => {
  const basic = Buffer.from(`${encodeURIComponent('zyc_test')}:${encodeURIComponent('secret:value')}`).toString('base64');
  assert.deepEqual(readOAuthClientCredentials({ headers: { authorization: `Basic ${basic}` }, body: {} }), {
    clientId: 'zyc_test',
    clientSecret: 'secret:value',
  });
  assert.deepEqual(readOAuthClientCredentials({ headers: {}, body: { client_id: 'zyc_post', client_secret: 'post_secret' } }), {
    clientId: 'zyc_post',
    clientSecret: 'post_secret',
  });
  assert.throws(() => readOAuthClientCredentials({ headers: { authorization: 'Basic invalid' }, body: {} }), (error) => error.status === 401 && error.message === 'invalid_client');
});
test('MCP initialize returns a supported Streamable HTTP protocol result', async () => {
  const result = await dispatchMcpMessage({}, {}, {}, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.jsonrpc, '2.0');
  assert.equal(result.body.id, 1);
  assert.equal(result.body.result.protocolVersion, '2025-03-26');
  assert.deepEqual(result.body.result.capabilities, { tools: {} });
});

test('MCP accepts every notification without a response body', async () => {
  const result = await dispatchMcpMessage({}, {}, {}, {
    jsonrpc: '2.0',
    method: 'notifications/cancelled',
    params: { requestId: 1, reason: 'test' },
  });
  assert.deepEqual(result, { status: 202 });
});

test('MCP unknown request uses JSON-RPC error over HTTP 200', async () => {
  const result = await dispatchMcpMessage({}, {}, {}, { jsonrpc: '2.0', id: 7, method: 'unknown/method' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { jsonrpc: '2.0', id: 7, error: { code: -32601, message: 'Method not found' } });
});

test('MCP rejects malformed requests with JSON-RPC invalid request', async () => {
  const result = await dispatchMcpMessage({}, {}, {}, { id: 8, method: 'tools/list' });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, -32600);
  assert.equal(result.body.id, null);
});

test('MCP GET and DELETE require OAuth before returning method not allowed', async () => {
  for (const handler of [handleMcpGet, handleMcpDelete]) {
    const headers = {};
    const req = { headers: {}, protocol: 'https', get: () => 'www.qiuzhijianli.xyz' };
    const res = { set: (name, value) => { headers[name] = value; return res; } };
    await assert.rejects(handler(req, res), (error) => error.status === 401 && error.message === 'invalid_token');
    assert.match(headers['WWW-Authenticate'], /^Bearer resource_metadata=/);
  }
});
