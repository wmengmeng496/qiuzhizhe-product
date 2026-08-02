import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { query, withTransaction } from './db.js';
import { recordEvent } from './events.js';

const emailSchema = z.string().trim().toLowerCase().email();
const phoneSchema = z.string().trim().regex(/^1[3-9]\d{9}$/, '请输入有效的 11 位手机号');
const memoryUsers = new Map();
const CURRENT_AGREEMENT_VERSION = '2026-07-24';

const authSchema = z.object({
  account: z.string().trim().optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  password: z.string().min(6).max(128),
  displayName: z.string().trim().max(80).optional(),
  termsAccepted: z.boolean().optional(),
  agreementVersion: z.string().trim().max(20).optional(),
});

function publicUser(row) {
  return {
    id: row.id,
    email: row.email?.endsWith('@phone.local') ? '' : row.email,
    phone: row.phone || '',
    displayName: row.display_name,
    plan: row.plan,
    createdAt: row.created_at,
  };
}

function isDbUnavailable(error) {
  return error?.code === 'ECONNREFUSED'
    || error?.code === 'ENOTFOUND'
    || error?.code === 'ETIMEDOUT'
    || Array.isArray(error?.errors);
}

async function createMemoryUser(input) {
  const email = emailForAccount(input);
  const key = input.phone || email.toLowerCase();
  const now = new Date().toISOString();
  const existing = memoryUsers.get(key);
  if (existing) return existing;
  const user = {
    id: randomUUID(),
    email,
    phone: input.phone || '',
    password_hash: await bcrypt.hash(input.password, 10),
    display_name: input.displayName || defaultDisplayName(input.account),
    plan: 'ultimate',
    created_at: now,
  };
  memoryUsers.set(key, user);
  if (input.email) memoryUsers.set(input.email.toLowerCase(), user);
  return user;
}

async function findOrCreateMemoryUser(input) {
  const email = input.email || '';
  const key = input.phone || email.toLowerCase();
  const found = memoryUsers.get(key);
  if (found) return found;
  return createMemoryUser(input);
}

function findMemoryUserById(id) {
  for (const user of new Set(memoryUsers.values())) {
    if (user.id === id) return user;
  }
  return null;
}

function restoreMemoryUserFromToken(decoded) {
  if (!decoded?.sub) return null;
  const email = decoded.email || `${decoded.sub}@dev.local`;
  const now = new Date().toISOString();
  const user = {
    id: decoded.sub,
    email,
    phone: '',
    password_hash: '',
    display_name: defaultDisplayName(email),
    plan: decoded.plan || 'ultimate',
    created_at: now,
  };
  memoryUsers.set(user.id, user);
  memoryUsers.set(email.toLowerCase(), user);
  return user;
}

function defaultDisplayName(account) {
  if (/^1[3-9]\d{9}$/.test(account)) return `用户${account.slice(-4)}`;
  const email = account || '';
  return email.split('@')[0].slice(0, 24) || '求职用户';
}

function normalizeAuthInput(body, { requireContact = true } = {}) {
  const parsed = authSchema.parse(body);
  const rawAccount = (parsed.account || parsed.email || parsed.phone || '').trim();
  const looksLikePhone = /^1[3-9]\d{9}$/.test(rawAccount);
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawAccount);
  const email = parsed.email || (looksLikeEmail ? rawAccount.toLowerCase() : undefined);
  const phone = parsed.phone || (looksLikePhone ? rawAccount : undefined);

  if (requireContact && !email && !phone) {
    throw new ApiError(400, '请输入有效的邮箱或手机号');
  }

  return {
    ...parsed,
    email,
    phone,
    account: email || phone || rawAccount,
  };
}

function emailForAccount(input) {
  return input.email || `${input.phone}@phone.local`;
}

