import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CUSTOM_PROXY_KEY = 'test-only-key';
process.env.AI_TIMEOUT_MS = '1000';
process.env.AI_DEFAULT_MODEL = 'primary-model';
process.env.AI_FALLBACK_MODELS = 'fallback-model';

const { callAiJson } = await import('../src/ai.js');

const success = (content, model = 'primary-model') => new Response(JSON.stringify({
  model,
  choices: [{ message: { content: JSON.stringify(content) } }],
}), { status: 200, headers: { 'content-type': 'application/json' } });

const originalFetch = globalThis.fetch;

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('restores redacted PII without sending it upstream', async () => {
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    const redacted = request.messages[0].content;
    const [phoneToken] = redacted.match(/\[\[QIUZHI_[^\]]+_PHONE_\d+\]\]/) || [];
    const [emailToken] = redacted.match(/\[\[QIUZHI_[^\]]+_EMAIL_\d+\]\]/) || [];
    return success({ optimizedContent: `电话：${phoneToken}`, note: emailToken });
  };

  const result = await callAiJson({
    model: 'primary-model',
    messages: [{ role: 'user', content: '电话：13800138000，邮箱 candidate@example.com' }],
  });

  assert.match(JSON.stringify(request), /_PHONE_\d+/);
  assert.doesNotMatch(JSON.stringify(request), /13800138000|candidate@example\.com/);
  assert.equal(result.optimizedContent, '电话：13800138000');
  assert.equal(result.note, 'candidate@example.com');
});

test('does not retry an unreachable AI gateway on another model', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('ECONNREFUSED secret prompt'); };

  await assert.rejects(() => callAiJson({ model: 'primary-model', messages: [{ role: 'user', content: 'private prompt' }] }), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.message, 'AI 服务暂时无法连接，请稍后再试');
    return true;
  });
  assert.equal(calls, 1);
});

test('uses one total timeout budget instead of timing out each model', async () => {
  let calls = 0;
  globalThis.fetch = (_url, { signal }) => new Promise((resolve, reject) => {
    calls += 1;
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });

  const started = Date.now();
  await assert.rejects(() => callAiJson({ model: 'primary-model', messages: [{ role: 'user', content: 'private prompt' }] }), { status: 504 });
  assert.ok(Date.now() - started < 1800);
  assert.equal(calls, 1);
});

test('falls back only after an explicit model capability error', async () => {
  const models = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    models.push(body.model);
    if (models.length === 1) return new Response(JSON.stringify({ error: { code: 'model_not_found', message: 'private upstream detail' } }), { status: 404 });
    return success({ ok: true }, body.model);
  };

  const result = await callAiJson({ model: 'primary-model', messages: [{ role: 'user', content: 'private prompt' }] });
  assert.deepEqual(models, ['primary-model', 'fallback-model']);
  assert.equal(result.ok, true);
});
