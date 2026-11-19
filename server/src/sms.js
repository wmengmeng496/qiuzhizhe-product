import Dysmsapi20170525, * as $Dysmsapi20170525 from '@alicloud/dysmsapi20170525';
import * as $OpenApi from '@alicloud/openapi-client';
import { randomInt } from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';

const codes = new Map();
const lastSent = new Map();
const failedAttempts = new Map();
const MAX_VERIFY_ATTEMPTS = 5;
const CODE_TTL_MS = 5 * 60_000;
const PURPOSES = new Set(['login', 'reset']);

function codeKey(phone, purpose) {
  return `${purpose}:${phone}`;
}

function readPurpose(value) {
  const purpose = String(value || 'login').trim();
  if (!PURPOSES.has(purpose)) throw new ApiError(400, '不支持的验证码用途');
  return purpose;
}

function client() {
  if (!config.sms.accessKeyId || !config.sms.accessKeySecret || !config.sms.signName || !config.sms.templateCode) {
    throw new ApiError(503, '短信服务尚未配置，请联系管理员');
  }
  return new Dysmsapi20170525(new $OpenApi.Config({
    accessKeyId: config.sms.accessKeyId,
    accessKeySecret: config.sms.accessKeySecret,
    endpoint: config.sms.endpoint,
  }));
}

export async function deliverSmsCode(phone, code) {
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) throw new ApiError(400, '请输入有效的 11 位手机号');
  if (!/^\d{6}$/.test(String(code || ''))) throw new ApiError(500, '验证码生成失败');
  const request = new $Dysmsapi20170525.SendSmsRequest({
    phoneNumbers: phone,
    signName: config.sms.signName,
    templateCode: config.sms.templateCode,
    templateParam: JSON.stringify({ code }),
  });
  try {
    const result = await client().sendSms(request);
    if (result.body?.code && result.body.code !== 'OK') {
      console.error('[sms:provider]', { code: result.body.code, requestId: result.body.requestId });
      throw new ApiError(502, '短信发送失败，请稍后再试');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('[sms:provider]', { code: error?.code || error?.name || 'UNKNOWN' });
    throw new ApiError(502, '短信发送失败，请稍后再试');
  }
}

export async function sendCode(req, res) {
  const phone = String(req.body?.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new ApiError(400, '请输入有效的 11 位手机号');
  const purpose = readPurpose(req.body?.purpose);
  const key = codeKey(phone, purpose);
  const now = Date.now();
  if (now - (lastSent.get(phone) || 0) < 60_000) throw new ApiError(429, '验证码发送过于频繁，请稍后再试');
  const code = String(randomInt(100000, 1000000));
  await deliverSmsCode(phone, code);
  codes.set(key, { code, expiresAt: now + CODE_TTL_MS });
  failedAttempts.delete(key);
  lastSent.set(phone, now);
  res.json({ success: true, message: '验证码已发送' });
}

export function verifyCode(phone, code, purpose = 'login') {
  const key = codeKey(String(phone || '').trim(), readPurpose(purpose));
  const item = codes.get(key);
  if (!item || item.expiresAt < Date.now()) {
    codes.delete(key);
    failedAttempts.delete(key);
    return false;
  }
  if (item.code !== code) {
    const attempts = (failedAttempts.get(key) || 0) + 1;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      codes.delete(key);
      failedAttempts.delete(key);
    } else failedAttempts.set(key, attempts);
    return false;
  }
  codes.delete(key);
  failedAttempts.delete(key);
  return true;
}

export function storeVerificationCode(phone, code, purpose = 'login', expiresAt = Date.now() + CODE_TTL_MS) {
  const key = codeKey(String(phone || '').trim(), readPurpose(purpose));
  codes.set(key, { code: String(code), expiresAt });
  failedAttempts.delete(key);
}
