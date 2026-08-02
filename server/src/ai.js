import { config } from './config.js';
import { ApiError } from './errors.js';
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

function shouldTryNextModel(status, detail) {
  return (
    status === 404 ||
    status === 502 ||
    status === 504 ||
    status === 524 ||
    status === 503 ||
    /ChannelCapability|未配置渠道|SKU 路由|model.*not.*found|模型.*不存在|模型.*未配置/i.test(detail)
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

function parseAiErrorDetail(text) {
  try {
    const parsed = JSON.parse(text);
    return {
      message: parsed?.error?.message || parsed?.message || text.slice(0, 300),
      code: parsed?.error?.code || parsed?.code || '',
    };
  } catch {
    const title = String(text).match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1] || '';
    if (/524|timeout/i.test(title)) {
      return { message: '上游 ToApis 网关超时，请稍后重试或切换模型', code: 'UPSTREAM_TIMEOUT' };
    }
    if (/<html[\s>]/i.test(String(text))) {
      return { message: title || '上游 AI 服务返回了网页错误', code: 'UPSTREAM_HTML_ERROR' };
    }
    return { message: text.slice(0, 300), code: '' };
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

export async function callAiJson({ model, messages, temperature = 0.5, maxTokens = 4000 }) {
  if (!config.ai.key) {
    throw new ApiError(503, 'AI 服务还没有配置密钥，请先配置 TOAPIS_API_KEY 或 CUSTOM_PROXY_KEY');
  }

  const modelsToTry = uniqueModels([
    model,
    aiProvider.defaultModel,
    ...(aiProvider.fallbackModels || []),
  ]);
  const errors = [];

  for (const activeModel of modelsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(config.ai.timeoutMs, 45000));

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
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: aiProvider.responseFormat,
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        const detail = parseAiErrorDetail(text).message;
        errors.push(`${activeModel}: ${detail}`);
        if (shouldTryNextModel(response.status, detail)) continue;
        throw new ApiError(502, `上游 AI 服务错误：${detail}`);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        errors.push(`${activeModel}: 上游 AI 服务返回了无效 JSON`);
        continue;
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        errors.push(`${activeModel}: AI 返回内容为空`);
        continue;
      }

      return extractJson(content);
    } catch (error) {
      if (error?.name === 'AbortError') {
        errors.push(`${activeModel}: 请求超时`);
        continue;
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
  const modeInstruction = resumeOptimizeModes[input.optimizeMode] || resumeOptimizeModes.full;
  const prompts = aiPrompts.resumeOptimize;

  return callAiJson({
    model: input.model,
    temperature: aiDefaults.resumeOptimize.temperature,
    maxTokens: aiDefaults.resumeOptimize.maxTokens,
    messages: [
      {
        role: 'system',
        content: prompts.system,
      },
      {
        role: 'user',
        content: prompts.user({ input, modeInstruction }),
      },
    ],
  });
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
