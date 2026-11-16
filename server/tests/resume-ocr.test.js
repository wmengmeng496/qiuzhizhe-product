import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CUSTOM_PROXY_KEY = 'test-only-key';
process.env.AI_DEFAULT_MODEL = 'rewrite-model';
process.env.AI_OCR_MODEL = 'vision-model';
process.env.AI_FALLBACK_MODELS = 'rewrite-fallback';
process.env.AI_OCR_FALLBACK_MODELS = 'vision-fallback';
process.env.AI_TIMEOUT_MS = '1000';
process.env.AI_RESUME_TIMEOUT_MS = '1000';
const { optimizeResumeWithAi } = await import('../src/ai.js');
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

const source = '张三 软件工程师 工作经历：负责支付服务开发与维护，参与需求分析、接口设计及自动化测试。项目经历：订单管理平台，负责数据库建模、异常排查和生产发布。教育经历：计算机科学本科。专业技能：JavaScript、SQL、Git。';
const improved = '## 核心能力\n面向交易场景交付稳定可靠的后端接口，具备从需求澄清到生产发布的完整实践。\n## 项目实践\n围绕订单生命周期设计数据结构与异常处理，通过自动化验证保障支付链路质量；协同团队定位线上问题并完善发布流程。';
const input = { resumeContent: source, jobRequirements: '招聘后端工程师，要求数据库设计、接口开发以及生产运维经验。', model: 'rewrite-model', optimizeMode: 'full', aiConsent: true, resumePageImages: ['data:image/png;base64,AA=='] };
const success = (value) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('provided images trigger OCR even with long readable partial text, using configured models', async () => {
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) return new Response(JSON.stringify({ error: { code: 'model_not_found' } }), { status: 404 });
    if (requests.length === 2) return success({ text: source });
    return success({ optimizedContent: improved });
  };
  const result = await optimizeResumeWithAi({ ...input, resumeContent: source.repeat(3) });
  assert.deepEqual(requests.map(r => r.model), ['vision-model', 'vision-fallback', 'rewrite-model']);
  assert.equal(requests[0].messages[1].content[1].type, 'image_url');
  assert.ok(requests[2].messages[1].content.includes(source));
  assert.equal(result.extractedResumeContent, source);
});


test('multi-page OCR sends one image per request, skips blank pages, and preserves page order', async () => {
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) return success({ text: `${source} 第一页` });
    if (requests.length === 2) return success({ text: '', blank: true });
    if (requests.length === 3) return success({ text: `${source} 第三页` });
    return success({ optimizedContent: improved });
  };
  const result = await optimizeResumeWithAi({
    ...input,
    resumePageImages: [
      'data:image/png;base64,AA==',
      'data:image/png;base64,AQ==',
      'data:image/png;base64,Ag==',
    ],
  });
  assert.equal(requests.length, 4);
  assert.ok(requests.slice(0, 3).every(request => request.messages[1].content.filter(part => part.type === 'image_url').length === 1));
  assert.match(requests[0].messages[1].content[0].text, /第 1\/3 页/);
  assert.match(requests[1].messages[1].content[0].text, /第 2\/3 页/);
  assert.match(requests[2].messages[1].content[0].text, /第 3\/3 页/);
  assert.match(result.extractedResumeContent, /===== 第 1 页 =====/);
  assert.doesNotMatch(result.extractedResumeContent, /===== 第 2 页 =====/);
  assert.match(result.extractedResumeContent, /===== 第 3 页 =====/);
  assert.ok(result.extractedResumeContent.indexOf('第一页') < result.extractedResumeContent.indexOf('第三页'));
});

test('OCR failure cannot fall through to optimization using partial text', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return success({ text: '无法读取' }); };
  await assert.rejects(() => optimizeResumeWithAi(input), { status: 502 });
  assert.equal(calls, 1);
});

test('placeholder text without images is rejected before calling AI', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return success({ optimizedContent: improved }); };
  await assert.rejects(() => optimizeResumeWithAi({ ...input, resumePageImages: [], resumeContent: 'PDF文本层读取不完整，原始项目内容待补充。'.repeat(5) }), { status: 400 });
  assert.equal(calls, 0);
});

test('OCR source and contacts survive a successful second rewrite with PII restored', async () => {
  let calls = 0;
  const withContact = `${source} 电话：13800138000 邮箱：candidate@example.com`;
  globalThis.fetch = async (_url, options) => {
    calls++;
    if (calls === 1) return success({ text: withContact });
    const body = JSON.parse(options.body);
    assert.doesNotMatch(JSON.stringify(body), /13800138000|candidate@example\.com/);
    const prompt = body.messages[1].content;
    const protectedSource = prompt.split('原始简历：\n')[1].split('\n\n请返回 JSON：')[0];
    if (calls === 2) return success({ optimizedContent: protectedSource });
    const phone = prompt.match(/\[\[QIUZHI_[^\]]+_PHONE_\d+\]\]/)[0];
    return success({ optimizedContent: `${improved} 电话：${phone}` });
  };
  const result = await optimizeResumeWithAi(input);
  assert.equal(calls, 3);
  assert.equal(result.extractedResumeContent, withContact);
  assert.match(result.optimizedContent, /13800138000/);
});

test('an echoed rewrite is rejected rather than reported as successful', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return success({ optimizedContent: source }); };
  await assert.rejects(() => optimizeResumeWithAi({ ...input, resumePageImages: [] }), { status: 502 });
  assert.equal(calls, 2);
});

test('failed second rewrite propagates failure instead of accepting the first echo', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return success({ optimizedContent: source });
    throw new TypeError('unreachable');
  };
  await assert.rejects(() => optimizeResumeWithAi({ ...input, resumePageImages: [] }), { status: 503 });
  assert.equal(calls, 2);
});

test('OCR and optimization share one total resume timeout budget', async () => {
  let calls = 0;
  globalThis.fetch = async (_url, { signal }) => {
    calls++;
    if (calls === 1) {
      await new Promise(resolve => setTimeout(resolve, 600));
      return success({ text: source });
    }
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
  };
  const started = Date.now();
  await assert.rejects(() => optimizeResumeWithAi(input), { status: 504 });
  assert.ok(Date.now() - started < 1400);
  assert.equal(calls, 2);
});
