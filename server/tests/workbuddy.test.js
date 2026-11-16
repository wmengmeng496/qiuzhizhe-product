import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashToken, normalizeRedirectUris, normalizeScopes } from '../src/workbuddy.js';

test('WorkBuddy OAuth accepts HTTPS and localhost redirect URIs only', () => {
  assert.deepEqual(normalizeRedirectUris(['https://workbuddy.cn/callback']), ['https://workbuddy.cn/callback']);
  assert.deepEqual(normalizeRedirectUris(['http://127.0.0.1:3000/callback']), ['http://127.0.0.1:3000/callback']);
  assert.throws(() => normalizeRedirectUris(['http://example.com/callback']));
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