function safeRedirectPath(value) {
  if (!value || typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function appBaseUrl(req) {
  if (config.publicUrl) return config.publicUrl.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function tokenCallbackHtml({ token, user, redirect }) {
  const payload = JSON.stringify({ token, user, redirect });
  return `<!doctype html><html><head><meta charset="utf-8"><title>登录成功</title></head><body><script>
const data = ${payload};
localStorage.setItem('job_assistant_token', data.token);
localStorage.setItem('job_assistant_user', JSON.stringify(data.user));
location.replace(data.redirect || '/');
</script></body></html>`;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, plan: user.plan },
    config.jwtSecret,
    { expiresIn: '30d' },
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' && config.jwtSecret !== 'dev-only-change-me') {
      return jwt.verify(token, 'dev-only-change-me');
    }
    throw error;
  }
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new ApiError(401, '请先登录');

    const decoded = verifyToken(token);
    try {
      const result = await query(
        'select id, email, phone, display_name, plan, created_at from users where id = $1',
        [decoded.sub],
      );
      if (result.rowCount === 0) throw new ApiError(401, '登录状态已失效');
      req.user = publicUser(result.rows[0]);
    } catch (error) {
      if (!isDbUnavailable(error)) throw error;
      const memoryUser = findMemoryUserById(decoded.sub) || restoreMemoryUserFromToken(decoded);
      if (!memoryUser) throw new ApiError(401, '登录状态已失效，请重新登录');
      req.user = publicUser(memoryUser);
      req.devMemoryAuth = true;
    }
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, '登录状态已失效'));
  }
}

export function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!config.adminToken || token !== config.adminToken) {
    next(new ApiError(403, '无管理员权限'));
    return;
  }
  next();
}

export async function register(req, res) {
  const input = normalizeAuthInput(req.body);
  if (!input.termsAccepted || input.agreementVersion !== CURRENT_AGREEMENT_VERSION) {
    throw new ApiError(400, '请阅读并同意当前版本的用户协议和隐私政策');
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const displayName = input.displayName || defaultDisplayName(input.account);
  const email = emailForAccount(input);

  try {
    const user = await withTransaction(async (client) => {
      const result = await client.query(
        `insert into users (email, phone, password_hash, display_name)
         values ($1, $2, $3, $4)
         returning id, email, phone, display_name, plan, created_at`,
        [email, input.phone || null, passwordHash, displayName],
      );
      const createdUser = publicUser(result.rows[0]);
      await client.query(
        `insert into user_consents
         (user_id, agreement_version, terms_accepted, privacy_accepted, ip_address, user_agent)
         values ($1, $2, true, true, $3, $4)`,
        [createdUser.id, CURRENT_AGREEMENT_VERSION, req.ip || null, req.get('user-agent') || null],
      );
      return createdUser;
    });
    await recordEvent(req, { userId: user.id, eventType: 'auth.register', entityType: 'user', entityId: user.id });
    res.status(201).json({ success: true, user, token: signToken(user) });
  } catch (error) {
    if (isDbUnavailable(error)) {
      const row = await createMemoryUser(input);
      const user = publicUser(row);
      console.warn('[auth] database unavailable, using in-memory dev user');
      res.status(201).json({ success: true, user, token: signToken(user) });
      return;
    }
    if (error.code === '23505') {
      throw new ApiError(409, input.phone ? '这个手机号已经注册过了' : '这个邮箱已经注册过了');
    }
    throw error;
  }
}

export async function login(req, res) {
  const input = normalizeAuthInput(req.body);
  let result;
  try {
    result = await query(
      `select id, email, phone, password_hash, display_name, plan, created_at
       from users
       where ($1::text is not null and lower(email) = $1)
          or ($2::text is not null and phone = $2)
       limit 1`,
      [input.email || null, input.phone || null],
    );
  } catch (error) {
    if (!isDbUnavailable(error)) throw error;
    const row = await findOrCreateMemoryUser(input);
    const ok = await bcrypt.compare(input.password, row.password_hash);
    if (!ok) throw new ApiError(401, '账号或密码不正确');
    const user = publicUser(row);
    console.warn('[auth] database unavailable, using in-memory dev user');
    res.json({ success: true, user, token: signToken(user) });
    return;
  }

  if (result.rowCount === 0) throw new ApiError(401, '账号或密码不正确');

  const row = result.rows[0];
  if (!row.password_hash) throw new ApiError(401, '这个账号是微信登录创建的，请使用微信扫码登录');
  const ok = await bcrypt.compare(input.password, row.password_hash);
  if (!ok) throw new ApiError(401, '账号或密码不正确');

  const user = publicUser(row);
  await recordEvent(req, { userId: user.id, eventType: 'auth.login', entityType: 'user', entityId: user.id });
  res.json({ success: true, user, token: signToken(user) });
}

export function getWechatConfig(req, res) {
  const enabled = Boolean(config.wechat.appId && config.wechat.appSecret);
  res.json({
    success: true,
    enabled,
    startUrl: enabled ? `/api/auth/wechat/start?redirect=${encodeURIComponent(safeRedirectPath(req.query.redirect || '/'))}` : null,
  });
}

export function startWechatLogin(req, res) {
  if (!config.wechat.appId || !config.wechat.appSecret) {
    throw new ApiError(503, '微信扫码登录还没有配置 AppID/AppSecret');
  }

  const redirect = safeRedirectPath(req.query.redirect || '/');
  const state = jwt.sign({ redirect }, config.jwtSecret, { expiresIn: '10m' });
  const callback = config.wechat.redirectUri || `${appBaseUrl(req)}/api/auth/wechat/callback`;
  const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
  url.searchParams.set('appid', config.wechat.appId);
  url.searchParams.set('redirect_uri', callback);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'snsapi_login');
  url.searchParams.set('state', state);
  res.redirect(`${url.toString()}#wechat_redirect`);
}

