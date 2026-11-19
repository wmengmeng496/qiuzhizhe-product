import test from 'node:test';
import assert from 'node:assert/strict';
import { cookieToken, consumeLoginChallenge, hashChallengeCode, hashSecret, newChallenge, sessionCookie } from '../src/sms-auth.js';
import { smsConfigStatus } from '../src/config.js';

function challengeClient(challenge) {
  const updates = [];
  return {
    updates,
    async query(sql, params) {
      if (sql.startsWith('select * from auth_challenges')) return { rowCount: challenge ? 1 : 0, rows: challenge ? [challenge] : [] };
      updates.push({ sql, params });
      return { rowCount: 1, rows: [] };
    },
  };
}

test('challenge codes are HMAC hashed and consume once on success', async () => {
  const generated = newChallenge({ phone: '13800138000' });
  assert.notEqual(generated.secretHash, hashSecret(generated.code));
  assert.equal(generated.secretHash, hashChallengeCode(generated.code, generated.phone, generated.id));
  const row = { id: generated.id, secret_hash: generated.secretHash };
  const client = challengeClient(row);
  assert.equal(await consumeLoginChallenge(client, { phone: generated.phone, code: generated.code }), row);
  assert.match(client.updates[0].sql, /consumed_at=now\(\)/);
});

test('wrong challenge code increments attempts without consuming success path', async () => {
  const generated = newChallenge({ phone: '13900139000' });
  const client = challengeClient({ id: generated.id, secret_hash: generated.secretHash });
  assert.equal(await consumeLoginChallenge(client, { phone: generated.phone, code: '000000' }), null);
  assert.match(client.updates[0].sql, /attempts=attempts\+1/);
});

test('session lookup requires the current user auth version', async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 0, rows: [] };
    },
  };
  const { resolveSession } = await import('../src/sms-auth.js');
  assert.equal(await resolveSession(client, 'stale-session'), null);
  assert.match(queries[0].sql, /s\.auth_version=u\.auth_version/);
});

test('session cookie is HttpOnly and parseable', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const header = sessionCookie('token/value');
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Lax/);
    assert.match(header, /Secure/);
    assert.equal(cookieToken(header), 'token/value');
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('SMS configuration status never exposes credential values', () => {
  const status = smsConfigStatus();
  assert.deepEqual(Object.keys(status).sort(), ['configured', 'missing', 'required']);
  assert.equal(JSON.stringify(status).includes('accessKeySecret'), false);
});
