import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config, planLimits } from './config.js';
import { ApiError } from './errors.js';
import { query, withTransaction } from './db.js';
import { recordEvent } from './events.js';
import { optimizeResumeWithAi } from './ai.js';
import { assertAndConsumeUsage, assertModelAllowed, getUsage, refundUsage } from './usage.js';

const OAUTH_SCOPES = ['openid', 'profile', 'resume.read', 'resume.write'];
const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const MCP_PROTOCOL_VERSION = '2025-03-26';

function baseUrl(req) {
  return (config.publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

export function hashToken(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createOpaqueToken(prefix) {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function normalizeRedirectUri(value) {
  try {
    return new URL(String(value)).toString();
  } catch {
    throw new ApiError(400, 'OAuth 回调地址格式无效');
  }
}

export function redirectUriMatches(registeredRedirectUris, redirectUri) {
  const normalizedRedirectUri = normalizeRedirectUri(redirectUri);
  return (registeredRedirectUris || []).some((registeredRedirectUri) => normalizeRedirectUri(registeredRedirectUri) === normalizedRedirectUri);
}

export function normalizeRedirectUris(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) throw new ApiError(400, 'redirect_uris 必须包含至少一个回调地址');
  return value.map((item) => {
    const normalized = normalizeRedirectUri(item);
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new ApiError(400, 'OAuth 回调地址必须使用 HTTPS');
    return normalized;
  });
}

export function normalizeScopes(value) {
  const requested = String(value || OAUTH_SCOPES.join(' ')).split(/\s+/).filter(Boolean);
  const invalid = requested.filter((scope) => !OAUTH_SCOPES.includes(scope));
  if (invalid.length) throw new ApiError(400, `不支持的授权范围：${invalid.join(', ')}`);
  return [...new Set(requested)];
}

function appendOAuthResult(redirectUri, params) {
  const url = new URL(redirectUri);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function verifyClient(clientId, clientSecret, redirectUri) {
  const found = await query('select client_id, client_secret_hash, redirect_uris, client_name from oauth_clients where client_id = $1', [clientId]);
  if (!found.rowCount) throw new ApiError(401, 'invalid_client');
  const client = found.rows[0];
  if (clientSecret !== undefined && (!clientSecret || !(await bcrypt.compare(String(clientSecret), client.client_secret_hash)))) throw new ApiError(401, 'invalid_client');
  if (redirectUri && !redirectUriMatches(client.redirect_uris, redirectUri)) throw new ApiError(400, 'invalid_grant');
  return client;
}

async function issueTokens(clientId, userId, scope) {
  const accessToken = createOpaqueToken('zyat');
  const refreshToken = createOpaqueToken('zyrt');
  await query(
    `insert into oauth_tokens
     (client_id, user_id, access_token_hash, refresh_token_hash, scope, access_expires_at, refresh_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [clientId, userId, hashToken(accessToken), hashToken(refreshToken), scope,
      new Date(Date.now() + ACCESS_TOKEN_TTL_MS), new Date(Date.now() + REFRESH_TOKEN_TTL_MS)],
  );
  return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_MS / 1000, refresh_token: refreshToken, scope };
}

export function oauthProtectedResourceMetadata(req, res) {
  const root = baseUrl(req);
  res.json({ resource: `${root}/api/mcp`, authorization_servers: [root], scopes_supported: OAUTH_SCOPES, bearer_methods_supported: ['header'] });
}

export function oauthAuthorizationServerMetadata(req, res) {
  const root = baseUrl(req);
  res.json({
    issuer: root,
    authorization_endpoint: `${root}/api/oauth/authorize`,
    token_endpoint: `${root}/api/oauth/token`,
    registration_endpoint: `${root}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: OAUTH_SCOPES,
  });
}

export async function registerOAuthClient(req, res) {
  res.set('Cache-Control', 'no-store');
  const redirectUris = normalizeRedirectUris(req.body?.redirect_uris);
  const clientName = String(req.body?.client_name || 'WorkBuddy Connector').trim().slice(0, 120);
  const clientId = `zyc_${randomBytes(16).toString('hex')}`;
  const clientSecret = createOpaqueToken('zys');
  await query('insert into oauth_clients (client_id, client_secret_hash, client_name, redirect_uris) values ($1, $2, $3, $4)', [clientId, await bcrypt.hash(clientSecret, 10), clientName, redirectUris]);
  res.status(201).json({ client_id: clientId, client_secret: clientSecret, client_name: clientName, redirect_uris: redirectUris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_post' });
}

export async function startOAuthAuthorization(req, res) {
  const input = z.object({
    response_type: z.literal('code'), client_id: z.string().min(1), redirect_uri: z.string().url(), scope: z.string().optional(), state: z.string().max(2000).optional(),
    code_challenge: z.string().min(43).max(128), code_challenge_method: z.literal('S256'),
  }).parse(req.query);
  const redirectUri = normalizeRedirectUri(input.redirect_uri);
  const client = await verifyClient(input.client_id, undefined, redirectUri);
  const params = new URLSearchParams({ client_id: input.client_id, client_name: client.client_name, redirect_uri: redirectUri, scope: normalizeScopes(input.scope).join(' '), code_challenge: input.code_challenge, code_challenge_method: input.code_challenge_method });
  if (input.state) params.set('state', input.state);
  res.redirect(`/oauth/authorize?${params.toString()}`);
}

export async function confirmOAuthAuthorization(req, res) {
  const input = z.object({ clientId: z.string().min(1), redirectUri: z.string().url(), scope: z.string(), state: z.string().max(2000).optional().default(''), codeChallenge: z.string().min(43).max(128), approved: z.boolean() }).parse(req.body);
  const redirectUri = normalizeRedirectUri(input.redirectUri);
  await verifyClient(input.clientId, undefined, redirectUri);
  const scopes = normalizeScopes(input.scope);
  if (!input.approved) {
    res.json({ success: true, redirectUrl: appendOAuthResult(redirectUri, { error: 'access_denied', state: input.state }) });
    return;
  }
  const code = createOpaqueToken('zyc');
  await query(
    `insert into oauth_authorization_codes (code_hash, client_id, user_id, redirect_uri, scope, code_challenge, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [hashToken(code), input.clientId, req.user.id, redirectUri, scopes.join(' '), input.codeChallenge, new Date(Date.now() + CODE_TTL_MS)],
  );
  await recordEvent(req, { userId: req.user.id, eventType: 'auth.workbuddy.bind', entityType: 'oauth_client', entityId: input.clientId });
  res.json({ success: true, redirectUrl: appendOAuthResult(redirectUri, { code, state: input.state }) });
}

export async function exchangeOAuthToken(req, res) {
  res.set('Cache-Control', 'no-store');
  const grantType = String(req.body?.grant_type || '');
  const clientId = String(req.body?.client_id || '');
  if (!req.body?.client_secret) throw new ApiError(401, 'invalid_client');
  const redirectUri = req.body?.redirect_uri ? normalizeRedirectUri(req.body.redirect_uri) : undefined;
  await verifyClient(clientId, req.body.client_secret, redirectUri);
  if (grantType === 'authorization_code') {
    const challenge = createHash('sha256').update(String(req.body?.code_verifier || '')).digest('base64url');
    const found = await query(
      `update oauth_authorization_codes set consumed_at = now()
       where code_hash = $1 and client_id = $2 and redirect_uri = $3 and code_challenge = $4
         and consumed_at is null and expires_at > now()
       returning user_id, scope`,
      [hashToken(String(req.body?.code || '')), clientId, redirectUri, challenge],
    );
    if (!found.rowCount) throw new ApiError(400, 'invalid_grant');
    res.json(await issueTokens(clientId, found.rows[0].user_id, found.rows[0].scope));
    return;
  }
  if (grantType === 'refresh_token') {
    const found = await query(
      `update oauth_tokens set revoked_at = now()
       where client_id = $1 and refresh_token_hash = $2 and revoked_at is null and refresh_expires_at > now()
       returning user_id, scope`,
      [clientId, hashToken(String(req.body?.refresh_token || ''))],
    );
    if (!found.rowCount) throw new ApiError(400, 'invalid_grant');
    res.json(await issueTokens(clientId, found.rows[0].user_id, found.rows[0].scope));
    return;
  }
  throw new ApiError(400, 'unsupported_grant_type');
}

export async function listOAuthConnections(req, res) {
  const found = await query(
    `select c.client_id, c.client_name, max(t.created_at) as connected_at
     from oauth_tokens t join oauth_clients c on c.client_id = t.client_id
     where t.user_id = $1 and t.revoked_at is null and t.refresh_expires_at > now()
     group by c.client_id, c.client_name order by connected_at desc`,
    [req.user.id],
  );
  res.json({ success: true, connections: found.rows });
}

export async function revokeOAuthConnection(req, res) {
  const clientId = z.string().min(1).parse(req.params.clientId);
  const result = await query(
    'update oauth_tokens set revoked_at = now() where user_id = $1 and client_id = $2 and revoked_at is null returning id',
    [req.user.id, clientId],
  );
  await recordEvent(req, { userId: req.user.id, eventType: 'auth.workbuddy.unbind', entityType: 'oauth_client', entityId: clientId });
  res.json({ success: true, revoked: result.rowCount });
}

async function requireMcpAuth(req, res) {
  const header = req.headers.authorization || '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!raw) {
    res.set('WWW-Authenticate', `Bearer resource_metadata=\"${baseUrl(req)}/.well-known/oauth-protected-resource\"`);
    throw new ApiError(401, 'invalid_token');
  }
  const found = await query(`select t.user_id, t.scope, u.display_name, u.plan from oauth_tokens t join users u on u.id = t.user_id where t.access_token_hash = $1 and t.revoked_at is null and t.access_expires_at > now()`, [hashToken(raw)]);
  if (!found.rowCount) {
    res.set('WWW-Authenticate', `Bearer resource_metadata=\"${baseUrl(req)}/.well-known/oauth-protected-resource\"`);
    throw new ApiError(401, 'invalid_token');
  }
  return found.rows[0];
}

function textContent(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

const optimizeToolSchema = z.object({
  resumeContent: z.string().min(20).max(80000), jobRequirements: z.string().min(20).max(80000), jobTitle: z.string().max(120).optional().default(''), company: z.string().max(120).optional().default(''),
  optimizeMode: z.enum(['full', 'project', 'intro', 'experience', 'skills']).optional().default('full'), model: z.string().optional().default('gpt-5.6-sol'),
});

function requireScope(req, res, user, scope) {
  if (String(user.scope || '').split(/\s+/).includes(scope)) return;
  res.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"`);
  throw new ApiError(403, 'insufficient_scope');
}

async function callMcpTool(req, res, user, name, args) {
  if (name === 'get_account_summary') {
    requireScope(req, res, user, 'profile');
    const usage = await withTransaction((client) => getUsage(client, user.user_id));
    return textContent({ displayName: user.display_name, plan: user.plan, usage, limits: planLimits[user.plan] || planLimits.free, workspaceUrl: `${baseUrl(req)}/workspace` });
  }
  if (name === 'list_resume_optimizations') {
    requireScope(req, res, user, 'resume.read');
    const limit = Math.max(1, Math.min(20, Number(args?.limit || 10)));
    const found = await query('select id, job_title, company, optimize_mode, model, match_score, created_at from resume_optimizations where user_id = $1 order by created_at desc limit $2', [user.user_id, limit]);
    return textContent(found.rows);
  }
  if (name === 'optimize_resume') {
    requireScope(req, res, user, 'resume.write');
    const input = optimizeToolSchema.parse(args || {});
    const authUser = { id: user.user_id, plan: user.plan };
    assertModelAllowed(authUser, input.model);
    const reservation = await withTransaction((client) => assertAndConsumeUsage(client, authUser, 'resume'));
    try {
      const result = await optimizeResumeWithAi({ ...input, keywordMatch: true, resumePageImages: [], aiConsent: true });
      const normalized = {
        originalContent: result.extractedResumeContent || input.resumeContent, optimizedContent: String(result.optimizedContent || ''),
        highlightedContent: result.highlightedContent ? String(result.highlightedContent) : null, keywords: Array.isArray(result.keywords) ? result.keywords.map(String) : [],
        improvements: Array.isArray(result.improvements) ? result.improvements.map(String) : [], matchScore: result.matchScore != null && Number.isFinite(Number(result.matchScore)) ? Math.max(0, Math.min(100, Number(result.matchScore))) : 0,
        model: String(result.model || input.model),
      };
      if (!normalized.optimizedContent) throw new ApiError(502, 'AI 没有返回优化后的简历内容');
      const saved = await query(
        `insert into resume_optimizations (user_id, job_requirements, resume_content, optimize_mode, model, optimized_content, highlighted_content, keywords, improvements, match_score, status, job_title, company)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',$11,$12) returning id, created_at`,
        [user.user_id, input.jobRequirements, normalized.originalContent, input.optimizeMode, normalized.model, normalized.optimizedContent, normalized.highlightedContent, JSON.stringify(normalized.keywords), JSON.stringify(normalized.improvements), normalized.matchScore, input.jobTitle || null, input.company || null],
      );
      return textContent({ id: saved.rows[0].id, createdAt: saved.rows[0].created_at, usage: reservation, ...normalized });
    } catch (error) {
      await withTransaction((client) => refundUsage(client, authUser, 'resume', reservation.period));
      throw error;
    }
  }
  throw new ApiError(404, `未知工具：${name}`);
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export async function dispatchMcpMessage(req, res, user, message) {
  if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return { status: 400, body: jsonRpcError(null, -32600, 'Invalid Request') };
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
  const id = hasId ? message.id : null;
  const params = message.params || {};

  if (message.method === 'initialize') {
    if (!hasId) return { status: 400, body: jsonRpcError(null, -32600, 'Invalid Request') };
    return {
      status: 200,
      body: {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: '职引简历', version: '1.0.2' },
        },
      },
    };
  }

  if (!hasId) return { status: 202 };

  if (message.method === 'tools/list') {
    return { status: 200, body: { jsonrpc: '2.0', id, result: { tools: [
      { name: 'optimize_resume', description: '根据目标岗位 JD 优化并保存当前用户的中文简历。', inputSchema: { type: 'object', properties: { resumeContent: { type: 'string' }, jobRequirements: { type: 'string' }, jobTitle: { type: 'string' }, company: { type: 'string' }, optimizeMode: { type: 'string', enum: ['full', 'project', 'intro', 'experience', 'skills'] }, model: { type: 'string' } }, required: ['resumeContent', 'jobRequirements'] } },
      { name: 'list_resume_optimizations', description: '读取当前账号最近的简历优化记录摘要。', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } } } },
      { name: 'get_account_summary', description: '查看已绑定职引简历账号的套餐、额度和工作台地址。', inputSchema: { type: 'object', properties: {} } },
    ] } } };
  }

  if (message.method === 'tools/call') {
    if (!params || typeof params.name !== 'string' || !params.name) {
      return { status: 200, body: jsonRpcError(id, -32602, 'Invalid params') };
    }
    try {
      const result = await callMcpTool(req, res, user, params.name, params.arguments);
      return { status: 200, body: { jsonrpc: '2.0', id, result } };
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && error.message === 'insufficient_scope') throw error;
      const messageText = error instanceof ApiError || error instanceof z.ZodError ? error.message : '工具调用失败，请稍后重试';
      return { status: 200, body: { jsonrpc: '2.0', id, result: { ...textContent(messageText), isError: true } } };
    }
  }

  return { status: 200, body: jsonRpcError(id, -32601, 'Method not found') };
}

export async function handleMcp(req, res) {
  const user = await requireMcpAuth(req, res);
  if (!req.is('application/json')) {
    res.status(415).json(jsonRpcError(null, -32600, 'Content-Type must be application/json'));
    return;
  }
  const result = await dispatchMcpMessage(req, res, user, req.body);
  if (result.body === undefined) {
    res.status(result.status).end();
    return;
  }
  res.status(result.status).json(result.body);
}

async function rejectUnsupportedMcpMethod(req, res) {
  await requireMcpAuth(req, res);
  res.set('Allow', 'POST');
  res.status(405).end();
}

export const handleMcpGet = rejectUnsupportedMcpMethod;
export const handleMcpDelete = rejectUnsupportedMcpMethod;
