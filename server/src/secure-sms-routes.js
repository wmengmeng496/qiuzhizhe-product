import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from './errors.js';
import { query, withTransaction } from './db.js';
import { rateLimit } from './rate-limit.js';
import { deliverSmsCode } from './sms.js';
import { recordEvent } from './events.js';
import { clearSessionCookie, consumeLoginChallenge, cookieToken, createSession, hashSecret, newChallenge, normalizePhone, sessionCookie, storeChallenge } from './sms-auth.js';

const router = Router();
const phoneInput = z.object({ phone: z.string().trim() });

router.post('/challenge',
  rateLimit({ windowMs: 10 * 60_000, max: 20, key: (req) => req.ip || 'unknown', message: '验证码请求过于频繁，请稍后再试' }),
  rateLimit({ windowMs: 60_000, max: 5, key: (req) => `${req.ip || ''}:${req.body?.phone || ''}`, message: '验证码发送过于频繁，请稍后再试' }),
  asyncHandler(async (req, res) => {
    const input = phoneInput.extend({ purpose: z.literal('login').default('login') }).parse(req.body);
    const phone = normalizePhone(input.phone);
    const challenge = newChallenge({ phone, req });
    await withTransaction(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`phone:${phone}`]);
      const recent = await client.query(`select 1 from auth_challenges where channel='phone' and destination=$1
        and created_at>now()-interval '60 seconds' and consumed_at is null
        and coalesce(metadata->>'deliveryStatus','sent') in ('pending','sent') limit 1`, [phone]);
      if (recent.rowCount) throw new ApiError(429, '验证码发送过于频繁，请稍后再试');
      await client.query("update auth_challenges set consumed_at=now() where channel='phone' and destination=$1 and purpose='login' and consumed_at is null", [phone]);
      await storeChallenge(client, challenge);
    });
    try {
      await deliverSmsCode(phone, challenge.code);
    } catch (error) {
      await query(`update auth_challenges set consumed_at=now(),metadata=jsonb_set(metadata,'{deliveryStatus}','"failed"') where id=$1`, [challenge.id]).catch(() => {});
      throw error;
    }
    await query(`update auth_challenges set metadata=jsonb_set(metadata,'{deliveryStatus}','"sent"') where id=$1`, [challenge.id]);
    res.json({ success: true, message: '验证码已发送' });
  }));

router.post('/login/code', rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(async (req, res) => {
  const input = phoneInput.extend({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const result = await withTransaction(async (client) => {
    const challenge = await consumeLoginChallenge(client, input);
    if (!challenge) return { error: new ApiError(400, '验证码错误或已过期，请重新获取') };
    const found = await client.query(`select id,email,phone,display_name,plan,created_at,auth_version from users where phone=$1 limit 1`, [normalizePhone(input.phone)]);
    if (!found.rowCount) return { error: new ApiError(404, '该手机号尚未注册，请先注册账号') };
    const user = found.rows[0];
    const token = await createSession(client, { userId: user.id, authVersion: user.auth_version, req });
    return { user, token };
  });
  if (result.error) throw result.error;
  res.setHeader('Set-Cookie', sessionCookie(result.token));
  const { user } = result;
  await recordEvent(req, { userId: user.id, eventType: 'auth.sms.login', entityType: 'user', entityId: user.id });
  res.json({ success: true, user: { id: user.id, email: user.email?.endsWith('@phone.local') ? '' : user.email, phone: user.phone || '', displayName: user.display_name, plan: user.plan, createdAt: user.created_at } });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = cookieToken(req.headers.cookie || '');
  if (token) await query("update user_sessions set revoked_at=now(),revoke_reason='logout' where token_hash=$1 and revoked_at is null", [hashSecret(token)]);
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ success: true });
}));

export default router;
