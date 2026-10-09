import '../src/env.js';

function boundedTimeout(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1000), maximum);
}

export const aiProvider = {
  baseURL: process.env.TOAPIS_BASE_URL || 'https://toapis.com/v1',
  chatCompletionsPath: process.env.AI_CHAT_COMPLETIONS_PATH || '/chat/completions',
  imageEditsPath: process.env.AI_IMAGE_EDITS_PATH || '/images/edits',
  imageGenerationsPath: process.env.AI_IMAGE_GENERATIONS_PATH || '/images/generations',
  apiKey: process.env.TOAPIS_API_KEY || process.env.CUSTOM_PROXY_KEY || '',
  timeoutMs: boundedTimeout(process.env.AI_TIMEOUT_MS, 150000, 240000),
  imageTimeoutMs: boundedTimeout(process.env.AI_IMAGE_TIMEOUT_MS, 180000, 300000),
  defaultModel: process.env.AI_DEFAULT_MODEL || process.env.TOAPIS_DEFAULT_MODEL || 'gemini-3.6-flash',
  ocrModel: process.env.AI_OCR_MODEL || process.env.TOAPIS_OCR_MODEL || 'gemini-3.6-flash',
  imageModel: process.env.AI_IMAGE_MODEL || process.env.TOAPIS_IMAGE_MODEL || 'gpt-image-2',
  fallbackModels: [
    ...(process.env.AI_FALLBACK_MODELS || 'gemini-3.6-flash,gpt-5.6-sol')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    'gemini-3.6-flash',
    'gpt-5.6-sol',
  ],
  responseFormat: { type: 'json_object' },
};

export const aiModelMap = {
  'server-default': aiProvider.defaultModel,
  default: aiProvider.defaultModel,
  'gpt-5.6-sol': 'gemini-3.6-flash',
  'gpt-5.5': 'gemini-3.6-flash',
  'gpt-5.4': 'gemini-3.6-flash',
  'gpt-4': 'gemini-3.6-flash',
  'gpt-4o': 'gemini-3.6-flash',
  'gpt-4o-mini': 'gemini-3.6-flash',
  'gpt-3.5': 'gemini-3.6-flash',
  'gpt-3.5-turbo': 'gemini-3.6-flash',
  'claude-3': 'claude-3-opus',
  'claude-3.5': 'claude-3.5-sonnet',
  'gemini-pro': 'gemini-3.6-flash',
};

export const aiDefaults = {
  resumeOptimize: {
    temperature: 0.4,
    maxTokens: 4000,
  },
  interviewQuestion: {
    temperature: 0.4,
    maxTokens: 1800,
  },
  interviewSummary: {
    temperature: 0.4,
    maxTokens: 1800,
  },
};

export const resumeOptimizeModes = {
  full: '对整份简历进行行业定向优化：先识别目标行业和岗位族，再调整简历结构、关键词、证据顺序、成果表达和投递重点。保持事实真实，不凭空编造。',
  project: '仅优化「项目经历」部分。先判断该岗位更看重技术深度、业务增长、交付效率、用户体验、客户转化还是运营结果，再用 STAR/业务闭环重构项目描述。其他部分保持不变。',
  intro: '仅优化「自我介绍/个人总结」部分。先识别目标行业和岗位身份，再重构开场定位、核心优势和行业语言。返回的 optimizedContent 仍然必须是完整简历全文。',
  experience: '仅优化「工作经历」部分。按目标行业重排职责和成果：突出最能证明岗位胜任力的场景、动作、协作关系、指标结果和业务影响。其他部分保持不变。',
  skills: '仅优化「专业技能」部分。按目标行业和岗位族重排技能优先级，为关键技能补充使用场景、熟练度、工具链或业务应用。其他部分保持不变。',
};

export const aiPrompts = {
  resumeOptimize: {
    system: `你是资深招聘顾问和面试官，擅长按目标 JD 优化中文简历。
先判断行业/岗位筛选逻辑，再把真实经历改写成招聘方能识别的能力证据、结构化表达和可检索关键词。
必须返回严格 JSON，不要包含任何其他文字。`,
    user: ({ input, modeInstruction }) => `优化模式：${modeInstruction}

${input.keywordMatch ? '请将 JD 核心关键词自然融入简历。' : ''}
处理要求：
1. 识别 JD 对应的行业、岗位族和核心筛选标准。
2. 优先保留真实经历，弱化无关内容；不要编造公司、学校、证书、数字或项目。
3. 经历表达用「成果/结论 + 场景任务 + 动作方法 + 工具能力 + 影响」重写，可隐含 STAR、PDCA、拆解-执行-复盘等结构，但不要直接写方法论名称。
4. 技术/数据/AI 岗突出技术栈、工程质量、复杂问题拆解、性能和上线结果；产品/项目岗突出需求拆解、用户理解、跨团队推进和结果复盘；运营/销售/职能等岗位按 JD 强调业务场景、流程效率、风险控制或转化结果。
5. keywords 返回 8-12 个高价值搜索关键词，并自然分布到个人总结、技能、工作经历、项目经历中。
6. 语言简洁、具体、像真实候选人简历，避免空泛套话和过度 AI 味。
7. 除非优化模式要求删除或合并，否则保留原简历主要结构，并返回完整简历全文。

${input.optimizeMode === 'intro' ? `
自我介绍专项规则：
1. 只改写或新增「个人总结/自我介绍」部分，返回的 optimizedContent 仍然必须是完整简历全文。
2. 按目标行业和岗位族调整表达重点，突出 2-3 个最能支撑岗位匹配的核心优势。
3. 若岗位要求中包含「自我介绍工作流确认信息」，优先使用其中的目标身份、表达风格、MBTI、星座和补充亮点；未填写的信息不要编造。
4. 文风要像候选人能在面试开场自然说出来，同时保留适合放进简历的专业密度。
` : ''}

岗位要求（JD）：
${input.jobRequirements}

原始简历：
${input.resumeContent}

请返回 JSON：
{
  "optimizedContent": "优化后的简历全文，使用 Markdown 格式",
  "highlightedContent": "可选，使用 {{+新增}} {{~修改}} {{-删除}} 标记变化",
  "keywords": ["8-12个适合招聘搜索的行业/岗位/技能关键词"],
  "improvements": ["识别出的行业/岗位族", "优化策略", "关键词和表达改进点"],
  "matchScore": 85
}`,
  },
  interviewQuestion: {
    system: '你是一位资深技术面试官和面试辅导专家。必须返回严格 JSON。',
    user: ({ input }) => `面试岗位：${input.position}

面试问题：
${input.question}

候选人回答：
${input.answer}

请返回 JSON：
{
  "score": 75,
  "analysis": "200字以内，指出优点和不足",
  "suggestion": "300字以内，给出可执行优化建议"
}`,
  },
  interviewSummary: {
    system: '你是一位资深技术面试官和职业顾问。必须返回严格 JSON。',
    user: ({ input, qaText }) => `面试岗位：${input.position}

各题评分和回答：
${qaText}

请返回 JSON：
{
  "summary": "整体评价，200字以内",
  "improvements": ["具体改进建议1", "具体改进建议2", "具体改进建议3", "具体改进建议4"]
}`,
  },
};
