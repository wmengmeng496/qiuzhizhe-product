import Dysmsapi20170525, * as $Dysmsapi20170525 from '@alicloud/dysmsapi20170525';
import * as $OpenApi from '@alicloud/openapi-client';
import { randomInt } from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';

const codes = new Map();
const lastSent = new Map();
const failedAttempts = new Map();
const MAX_VERIFY_ATTEMPTS = 5;

function client() {
  if (!config.sms.accessKeyId || !config.sms.accessKeySecret) {
    throw new ApiError(503, '短信服务尚未配置，请联系管理员');
  }
  return new Dysmsapi20170525(new $OpenApi.Config({
    accessKeyId: config.sms.accessKeyId,
    accessKeySecret: config.sms.accessKeySecret,
    endpoint: config.sms.endpoint,
  }));
}

export async function sendCode(req, res) {
  const phone = String(req.body?.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new ApiError(400, '请输入有效的 11 位手机号');
  const now = Date.now();
  if (now - (lastSent.get(phone) || 0) < 60_000) throw new ApiError(429, '验证码发送过于频繁，请稍后再试');
  const code = String(randomInt(100000, 1000000));
  const request = new $Dysmsapi20170525.SendSmsRequest({
    phoneNumbers: phone,
    signName: config.sms.signName,
    templateCode: config.sms.templateCode,
    templateParam: JSON.stringify({ code }),
  });
  const result = await client().sendSms(request);
  if (result.body?.code && result.body.code !== 'OK') throw new ApiError(502, result.body.message || '短信发送失败');
  codes.set(phone, { code, expiresAt: now + 5 * 60_000 });
  failedAttempts.delete(phone);
  lastSent.set(phone, now);
  res.json({ success: true, message: '验证码已发送' });
}

export function verifyCode(phone, code) {
  const item = codes.get(phone);
  if (!item || item.expiresAt < Date.now()) {
    codes.delete(phone);
    failedAttempts.delete(phone);
    return false;
  }
  if (item.code !== code) {
    const attempts = (failedAttempts.get(phone) || 0) + 1;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      codes.delete(phone);
      failedAttempts.delete(phone);
    } else failedAttempts.set(phone, attempts);
    return false;
  }
  codes.delete(phone);
  failedAttempts.delete(phone);
  return true;
}
