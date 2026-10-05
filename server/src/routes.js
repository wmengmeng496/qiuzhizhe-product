import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  getWechatConfig,
  handleWechatCallback,
  login,
  register,
  requireAdmin,
  requireAuth,
  startWechatLogin,
} from './auth.js';
import { checkDatabase, query, withTransaction } from './db.js';
import { asyncHandler, ApiError } from './errors.js';
import { analyzeInterviewQuestion, generateCareerPhotoWithAi, optimizeResumeWithAi, summarizeInterviewReview } from './ai.js';
import { assertAndConsumeUsage, assertModelAllowed, getUsage, refundUsage } from './usage.js';
import { config, planLimits } from './config.js';
import { recordEvent } from './events.js';
import { sendCode } from './sms.js';
import { aiProvider } from '../config/ai.config.js';
import { rateLimit } from './rate-limit.js';
import { assertPublicAllowedUrl, fetchWithTimeout, readResponseText } from './url-safety.js';
import {
  consumeDevCareerPhotoUsage,
  consumeDevInterviewUsage,
  consumeDevResumeUsage,
  deleteDevUserData,
  getDevUsage,
  listDevResumeOptimizations,
  refundDevCareerPhotoUsage,
  refundDevInterviewUsage,
  refundDevResumeUsage,
  saveDevResumeOptimization,
} from './dev-store.js';

const router = Router();

export const optimizeSchema = z.object({
  resumeContent: z.string().max(80000),
  jobRequirements: z.string().min(20).max(80000),
  optimizeMode: z.enum(['full', 'project', 'intro', 'experience', 'skills']).default('full'),
  model: z.string().default('gpt-5.6-sol'),
  keywordMatch: z.boolean().default(true),
  jobTitle: z.string().trim().max(120).optional().default(''),
  company: z.string().trim().max(120).optional().default(''),
  resumePageImages: z.array(z.string().regex(/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, '简历图片必须是有效的图片数据').max(3_000_000)).max(3).optional().default([]),
  aiConsent: z.literal(true),
}).superRefine((input, context) => {
  if (input.resumeContent.trim().length < 20 && input.resumePageImages.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 20, inclusive: true, type: 'string', path: ['resumeContent'], message: '简历文本至少需要 20 个字符，或提供 1-3 张简历图片用于 OCR' });
  }
  if (input.resumeContent.trim().length < 20 && input.resumePageImages.length < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['resumePageImages'], message: '图片简历必须提供 1-3 张图片' });
  }
});

const interviewSchema = z.object({
  company: z.string().min(1).max(120),
  position: z.string().min(1).max(120),
  industry: z.string().max(80).optional().default('其他'),
  date: z.string().min(8).max(20),
  model: z.string().default('gpt-4o'),
  questions: z.array(z.object({
    question: z.string().min(1).max(4000),
    answer: z.string().min(1).max(12000),
  })).min(1).max(10),
});

const careerPhotoSchema = z.object({
  imageDataUrl: z.string().min(100).max(12_000_000),
  gender: z.enum(['male', 'female']),
  style: z.string().min(2).max(60),
  prompt: z.string().min(20).max(4000),
});

const manualOrderSchema = z.object({
  plan: z.enum(['pro', 'ultimate']),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  contact: z.string().trim().max(120).optional().default(''),
  remark: z.string().trim().max(500).optional().default(''),
});

const jobDescriptionSchema = z.object({
  url: z.string().trim().url().max(2000),
});

const orderPrices = {
  pro: { monthly: 2900, yearly: 27800 },
  ultimate: { monthly: 5900, yearly: 56600 },
};

function isDbUnavailable(error) {
  return error?.code === 'ECONNREFUSED'
    || error?.code === 'ENOTFOUND'
    || error?.code === 'ETIMEDOUT'
    || error?.code === 'EPERM'
    || error?.code === 'EACCES'
    || Array.isArray(error?.errors);
}

