import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { ApiError } from './errors.js';

export const SESSION_COOKIE = 'zhiyin_session';
export const normalizePhone = (value) => {
  const phone = String(value || '').replace(/[\s-]/g, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new ApiError(400, '请输入有效的 11 位手机号');
  return phone;
};
export const hashSecret = (value) => createHash('sha256').update(String(value)).digest('hex');
export const hashChallengeCode = (code, phone, challengeId) => createHmac('sha256', config.jwtSecret)
  .update(`${challengeId}:${phone}:${code}`)
  .digest('hex');
const hashesEqual = (left, right) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
export const generateCode = () => String(randomInt(100000, 1000000));
export function newChallenge({ phone, req = {}, ttlMs = 5 * 60_000 }) {
  const code = generateCode();
  const id = randomUUID();
  const normalizedPhone = normalizePhone(phone);
  return { id, code, phone: normalizedPhone, secretHash: hashChallengeCode(code, normalizedPhone, id), expiresAt: new Date(Date.now() + ttlMs), ip: req.ip || '', userAgent: req.get?.('user-agent') || req.headers?.['user-agent'] || '' };
}
export async function storeChallenge(client, challenge) {
  await client.query(`insert into auth_challenges(id,channel,destination,purpose,secret_hash,expires_at,request_ip,user_agent,metadata)
    values($1,'phone',$2,'login',$3,$4,$5,$6,'{"deliveryStatus":"pending"}'::jsonb)`,
  [challenge.id, challenge.phone, challenge.secretHash, challenge.expiresAt, challenge.ip, challenge.userAgent]);
}
export async function consumeLoginChallenge(client, { phone, code }) {
  const normalized = normalizePhone(phone);
  const result = await client.query(`select * from auth_challenges where channel='phone' and destination=$1 and purpose='login'
    and consumed_at is null and expires_at>now() and attempts<max_attempts and coalesce(metadata->>'deliveryStatus','sent')='sent'
    order by created_at desc limit 1 for update`, [normalized]);
  if (!result.rowCount) return null;
  const challenge = result.rows[0];
  if (!hashesEqual(challenge.secret_hash, hashChallengeCode(code, normalized, challenge.id))) {
    await client.query(`update auth_challenges set attempts=attempts+1,
      consumed_at=case when attempts+1>=max_attempts then now() else consumed_at end where id=$1`, [challenge.id]);
    return null;
  }
  await client.query('update auth_challenges set consumed_at=now() where id=$1', [challenge.id]);
  return challenge;
}
export const createSessionToken = () => randomBytes(32).toString('base64url');
export async function createSession(client, { userId, authVersion = 0, req = {} }) {
  const token = createSessionToken(); const now = Date.now();
  await client.query(`insert into user_sessions(user_id,token_hash,auth_version,ip,user_agent,idle_expires_at,absolute_expires_at)
    values($1,$2,$3,$4,$5,$6,$7)`, [userId, hashSecret(token), authVersion, req.ip || '', req.get?.('user-agent') || '', new Date(now + 7 * 86400000), new Date(now + 30 * 86400000)]);
  return token;
}
export async function resolveSession(client, token) {
  if (!token) return null;
  const result = await client.query(`select s.id session_id,u.* from user_sessions s join users u on u.id=s.user_id
    where s.token_hash=$1 and s.auth_version=u.auth_version and s.revoked_at is null and s.idle_expires_at>now() and s.absolute_expires_at>now() limit 1`, [hashSecret(token)]);
  if (!result.rowCount) return null;
  await client.query("update user_sessions set last_seen_at=now(),idle_expires_at=least(absolute_expires_at,now()+interval '7 days') where id=$1", [result.rows[0].session_id]);
  return result.rows[0];
}
export function cookieToken(header = '') {
  for (const part of String(header).split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}
export const sessionCookie = (token) => `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
