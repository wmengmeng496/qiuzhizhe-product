import { config } from './config.js';
import { ApiError } from './errors.js';
import { redactAiMessages, restoreAiResult } from './pii.js';
import { aiDefaults, aiModelMap, aiPrompts, aiProvider, resumeOptimizeModes } from '../config/ai.config.js';

function extractJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1].trim());

    const object = content.match(/\{[\s\S]*\}/);
    if (object) return JSON.parse(object[0]);

    throw new ApiError(502, 'AI 返回内容无法解析为 JSON');
  }
}

function resolveModel(model) {
  return aiModelMap[model] || model;
}

function uniqueModels(models) {
  return [...new Set(models.map(resolveModel).filter(Boolean))];
}

function contentSimilarity(left = '', right = '') {
  const normalize = (value) => String(value).replace(/\s+/g, '').toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 1;
  const grams = (value) => {
    const result = new Map();
    for (let index = 0; index < value.length - 1; index += 1) {
      const gram = value.slice(index, index + 2);
      result.set(gram, (result.get(gram) || 0) + 1);
    }
    return result;
  };
  const aGrams = grams(a);
  const bGrams = grams(b);
  let overlap = 0;
  for (const [gram, count] of aGrams) overlap += Math.min(count, bGrams.get(gram) || 0);
  return (2 * overlap) / Math.max(a.length + b.length - 2, 1);
}

function shouldTryNextModel(status, detail) {
  return (
    ((status === 400 || status === 404) && /model|模型|channel|渠道|sku/i.test(detail)) ||
    /ChannelCapability|未配置渠道|SKU 路由|model[_ -]?not[_ -]?found|模型.*(?:不存在|未配置)/i.test(detail)
  );
}

function joinUrl(baseURL, path) {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function dataUrlToImage(dataUrl = '') {
  const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) {
    throw new ApiError(400, '请上传 JPG、PNG 或 WebP 格式的本人照片');
  }

  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 8 * 1024 * 1024) {
    throw new ApiError(400, '图片超过 8MB，请压缩后再上传');
  }

  return { buffer, mimeType };
}

function dataUrlToVisionPart(dataUrl = '') {
  const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) {
    throw new ApiError(400, 'PDF 页面图片格式不正确');
  }
  return { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } };
}

function looksReadableResumeText(text = '') {
  const compact = String(text).replace(/\s/g, '');
  if (compact.includes('PDF文本层读取不完整') || compact.includes('原始项目内容待补充') || compact.includes('待补充原始项目背景')) {
    return false;
  }
  const cjk = (compact.match(/[\u4e00-\u9fa5]/g) || []).length;
  const meaningfulWords = (String(text).match(/[A-Za-z]{2,}|[\u4e00-\u9fa5]{2,}/g) || []).length;
  return String(text).trim().length >= 40 && (cjk >= 12 || meaningfulWords >= 8);
}

function parseAiErrorDetail(text) {
  try {
    const parsed = JSON.parse(text);
    return {
      message: parsed?.error?.message || parsed?.message || '上游 AI 服务返回错误',
      code: parsed?.error?.code || parsed?.code || '',
    };
  } catch {
    const title = String(text).match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1] || '';
    if (/524|timeout/i.test(title)) {
      return { message: '上游 ToApis 网关超时，请稍后重试或切换模型', code: 'UPSTREAM_TIMEOUT' };
    }
    if (/<html[\s>]/i.test(String(text))) {
      return { message: '上游 AI 服务返回了网页错误', code: 'UPSTREAM_HTML_ERROR' };
    }
    return { message: '上游 AI 服务返回错误', code: '' };
  }
}

function shouldFallbackToImageGeneration(detail) {
  return /invalid api type|invalid_api_type|ChannelCapability|未配置渠道能力|model_not_found|模型.*未配置/i.test(
    `${detail.code} ${detail.message}`,
  );
}

function normalizeGeneratedImage(data) {
  const directItem = Array.isArray(data?.data) ? data.data[0] : null;
  const taskItem = Array.isArray(data?.result?.data) ? data.result.data[0] : null;
  const item = directItem || taskItem;
  const b64 = item?.b64_json || item?.b64;
  const url = item?.url || '';
  if (!b64 && !url) return '';
  return b64 ? `data:image/png;base64,${b64}` : url;
}