async function reserveResumeUsage(req) {
  if (req.devMemoryAuth) return consumeDevResumeUsage(req.user);
  return withTransaction((client) => assertAndConsumeUsage(client, req.user, 'resume'));
}

async function refundResumeUsage(req, reservation) {
  if (req.devMemoryAuth) {
    refundDevResumeUsage(req.user.id, reservation.period);
    return;
  }
  await withTransaction((client) => refundUsage(client, req.user, 'resume', reservation.period));
}

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'job-assistant-api',
    release: config.release,
    time: new Date().toISOString(),
    ai: {
      configured: Boolean(config.ai.key),
      defaultModel: aiProvider.defaultModel,
      ocrModel: aiProvider.ocrModel,
    },
  });
});

router.get('/ready', asyncHandler(async (req, res) => {
  const database = await checkDatabase();
  const ready = database.ready && Boolean(config.ai.key);
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ready' : 'not_ready',
    database,
    ai: { configured: Boolean(config.ai.key) },
  });
}));

router.post('/auth/sms/send', rateLimit({ windowMs: 60_000, max: 5, message: '短信请求过于频繁，请稍后再试' }), asyncHandler(sendCode));

function decodeHtmlEntities(value = '') {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function stripHtml(value = '') {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readMeta(html, names) {
  for (const name of names) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtmlEntities(match[1]).trim();
    }
  }
  return '';
}

function compactLines(lines) {
  return lines.map((line) => line.trim()).filter(Boolean).join('\n');
}

function buildBossJobContent({ url, company, position, salary, location, experience, degree, description, performance, department, reportObject, address, companyInfo }) {
  return compactLines([
    company ? `公司：${company}` : '',
    position ? `岗位：${position}` : '',
    salary ? `薪资：${salary}` : '',
    location ? `地点：${location}` : '',
    experience ? `经验：${experience}` : '',
    degree ? `学历：${degree}` : '',
    performance ? `奖金绩效：\n${performance}` : '',
    description ? `职位详情：\n${description}` : '',
    department ? `所属部门：${department}` : '',
    reportObject ? `汇报对象：${reportObject}` : '',
    address ? `工作地点：${address}` : '',
    companyInfo ? `公司信息：${companyInfo}` : '',
    `来源链接：${url}`,
  ]);
}

function parseBossMicroJob(data, url) {
  if (!data || data.rescode !== 1 || !data.data?.job) return null;
  const job = data.data.job;
  const brand = data.data.brandComInfo || {};
  const company = job.brandName || brand.comName || '';
  const position = job.jobName || '';
  const salary = job.salaryDesc || '';
  const location = [job.locationName, job.experienceName, job.degreeName].filter(Boolean).join('·');
  const companyInfo = [brand.stageName, brand.scaleName, brand.industryName].filter(Boolean).join('·');
  const bodyText = compactLines([job.performance || '', job.postDescription || '']);

  if (bodyText.length < 20 || !position) {
    throw new ApiError(422, 'BOSS 返回了岗位壳信息，但没有返回可用的 JD 正文。请复制 JD 原文后使用「粘贴 JD」。');
  }

  return {
    url,
    content: buildBossJobContent({
      url,
      company,
      position,
      salary,
      location,
      experience: job.experienceName || '',
      degree: job.degreeName || '',
      description: job.postDescription || '',
      performance: job.performance || '',
      department: job.department || '',
      reportObject: job.reportObject || '',
      address: job.address || '',
      companyInfo,
    }).slice(0, 20000),
    company,
    position,
    salary,
    location,
  };
}

