import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../src/rate-limit.js';
import { consumeDevResumeUsage, deleteDevUserData, getDevUsage, listDevResumeOptimizations, saveDevResumeOptimization } from '../src/dev-store.js';
import { optimizeSchema } from '../src/routes.js';
import { planLimits } from '../src/config.js';
import { normalizeAuthInput } from '../src/auth.js';
import { storeVerificationCode, verifyCode } from '../src/sms.js';

function request(ip = '127.0.0.1') {
  return { ip };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
}

test('rate limits are isolated per middleware instance', () => {
  const first = rateLimit({ windowMs: 60_000, max: 1 });
  const second = rateLimit({ windowMs: 60_000, max: 1 });
  let firstNext = 0;
  let secondNext = 0;

  first(request(), response(), () => { firstNext += 1; });
  first(request(), response(), () => { firstNext += 1; });
  second(request(), response(), () => { secondNext += 1; });

  assert.equal(firstNext, 1);
  assert.equal(secondNext, 1);
});

test('registration accepts phone or email with password and no verification code', () => {
  const common = { password: 'secret123', termsAccepted: true, agreementVersion: '2026-07-24' };
  assert.equal(normalizeAuthInput({ ...common, account: '13800138000' }).phone, '13800138000');
  assert.equal(normalizeAuthInput({ ...common, account: 'USER@example.com' }).email, 'user@example.com');
  assert.throws(() => normalizeAuthInput({ ...common, account: 'not-an-account' }));
});


test('SMS codes are one-time and isolated by purpose', () => {
  const phone = '13800138000';
  storeVerificationCode(phone, '123456', 'login');
  assert.equal(verifyCode(phone, '123456', 'reset'), false);
  assert.equal(verifyCode(phone, '123456', 'login'), true);
  assert.equal(verifyCode(phone, '123456', 'login'), false);
});

test('SMS codes expire and are invalidated after five failed attempts', () => {
  const phone = '13900139000';
  storeVerificationCode(phone, '654321', 'login', Date.now() - 1);
  assert.equal(verifyCode(phone, '654321', 'login'), false);

  storeVerificationCode(phone, '654321', 'reset');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(verifyCode(phone, '000000', 'reset'), false);
  }
  assert.equal(verifyCode(phone, '654321', 'reset'), false);
});

test('data deletion clears content but preserves development quota usage', () => {
  const user = { id: 'quota-regression-user', plan: 'free' };
  deleteDevUserData(user.id);
  consumeDevResumeUsage(user);
  saveDevResumeOptimization(user.id, { resume_content: 'private content' });

  deleteDevUserData(user.id, { preserveUsage: true });

  assert.equal(getDevUsage(user.id).resume_optimize_used, 1);
  assert.deepEqual(listDevResumeOptimizations(user.id), []);
});

test('resume schema accepts OCR-only input with up to five valid images', () => {
  const image = 'data:image/png;base64,AA==';
  const parsed = optimizeSchema.parse({
    resumeContent: '',
    jobRequirements: 'A'.repeat(20),
    resumePageImages: [image, image, image, image, image],
    aiConsent: true,
  });
  assert.equal(parsed.resumePageImages.length, 5);
});

test('resume schema rejects textless input without consent, images, or excessive pages', () => {
  const base = { resumeContent: '', jobRequirements: 'A'.repeat(20) };
  assert.throws(() => optimizeSchema.parse(base));
  assert.throws(() => optimizeSchema.parse({ ...base, resumePageImages: ['data:image/png;base64,AA=='], aiConsent: false }));
  assert.throws(() => optimizeSchema.parse({
    ...base,
    resumePageImages: Array.from({ length: 6 }, () => 'data:image/png;base64,AA=='),
    aiConsent: true,
  }));
});

test('resume schema rejects OCR images that exceed the total request budget', () => {
  assert.throws(() => optimizeSchema.parse({
    resumeContent: '',
    jobRequirements: 'A'.repeat(20),
    resumePageImages: [
      `data:image/png;base64,${'A'.repeat(2_999_960)}`,
      `data:image/png;base64,${'A'.repeat(2_999_960)}`,
      `data:image/png;base64,${'A'.repeat(100)}`,
    ],
    aiConsent: true,
  }));
});

test('normal text resume remains valid without OCR pages', () => {
  const parsed = optimizeSchema.parse({
    resumeContent: 'A'.repeat(20),
    jobRequirements: 'B'.repeat(20),
    aiConsent: true,
  });
  assert.deepEqual(parsed.resumePageImages, []);
  assert.equal(planLimits.free.resumeOptimize, 3);
});