export async function handleWechatCallback(req, res) {
  if (!config.wechat.appId || !config.wechat.appSecret) {
    throw new ApiError(503, '微信扫码登录还没有配置 AppID/AppSecret');
  }

  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if (!code || !state) throw new ApiError(400, '微信登录回调参数缺失');

  let redirect = '/';
  try {
    redirect = safeRedirectPath(jwt.verify(state, config.jwtSecret).redirect);
  } catch {
    throw new ApiError(400, '微信登录状态已过期，请重新扫码');
  }

  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.searchParams.set('appid', config.wechat.appId);
  tokenUrl.searchParams.set('secret', config.wechat.appSecret);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  const tokenResponse = await fetch(tokenUrl);
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token || !tokenData.openid) {
    throw new ApiError(502, tokenData.errmsg || '微信登录授权失败');
  }

  const profileUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  profileUrl.searchParams.set('access_token', tokenData.access_token);
  profileUrl.searchParams.set('openid', tokenData.openid);
  profileUrl.searchParams.set('lang', 'zh_CN');
  const profileResponse = await fetch(profileUrl);
  const profile = await profileResponse.json();
  if (profile.errcode) throw new ApiError(502, profile.errmsg || '微信用户信息获取失败');

  const providerUserId = profile.unionid || tokenData.unionid || tokenData.openid;
  const nickname = profile.nickname || '微信用户';
  const avatar = profile.headimgurl || '';

  const existing = await query(
    `select u.id, u.email, u.phone, u.display_name, u.plan, u.created_at
     from user_social_accounts s
     join users u on u.id = s.user_id
     where s.provider = 'wechat' and s.provider_user_id = $1`,
    [providerUserId],
  );

  let user;
  if (existing.rowCount > 0) {
    await query(
      `update user_social_accounts
       set nickname = $2, avatar_url = $3, raw_profile = $4, updated_at = now()
       where provider = 'wechat' and provider_user_id = $1`,
      [providerUserId, nickname, avatar, JSON.stringify(profile)],
    );
    user = publicUser(existing.rows[0]);
  } else {
    const email = `wechat_${providerUserId}@wechat.local`;
    const inserted = await query(
      `insert into users (email, password_hash, display_name)
       values ($1, null, $2)
       returning id, email, phone, display_name, plan, created_at`,
      [email, nickname],
    );
    user = publicUser(inserted.rows[0]);
    await query(
      `insert into user_social_accounts
       (user_id, provider, provider_user_id, union_id, nickname, avatar_url, raw_profile)
       values ($1, 'wechat', $2, $3, $4, $5, $6)`,
      [user.id, providerUserId, profile.unionid || tokenData.unionid || null, nickname, avatar, JSON.stringify(profile)],
    );
    await recordEvent(req, { userId: user.id, eventType: 'auth.wechat.register', entityType: 'user', entityId: user.id });
  }

  await recordEvent(req, { userId: user.id, eventType: 'auth.wechat.login', entityType: 'user', entityId: user.id });
  res.type('html').send(tokenCallbackHtml({ token: signToken(user), user, redirect }));
}