async function fetchBossMicroJob(targetUrl) {
  const sjid = targetUrl.pathname.match(/\/weijd-job\/([^/?#]+)/)?.[1];
  if (!sjid) return null;

  const params = new URLSearchParams();
  params.set('aid', targetUrl.searchParams.get('aid') || '');
  params.set('fromSource', targetUrl.searchParams.get('fromSource') || '-1');
  const apiUrl = `https://m.zhipin.com/wapi/zpjob/wjd/job/${encodeURIComponent(sjid)}?${params.toString()}`;
  await assertPublicAllowedUrl(new URL(apiUrl), ['zhipin.com']);
  const response = await fetchWithTimeout(apiUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
      referer: targetUrl.toString(),
      'x-requested-with': 'XMLHttpRequest',
    },
    redirect: 'manual',
  });

  const location = response.headers.get('location') || '';
  if (response.status >= 300 && response.status < 400 && /security|verify|captcha/i.test(location)) {
    throw new ApiError(409, 'BOSS 触发了安全验证，后端无法直接读取这个链接。请复制 JD 原文后使用「粘贴 JD」。');
  }
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    const text = await readResponseText(response, 1_000_000);
    if (/security|请稍候|安全验证|captcha|verify/i.test(text)) {
      throw new ApiError(409, 'BOSS 触发了安全验证，后端无法直接读取这个链接。请复制 JD 原文后使用「粘贴 JD」。');
    }
    return null;
  }

  const data = JSON.parse(await readResponseText(response, 1_000_000));
  if (data?.rescode && data.rescode !== 1) {
    throw new ApiError(422, data.message || data.errmsg || 'BOSS 没有返回可用的岗位 JD。');
  }
  return parseBossMicroJob(data, targetUrl.toString());
}