async function pollImageGenerationTask(taskId, signal) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 5 ? 1000 : 2500));
    const response = await fetch(joinUrl(aiProvider.baseURL, `${aiProvider.imageGenerationsPath}/${taskId}`), {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${config.ai.key}`,
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const detail = parseAiErrorDetail(text);
      throw new ApiError(502, `图片任务查询失败：${detail.message}`);
    }
    if (data?.status === 'completed') {
      const imageUrl = normalizeGeneratedImage(data);
      if (!imageUrl) throw new ApiError(502, '图片生成任务完成但没有返回图片');
      return imageUrl;
    }
    if (['failed', 'cancelled', 'expired'].includes(data?.status)) {
      throw new ApiError(502, `图片生成任务失败：${data?.error?.message || data?.status}`);
    }
  }

  throw new ApiError(504, '图片生成任务等待超时，请稍后再试');
}

async function generateImageFromPrompt({ prompt, model, signal }) {
  const response = await fetch(joinUrl(aiProvider.baseURL, aiProvider.imageGenerationsPath), {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${config.ai.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x1536',
    }),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(502, '图片生成服务返回了无效 JSON');
  }

  if (!response.ok) {
    const detail = parseAiErrorDetail(text);
    throw new ApiError(502, `图片生成失败：${detail.message}`);
  }

  const imageUrl = normalizeGeneratedImage(data);
  if (imageUrl) return imageUrl;
  if (data?.id && data?.object === 'generation.task') {
    return pollImageGenerationTask(data.id, signal);
  }

  throw new ApiError(502, '图片生成服务没有返回图片');
}

async function extractResumeTextFromImages({ pageImages, model = aiProvider.ocrModel }) {
  if (!Array.isArray(pageImages) || pageImages.length === 0) return '';

  const messages = [
    {
      role: 'system',
      content: '你是专业简历文本识别助手。必须从图片中尽可能完整、准确地提取简历文字，保留原有顺序、标题、项目符号、日期和联系方式，只返回严格 JSON。',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `请识别以下 PDF 页面图片中的全部可见简历文字，并输出 JSON：\n{\n  "text": "按原顺序整理后的完整文本"\n}\n\n要求：\n1. 尽量保留原文，不要改写语义。\n2. 按页面和阅读顺序输出。\n3. 版式可简化，但不要漏掉姓名、岗位、经历、项目、技能和联系方式。\n4. 如果有少量看不清的字，请用“[不清晰]”标记，不要编造。`,
        },
        ...pageImages.map((dataUrl) => dataUrlToVisionPart(dataUrl)),
      ],
    },
  ];

  const result = await callAiJson({
    model,
    messages,
    temperature: 0.1,
    maxTokens: 2500,
  });

  return String(result?.text || '').trim();
}

export async function callAiJson({ model, messages, temperature = 0.5, maxTokens = 4000 }) {
  if (!config.ai.key) {
    throw new ApiError(503, 'AI 服务还没有配置密钥，请先配置 TOAPIS_API_KEY 或 CUSTOM_PROXY_KEY');
  }

  const modelsToTry = uniqueModels([
    model,
    aiProvider.defaultModel,
    ...(aiProvider.fallbackModels || []),
  ]);
  const protectedPayload = redactAiMessages(messages);
  const errors = [];
  const deadline = Date.now() + config.ai.timeoutMs;

  for (const activeModel of modelsToTry) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);

    try {
      const response = await fetch(config.ai.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.ai.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeModel,
          messages: protectedPayload.messages,
          temperature,
          max_tokens: maxTokens,
          response_format: aiProvider.responseFormat,
          ...(activeModel.startsWith('gpt-5.6') ? { reasoning_effort: 'none' } : {}),
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        const detail = parseAiErrorDetail(text);
        console.error('[ai:upstream_error]', response.status, detail.code, detail.message, text.slice(0, 300));
        errors.push('模型不可用');
        if (shouldTryNextModel(response.status, `${detail.code} ${detail.message}`)) continue;
        throw new ApiError(502, `上游 AI 服务报错 (${response.status})：${detail.message}`);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        errors.push('上游 AI 服务返回了无效 JSON');
        continue;
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        errors.push('AI 返回内容为空');
        continue;
      }

      return restoreAiResult({
        ...extractJson(content),
        model: data?.model || activeModel,
      }, protectedPayload.replacements);
    } catch (error) {
      if (error?.name === 'AbortError') {
        errors.push('请求超时');
        break;
      }
      if (!(error instanceof ApiError)) {
        throw new ApiError(503, 'AI 服务暂时无法连接，请稍后再试');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const errorSummary = errors.slice(0, 3).join('；');
  const allTimedOut = errors.length > 0 && errors.every((item) => /请求超时|网关超时|timeout/i.test(item));
  if (allTimedOut) {
    throw new ApiError(504, `AI 模型处理超时：${errorSummary}`);
  }
  throw new ApiError(502, `AI 模型暂时不可用：${errorSummary}`);
}

export async function generateCareerPhotoWithAi(input) {
  if (!config.ai.key) {
    throw new ApiError(503, '图片生成服务还没有配置密钥');
  }

  const { buffer, mimeType } = dataUrlToImage(input.imageDataUrl);
  const prompt = String(input.prompt || '').trim();
  if (prompt.length < 20) {
    throw new ApiError(400, '形象照提示词过短，请先选择一个正式风格');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), aiProvider.imageTimeoutMs);

  const model = input.model || aiProvider.imageModel;

  try {
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('size', input.size || '1024x1536');
    form.set('quality', input.quality || 'medium');
    form.set('image', new Blob([buffer], { type: mimeType }), `career-photo.${mimeType.split('/')[1]}`);

    const response = await fetch(joinUrl(aiProvider.baseURL, aiProvider.imageEditsPath), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.ai.key}`,
      },
      body: form,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(502, '图片生成服务返回了无效 JSON');
    }

    if (!response.ok) {
      const detail = parseAiErrorDetail(text);
      if (shouldFallbackToImageGeneration(detail)) {
        const imageUrl = await generateImageFromPrompt({ prompt, model, signal: controller.signal });
        return {
          imageUrl,
          model,
          prompt,
          mode: 'generation',
        };
      }
      throw new ApiError(502, `图片生成失败：${detail.message}`);
    }

    const imageUrl = normalizeGeneratedImage(data);
    if (!imageUrl) {
      throw new ApiError(502, '图片生成服务没有返回图片');
    }

    return {
      imageUrl,
      model,
      prompt,
      mode: 'edit',
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(504, '图片生成等待超时，请稍后再试或换一张更小的照片');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function optimizeResumeWithAi(input) {
  let resumeContent = String(input.resumeContent || '').trim();
  if (!looksReadableResumeText(resumeContent) && Array.isArray(input.resumePageImages) && input.resumePageImages.length > 0) {
    const ocrText = await extractResumeTextFromImages({ pageImages: input.resumePageImages });
    if (looksReadableResumeText(ocrText)) {
      resumeContent = ocrText;
    }
  }

  const modeInstruction = resumeOptimizeModes[input.optimizeMode] || resumeOptimizeModes.full;
  const prompts = aiPrompts.resumeOptimize;
  const messages = [
    { role: 'system', content: prompts.system },
    { role: 'user', content: prompts.user({ input: { ...input, resumeContent }, modeInstruction }) },
  ];
  let result = await callAiJson({
    model: input.model,
    temperature: aiDefaults.resumeOptimize.temperature,
    maxTokens: aiDefaults.resumeOptimize.maxTokens,
    messages,
  });

  // A model occasionally echoes the source resume. Require a meaningful edit and
  // give it one focused rewrite pass before accepting the result.
  const source = resumeContent;
  const optimized = String(result?.optimizedContent || '').trim();
  if (contentSimilarity(source, optimized) > 0.94) {
    result = await callAiJson({
      model: input.model,
      temperature: 0.65,
      maxTokens: aiDefaults.resumeOptimize.maxTokens,
      messages: [
        ...messages,
        {
          role: 'user',
          content: '上一版与原简历差异不足，不能原样复述。请重新改写目标模块，至少修改 8 处具体表达，并在 improvements 中列出实际修改点；不得编造事实。',
        },
      ],
    });
  }
  if (contentSimilarity(source, String(result?.optimizedContent || '')) > 0.94) {
    throw new ApiError(502, 'AI 返回的优化稿与原简历差异不足，已取消本次并退回额度');
  }
  return result;
}

export async function analyzeInterviewQuestion(input) {
  const prompts = aiPrompts.interviewQuestion;

  return callAiJson({
    model: input.model,
    temperature: aiDefaults.interviewQuestion.temperature,
    maxTokens: aiDefaults.interviewQuestion.maxTokens,
    messages: [
      {
        role: 'system',
        content: prompts.system,
      },
      {
        role: 'user',
        content: prompts.user({ input }),
      },
    ],
  });
}

export async function summarizeInterviewReview(input) {
  const qaText = input.questions
    .map((q, i) => `题目 ${i + 1}（${q.score}分）：${q.question}\n回答：${q.answer}`)
    .join('\n\n');

  return callAiJson({
    model: input.model,
    temperature: aiDefaults.interviewSummary.temperature,
    maxTokens: aiDefaults.interviewSummary.maxTokens,
    messages: [
      {
        role: 'system',
        content: aiPrompts.interviewSummary.system,
      },
      {
        role: 'user',
        content: aiPrompts.interviewSummary.user({ input, qaText }),
      },
    ],
  });
}