function parseBossJobHtml(html, url) {
  const title = readMeta(html, ['og:title', 'twitter:title']) || decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const description = readMeta(html, ['description', 'og:description', 'twitter:description']);
  const keywords = readMeta(html, ['keywords']);
  const visibleText = stripHtml(html);
  const combined = compactLines([title, description, keywords, visibleText]);

  if (/安全验证|登录后查看|请登录|访问异常|verify|captcha/i.test(combined)) {
    throw new ApiError(409, 'BOSS 页面需要登录或安全验证，暂时无法自动读取。请复制 JD 原文后使用「粘贴 JD」。');
  }
  if (/<div\s+id=["']app["']><\/div>/i.test(html) && /weijd\/js\/weijd\./i.test(html) && !description && !title) {
    throw new ApiError(409, '这个 BOSS 链接只返回了空页面壳，真实 JD 需要页面脚本二次请求且当前被 BOSS 拦截。请复制 JD 原文后使用「粘贴 JD」。');
  }

  const position = (title.match(/^(.+?)(?:招聘|_|-|—|\|)/)?.[1] || '').trim();
  const salary = combined.match(/(?:薪资|薪酬|待遇)[:：\s]*([0-9.]+[kK万千]?[-~至][0-9.]+[kK万千]?(?:·\d+薪)?)/)?.[1]
    || combined.match(/([0-9.]+[kK][-~至][0-9.]+[kK](?:·\d+薪)?)/)?.[1]
    || '';
  const location = combined.match(/(?:地点|城市|工作地址)[:：\s]*([^\n，,。]{2,30})/)?.[1]?.trim() || '';
  const company = combined.match(/(?:公司|企业)[:：\s]*([^\n，,。]{2,60})/)?.[1]?.trim()
    || title.match(/[|｜]\s*([^|｜_-]{2,60})(?:招聘|_|-|—|\|)?/)?.[1]?.trim()
    || '';

  const bodyText = compactLines([description, visibleText]);
  const content = buildBossJobContent({
    url,
    company,
    position,
    salary,
    location,
    description,
  });

  if (bodyText.length < 40 || (!position && !company)) {
    throw new ApiError(422, '没有从链接中解析到完整 JD。请确认链接可公开访问，或复制 JD 原文后粘贴。');
  }

  return {
    url,
    content: content.slice(0, 20000),
    company,
    position,
    salary,
    location,
  };
}

router.post('/auth/register', rateLimit({ windowMs: 60_000, max: 10 }), asyncHandler(register));
router.post('/auth/login', rateLimit({ windowMs: 60_000, max: 20 }), asyncHandler(login));
router.get('/auth/wechat/config', asyncHandler(getWechatConfig));
router.get('/auth/wechat/start', asyncHandler(startWechatLogin));
router.get('/auth/wechat/callback', asyncHandler(handleWechatCallback));

router.post('/job-description/fetch', rateLimit({ windowMs: 60_000, max: 20 }), asyncHandler(async (req, res) => {
  const input = jobDescriptionSchema.parse(req.body);
  const targetUrl = new URL(input.url);
  await assertPublicAllowedUrl(targetUrl, ['zhipin.com', 'kanzhun.com', 'bosszhipin.com']);
  if (!/(^|\.)zhipin\.com$|(^|\.)kanzhun\.com$|(^|\.)bosszhipin\.com$/i.test(targetUrl.hostname)) {
    throw new ApiError(400, '请粘贴 BOSS 直聘岗位链接');
  }

  const microJob = await fetchBossMicroJob(targetUrl);
  if (microJob) {
    res.json({ success: true, job: microJob });
    return;
  }

  const response = await fetchWithTimeout(targetUrl.toString(), {
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
    },
    redirect: 'manual',
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new ApiError(502, 'BOSS 页面重定向地址无效');
    const redirectUrl = new URL(location, targetUrl);
    await assertPublicAllowedUrl(redirectUrl, ['zhipin.com', 'kanzhun.com', 'bosszhipin.com']);
    throw new ApiError(409, 'BOSS 页面发生跨页面重定向，请复制 JD 原文后使用「粘贴 JD」。');
  }
  if (!response.ok) {
    throw new ApiError(502, `BOSS 页面读取失败：HTTP ${response.status}`);
  }

  const html = await readResponseText(response, 2_000_000);
  const job = parseBossJobHtml(html, targetUrl.toString());
  res.json({ success: true, job });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  if (req.devMemoryAuth) {
    res.json({
      success: true,
      user: req.user,
      usage: getDevUsage(req.user.id),
      limits: planLimits[req.user.plan] || planLimits.free,
    });
    return;
  }

  const usage = await withTransaction((client) => getUsage(client, req.user.id));
  res.json({
    success: true,
    user: req.user,
    usage,
    limits: planLimits[req.user.plan] || planLimits.free,
  });
}));

// Export application data without credentials or third-party raw profiles.
router.get('/me/export', requireAuth, asyncHandler(async (req, res) => {
  if (req.devMemoryAuth) {
    res.json({ success: true, exportedAt: new Date().toISOString(), user: req.user, usage: getDevUsage(req.user.id), resumeOptimizations: listDevResumeOptimizations(req.user.id), orders: [], interviewReviews: [] });
    return;
  }
  const [optimizations, orders, reviews] = await Promise.all([
    query('select id, job_title, company, job_requirements, resume_content, optimize_mode, model, optimized_content, highlighted_content, keywords, improvements, match_score, status, created_at from resume_optimizations where user_id = $1 order by created_at desc', [req.user.id]),
    query('select id, plan, billing_cycle, amount, currency, provider, status, contact, remark, admin_note, approved_at, created_at, updated_at from orders where user_id = $1 order by created_at desc', [req.user.id]),
    query('select r.id, r.company, r.position, r.industry, r.interview_date, r.model, r.overall_rating, r.summary, r.improvements, r.status, r.created_at, q.id as question_id, q.question, q.answer, q.score, q.analysis, q.suggestion from interview_reviews r left join interview_review_questions q on q.review_id = r.id where r.user_id = $1 order by r.created_at desc, q.created_at asc', [req.user.id]),
  ]);
  res.json({ success: true, exportedAt: new Date().toISOString(), user: req.user, resumeOptimizations: optimizations.rows, orders: orders.rows, interviewReviews: reviews.rows });
}));

router.delete('/me/data', requireAuth, asyncHandler(async (req, res) => {
  if (req.devMemoryAuth) {
    deleteDevUserData(req.user.id, { preserveUsage: true });
    res.json({ success: true });
    return;
  }
  await withTransaction(async (client) => {
    await client.query('delete from resume_optimizations where user_id = $1', [req.user.id]);
    await client.query('delete from interview_reviews where user_id = $1', [req.user.id]);
  });
  res.json({ success: true });
}));

router.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  const input = z.object({
    confirmation: z.literal('DELETE'),
    password: z.string().max(128).optional(),
  }).parse(req.body);
  if (req.devMemoryAuth) {
    const { verifyMemoryUserPassword, forgetMemoryUser } = await import('./auth.js');
    if (!(await verifyMemoryUserPassword(req.user.id, input.password))) {
      throw new ApiError(403, '密码不正确');
    }
    forgetMemoryUser(req.user.id);
    deleteDevUserData(req.user.id);
    res.json({ success: true });
    return;
  }
  const deleted = await withTransaction(async (client) => {
    const found = await client.query('select password_hash from users where id = $1 for update', [req.user.id]);
    if (!found.rowCount) throw new ApiError(404, '用户不存在');
    if (found.rows[0].password_hash && !(await bcrypt.compare(input.password || '', found.rows[0].password_hash))) {
      throw new ApiError(403, '密码不正确');
    }
    return client.query('delete from users where id = $1 returning id', [req.user.id]);
  });
  if (!deleted.rowCount) throw new ApiError(404, '用户不存在');
  res.json({ success: true });
}));

router.post('/resume-optimizations', rateLimit({ windowMs: 60_000, max: 10, message: 'AI 简历优化请求过于频繁，请稍后再试' }), requireAuth, asyncHandler(async (req, res) => {
  const input = optimizeSchema.parse(req.body);
  assertModelAllowed(req.user, input.model);

  // Reserve quota before paying the upstream AI cost. Refund it if generation fails.
  const reservation = await reserveResumeUsage(req);
  let result;
  try {
    result = await optimizeResumeWithAi(input);
  } catch (error) {
    await refundResumeUsage(req, reservation);
    throw error;
  }
  const normalized = {
    originalContent: result.extractedResumeContent || input.resumeContent,
    optimizedContent: String(result.optimizedContent || ''),
    highlightedContent: result.highlightedContent ? String(result.highlightedContent) : null,
    keywords: Array.isArray(result.keywords) ? result.keywords.map(String) : [],
    improvements: Array.isArray(result.improvements) ? result.improvements.map(String) : [],
    matchScore: Number.isFinite(Number(result.matchScore)) ? Math.max(0, Math.min(100, Number(result.matchScore))) : 75,
    mode: input.optimizeMode,
    model: String(result.model || input.model),
  };

  if (!normalized.optimizedContent) {
    await refundResumeUsage(req, reservation);
    throw new ApiError(502, 'AI 没有返回优化后的简历内容');
  }

  try {
    const saved = req.devMemoryAuth
      ? saveDevResumeOptimization(req.user.id, {
        job_title: input.jobTitle || null,
        company: input.company || null,
        job_requirements: input.jobRequirements,
        resume_content: input.resumeContent,
        optimize_mode: input.optimizeMode,
        model: normalized.model,
        optimized_content: normalized.optimizedContent,
        highlighted_content: normalized.highlightedContent,
        keywords: normalized.keywords,
        improvements: normalized.improvements,
        match_score: normalized.matchScore,
      })
      : await withTransaction(async (client) => {
        const insert = await client.query(
          `insert into resume_optimizations
           (user_id, job_requirements, resume_content, optimize_mode, model, optimized_content,
            highlighted_content, keywords, improvements, match_score, status, job_title, company)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',$11,$12)
           returning id, created_at`,
          [
            req.user.id,
            input.jobRequirements,
            normalized.originalContent,
            input.optimizeMode,
            normalized.model,
            normalized.optimizedContent,
            normalized.highlightedContent,
            JSON.stringify(normalized.keywords),
            JSON.stringify(normalized.improvements),
            normalized.matchScore,
            input.jobTitle || null,
            input.company || null,
          ],
        );
        return insert.rows[0];
      });
    if (!req.devMemoryAuth) {
      await recordEvent(req, {
        userId: req.user.id,
        eventType: 'resume.optimize.completed',
        entityType: 'resume_optimization',
        entityId: saved.id,
        metadata: { mode: input.optimizeMode, model: normalized.model, matchScore: normalized.matchScore },
      });
    }
    res.status(201).json({
      success: true,
      result: {
        id: saved.id,
        createdAt: saved.created_at,
        usage: reservation,
        model: normalized.model,
        jobTitle: input.jobTitle || null,
        company: input.company || null,
        ...normalized,
      },
    });
  } catch (error) {
    await refundResumeUsage(req, reservation);
    throw error;
  }
}));

router.post('/career-assets/photo', rateLimit({ windowMs: 60_000, max: 3, message: '形象照生成请求过于频繁，请稍后再试' }), requireAuth, asyncHandler(async (req, res) => {
  const input = careerPhotoSchema.parse(req.body);
  const reservation = req.devMemoryAuth
    ? consumeDevCareerPhotoUsage(req.user)
    : await withTransaction((client) => assertAndConsumeUsage(client, req.user, 'careerPhoto'));
  let result;
  try {
    result = await generateCareerPhotoWithAi(input);
  } catch (error) {
    if (req.devMemoryAuth) refundDevCareerPhotoUsage(req.user.id, reservation.period);
    else await withTransaction((client) => refundUsage(client, req.user, 'careerPhoto', reservation.period));
    throw error;
  }

  await recordEvent(req, {
    userId: req.user.id,
    eventType: 'career.photo.generated',
    entityType: 'career_asset',
    entityId: null,
    metadata: { gender: input.gender, style: input.style, model: result.model },
  });

  res.status(201).json({ success: true, result, usage: reservation });
}));

router.post('/orders/manual', requireAuth, asyncHandler(async (req, res) => {
  const input = manualOrderSchema.parse(req.body);
  const amount = orderPrices[input.plan][input.billingCycle];
  const result = await query(
    `insert into orders (user_id, plan, billing_cycle, amount, provider, status, contact, remark)
     values ($1,$2,$3,$4,'manual','pending',$5,$6)
     returning id, plan, billing_cycle, amount, currency, provider, status, contact, remark, created_at`,
    [req.user.id, input.plan, input.billingCycle, amount, input.contact, input.remark],
  );
  const order = result.rows[0];
  await recordEvent(req, {
    userId: req.user.id,
    eventType: 'order.manual.created',
    entityType: 'order',
    entityId: order.id,
    metadata: { plan: input.plan, billingCycle: input.billingCycle, amount },
  });
  res.status(201).json({ success: true, order });
}));

router.get('/orders', requireAuth, asyncHandler(async (req, res) => {
  const result = await query(
    `select id, plan, billing_cycle, amount, currency, provider, status, contact, remark, admin_note, approved_at, created_at, updated_at
     from orders
     where user_id = $1
     order by created_at desc
     limit 50`,
    [req.user.id],
  );
  res.json({ success: true, items: result.rows });
}));

router.get('/resume-optimizations', requireAuth, asyncHandler(async (req, res) => {
  if (req.devMemoryAuth) {
    res.json({ success: true, items: listDevResumeOptimizations(req.user.id) });
    return;
  }
  const result = await query(
    `select id, job_title, company, job_requirements, resume_content, optimize_mode, model,
            optimized_content, highlighted_content, keywords, improvements, match_score, status, created_at
     from resume_optimizations
     where user_id = $1
     order by created_at desc
     limit 100`,
    [req.user.id],
  );
  res.json({ success: true, items: result.rows });
}));

router.post('/interview-reviews', rateLimit({ windowMs: 60_000, max: 6, message: '面试复盘请求过于频繁，请稍后再试' }), requireAuth, asyncHandler(async (req, res) => {
  const input = interviewSchema.parse(req.body);
  assertModelAllowed(req.user, input.model);

  const reservation = req.devMemoryAuth
    ? consumeDevInterviewUsage(req.user)
    : await withTransaction((client) => assertAndConsumeUsage(client, req.user, 'interview'));

  try {
    const analyzed = [];
    for (const item of input.questions) {
    const analysis = await analyzeInterviewQuestion({
      model: input.model,
      position: input.position,
      question: item.question,
      answer: item.answer,
    });
    analyzed.push({
      question: item.question,
      answer: item.answer,
      score: Math.max(0, Math.min(100, Number(analysis.score) || 0)),
      analysis: String(analysis.analysis || ''),
      suggestion: String(analysis.suggestion || ''),
    });
  }

  const overall = await summarizeInterviewReview({
    model: input.model,
    position: input.position,
    questions: analyzed,
  });
    const overallRating = Math.round(analyzed.reduce((sum, q) => sum + q.score, 0) / analyzed.length);

    const saved = await withTransaction(async (client) => {
    const review = await client.query(
      `insert into interview_reviews
       (user_id, company, position, industry, interview_date, model, overall_rating, summary, improvements, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed')
       returning id, created_at`,
      [
        req.user.id,
        input.company,
        input.position,
        input.industry || '其他',
        input.date,
        input.model,
        overallRating,
        String(overall.summary || ''),
        JSON.stringify(Array.isArray(overall.improvements) ? overall.improvements.map(String) : []),
      ],
    );

    for (const item of analyzed) {
      await client.query(
        `insert into interview_review_questions
         (review_id, question, answer, score, analysis, suggestion)
         values ($1,$2,$3,$4,$5,$6)`,
        [review.rows[0].id, item.question, item.answer, item.score, item.analysis, item.suggestion],
      );
    }

    return review.rows[0];
  });

    res.status(201).json({
      success: true,
      review: {
      id: saved.id,
      company: input.company,
      position: input.position,
      industry: input.industry,
      date: input.date,
      model: input.model,
      overallRating,
      status: 'completed',
      summary: String(overall.summary || ''),
      improvements: Array.isArray(overall.improvements) ? overall.improvements.map(String) : [],
      questions: analyzed.map((q, index) => ({ id: `${saved.id}-${index}`, ...q })),
        createdAt: saved.created_at,
      },
    });
  } catch (error) {
    if (reservation) {
      if (req.devMemoryAuth) refundDevInterviewUsage(req.user.id, reservation.period);
      else await withTransaction((client) => refundUsage(client, req.user, 'interview', reservation.period));
    }
    throw error;
  }
}));

router.get('/interview-reviews', requireAuth, asyncHandler(async (req, res) => {
  const reviews = await query(
    `select id, company, position, industry, interview_date, model, overall_rating, summary, improvements, status, created_at
     from interview_reviews
     where user_id = $1
     order by created_at desc
     limit 100`,
    [req.user.id],
  );
  const ids = reviews.rows.map((row) => row.id);
  const questions = ids.length
    ? await query(
      `select id, review_id, question, answer, score, analysis, suggestion
       from interview_review_questions
       where review_id = any($1::uuid[])
       order by created_at asc`,
      [ids],
    )
    : { rows: [] };

  const byReview = new Map();
  for (const item of questions.rows) {
    if (!byReview.has(item.review_id)) byReview.set(item.review_id, []);
    byReview.get(item.review_id).push(item);
  }

  res.json({
    success: true,
    items: reviews.rows.map((row) => ({
      ...row,
      questions: byReview.get(row.id) || [],
    })),
  });
}));

router.patch('/admin/users/:id/plan', requireAdmin, asyncHandler(async (req, res) => {
  const input = z.object({ plan: z.enum(['free', 'pro', 'ultimate']) }).parse(req.body);
  const result = await query(
    'update users set plan = $1, updated_at = now() where id = $2 returning id, email, display_name, plan, created_at',
    [input.plan, req.params.id],
  );
  if (result.rowCount === 0) throw new ApiError(404, '用户不存在');
  await recordEvent(req, {
    userId: req.params.id,
    eventType: 'admin.user.plan_updated',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { plan: input.plan },
  });
  res.json({ success: true, user: result.rows[0] });
}));

router.get('/admin/data', requireAdmin, asyncHandler(async (req, res) => {
  const type = z.enum(['users', 'orders', 'events', 'optimizations']).default('users').parse(req.query.type || 'users');
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const search = String(req.query.search || '').trim();

  if (type === 'users') {
    const result = await query(
      `select u.id, u.email, u.display_name, u.plan, u.created_at, u.updated_at,
              coalesce(s.provider, '') as social_provider,
              coalesce(s.nickname, '') as social_nickname
       from users u
       left join user_social_accounts s on s.user_id = u.id
       where $1 = '' or u.email ilike '%' || $1 || '%' or u.display_name ilike '%' || $1 || '%' or s.nickname ilike '%' || $1 || '%'
       order by u.created_at desc
       limit $2`,
      [search, limit],
    );
    res.json({ success: true, type, items: result.rows });
    return;
  }

  if (type === 'orders') {
    const result = await query(
      `select o.id, o.plan, o.billing_cycle, o.amount, o.currency, o.provider, o.status,
              o.contact, o.remark, o.admin_note, o.approved_at, o.created_at, o.updated_at,
              u.email, u.display_name
       from orders o
       join users u on u.id = o.user_id
       where $1 = '' or u.email ilike '%' || $1 || '%' or o.contact ilike '%' || $1 || '%' or o.status = $1
       order by o.created_at desc
       limit $2`,
      [search, limit],
    );
    res.json({ success: true, type, items: result.rows });
    return;
  }

  if (type === 'events') {
    const result = await query(
      `select e.id, e.event_type, e.entity_type, e.entity_id, e.metadata, e.ip, e.user_agent, e.created_at,
              u.email, u.display_name
       from app_events e
       left join users u on u.id = e.user_id
       where $1 = '' or e.event_type ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%'
       order by e.created_at desc
       limit $2`,
      [search, limit],
    );
    res.json({ success: true, type, items: result.rows });
    return;
  }

  const result = await query(
    `select r.id, r.optimize_mode, r.model, r.match_score, r.status, r.created_at,
            left(r.job_requirements, 240) as job_requirements_preview,
            u.email, u.display_name
     from resume_optimizations r
     join users u on u.id = r.user_id
     where $1 = '' or u.email ilike '%' || $1 || '%' or r.optimize_mode = $1
     order by r.created_at desc
     limit $2`,
    [search, limit],
  );
  res.json({ success: true, type, items: result.rows });
}));

router.patch('/admin/orders/:id', requireAdmin, asyncHandler(async (req, res) => {
  const input = z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
    adminNote: z.string().trim().max(500).optional().default(''),
  }).parse(req.body);

  const saved = await withTransaction(async (client) => {
    const orderResult = await client.query(
      `update orders
       set status = $1, admin_note = $2, approved_at = case when $1 = 'approved' then now() else approved_at end, updated_at = now()
       where id = $3
       returning id, user_id, plan, billing_cycle, amount, currency, provider, status, contact, remark, admin_note, approved_at, created_at, updated_at`,
      [input.status, input.adminNote, req.params.id],
    );
    if (orderResult.rowCount === 0) throw new ApiError(404, '订单不存在');
    const order = orderResult.rows[0];
    if (input.status === 'approved') {
      await client.query('update users set plan = $1, updated_at = now() where id = $2', [order.plan, order.user_id]);
    }
    return order;
  });

  await recordEvent(req, {
    userId: saved.user_id,
    eventType: `admin.order.${input.status}`,
    entityType: 'order',
    entityId: saved.id,
    metadata: { plan: saved.plan, adminNote: input.adminNote },
  });

  res.json({ success: true, order: saved });
}));

export default router;
