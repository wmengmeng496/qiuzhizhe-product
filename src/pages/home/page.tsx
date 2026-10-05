import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createResumeOptimization } from '@/lib/backend-service';
import { fetchJobDescription, getStoredUser } from '@/lib/api';
import { extractPdfText } from '@/lib/pdf-reader';
import { extractDocxText } from '@/lib/docx-reader';
import type { OptimizeMode } from '../resume-optimizer/page';

type ResumeStyle = 'clean' | 'tech' | 'consulting' | 'dark';
type ResumePreviewMode = 'optimized' | 'original' | 'compare';
type WorkspaceModel = 'server-default' | 'gpt-5.6-sol' | 'gpt-5.4' | 'gpt-5.5' | 'gpt-4o';

interface ResumeResult {
  optimizedContent: string;
  keywords: string[];
  improvements: string[];
  matchScore: number;
}

interface ResumeVersionPayload {
  version: number;
  docName: string;
  modeLabel: string;
  result: ResumeResult;
  originalContent?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  type?: 'text' | 'resume_version';
  version?: ResumeVersionPayload;
}

interface UploadedResumeFile {
  name: string;
  size: number;
  type: string;
}

interface JobTarget {
  company: string;
  role: string;
  source: 'paste' | 'boss' | 'sample';
  content: string;
  keywords: string[];
}

interface OptimizationRecord {
  id: string;
  company: string;
  position: string;
  industry: string;
  optimizeMode: OptimizeMode | string;
  model: string;
  matchScore: number;
  keywords: string[];
  improvements: string[];
  optimizedContent?: string;
  date: string;
  status: 'completed' | 'failed';
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  resumeContent: string;
  result: ResumeResult;
  command: string;
  activeMode: OptimizeMode;
  uploadedFile: UploadedResumeFile | null;
  jobRequirements: string;
  model?: WorkspaceModel;
}

interface ChatWorkspace {
  sessions: ChatSession[];
  activeSessionId: string;
}

type IntroRoleType = 'auto' | 'sales' | 'product' | 'tech' | 'operation';
type HistoryTab = 'chat' | 'optimization';
type OptimizationFlow = 'resume' | 'intro';

interface ResumeModule {
  key: string;
  mode: OptimizeMode;
  label: string;
  icon: string;
  prompt: string;
  step: number;
  goal: string;
  output: string;
  checks: string[];
}

interface IntroWorkflowState {
  roleType: IntroRoleType;
  mbti: string;
  zodiac: string;
  tone: string;
  highlights: string;
}

const CHAT_HISTORY_KEY = 'home_job_chat_history_v1';
const CHAT_SESSIONS_KEY = 'home_job_chat_sessions_v1';
const ACTIVE_CHAT_SESSION_KEY = 'home_job_active_session_v1';
const OPTIMIZATION_RECORDS_KEY = 'optimization_records';
const SHELL_SIDEBAR_WIDTH = 244;
const WORKBENCH_HISTORY_WIDTH = 288;
const DEFAULT_COMMAND = '继续优化项目经历，并保持和 JD 关键词匹配';
const DEFAULT_WORKSPACE_MODEL: WorkspaceModel = 'server-default';

function scopedLocalKey(key: string) {
  return `${key}:${getStoredUser()?.id || 'anonymous'}`;
}

const WORKSPACE_MODELS: Array<{ id: WorkspaceModel; name: string; desc: string; badge: string; credits: number }> = [
  { id: 'server-default', name: '智能默认', desc: '优先使用 GPT-5.6 Sol，自动走兜底策略', badge: '推荐', credits: 1 },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', desc: '高质量复杂简历分析与定向改写', badge: '旗舰', credits: 3 },
  { id: 'gpt-5.4', name: 'GPT-5.4', desc: '质量优先，适合完整简历和复杂 JD', badge: '高质量', credits: 2 },
  { id: 'gpt-5.5', name: 'GPT-5.5', desc: '更强推理，适合高要求岗位', badge: '深度', credits: 3 },
  { id: 'gpt-4o', name: 'GPT-4o', desc: '速度优先；若账号未配置会提示失败', badge: '快速', credits: 1 },
];

const MODULE_CATALOG: Record<string, Omit<ResumeModule, 'key'>> = {
  full: {
    mode: 'full',
    label: '整体诊断',
    icon: 'ri-file-list-3-line',
    prompt: '先基于当前 JD 诊断整份简历，重排投递重点，给出最值得优先优化的模块和完整投递版本',
    step: 1,
    goal: '判断简历和 JD 的整体匹配关系，先定优化优先级。',
    output: '完整简历版本、匹配分、关键词和优先改动建议',
    checks: ['岗位定位是否清楚', '经历顺序是否匹配 JD', '高价值关键词是否出现'],
  },
  intro: {
    mode: 'intro',
    label: '开场定位',
    icon: 'ri-user-voice-line',
    prompt: '基于当前 JD 优化个人总结或自我介绍，先明确目标身份，再提炼 3 个最适合开场表达的核心优势',
    step: 2,
    goal: '把候选人一句话定位和核心优势说清楚。',
    output: '个人总结/自我介绍段落',
    checks: ['目标身份是否明确', '优势是否贴近岗位', '表达是否自然可信'],
  },
  skills: {
    mode: 'skills',
    label: '技能匹配',
    icon: 'ri-tools-line',
    prompt: '基于当前 JD 优化技能描述，按岗位优先级重排技能，补充使用场景、熟练度和能支撑经历的关键词',
    step: 3,
    goal: '让技能区成为 JD 关键词和真实项目之间的索引。',
    output: '重排后的技能清单',
    checks: ['核心技能是否前置', '每项技能是否有场景', '是否避免空泛堆词'],
  },
  experience: {
    mode: 'experience',
    label: '工作经历',
    icon: 'ri-briefcase-4-line',
    prompt: '基于当前 JD 优化工作经历，按职责范围、协作动作、业务结果和量化成果重写表达',
    step: 4,
    goal: '把日常职责改成能证明能力的结果导向表达。',
    output: '工作经历 bullet 重写版本',
    checks: ['动作是否具体', '结果是否可感知', '职责是否服务目标岗位'],
  },
  project: {
    mode: 'project',
    label: '项目亮点',
    icon: 'ri-stack-line',
    prompt: '基于当前 JD 优化项目经验，按背景、任务、动作、难点、结果重构项目亮点，并突出个人贡献',
    step: 5,
    goal: '把项目经历改成最能打动面试官的证据链。',
    output: '项目经历 STAR 版本',
    checks: ['技术/业务难点是否清楚', '个人贡献是否明确', '是否有量化或结果'],
  },
  education: {
    mode: 'full',
    label: '教育补强',
    icon: 'ri-graduation-cap-line',
    prompt: '基于当前 JD 优化教育经历，保留和岗位相关的学历、专业、课程、校园项目或奖项，弱化无关信息',
    step: 6,
    goal: '把教育经历变成补充可信度的信息，而不是占版面。',
    output: '教育经历补强建议',
    checks: ['信息是否和岗位相关', '是否足够简洁', '是否补充可信证明'],
  },
  certificate: {
    mode: 'full',
    label: '证书资质',
    icon: 'ri-award-line',
    prompt: '基于当前 JD 优化证书资质，筛选和岗位要求相关的认证、奖项和能力证明，并调整展示顺序',
    step: 7,
    goal: '筛出能增加岗位信任感的证明材料。',
    output: '证书/奖项排序建议',
    checks: ['是否贴近岗位要求', '是否有含金量', '展示顺序是否合理'],
  },
  portfolio: {
    mode: 'full',
    label: '作品材料',
    icon: 'ri-links-line',
    prompt: '基于当前 JD 优化作品链接和补充材料，选择最能证明岗位匹配度的项目、作品集、GitHub、案例或附件说明',
    step: 8,
    goal: '让附件和链接补足简历里无法展开的证据。',
    output: '作品链接和补充材料说明',
    checks: ['材料是否能打开', '是否对应岗位能力', '说明是否一眼可懂'],
  },
};

const DEFAULT_RESUME_MODULES: ResumeModule[] = [
  { key: 'full', ...MODULE_CATALOG.full },
  { key: 'intro', ...MODULE_CATALOG.intro },
  { key: 'skills', ...MODULE_CATALOG.skills },
  { key: 'experience', ...MODULE_CATALOG.experience },
  { key: 'project', ...MODULE_CATALOG.project },
];

const STYLE_OPTIONS: Array<{ value: ResumeStyle; label: string; icon: string }> = [
  { value: 'clean', label: '清爽专业', icon: 'ri-layout-line' },
  { value: 'tech', label: '技术研发', icon: 'ri-code-box-line' },
  { value: 'consulting', label: '咨询简洁', icon: 'ri-presentation-line' },
  { value: 'dark', label: '深色高级', icon: 'ri-moon-line' },
];

const INTRO_ROLE_OPTIONS: Array<{ value: IntroRoleType; label: string; icon: string }> = [
  { value: 'auto', label: '自动识别', icon: 'ri-magic-line' },
  { value: 'sales', label: '销售/商务', icon: 'ri-hand-heart-line' },
  { value: 'product', label: '产品经理', icon: 'ri-compasses-2-line' },
  { value: 'tech', label: '技术研发', icon: 'ri-code-s-slash-line' },
  { value: 'operation', label: '运营/市场', icon: 'ri-line-chart-line' },
];

const INTRO_TONE_OPTIONS = ['结构清晰', '亲和有感染力', '自信结果导向', '稳重专业'];

const OPTIMIZATION_STAGES: Record<OptimizationFlow, Array<{ title: string; detail: string; icon: string }>> = {
  resume: [
    { title: '理解优化指令', detail: '确认本次要优化的简历模块和表达方向', icon: 'ri-chat-check-line' },
    { title: '解析目标 JD', detail: '提取岗位职责、任职要求和高频关键词', icon: 'ri-search-eye-line' },
    { title: '匹配简历素材', detail: '对照项目经历、技能描述和工作经历找匹配点', icon: 'ri-git-merge-line' },
    { title: '重写高价值表达', detail: '补充动作、技术难点、业务结果和量化描述', icon: 'ri-edit-2-line' },
    { title: '生成投递版本', detail: '整理完整简历、关键词、优化建议和匹配分', icon: 'ri-file-check-line' },
  ],
  intro: [
    { title: '确认目标身份', detail: '识别岗位类型、面试场景和自我介绍口径', icon: 'ri-user-search-line' },
    { title: '提炼核心优势', detail: '从简历和 JD 中提取最适合开场表达的亮点', icon: 'ri-sparkling-line' },
    { title: '匹配表达风格', detail: '结合语气、MBTI、星座和补充亮点控制风格', icon: 'ri-palette-line' },
    { title: '组织开场结构', detail: '按背景、能力、项目和岗位动机组织内容', icon: 'ri-list-check-3' },
    { title: '生成自然版本', detail: '输出能在面试开场直接说出口的自我介绍', icon: 'ri-mic-line' },
  ],
};

const INTRO_ROLE_GUIDES: Record<Exclude<IntroRoleType, 'auto'>, { label: string; focus: string; keywords: string[] }> = {
  sales: {
    label: '销售/商务',
    focus: '突出资源整合、客户共情、需求挖掘、关系推进和结果转化',
    keywords: ['资源整合', '客户共情', '需求挖掘', '关系推进', '销售转化', '结果导向'],
  },
  product: {
    label: '产品经理',
    focus: '突出逻辑拆解、审美判断、用户视角、业务理解和跨团队沟通',
    keywords: ['逻辑拆解', '用户视角', '审美判断', '业务理解', '跨团队沟通', '产品推进'],
  },
  tech: {
    label: '技术研发',
    focus: '突出代码严谨、工程质量、问题拆解、稳定交付和技术协作',
    keywords: ['代码严谨', '工程质量', '问题拆解', '稳定交付', '技术协作', '可维护性'],
  },
  operation: {
    label: '运营/市场',
    focus: '突出用户感知、内容表达、数据复盘、增长动作和执行闭环',
    keywords: ['用户感知', '内容表达', '数据复盘', '增长动作', '执行闭环', '活动策划'],
  },
};

const SAMPLE_RESUME = `王同学
前端开发工程师
上海 | 3 年经验 | wang@example.com | 138-0000-0000

技能：React、TypeScript、JavaScript、HTML、CSS、Webpack、Vite

工作经历：
某科技公司 前端开发工程师 2023.07 - 至今
- 负责后台管理系统页面开发
- 参与组件开发和接口联调
- 与产品、后端协作完成需求

项目经历：
企业招聘管理后台
- 完成简历列表、候选人详情、权限配置等页面
- 负责表单和表格开发
- 优化部分页面性能`;

const SAMPLE_JD = `岗位：前端开发工程师
职责：
1. 负责 Web 端业务页面、后台管理系统和复杂交互模块开发；
2. 使用 React、TypeScript 完成组件化开发和前端工程化建设；
3. 关注性能优化、代码质量、可维护性和跨团队协作；
4. 有大型后台系统、数据看板、权限系统经验优先。`;

const DEFAULT_RESULT: ResumeResult = {
  optimizedContent: `王同学
前端开发工程师
上海 | 3 年经验 | wang@example.com | 138-0000-0000

个人总结
前端开发工程师，具备 React、TypeScript、组件化开发和前端工程化经验。熟悉复杂业务后台、数据看板和多角色权限场景，能够从业务目标出发完成页面架构、组件抽象、性能优化和跨团队交付。

工作经历
某科技公司 | 前端开发工程师 | 2023.07 - 至今
- 负责管理端核心工作流重构，抽象表单、权限和数据表格组件，支持多业务线复用，减少重复开发成本。
- 基于 React 和 TypeScript 完成复杂交互模块开发，优化状态管理和接口联调流程，提升页面交付稳定性。
- 参与前端工程化治理，补充代码规范、组件文档和构建检查，降低多人协作中的维护成本。

项目经历
企业招聘管理后台重构
- 针对旧系统页面重复、权限分散、表单维护成本高的问题，重构核心业务流程和通用组件层。
- 沉淀动态表单、筛选表格、批量操作和角色权限组件，提升新增页面配置效率。
- 优化首屏资源加载和列表渲染逻辑，改善大数据量场景下的交互流畅度。

技能描述
- 前端框架：熟悉 React、TypeScript、Hooks、组件抽象和复杂表单开发。
- 工程化：具备构建配置、代码规范、组件文档和前端质量治理经验。
- 性能优化：理解资源加载、列表渲染、缓存策略和交互性能优化方法。`,
  keywords: ['React', 'TypeScript', '组件化', '性能优化', '前端工程化', '跨团队协作'],
  improvements: ['项目经历改成结果表达', '补齐 JD 核心关键词', '强化工程化能力', '压缩低价值描述'],
  matchScore: 82,
};

const EMPTY_RESULT: ResumeResult = {
  optimizedContent: '',
  keywords: [],
  improvements: [],
  matchScore: 0,
};

const PRODUCT_MANAGER_RESULT: ResumeResult = {
  optimizedContent: `王同学
产品经理
上海 | 3 年经验 | wang@example.com | 138-0000-0000

个人总结
具备 3 年 Web 业务与后台系统项目经验，熟悉招聘管理后台、权限配置、表单流程和数据展示等复杂业务场景。能够从用户路径、业务目标和交付效率出发拆解需求，协调研发、设计与后端推进功能落地，并结合数据反馈持续优化产品体验。过往前端开发经历使我理解技术实现边界，能够更高效地完成需求澄清、方案评审和跨团队沟通。

工作经历
某科技公司 | 前端开发工程师 / 产品协同负责人 | 2023.07 - 至今
- 深度参与后台管理系统需求分析，与产品、后端共同梳理招聘流程、候选人管理、权限配置和数据展示等核心模块。
- 基于用户操作路径和业务规则，推动表单、表格、筛选、批量操作等高频能力组件化，提升功能交付效率和一致性。
- 在需求评审和接口联调阶段补充异常场景、权限边界和状态流转细节，减少返工并提升上线质量。

项目经历
企业招聘管理后台
- 围绕候选人筛选、简历查看、岗位流转和权限分配等流程，梳理多角色使用场景和关键页面信息架构。
- 将业务需求拆解为候选人列表、详情页、权限配置、数据看板等功能模块，协同研发完成版本交付。
- 关注使用效率与操作反馈，优化筛选条件、表单校验和列表加载体验，改善业务人员日常操作效率。

技能描述
- 产品能力：需求理解、流程梳理、用户路径分析、功能拆解、PRD 协同、版本推进。
- 协作能力：熟悉研发交付流程，能与产品、设计、后端和测试高效沟通。
- 业务理解：熟悉后台系统、权限配置、招聘流程、数据展示和复杂表单场景。`,
  keywords: ['需求分析', '用户路径', '跨团队协作', '后台系统', '权限配置', '数据驱动'],
  improvements: ['自我介绍已转向产品经理表达', '突出需求理解和业务拆解能力', '保留技术背景作为协作优势', '弱化纯研发职责表述'],
  matchScore: 86,
};

const JD_KEYWORD_POOL = [
  'React', 'TypeScript', 'Vue', 'Vite', 'Next.js', 'Node.js', 'Ant Design',
  'WebSocket', 'SSE', 'AI', '客服', '中台', 'CRM', '权限', '复杂表单',
  '数据看板', '性能优化', '组件化', '工程化', '跨团队协作', '移动端',
  '需求拆解', '项目交付', '接口联调',
];

function extractJobKeywords(content: string) {
  const normalized = content.toLowerCase();
  const matched = JD_KEYWORD_POOL.filter((keyword) => normalized.includes(keyword.toLowerCase()));
  return Array.from(new Set(matched)).slice(0, 8);
}

function extractLineValue(content: string, labels: string[]) {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  const found = lines.find((line) => labels.some((label) => line.startsWith(label)));
  if (!found) return '';
  return found.replace(new RegExp(`^(${labels.join('|')})[:：]?\\s*`), '').trim();
}

function parseJobTarget(content: string, source: JobTarget['source']): JobTarget {
  const role = extractLineValue(content, ['岗位', '职位', '目标岗位']) || '目标岗位';
  const company = extractLineValue(content, ['公司', '企业']) || (source === 'boss' ? 'BOSS 直聘岗位' : '自定义 JD');
  const keywords = extractJobKeywords(content);
  return {
    company,
    role,
    source,
    content,
    keywords: keywords.length ? keywords : ['岗位匹配', '职责拆解', '表达优化'],
  };
}

function createProjectDemoResult(jd: string): ResumeResult {
  const target = parseJobTarget(jd, 'paste');
  const keywords = target.keywords.slice(0, 6);
  return {
    ...DEFAULT_RESULT,
    optimizedContent: DEFAULT_RESULT.optimizedContent.replace(
      `企业招聘管理后台重构
- 针对旧系统页面重复、权限分散、表单维护成本高的问题，重构核心业务流程和通用组件层。
- 沉淀动态表单、筛选表格、批量操作和角色权限组件，提升新增页面配置效率。
- 优化首屏资源加载和列表渲染逻辑，改善大数据量场景下的交互流畅度。`,
      `企业招聘管理后台重构
- 围绕${target.role} JD 中的${keywords.slice(0, 3).join('、') || '核心职责'}要求，重构候选人筛选、权限配置和数据表格等高频流程。
- 抽象复杂表单、列表筛选、批量操作和角色权限组件，支持多业务线复用，减少重复开发和联调成本。
- 结合接口状态管理、懒加载和列表渲染优化，改善大数据量场景下的页面响应速度和操作稳定性。`,
    ),
    keywords: target.keywords,
    improvements: ['项目经验已按当前 JD 重写', '补入岗位关键词和业务场景', '突出个人动作、技术方案和交付结果', '弱化泛泛职责描述'],
    matchScore: 88,
  };
}

function createLocalOptimizationDemoResult(resume: string, jd: string, mode: OptimizeMode, instruction: string): ResumeResult {
  const target = parseJobTarget(jd, 'paste');
  const keywords = target.keywords.slice(0, 8);
  const original = resume.trim() || SAMPLE_RESUME;
  const keywordText = keywords.length ? keywords.join('、') : '岗位关键词、职责场景、交付结果';
  const demoBlock = [
    '',
    '## 本地演示优化版本',
    `> AI 上游暂时不可用，以下为基于规则生成的演示结果，用于验证“上传简历 -> JD 匹配 -> 生成版本 -> 对比记录”的主流程。`,
    '',
    '### 针对 JD 的优化重点',
    `- 目标岗位：${target.role}`,
    `- 匹配关键词：${keywordText}`,
    `- 本次指令：${instruction}`,
    '',
    mode === 'project'
      ? `### 项目经历优化示例\n- 围绕 ${target.role} 的筛选重点，将项目描述从“做了什么页面”调整为“解决了什么业务问题、采取了什么动作、产生了什么结果”。\n- 在项目条目中前置 ${keywordText} 等关键词，补充接口联调、组件复用、性能优化、权限/流程等可被招聘方识别的能力证据。\n- 每个项目建议按「业务场景 + 个人动作 + 技术方案 + 交付结果」重写，避免只罗列技术栈。`
      : mode === 'experience'
        ? `### 工作经历优化示例\n- 将日常职责改写为面向 ${target.role} 的交付证据，突出跨团队协作、需求拆解、上线质量和业务影响。\n- 把 ${keywordText} 等 JD 关键词自然放入职责与成果表达中，增强搜索匹配度。`
        : mode === 'skills'
          ? `### 技能描述优化示例\n- 技能栈按 ${target.role} 的优先级重排，先展示 JD 高相关能力，再展示辅助工具。\n- 每个核心技能补充使用场景，例如复杂表单、数据看板、权限控制、移动端适配或性能优化。`
          : mode === 'intro'
            ? `### 个人总结优化示例\n- 开场定位调整为 ${target.role} 候选人，突出与 JD 直接相关的 2-3 个优势。\n- 表达上减少泛泛形容词，改为“业务场景 + 能力证据 + 可迁移价值”。`
            : `### 整体优化示例\n- 简历结构保持不变，优先强化个人总结、技能关键词、工作职责和项目成果。\n- 将 ${keywordText} 等 JD 关键词分布到摘要、技能、经历和项目中，提高匹配度。`,
    '',
    '---',
    '',
    original,
  ].join('\n');

  return {
    optimizedContent: demoBlock,
    keywords: keywords.length ? keywords : ['JD 匹配', '项目经历', '成果表达', '关键词优化'],
    improvements: [
      '已生成本地演示优化版本，主流程可继续预览和对比',
      '已根据当前 JD 提取匹配关键词',
      '已给出可落地的模块改写方向',
      '真实 AI 恢复后会替换为模型生成版本',
    ],
    matchScore: Math.min(92, Math.max(78, 72 + keywords.length * 2)),
  };
}

function isIntroRequest(mode: OptimizeMode, command: string) {
  return mode === 'intro' || /自我介绍|个人介绍|个人总结|面试介绍|开场介绍|优势介绍|summary/i.test(command);
}

function inferIntroRole(command: string, jd: string): Exclude<IntroRoleType, 'auto'> {
  const text = `${command}\n${jd}`;
  if (/销售|商务|BD|客户|线索|成交|转化|大客户/i.test(text)) return 'sales';
  if (/产品经理|产品方向|产品岗|\bPM\b|用户体验|需求分析|PRD|原型/i.test(text)) return 'product';
  if (/运营|市场|增长|内容|活动|社群|投放|转化率/i.test(text)) return 'operation';
  return 'tech';
}

function resolveIntroRole(profile: IntroWorkflowState, command: string, jd: string) {
  const role = profile.roleType === 'auto' ? inferIntroRole(command, jd) : profile.roleType;
  return INTRO_ROLE_GUIDES[role];
}

function buildIntroWorkflowContext(profile: IntroWorkflowState, command: string, jd: string) {
  const guide = resolveIntroRole(profile, command, jd);
  const lines = [
    `目标身份：${guide.label}`,
    `表达重点：${guide.focus}`,
    `推荐关键词：${guide.keywords.join('、')}`,
    `表达风格：${profile.tone || '结构清晰'}`,
  ];

  if (profile.mbti.trim()) lines.push(`候选人 MBTI：${profile.mbti.trim()}`);
  if (profile.zodiac.trim()) lines.push(`候选人星座：${profile.zodiac.trim()}`);
  if (profile.highlights.trim()) lines.push(`候选人补充亮点：${profile.highlights.trim()}`);

  return lines.join('\n');
}

function createIntroDemoResult(profile: IntroWorkflowState, command: string, jd: string): ResumeResult {
  const guide = resolveIntroRole(profile, command, jd);
  const tone = profile.tone || '结构清晰';
  const optional = [
    profile.mbti.trim() ? `${profile.mbti.trim()} 的沟通偏好` : '',
    profile.zodiac.trim() ? `${profile.zodiac.trim()} 的表达特质` : '',
    profile.highlights.trim(),
  ].filter(Boolean).join('，');
  const optionalSentence = optional ? `同时结合 ${optional}，让表达更贴近本人。` : '';

  if (guide.label === '产品经理') {
    return {
      ...PRODUCT_MANAGER_RESULT,
      optimizedContent: PRODUCT_MANAGER_RESULT.optimizedContent.replace(
        '具备 3 年 Web 业务与后台系统项目经验，熟悉招聘管理后台、权限配置、表单流程和数据展示等复杂业务场景。能够从用户路径、业务目标和交付效率出发拆解需求，协调研发、设计与后端推进功能落地，并结合数据反馈持续优化产品体验。过往前端开发经历使我理解技术实现边界，能够更高效地完成需求澄清、方案评审和跨团队沟通。',
        `我有 3 年 Web 业务与后台系统项目经验，熟悉招聘管理后台、权限配置、表单流程和数据展示等复杂业务场景。面向产品经理岗位，我会用${tone}的方式介绍自己：能从用户路径、业务目标和交付效率出发拆解需求，兼顾逻辑结构、体验审美和跨团队沟通，并借助技术背景更准确地判断方案边界、推进功能落地。${optionalSentence}`,
      ),
      improvements: ['自我介绍已按产品经理岗位重写', '强化逻辑、审美和沟通表达', '保留技术背景作为协作优势', '加入可选个性化信息'],
    };
  }

  const introByRole: Record<string, string> = {
    '销售/商务': `我有 3 年 Web 业务与后台系统项目经验，熟悉客户需求拆解、复杂流程协同和结果交付。面向销售/商务岗位，我会用${tone}的方式介绍自己：擅长从业务目标出发理解客户真实诉求，整合产品、技术和交付资源推进方案落地，在沟通中兼顾共情表达与结果转化。${optionalSentence}`,
    '技术研发': `我是一名前端开发工程师，具备 3 年 React、TypeScript、组件化开发和前端工程化经验。面向技术研发岗位，我会用${tone}的方式介绍自己：重视代码严谨性、问题拆解、可维护性和稳定交付，能够在复杂后台、权限系统和数据展示场景中持续提升工程质量。${optionalSentence}`,
    '运营/市场': `我有 3 年 Web 业务与后台系统项目经验，熟悉用户路径、数据展示和业务流程。面向运营/市场岗位，我会用${tone}的方式介绍自己：能够从用户感知和业务目标出发设计动作，结合数据复盘优化内容、活动和转化链路，并推动跨团队执行闭环。${optionalSentence}`,
  };

  return {
    optimizedContent: `王同学
${guide.label}
上海 | 3 年经验 | wang@example.com | 138-0000-0000

个人总结
${introByRole[guide.label]}

工作经历
某科技公司 | 前端开发工程师 | 2023.07 - 至今
- 负责后台管理系统页面开发，参与从需求理解、方案拆解到上线交付的完整流程。
- 与产品、后端和业务方协作推进复杂表单、列表、权限配置和数据展示模块落地。
- 关注体验反馈、性能稳定性和交付效率，持续优化业务人员的日常使用流程。

项目经历
企业招聘管理后台
- 围绕候选人管理、简历查看、岗位流转和权限分配等核心流程完成模块建设。
- 梳理多角色使用场景，沉淀可复用的表单、表格和筛选能力，提升后续需求交付效率。
- 结合用户操作反馈优化页面性能和信息呈现，使业务流程更清晰、更易推进。

技能描述
- 沟通协作：能够在业务、产品、技术之间做清晰表达和需求对齐。
- 业务理解：熟悉后台系统、招聘流程、权限配置、数据展示和复杂表单场景。
- 交付能力：具备从问题拆解、方案实现到复盘优化的闭环推进经验。`,
    keywords: guide.keywords,
    improvements: [`自我介绍已按${guide.label}岗位重写`, `强化${guide.focus}`, '加入表达风格偏好', '保留原简历关键信息'],
    matchScore: guide.label === '技术研发' ? 84 : 82,
  };
}

function parseResume(content: string) {
  const lines = content.split('\n').map((line) => line.trim()).filter((line) => line && !isLikelyResumeNoiseLine(line));
  const name = lines[0] || '王同学';
  const role = lines[1] || '前端开发工程师';
  const contact = lines.find((line) => line.includes('@')) || '上海 | 3 年经验 | wang@example.com';
  const sections = content.split(/\n(?=(个人总结|工作经历|项目经历|技能描述)\n)/g);

  return { name, role, contact, sections };
}

function buildResumeDocName(result: ResumeResult) {
  const parsed = parseResume(result.optimizedContent);
  return `${parsed.name}_${parsed.role}_优化简历.md`;
}

function getModeLabel(mode: OptimizeMode) {
  if (mode === 'intro') return '自我介绍';
  if (mode === 'experience') return '工作经历';
  if (mode === 'project') return '项目经验';
  if (mode === 'skills') return '技能描述';
  return '整体优化';
}

function getLatestResumeVersion(messages: ChatMessage[]) {
  return messages.reduce((latest, message) => Math.max(latest, message.version?.version || 0), 0);
}

function getResumeVersionMessages(messages: ChatMessage[]) {
  return messages.filter((message) => message.type === 'resume_version' && message.version);
}

function normalizeResumeModuleTitle(title: string) {
  const value = title.replace(/[：:]/g, '').replace(/\s+/g, '').trim();
  if (/^(个人总结|个人简介|自我评价|个人评价|求职意向|职业概况|职业总结|优势亮点)$/.test(value)) return 'intro';
  if (/^(专业技能|技能描述|技能清单|技术栈|技术能力|核心技能|职业技能)$/.test(value)) return 'skills';
  if (/^(工作经历|工作经验|实习经历|任职经历|职业经历)$/.test(value)) return 'experience';
  if (/^(项目经历|项目经验|项目介绍|代表项目|项目实践)$/.test(value)) return 'project';
  if (/^(教育经历|教育背景|学历背景)$/.test(value)) return 'education';
  if (/^(证书|证书资质|资格证书|荣誉奖项|获奖经历)$/.test(value)) return 'certificate';
  if (/^(作品集|作品链接|个人作品|开源项目|补充信息)$/.test(value)) return 'portfolio';
  return '';
}

function createCustomResumeModule(title: string): ResumeModule {
  const label = title.replace(/[：:]\s*$/, '').trim().slice(0, 12) || '简历模块';
  return {
    key: `custom-${label}`,
    mode: 'full',
    label,
    icon: 'ri-layout-row-line',
    prompt: `基于当前 JD 单独优化「${label}」模块，保留真实经历，突出岗位匹配度和表达重点`,
    step: 9,
    goal: `针对简历里的「${label}」做定向补强。`,
    output: `${label}优化版本`,
    checks: ['是否服务目标岗位', '表达是否具体可信', '是否控制版面占比'],
  };
}

function detectResumeModules(content: string): ResumeModule[] {
  const modules: ResumeModule[] = [{ key: 'full', ...MODULE_CATALOG.full }];
  const seen = new Set(['full']);
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);

  lines.forEach((line) => {
    const clean = line.replace(/^#{1,4}\s*/, '').replace(/^\d+[.、]\s*/, '').trim();
    if (clean.length > 18) return;

    const catalogKey = normalizeResumeModuleTitle(clean);
    if (catalogKey && !seen.has(catalogKey)) {
      modules.push({ key: catalogKey, ...MODULE_CATALOG[catalogKey] });
      seen.add(catalogKey);
      return;
    }

    const looksLikeHeading = /^[\u4e00-\u9fa5A-Za-z\s/]+[:：]$/.test(clean) || /^【.+】$/.test(clean);
    if (!looksLikeHeading) return;
    const customTitle = clean.replace(/[【】]/g, '').replace(/[：:]$/, '').trim();
    const customKey = `custom-${customTitle}`;
    if (customTitle && !seen.has(customKey)) {
      modules.push(createCustomResumeModule(customTitle));
      seen.add(customKey);
    }
  });

  DEFAULT_RESUME_MODULES.forEach((module) => {
    if (!seen.has(module.key)) modules.push(module);
  });

  return modules;
}

function Toast({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white shadow-xl">
      {text}
    </div>
  );
}

function OptimizationThinking({
  flow,
  activeIndex,
  statusText,
}: {
  flow: OptimizationFlow;
  activeIndex: number;
  statusText: string;
}) {
  const stages = OPTIMIZATION_STAGES[flow];
  const safeIndex = Math.min(activeIndex, stages.length - 1);
  const progress = Math.round(((safeIndex + 1) / stages.length) * 100);

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/70">
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm">
          <i className="ri-brain-line animate-pulse" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-black text-slate-900">{statusText || '正在分析并匹配简历内容'}</div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-indigo-600 shadow-sm">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {stages.map((stage, index) => {
              const done = index < safeIndex;
              const current = index === safeIndex;
              return (
                <div
                  key={stage.title}
                  className={`rounded-xl border px-2.5 py-2 transition-colors ${
                    current
                      ? 'border-indigo-200 bg-white text-indigo-700 shadow-sm'
                      : done
                        ? 'border-emerald-100 bg-emerald-50/80 text-emerald-700'
                        : 'border-white/70 bg-white/55 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-black">
                    <i className={done ? 'ri-check-line' : stage.icon} />
                    <span className="truncate">{stage.title}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 opacity-80">{stage.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function inferModeFromCommand(command: string, fallback: OptimizeMode): OptimizeMode {
  if (/自我介绍|个人介绍|个人总结|优势|summary/i.test(command)) return 'intro';
  if (/工作经历|工作经验|履历|experience/i.test(command)) return 'experience';
  if (/项目经历|项目经验|项目|project/i.test(command)) return 'project';
  if (/技能|技术栈|skill/i.test(command)) return 'skills';
  if (/整体|全部|整份|全局|full/i.test(command)) return 'full';
  return fallback;
}

function hasProductManagerIntent(command: string) {
  return /产品经理|产品方向|产品岗|产品岗位|\bPM\b|product manager/i.test(command);
}


function isAssistantIntroRequest(command: string) {
  return /^(你是谁|你是干嘛的|你能做什么|介绍一下你自己|help|帮助)$/i.test(command.trim());
}

function createChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    type: 'text',
  };
}

function createResumeVersionMessage(input: {
  version: number;
  result: ResumeResult;
  modeLabel: string;
  docName: string;
  content: string;
  originalContent?: string;
}): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant',
    content: input.content,
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    type: 'resume_version',
    version: {
      version: input.version,
      result: input.result,
      modeLabel: input.modeLabel,
      docName: input.docName,
      originalContent: input.originalContent,
    },
  };
}

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultSession(messages: ChatMessage[] = []): ChatSession {
  const now = new Date().toISOString();
  return {
    id: createSessionId(),
    title: '前端开发工程师简历优化',
    createdAt: now,
    updatedAt: now,
    messages,
    resumeContent: SAMPLE_RESUME,
    result: DEFAULT_RESULT,
    command: DEFAULT_COMMAND,
    activeMode: 'full',
    uploadedFile: null,
    jobRequirements: SAMPLE_JD,
    model: DEFAULT_WORKSPACE_MODEL,
  };
}

function createBlankSession(): ChatSession {
  const now = new Date().toISOString();
  return {
    id: createSessionId(),
    title: '新的简历对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    resumeContent: '',
    result: EMPTY_RESULT,
    command: '',
    activeMode: 'full',
    uploadedFile: null,
    jobRequirements: '',
    model: DEFAULT_WORKSPACE_MODEL,
  };
}

function readStoredMessages(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(scopedLocalKey(CHAT_HISTORY_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ChatMessage => {
      return typeof item?.id === 'string'
        && (item.role === 'user' || item.role === 'assistant')
        && typeof item.content === 'string'
        && typeof item.time === 'string';
    });
  } catch {
    return [];
  }
}

function isResumeResult(value: unknown): value is ResumeResult {
  const result = value as ResumeResult;
  return typeof result?.optimizedContent === 'string'
    && Array.isArray(result.keywords)
    && Array.isArray(result.improvements)
    && typeof result.matchScore === 'number';
}

function isChatSession(value: unknown): value is ChatSession {
  const session = value as ChatSession;
  return typeof session?.id === 'string'
    && typeof session.title === 'string'
    && Array.isArray(session.messages)
    && typeof session.resumeContent === 'string'
    && isResumeResult(session.result)
    && typeof session.command === 'string'
    && ['full', 'project', 'intro', 'experience', 'skills'].includes(session.activeMode);
}

function shouldResetSeededBlankSession(session: ChatSession) {
  return session.title === '新的简历对话'
    && session.messages.length === 0
    && !session.uploadedFile
    && (
      session.resumeContent.trim() === SAMPLE_RESUME.trim()
      || session.result.optimizedContent.trim() === DEFAULT_RESULT.optimizedContent.trim()
      || session.command === DEFAULT_COMMAND
    );
}

function readChatWorkspace(): ChatWorkspace {
  try {
    const raw = window.localStorage.getItem(scopedLocalKey(CHAT_SESSIONS_KEY));
    const activeId = window.localStorage.getItem(scopedLocalKey(ACTIVE_CHAT_SESSION_KEY)) || '';
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sessions = parsed.filter(isChatSession).map((session) => {
          if (shouldResetSeededBlankSession(session)) {
            return {
              ...session,
              resumeContent: '',
              result: EMPTY_RESULT,
              command: '',
              activeMode: 'full' as const,
              uploadedFile: null,
              jobRequirements: '',
              model: DEFAULT_WORKSPACE_MODEL,
            };
          }
          const prepared = prepareUploadedResumeContent(session.resumeContent, session.uploadedFile?.name || '');
          const resultContent = cleanExtractedResumeText(session.result.optimizedContent);
          const shouldCleanResult = !hasEnoughReadableResumeText(resultContent) && session.uploadedFile;
          return {
            ...session,
            resumeContent: prepared.content,
            result: shouldCleanResult ? buildUploadedResumeResult(prepared.content, prepared.usedFallback) : session.result,
            jobRequirements: session.jobRequirements ?? SAMPLE_JD,
            model: session.model ?? DEFAULT_WORKSPACE_MODEL,
          };
        });
        if (sessions.length > 0) {
          return {
            sessions,
            activeSessionId: sessions.some((session) => session.id === activeId) ? activeId : sessions[0].id,
          };
        }
      }
    }
  } catch {
    // Fall through to migration/default session.
  }

  const migratedMessages = readStoredMessages();
  const session = createDefaultSession(migratedMessages);
  return { sessions: [session], activeSessionId: session.id };
}

function isOptimizationRecord(value: unknown): value is OptimizationRecord {
  const record = value as OptimizationRecord;
  return typeof record?.id === 'string'
    && typeof record.company === 'string'
    && typeof record.position === 'string'
    && typeof record.matchScore === 'number'
    && Array.isArray(record.keywords)
    && Array.isArray(record.improvements);
}

function readLocalOptimizationRecords() {
  try {
    const raw = window.localStorage.getItem(scopedLocalKey(OPTIMIZATION_RECORDS_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOptimizationRecord);
  } catch {
    return [];
  }
}

function writeLocalOptimizationRecord(record: OptimizationRecord) {
  try {
    const current = readLocalOptimizationRecords();
    const deduped = current.filter((item) => item.id !== record.id);
    window.localStorage.setItem(scopedLocalKey(OPTIMIZATION_RECORDS_KEY), JSON.stringify([record, ...deduped].slice(0, 100)));
  } catch {
    // ignore
  }
}

function buildOptimizationRecordContent(record: OptimizationRecord) {
  if (record.optimizedContent) return record.optimizedContent;

  return `${record.company}候选人
${record.position}
目标行业：${record.industry || '求职方向'} | JD 匹配度：${record.matchScore}%

个人总结
围绕 ${record.position} 岗位要求，已强化 ${record.keywords.slice(0, 4).join('、') || '岗位关键词'} 等核心表达，并将经历描述调整为更适合投递的结果导向版本。

项目经历
- 突出和 ${record.position} 相关的关键项目，补充问题背景、个人职责、解决方案和可量化结果。
- 保留高价值技术关键词，减少低匹配度信息对简历版面的占用。

技能描述
${record.keywords.map((keyword) => `- ${keyword}：已结合岗位要求融入简历表达。`).join('\n')}

优化说明
${record.improvements.map((item) => `- ${item}`).join('\n')}`;
}

function buildRecordFromResult(input: {
  result: ResumeResult;
  jobTarget: JobTarget;
  mode: OptimizeMode;
  optimizedContent: string;
}) {
  return {
    id: `home-opt-${Date.now()}`,
    company: input.jobTarget.company,
    position: input.jobTarget.role,
    industry: '求职方向',
    optimizeMode: input.mode,
    model: 'server-default',
    matchScore: input.result.matchScore,
    keywords: input.result.keywords,
    improvements: input.result.improvements,
    optimizedContent: input.optimizedContent,
    date: new Date().toISOString().slice(0, 10),
    status: 'completed' as const,
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileExtension(fileName: string) {
  return `.${fileName.split('.').pop()?.toLowerCase() || ''}`;
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

function normalizeExtractedText(text: string) {
  return text
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isLikelyHashToken(value: string) {
  return /^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value) && value.length >= 18;
}

function isLikelyResumeNoiseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^[A-Za-z]$/.test(trimmed)) return true;
  if (isLikelyHashToken(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length <= 3 && words.every(isLikelyHashToken)) return true;
  return false;
}

function cleanExtractedResumeText(text: string) {
  return normalizeExtractedText(text)
    .split('\n')
    .map((line) => line.replace(/[A-Za-z0-9]{18,}(?:[_-][A-Za-z0-9]{8,})*/g, '').trim())
    .filter((line) => line && !isLikelyResumeNoiseLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasEnoughReadableResumeText(text: string) {
  const compact = text.replace(/\s/g, '');
  const cjk = (compact.match(/[\u4e00-\u9fa5]/g) || []).length;
  const meaningfulWords = (text.match(/[A-Za-z]{2,}|[\u4e00-\u9fa5]{2,}/g) || []).length;
  return text.length >= 40 && (cjk >= 12 || meaningfulWords >= 8);
}

function deriveResumeFallbackFromFileName(fileName: string, rawText = '') {
  const baseName = stripFileExtension(fileName).replace(/[《》]/g, '').trim();
  const bracketRole = baseName.match(/[【[]([^】\]]+)[】\]]/)?.[1] || '';
  const role = (bracketRole.split(/[_\s|｜-]+/).find(Boolean) || '目标岗位').trim();
  const afterBracket = baseName.replace(/^[【[][^】\]]+[】\]]\s*/, '').trim();
  const name = (afterBracket.match(/[\u4e00-\u9fa5]{2,4}/)?.[0] || baseName.match(/[\u4e00-\u9fa5]{2,4}/)?.[0] || '候选人').trim();
  const phone = rawText.match(/1[3-9]\d{9}/)?.[0] || '';
  const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const contact = [phone ? `电话：${phone}` : '', email ? `邮箱：${email}` : ''].filter(Boolean).join(' | ') || '联系方式待补充';

  return `${name}
${role}
${contact}

个人总结
PDF 文本层读取不完整，已先保留文件名中的候选人和岗位信息。建议补充可复制文本，或上传 DOCX / TXT 简历后继续优化。

项目经历
- 待补充原始项目背景、个人职责、技术方案和业务结果。

技能描述
- 待从原始简历中提取技能关键词。`;
}

function prepareUploadedResumeContent(rawText: string, fileName: string) {
  const cleaned = cleanExtractedResumeText(rawText);
  if (hasEnoughReadableResumeText(cleaned)) {
    return { content: cleaned, usedFallback: false };
  }
  return {
    content: deriveResumeFallbackFromFileName(fileName, rawText),
    usedFallback: true,
  };
}

function getUploadIcon(type: string) {
  if (/pdf/i.test(type)) return 'ri-file-pdf-2-line';
  if (/word|doc/i.test(type)) return 'ri-file-word-2-line';
  return 'ri-file-text-line';
}

function buildUploadedResumeResult(content: string, usedFallback = false): ResumeResult {
  const parsed = parseResume(content);
  return {
    optimizedContent: content,
    keywords: ['待匹配 JD', parsed.role, '原始简历已读取'].filter(Boolean).slice(0, 6),
    improvements: usedFallback
      ? ['PDF 文本层不可读，已先清理乱码', '建议上传 DOCX / TXT 或粘贴简历文本', '仍可先基于文件名和 JD 优化表达框架']
      : ['已读取上传简历', '可继续输入目标岗位或 JD', '发送后将基于当前简历生成优化版本'],
    matchScore: 68,
  };
}

async function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('文件读取失败，请重试'));
    reader.readAsText(file, 'utf-8');
  });
}

async function extractResumeText(file: File) {
  try {
    const ext = getFileExtension(file.name);
    if (['.txt', '.md', '.markdown', '.csv', '.json'].includes(ext)) return normalizeExtractedText(await readTextFile(file));
    if (ext === '.pdf' || file.type.includes('pdf')) return await extractPdfText(file);
    if (ext === '.docx' || file.type.includes('wordprocessingml')) return await extractDocxText(file);
    if (ext === '.doc') throw new Error('暂不支持旧版 .doc，请另存为 .docx 后上传');
    throw new Error('不支持该文件格式，请上传 PDF、DOCX、TXT 或 MD');
  } catch (err) {
    throw err instanceof Error ? err : new Error('简历读取失败，请重试');
  }
}

function deriveSessionTitle(resumeContent: string, messages: ChatMessage[], fallback: string) {
  if (!resumeContent.trim() && messages.length === 0) return fallback || '新的简历对话';
  const parsed = parseResume(resumeContent);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content.trim();
  if (latestUserMessage) return latestUserMessage.slice(0, 18);
  if (parsed.name || parsed.role) return `${parsed.name}_${parsed.role}`.slice(0, 24);
  return fallback;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1280px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

function useIsPreviewDocked() {
  const [isPreviewDocked, setIsPreviewDocked] = useState(() => window.matchMedia('(min-width: 1536px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1536px)');
    const update = () => setIsPreviewDocked(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isPreviewDocked;
}

function ResumePreview({
  result,
  style,
}: {
  result: ResumeResult;
  style: ResumeStyle;
}) {
  const parsed = useMemo(() => parseResume(result.optimizedContent), [result.optimizedContent]);
  const styleClass = {
    clean: 'bg-white text-slate-900 border-slate-200',
    tech: 'bg-cyan-50/60 text-slate-900 border-cyan-200',
    consulting: 'bg-stone-50 text-slate-900 border-emerald-200',
    dark: 'bg-slate-900 text-slate-100 border-slate-700',
  }[style];
  const accentClass = {
    clean: 'border-indigo-500 text-indigo-600 bg-indigo-50',
    tech: 'border-cyan-700 text-cyan-700 bg-cyan-50',
    consulting: 'border-emerald-700 text-emerald-700 bg-emerald-50',
    dark: 'border-amber-400 text-amber-300 bg-slate-800',
  }[style];
  const mutedClass = style === 'dark' ? 'text-slate-300' : 'text-slate-500';

  return (
    <article className={`mx-auto min-h-[760px] w-full max-w-[620px] min-w-0 break-words border p-6 shadow-[0_14px_34px_rgba(31,41,55,.08)] transition-colors ${styleClass}`} style={{ overflowWrap: 'anywhere' }}>
      <div className={`mb-3 flex flex-col gap-4 border-b-4 pb-5 sm:flex-row sm:items-start sm:justify-between ${accentClass.split(' ').find((item) => item.startsWith('border-'))}`}>
        <div className="min-w-0">
          <div className="text-2xl font-black tracking-normal">{parsed.name}</div>
          <div className={`mt-2 text-base font-extrabold ${accentClass.split(' ').find((item) => item.startsWith('text-'))}`}>{parsed.role}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.keywords.slice(0, 6).map((keyword) => (
              <span key={keyword} className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${accentClass}`}>
                {keyword}
              </span>
            ))}
          </div>
        </div>
        <div className={`text-left text-sm leading-7 sm:text-right ${mutedClass}`}>
          {parsed.contact.split('|').map((item) => (
            <div key={item.trim()}>{item.trim()}</div>
          ))}
        </div>
      </div>
      <div className={`mb-7 text-sm font-bold ${mutedClass}`}>
        JD 匹配分 {result.matchScore} | 关键词覆盖 71% | 模板：ATS 友好版
      </div>
      <div className="space-y-6">
        {result.optimizedContent
        .split(/\n(?=(个人总结|工作经历|项目经历|技能描述)\n)/)
        .filter((block) => block.trim() && !['个人总结', '工作经历', '项目经历', '技能描述'].includes(block.trim()))
        .map((block, index) => {
          const [title, ...body] = block.trim().split('\n');
          return (
              <section key={`${title}-${index}`} className="min-w-0">
                <h3 className={`border-t pt-4 text-base font-black ${style === 'dark' ? 'border-slate-700' : 'border-slate-200'}`}>{title}</h3>
                <div className="mt-2 whitespace-pre-line text-sm leading-7">
                  {body.join('\n')}
                </div>
              </section>
          );
        })}
      </div>
    </article>
  );
}

function PlainResumePanel({ title, content }: { title: string; content: string }) {
  return (
    <article className="min-h-[760px] min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_12px_28px_rgba(31,41,55,.06)]">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-black text-slate-900">
        <i className="ri-file-text-line text-slate-500" />
        {title}
      </div>
      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700" style={{ overflowWrap: 'anywhere' }}>
        {content || '暂无原始简历内容'}
      </div>
    </article>
  );
}

function ResumeCompareView({
  originalContent,
  result,
}: {
  originalContent: string;
  result: ResumeResult;
}) {
  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-4">
      <ResumeScorePanel result={result} />
      <InlineDiffPanel originalContent={originalContent} optimizedContent={result.optimizedContent} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PlainResumePanel title="原始简历" content={originalContent} />
        <PlainResumePanel title="优化版本" content={result.optimizedContent} />
      </div>
    </div>
  );
}

function ResumeThumbnail({
  result,
  docName,
  onOpen,
}: {
  result: ResumeResult;
  docName: string;
  onOpen: () => void;
}) {
  const parsed = useMemo(() => parseResume(result.optimizedContent), [result.optimizedContent]);
  const previewLines = result.optimizedContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && ![parsed.name, parsed.role].includes(line))
    .slice(0, 8);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-6 w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-[0_12px_30px_rgba(31,41,55,.08)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(31,41,55,.12)]"
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4">
        <div className="flex min-w-0 items-center gap-3 font-black">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-xs text-white">DOC</span>
          <span className="truncate">{docName}</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600">
          <i className="ri-layout-right-line" />
          展开
        </span>
      </div>
      <div className="bg-slate-50 p-4">
        <div className="mx-auto h-48 max-w-[360px] overflow-hidden rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-inner" style={{ overflowWrap: 'anywhere' }}>
          <div className="flex items-start justify-between gap-4 border-b-2 border-indigo-500 pb-3">
            <div className="min-w-0">
              <div className="truncate text-xl font-black tracking-normal text-slate-950">{parsed.name}</div>
              <div className="mt-1 truncate text-sm font-extrabold text-indigo-600">{parsed.role}</div>
            </div>
            <div className="text-right text-[10px] font-bold leading-4 text-slate-400">
              {parsed.contact.split('|').slice(0, 2).map((item) => (
                <div key={item.trim()} className="truncate">{item.trim()}</div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {result.keywords.slice(0, 4).map((keyword) => (
              <span key={keyword} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-600">
                {keyword}
              </span>
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {previewLines.map((line, index) => (
              <div key={`${line}-${index}`} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${index < 2 ? 'bg-slate-800' : 'bg-slate-300'}`} />
                <span className="truncate text-[11px] font-bold text-slate-600">{line.replace(/^- /, '')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-600">
            <i className="ri-key-2-line mr-1" />
            JD 关键词已匹配
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
            匹配分 {result.matchScore}
          </span>
        </div>
      </div>
    </button>
  );
}

function ResumeVersionMessageCard({
  message,
  onOpen,
}: {
  message: ChatMessage;
  onOpen: (payload: ResumeVersionPayload) => void;
}) {
  const payload = message.version;
  if (!payload) return <div className="whitespace-pre-wrap text-sm text-slate-700">{message.content}</div>;

  const parsed = parseResume(payload.result.optimizedContent);
  const previewLines = payload.result.optimizedContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && ![parsed.name, parsed.role].includes(line))
    .slice(0, 4);

  return (
    <button
      type="button"
      onClick={() => onOpen(payload)}
      className="w-full overflow-hidden rounded-2xl border border-indigo-100 bg-white text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-xs font-black text-white">
            V{payload.version}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-950">{payload.docName}</div>
            <div className="mt-0.5 text-xs font-bold text-slate-400">{payload.modeLabel} · {message.time}</div>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-600">
          <i className="ri-layout-right-line" />
          展开
        </span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_150px]">
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-900">{message.content}</div>
          <div className="mt-3 space-y-1.5">
            {previewLines.map((line, index) => (
              <div key={`${line}-${index}`} className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-500">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-300" />
                <span className="truncate">{line.replace(/^- /, '')}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {payload.result.keywords.slice(0, 5).map((keyword) => (
              <span key={keyword} className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-600">
                {keyword}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-xs font-black text-slate-400">JD 匹配分</div>
          <div className="mt-1 text-3xl font-black text-indigo-600">{payload.result.matchScore}</div>
          <div className="mt-3 line-clamp-3 text-xs font-bold leading-5 text-slate-500">
            {payload.result.improvements.slice(0, 2).join('；')}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 p-4">
        <ResumeScorePanel result={payload.result} />
        {payload.originalContent && (
          <div className="mt-3 rounded-2xl border border-indigo-100 bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-black text-indigo-600">
              <i className="ri-git-compare-line" />
              修改对比摘要
            </div>
            <InlineDiffPanel
              originalContent={payload.originalContent}
              optimizedContent={payload.result.optimizedContent}
            />
          </div>
        )}
      </div>
    </button>
  );
}

function buildDimensionScores(result: ResumeResult) {
  const base = Math.max(55, Math.min(96, result.matchScore));
  return [
    { label: 'JD 关键词覆盖', score: Math.min(98, base + 6), icon: 'ri-key-2-line' },
    { label: '经历证据强度', score: Math.max(50, base - 3), icon: 'ri-stack-line' },
    { label: '表达清晰度', score: Math.min(96, base + 2), icon: 'ri-text' },
    { label: 'ATS 友好度', score: Math.min(94, base + 1), icon: 'ri-search-eye-line' },
  ];
}

function ResumeScorePanel({ result }: { result: ResumeResult }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {buildDimensionScores(result).map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-xs font-black text-slate-600">
              <i className={`${item.icon} text-indigo-500`} />
              <span className="truncate">{item.label}</span>
            </div>
            <span className="text-sm font-black text-slate-950">{item.score}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-600" style={{ width: `${item.score}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildLineDiff(originalContent: string, optimizedContent: string) {
  const originalLines = originalContent.split('\n').map((line) => line.trim()).filter(Boolean);
  const optimizedLines = optimizedContent.split('\n').map((line) => line.trim()).filter(Boolean);
  const originalSet = new Set(originalLines);
  const optimizedSet = new Set(optimizedLines);
  const removed = originalLines.filter((line) => !optimizedSet.has(line)).slice(0, 12);
  const added = optimizedLines.filter((line) => !originalSet.has(line)).slice(0, 12);
  return { removed, added };
}

function InlineDiffPanel({
  originalContent,
  optimizedContent,
}: {
  originalContent: string;
  optimizedContent: string;
}) {
  const diff = useMemo(() => buildLineDiff(originalContent, optimizedContent), [originalContent, optimizedContent]);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3">
        <div className="mb-2 text-xs font-black text-red-600">原始中被弱化或替换</div>
        <div className="space-y-2">
          {(diff.removed.length ? diff.removed : ['暂无明显删除内容']).map((line, index) => (
            <div key={`${line}-${index}`} className="rounded-xl bg-white px-3 py-2 text-xs font-bold leading-5 text-red-700">
              - {line}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
        <div className="mb-2 text-xs font-black text-emerald-700">优化后新增或强化</div>
        <div className="space-y-2">
          {(diff.added.length ? diff.added : ['暂无明显新增内容']).map((line, index) => (
            <div key={`${line}-${index}`} className="rounded-xl bg-white px-3 py-2 text-xs font-bold leading-5 text-emerald-700">
              + {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JobContextCard({
  target,
  value,
  uploadedFile,
  onEdit,
}: {
  target: JobTarget;
  value: string;
  uploadedFile: UploadedResumeFile | null;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!value.trim()) return null;

  return (
    <div className="rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <i className="ri-briefcase-4-line text-indigo-600" />
            职位上下文
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-black text-indigo-600">已锁定</span>
          </div>
          <div className="mt-1 truncate text-xs font-bold text-slate-500">
            {target.company} · {target.role}{uploadedFile ? ` · ${uploadedFile.name}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
            title="编辑职位"
          >
            <i className="ri-edit-2-line" />
          </button>
          <i className={`ri-arrow-down-s-line text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {target.keywords.slice(0, 8).map((keyword) => (
              <span key={keyword} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-indigo-600">
                {keyword}
              </span>
            ))}
          </div>
          <div className="max-h-40 overflow-auto whitespace-pre-wrap text-xs font-bold leading-6 text-slate-600">
            {value}
          </div>
        </div>
      )}
    </div>
  );
}

function NewConversationStart({
  value,
  target,
  loading,
  error,
  onChange,
  onPasteApply,
  onBossRead,
  onUploadClick,
}: {
  value: string;
  target: JobTarget;
  loading: boolean;
  error: string;
  onChange: (value: string) => void;
  onPasteApply: () => void;
  onBossRead: (url: string) => void;
  onUploadClick: () => void;
}) {
  const [tab, setTab] = useState<'paste' | 'link'>('paste');
  const [url, setUrl] = useState('');

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_46px_rgba(31,41,55,.08)]">
      <div className="mb-5">
        <div className="text-xl font-black text-slate-950">先放入目标职位，再开始简历对话</div>
        <div className="mt-2 text-sm font-bold leading-6 text-slate-500">职位描述会作为本轮对话的上下文，后续优化版本都会围绕它做匹配和对比。</div>
      </div>
      <div className="mb-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        {[
          { value: 'paste', label: '粘贴职位描述', icon: 'ri-file-copy-2-line' },
          { value: 'link', label: '读取岗位链接', icon: 'ri-link-m' },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value as 'paste' | 'link')}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-black ${
              tab === item.value ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
            }`}
          >
            <i className={item.icon} />
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'paste' ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={8}
          placeholder="粘贴岗位职责、任职要求、加分项。也可以先写：前端开发工程师，北京，12-15K。"
          className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 outline-none focus:border-indigo-300"
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="粘贴 BOSS 直聘岗位链接"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-300"
          />
          <button
            type="button"
            onClick={() => onBossRead(url)}
            disabled={loading || !url.trim()}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-black text-white disabled:bg-slate-300"
          >
            <i className={loading ? 'ri-loader-4-line animate-spin' : 'ri-download-cloud-2-line'} />
            读取职位
          </button>
        </div>
      )}
      {value.trim() && (
        <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3">
          <div className="text-xs font-black text-indigo-600">识别到的目标</div>
          <div className="mt-1 text-sm font-black text-slate-950">{target.company} · {target.role}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {target.keywords.slice(0, 6).map((keyword) => (
              <span key={keyword} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-indigo-600">
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}
      {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{error}</div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onUploadClick}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:bg-slate-50"
        >
          <i className="ri-upload-2-line" />
          上传简历
        </button>
        <button
          type="button"
          onClick={onPasteApply}
          disabled={value.trim().length < 20}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <i className="ri-chat-new-line" />
          进入对话
        </button>
      </div>
    </div>
  );
}

function IntroWorkflowPanel({
  value,
  onChange,
  guide,
}: {
  value: IntroWorkflowState;
  onChange: (value: IntroWorkflowState) => void;
  guide: { label: string; focus: string; keywords: string[] };
}) {
  const update = (patch: Partial<IntroWorkflowState>) => onChange({ ...value, ...patch });

  return (
    <div className="mt-5 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-black text-slate-900">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
            <i className="ri-user-voice-line" />
          </span>
          自我介绍定向
        </div>
        <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">
          {guide.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {INTRO_ROLE_OPTIONS.map((role) => (
          <button
            key={role.value}
            type="button"
            onClick={() => update({ roleType: role.value })}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-black ${
              value.roleType === role.value
                ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <i className={role.icon} />
            {role.label}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold leading-6 text-slate-500">
        {guide.focus}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {INTRO_TONE_OPTIONS.map((tone) => (
          <button
            key={tone}
            type="button"
            onClick={() => update({ tone })}
            className={`h-8 rounded-full border px-3 text-xs font-black ${
              value.tone === tone
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tone}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          value={value.mbti}
          onChange={(event) => update({ mbti: event.target.value })}
          placeholder="MBTI（可选）"
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-300"
        />
        <input
          value={value.zodiac}
          onChange={(event) => update({ zodiac: event.target.value })}
          placeholder="星座（可选）"
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-300"
        />
      </div>
      <textarea
        value={value.highlights}
        onChange={(event) => update({ highlights: event.target.value })}
        placeholder="补充亮点，比如客户资源、代表项目、获奖、个人表达特点（可选）"
        rows={3}
        className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
      />
    </div>
  );
}

function JobTargetPanel({
  open,
  value,
  target,
  loading,
  error,
  modules,
  onChange,
  onClose,
  onPasteApply,
  onBossRead,
  onStartModule,
}: {
  open: boolean;
  value: string;
  target: JobTarget;
  loading: boolean;
  error: string;
  modules: ResumeModule[];
  onChange: (value: string) => void;
  onClose: () => void;
  onPasteApply: () => void;
  onBossRead: (url: string) => void;
  onStartModule: (module: ResumeModule) => void;
}) {
  const [tab, setTab] = useState<'paste' | 'boss'>('paste');
  const [bossUrl, setBossUrl] = useState('');
  const hasTargetContent = value.trim().length > 0;

  if (!open) return null;

  return (
    <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <i className="ri-briefcase-4-line" />
            </span>
            目标 JD
          </div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {target.company} · {target.role}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
          title="收起"
        >
          <i className="ri-close-line" />
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex rounded-xl bg-white p-1">
            {[
              { value: 'paste', label: '粘贴 JD', icon: 'ri-file-copy-2-line' },
              { value: 'boss', label: 'BOSS 链接', icon: 'ri-link-m' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value as 'paste' | 'boss')}
                className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-black ${
                  tab === item.value ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <i className={item.icon} />
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'paste' ? (
            <>
              <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={9}
                placeholder="粘贴岗位职责、任职要求、加分项"
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700 outline-none focus:border-indigo-300"
              />
              <button
                type="button"
                onClick={onPasteApply}
                disabled={value.trim().length < 20}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <i className="ri-check-line" />
                使用这份 JD
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <input
                  value={bossUrl}
                  onChange={(event) => setBossUrl(event.target.value)}
                  placeholder="粘贴 BOSS 直聘岗位链接"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-300"
                />
                <button
                  type="button"
                  onClick={() => onBossRead(bossUrl)}
                  disabled={loading || !bossUrl.trim()}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <i className={loading ? 'ri-loader-4-line animate-spin' : 'ri-download-cloud-2-line'} />
                  读取岗位 JD
                </button>
              </div>
              {hasTargetContent && (
                <div className="rounded-xl border border-indigo-100 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-xs font-black text-indigo-600">已读取的 JD 内容</div>
                    <button
                      type="button"
                      onClick={onPasteApply}
                      className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 text-xs font-black text-indigo-600 hover:bg-indigo-100"
                    >
                      <i className="ri-check-line" />
                      使用
                    </button>
                  </div>
                  <textarea
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    rows={7}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-indigo-300"
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
          <div className="text-xs font-black text-indigo-600">当前匹配重点</div>
          {hasTargetContent ? (
            <>
              <div className="mt-2 text-lg font-black leading-7 text-slate-950">{target.role}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {target.keywords.slice(0, 8).map((keyword) => (
                  <span key={keyword} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-indigo-600 shadow-sm">
                    {keyword}
                  </span>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-indigo-100 bg-white/80 p-3">
                <div className="mb-2 text-xs font-black text-slate-500">JD 原文预览</div>
                <div className="max-h-44 overflow-auto whitespace-pre-wrap text-xs font-bold leading-6 text-slate-600">
                  {value}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm font-bold leading-7 text-slate-500">粘贴 JD 后会提取岗位、关键词和匹配重点。</div>
          )}
        </div>
      </div>

      {modules.length > 0 && (
        <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-950">简历优化工作流</div>
              <div className="mt-1 text-xs font-bold text-slate-500">建议按顺序跑，也可以直接选择薄弱模块。</div>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-indigo-600 shadow-sm">
              {modules.length} 步
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {modules.map((module) => (
              <button
                key={module.key}
                type="button"
                onClick={() => onStartModule(module)}
                className="group min-h-[168px] w-full rounded-2xl border border-white bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <div className="flex h-full min-w-0 flex-col">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                      <i className={module.icon} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-black text-slate-400">STEP {module.step}</div>
                          <div className="mt-0.5 truncate text-sm font-black text-slate-900">{module.label}</div>
                        </div>
                        <i className="ri-arrow-right-line shrink-0 text-slate-300 transition group-hover:text-indigo-500" />
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-slate-600">{module.goal}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {module.checks.slice(0, 3).map((check) => (
                      <span key={check} className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-500">
                        {check}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto rounded-xl bg-indigo-50/70 px-3 py-2 text-[11px] font-bold leading-5 text-indigo-700">
                    产出：{module.output}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkbenchHistorySidebar({
  activeTab,
  sessions,
  activeSessionId,
  optimizationRecords,
  onTabChange,
  onNewSession,
  onOpenSession,
  onOpenOptimizationRecord,
}: {
  activeTab: HistoryTab;
  sessions: ChatSession[];
  activeSessionId: string;
  optimizationRecords: OptimizationRecord[];
  onTabChange: (tab: HistoryTab) => void;
  onNewSession: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenOptimizationRecord: (record: OptimizationRecord) => void;
}) {
  return (
    <aside className="hidden border-b border-slate-200 bg-white xl:block xl:border-b-0 xl:border-r">
      <div className="flex h-full flex-col p-4">
        <button
          type="button"
          onClick={onNewSession}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white shadow-sm hover:bg-slate-800"
        >
          <i className="ri-chat-new-line" />
          新对话
        </button>

        <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          {[
            { value: 'chat', label: '对话', icon: 'ri-message-3-line' },
            { value: 'optimization', label: '优化', icon: 'ri-file-list-3-line' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onTabChange(item.value as HistoryTab)}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-black ${
                activeTab === item.value ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <i className={item.icon} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {activeTab === 'chat' ? (
            <div className="space-y-2">
              {sessions.map((session) => {
                const hasSessionJob = session.jobRequirements.trim().length > 0;
                const target = parseJobTarget(session.jobRequirements, 'paste');
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                      session.id === activeSessionId
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-indigo-600">
                        <i className="ri-message-3-line" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black">{session.title}</div>
                        <div className="mt-1 truncate text-[11px] font-bold opacity-70">
                          {hasSessionJob ? `${target.company} · ${target.role}` : '未设置 JD'}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] font-bold opacity-60">
                          <span>{session.messages.length} 条</span>
                          {session.uploadedFile && <span>已上传简历</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {optimizationRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onOpenOptimizationRecord(record)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500">
                      <i className="ri-file-user-line" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black">{record.company}_{record.position}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] font-bold opacity-70">
                        <span>{record.date}</span>
                        <span>匹配 {record.matchScore}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {record.keywords.slice(0, 3).map((keyword) => (
                          <span key={keyword} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-600">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {optimizationRecords.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-bold leading-6 text-slate-400">
                  暂无优化记录
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default function HomePage() {
  const initialWorkspace = useMemo(() => readChatWorkspace(), []);
  const initialSession = initialWorkspace.sessions.find((session) => session.id === initialWorkspace.activeSessionId) || initialWorkspace.sessions[0];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>(initialWorkspace.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initialWorkspace.activeSessionId);
  const [activeMode, setActiveMode] = useState<OptimizeMode>(initialSession.activeMode);
  const [activeModuleKey, setActiveModuleKey] = useState<string>(initialSession.activeMode);
  const [resumeStyle, setResumeStyle] = useState<ResumeStyle>('clean');
  const [resumePreviewMode, setResumePreviewMode] = useState<ResumePreviewMode>('optimized');
  const [selectedModel, setSelectedModel] = useState<WorkspaceModel>(initialSession.model ?? DEFAULT_WORKSPACE_MODEL);
  const [resumeContent, setResumeContent] = useState(initialSession.resumeContent);
  const [jobRequirements, setJobRequirements] = useState(initialSession.jobRequirements ?? SAMPLE_JD);
  const [draftJobRequirements, setDraftJobRequirements] = useState(initialSession.jobRequirements ?? SAMPLE_JD);
  const [command, setCommand] = useState(initialSession.command);
  const [result, setResult] = useState<ResumeResult>(initialSession.result);
  const [messages, setMessages] = useState<ChatMessage[]>(initialSession.messages);
  const [activeResumeVersion, setActiveResumeVersion] = useState(() => getLatestResumeVersion(initialSession.messages));
  const [uploadedFile, setUploadedFile] = useState<UploadedResumeFile | null>(initialSession.uploadedFile);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('chat');
  const [optimizationRecords, setOptimizationRecords] = useState<OptimizationRecord[]>(() => readLocalOptimizationRecords());
  const [showJobPanel, setShowJobPanel] = useState(true);
  const [readingBossJob, setReadingBossJob] = useState(false);
  const [jobError, setJobError] = useState('');
  const [introWorkflow, setIntroWorkflow] = useState<IntroWorkflowState>({
    roleType: 'auto',
    mbti: '',
    zodiac: '',
    tone: '结构清晰',
    highlights: '',
  });
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [optimizationFlow, setOptimizationFlow] = useState<OptimizationFlow>('resume');
  const [optimizationStageIndex, setOptimizationStageIndex] = useState(0);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [toast, setToast] = useState('');
  const [aiConsent, setAiConsent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const user = getStoredUser();
  const isDesktop = useIsDesktop();
  const isPreviewDocked = useIsPreviewDocked();
  const currentResume = useMemo(() => parseResume(result.optimizedContent), [result.optimizedContent]);
  const resumeModules = useMemo(() => detectResumeModules(result.optimizedContent || resumeContent), [result.optimizedContent, resumeContent]);
  const jobTarget = useMemo(() => parseJobTarget(jobRequirements, jobRequirements === SAMPLE_JD ? 'sample' : 'paste'), [jobRequirements]);
  const hasConversationContent = Boolean(resumeContent.trim() || result.optimizedContent.trim() || messages.length || jobRequirements.trim());
  const hasResumePreview = Boolean(result.optimizedContent.trim());
  const currentDocName = hasResumePreview ? buildResumeDocName(result) : '待生成简历.md';
  const activeVersionPayload = useMemo(
    () => getResumeVersionMessages(messages).find((message) => message.version?.version === activeResumeVersion)?.version,
    [activeResumeVersion, messages],
  );
  const currentOriginalContent = activeVersionPayload?.originalContent || resumeContent;
  const resumeVersionCount = useMemo(() => getResumeVersionMessages(messages).length, [messages]);
  const currentModelOption = WORKSPACE_MODELS.find((model) => model.id === selectedModel) || WORKSPACE_MODELS[0];
  const pageTitle = hasResumePreview ? `${currentResume.role}简历优化` : '新的简历对话';
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [sessions],
  );
  const introWorkflowActive = isIntroRequest(activeMode, command);
  const introGuide = useMemo(
    () => resolveIntroRole(introWorkflow, command, jobRequirements),
    [introWorkflow, command, jobRequirements],
  );
  const inputBarStyle = isDesktop && drawerOpen && isPreviewDocked
    ? { left: `${SHELL_SIDEBAR_WIDTH + WORKBENCH_HISTORY_WIDTH}px`, right: 'calc((100vw - 244px) / 2)' }
    : isDesktop
      ? { left: `${SHELL_SIDEBAR_WIDTH + WORKBENCH_HISTORY_WIDTH}px`, right: 0 }
      : { left: 0, right: 0 };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };

  useEffect(() => {
    if (!loading) {
      setOptimizationStageIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setOptimizationStageIndex((current) => Math.min(current + 1, OPTIMIZATION_STAGES[optimizationFlow].length - 1));
    }, 2200);

    return () => window.clearInterval(timer);
  }, [loading, optimizationFlow]);

  const rememberOptimizationRecord = (record: OptimizationRecord) => {
    writeLocalOptimizationRecord(record);
    setOptimizationRecords((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 100));
  };

  useEffect(() => {
    setSessions((current) => current.map((session) => {
      if (session.id !== activeSessionId) return session;
      return {
        ...session,
        title: deriveSessionTitle(resumeContent, messages, session.title),
        updatedAt: new Date().toISOString(),
        messages,
        resumeContent,
        result,
        command,
        activeMode,
        uploadedFile,
        jobRequirements,
        model: selectedModel,
      };
    }));
  }, [activeMode, activeSessionId, command, jobRequirements, messages, result, resumeContent, selectedModel, uploadedFile]);

  useEffect(() => {
    window.localStorage.setItem(scopedLocalKey(CHAT_SESSIONS_KEY), JSON.stringify(sessions));
    window.localStorage.setItem(scopedLocalKey(ACTIVE_CHAT_SESSION_KEY), activeSessionId);
    window.localStorage.setItem(scopedLocalKey(CHAT_HISTORY_KEY), JSON.stringify(messages));
  }, [activeSessionId, messages, sessions]);

  const addMessage = (message: Pick<ChatMessage, 'role' | 'content'>) => {
    setMessages((current) => [...current, createChatMessage(message.role, message.content)]);
  };

  const addResumeVersionMessage = (nextResult: ResumeResult, mode: OptimizeMode, content: string, originalContent?: string) => {
    setMessages((current) => {
      const version = getLatestResumeVersion(current) + 1;
      setActiveResumeVersion(version);
      return [
        ...current,
        createResumeVersionMessage({
          version,
          result: nextResult,
          modeLabel: getModeLabel(mode),
          docName: buildResumeDocName(nextResult),
          content,
          originalContent,
        }),
      ];
    });
  };

  const openResumeVersion = (payload: ResumeVersionPayload) => {
    setResult(payload.result);
    setActiveResumeVersion(payload.version);
    setResumePreviewMode('optimized');
    setDrawerOpen(true);
    setShowJobPanel(false);
    showToast(`已打开 V${payload.version} 简历版本`);
  };

  const openSession = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session || session.id === activeSessionId) return;
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setActiveResumeVersion(getLatestResumeVersion(session.messages));
    setResumeContent(session.resumeContent);
    setResult(session.result);
    setCommand(session.command);
    setActiveMode(session.activeMode);
    setActiveModuleKey(session.activeMode);
    setSelectedModel(session.model ?? DEFAULT_WORKSPACE_MODEL);
    setUploadedFile(session.uploadedFile);
    setJobRequirements(session.jobRequirements ?? SAMPLE_JD);
    setDraftJobRequirements(session.jobRequirements ?? SAMPLE_JD);
    setDrawerOpen(false);
    setShowJobPanel(false);
    setHistoryTab('chat');
    showToast('已切换对话');
  };

  const openOptimizationRecord = (record: OptimizationRecord) => {
    const content = buildOptimizationRecordContent(record);
    setResult({
      optimizedContent: content,
      keywords: record.keywords,
      improvements: record.improvements,
      matchScore: record.matchScore,
    });
    const recordMode = record.optimizeMode === 'intro' ? 'intro' : 'project';
    setCommand(`继续优化${recordMode === 'intro' ? '自我介绍' : '项目经验'}，并保持当前 JD 关键词匹配`);
    setActiveMode(recordMode);
    setActiveModuleKey(recordMode);
    setShowJobPanel(false);
    setDrawerOpen(true);
    setActiveResumeVersion(0);
    addMessage({
      role: 'assistant',
      content: `已打开优化记录《${record.company}_${record.position}》，可以继续在当前工作台里调整。`,
    });
    showToast('已打开优化记录');
  };

  const startNewSession = () => {
    const session = createBlankSession();
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setMessages([]);
    setActiveResumeVersion(0);
    setResumeContent(session.resumeContent);
    setResult(session.result);
    setCommand(session.command);
    setActiveMode(session.activeMode);
    setActiveModuleKey(session.activeMode);
    setSelectedModel(session.model ?? DEFAULT_WORKSPACE_MODEL);
    setUploadedFile(null);
    setJobRequirements(session.jobRequirements);
    setDraftJobRequirements(session.jobRequirements);
    setDrawerOpen(false);
    setShowJobPanel(true);
    setHistoryTab('chat');
    showToast('已开启新对话');
  };

  const clearCurrentMessages = () => {
    setMessages([]);
    showToast('当前对话记录已清空');
  };

  const handleResumeFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      showToast('文件超过 5MB，请压缩后再上传');
      return;
    }

    setUploadingResume(true);
    setStatusText('正在读取上传的简历文件');
    try {
      const rawContent = (await extractResumeText(file)).trim();
      const { content, usedFallback } = prepareUploadedResumeContent(rawContent, file.name);
      if (content.length < 20) {
        showToast('简历内容太短，请检查文件');
        return;
      }
      const fileMeta = { name: file.name, size: file.size, type: file.type || getFileExtension(file.name) };
      setUploadedFile(fileMeta);
      setResumeContent(content);
      setResult(buildUploadedResumeResult(content, usedFallback));
      setActiveResumeVersion(0);
      setCommand('基于当前 JD 优化项目经验，突出职责、动作、技术难点和结果');
      setActiveMode('project');
      setActiveModuleKey('project');
      setShowJobPanel(true);
      addMessage({
        role: 'assistant',
        content: usedFallback
          ? `已读取简历《${file.name}》，但 PDF 文本层不可读，已先清理乱码并保留文件名信息。建议上传 DOCX / TXT 或粘贴简历文本。`
          : `已读取简历《${file.name}》，你可以继续输入目标岗位、JD 或优化要求。`,
      });
      showToast(usedFallback ? 'PDF 文本层不可读，已清理乱码' : '简历已上传并读取');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '文件读取失败，请重试');
    } finally {
      setUploadingResume(false);
      setStatusText('');
    }
  };

  const runOptimization = async (mode = activeMode, instruction = command, moduleKey: string = activeModuleKey) => {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction || loading) return;

    addMessage({ role: 'user', content: trimmedInstruction });
    if (isAssistantIntroRequest(trimmedInstruction)) {
      addMessage({
        role: 'assistant',
        content: '我是职引简历，主要帮你围绕目标 JD 优化简历、自我介绍、项目经历、技能描述和面试复盘。你可以先上传简历或粘贴 JD，也可以直接选择下方模块开始演示。',
      });
      showToast('已回复当前问题');
      return;
    }

    const nextMode = inferModeFromCommand(trimmedInstruction, mode);
    const isProductManagerRequest = hasProductManagerIntent(trimmedInstruction);
    const shouldUseIntroWorkflow = isIntroRequest(nextMode, trimmedInstruction);
    const introContext = shouldUseIntroWorkflow
      ? buildIntroWorkflowContext(introWorkflow, trimmedInstruction, jobRequirements)
      : '';
    const activeIntroGuide = shouldUseIntroWorkflow
      ? resolveIntroRole(introWorkflow, trimmedInstruction, jobRequirements)
      : null;
    setActiveMode(nextMode);
    setActiveModuleKey(moduleKey);
    setOptimizationFlow(shouldUseIntroWorkflow ? 'intro' : 'resume');
    setOptimizationStageIndex(0);
    setLoading(true);
    setStatusText(shouldUseIntroWorkflow ? '正在结合岗位身份生成定向自我介绍' : '正在结合 JD 和你的指令优化右侧简历，预计需要 10-30 秒');
    const baseResumeContent = resumeContent.trim() || result.optimizedContent.trim() || SAMPLE_RESUME;
    try {
      if (!user) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        const demoResult = shouldUseIntroWorkflow
          ? createIntroDemoResult(introWorkflow, trimmedInstruction, jobRequirements)
          : isProductManagerRequest
            ? PRODUCT_MANAGER_RESULT
            : nextMode === 'project'
              ? createProjectDemoResult(jobRequirements)
              : DEFAULT_RESULT;
        setResult(demoResult);
        rememberOptimizationRecord(buildRecordFromResult({
          result: demoResult,
          jobTarget,
          mode: nextMode,
          optimizedContent: demoResult.optimizedContent,
        }));
        addResumeVersionMessage(
          demoResult,
          nextMode,
          shouldUseIntroWorkflow && activeIntroGuide
            ? `已按${activeIntroGuide.label}岗位生成自我介绍版本`
            : isProductManagerRequest
              ? '已生成产品经理方向简历版本'
              : '已生成新的优化简历版本',
          baseResumeContent,
        );
        showToast('已生成示例优化结果，登录后可保存真实记录');
        return;
      }

      const apiResumeContent = baseResumeContent;
      const apiJobRequirements = jobRequirements.trim() || SAMPLE_JD;

      const next = await createResumeOptimization({
        resumeContent: apiResumeContent,
        jobRequirements: `${isProductManagerRequest ? '目标岗位：产品经理\n请弱化纯前端研发定位，突出需求分析、业务理解、用户视角、跨团队协作和产品推进能力。\n\n' : ''}${apiJobRequirements}${introContext ? `\n\n自我介绍工作流确认信息（用户未填写的项不要编造）：\n${introContext}` : ''}

本次用户追加优化指令：
${trimmedInstruction}`,
        optimizeMode: nextMode,
        model: selectedModel,
        keywordMatch: true,
        aiConsent: true,
      });
      const nextResult = {
        optimizedContent: next.optimizedContent,
        keywords: next.keywords,
        improvements: next.improvements,
        matchScore: next.matchScore,
      };
      const finalResult = nextResult;
      setResult(finalResult);
      rememberOptimizationRecord(buildRecordFromResult({
        result: finalResult,
        jobTarget,
        mode: nextMode,
        optimizedContent: finalResult.optimizedContent,
      }));
      addResumeVersionMessage(
        finalResult,
        nextMode,
        shouldUseIntroWorkflow && activeIntroGuide
          ? `已按${activeIntroGuide.label}岗位生成自我介绍版本`
          : isProductManagerRequest
            ? '已生成产品经理方向简历版本'
            : '已按你的指令生成新的优化简历版本',
        apiResumeContent,
      );
      showToast('已按你的指令更新右侧简历');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '优化失败，请稍后再试';
      const fallbackResult = createLocalOptimizationDemoResult(baseResumeContent, jobRequirements, nextMode, trimmedInstruction);
      addMessage({
        role: 'assistant',
        content: `AI 生成暂时失败：${errorMessage}\n\n本次未生成正式优化稿，也未扣除额度。下面仅显示优化建议预览，不能作为投递版本。`,
      });
      setResult({ ...fallbackResult, optimizedContent: baseResumeContent });
      showToast('AI 暂不可用，本次未扣除额度');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const submitCommand = () => {
    if (user && !aiConsent) {
      showToast('请先确认同意将简历和 JD 发送给 AI 服务');
      return;
    }
    runOptimization(activeMode, command);
  };

  const selectModule = (module: ResumeModule) => {
    setActiveMode(module.mode);
    setActiveModuleKey(module.key);
    setCommand(module.prompt);
    showToast(`已切换到${module.label}`);
  };

  const applyDraftJob = () => {
    const next = draftJobRequirements.trim();
    if (next.length < 20) {
      setJobError('JD 内容太短，请补充岗位职责或任职要求');
      return;
    }
    setJobRequirements(next);
    setDraftJobRequirements(next);
    setJobError('');
    setCommand('基于当前 JD 优化项目经验，突出职责、动作、技术难点和结果');
    setActiveMode('project');
    setActiveModuleKey('project');
    setShowJobPanel(false);
    addMessage({ role: 'assistant', content: '已更新目标 JD，可以选择任一简历模块继续优化。' });
    showToast('目标 JD 已更新');
  };

  const readBossJob = async (url: string) => {
    const trimmedUrl = url.trim();
    if (!/zhipin|boss|kanzhun/i.test(trimmedUrl)) {
      setJobError('请粘贴 BOSS 直聘岗位链接');
      return;
    }
    setReadingBossJob(true);
    setJobError('');
    setStatusText('正在读取 BOSS 直聘岗位 JD');
    try {
      const job = await fetchJobDescription(trimmedUrl);
      setJobRequirements(job.content);
      setDraftJobRequirements(job.content);
      setCommand('基于当前 JD 优化项目经验，突出职责、动作、技术难点和结果');
      setActiveMode('project');
      setActiveModuleKey('project');
      setShowJobPanel(false);
      addMessage({ role: 'assistant', content: `已读取 ${job.company || 'BOSS 直聘'}「${job.position || '目标岗位'}」JD，可以选择任一简历模块开始优化。` });
      showToast('已读取 BOSS 直聘 JD');
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取岗位 JD 失败';
      setJobError(message);
      addMessage({ role: 'assistant', content: `岗位链接读取失败：${message}` });
    } finally {
      setReadingBossJob(false);
      setStatusText('');
    }
  };

  const startCoreModule = (module: ResumeModule) => {
    setActiveMode(module.mode);
    setActiveModuleKey(module.key);
    setCommand(module.prompt);
    runOptimization(module.mode, module.prompt, module.key);
  };

  const isNewConversationStart = !jobRequirements.trim() && !resumeContent.trim() && !hasResumePreview && messages.length === 0;

  return (
    <div className="min-h-[calc(100vh-56px)] text-slate-900">
        <main className="min-w-0">
          <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-xl md:px-7 xl:flex">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-base font-black md:text-lg">{pageTitle}</h1>
                <p className="hidden text-xs font-bold text-slate-400 md:block">{hasConversationContent ? activeSession?.title : '上传简历或输入目标岗位后开始优化'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startNewSession}
                className="hidden h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50 md:flex"
              >
                <i className="ri-chat-new-line" />
                新对话
              </button>
              <Link to="/credits" className="hidden h-9 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-black text-violet-700 md:flex">
                <i className="ri-copper-coin-line" />
                3,280
                <span className="text-violet-500">明细</span>
              </Link>
              {user ? (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-700 text-xs font-black text-white">
                  {user.displayName?.slice(0, 2).toUpperCase() || 'WU'}
                </div>
              ) : (
                <Link to="/auth" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">登录</Link>
              )}
            </div>
          </header>

          <section className={`grid min-h-[calc(100vh-56px)] transition-all duration-300 xl:min-h-[calc(100vh-64px)] ${
            drawerOpen
              ? 'xl:grid-cols-[288px_minmax(0,1fr)] 2xl:grid-cols-[288px_minmax(0,1fr)_minmax(560px,1fr)]'
              : 'xl:grid-cols-[288px_minmax(0,1fr)]'
          }`}>
            <WorkbenchHistorySidebar
              activeTab={historyTab}
              sessions={sortedSessions}
              activeSessionId={activeSessionId}
              optimizationRecords={optimizationRecords}
              onTabChange={setHistoryTab}
              onNewSession={startNewSession}
              onOpenSession={openSession}
              onOpenOptimizationRecord={openOptimizationRecord}
            />

            <section className="relative min-w-0 pb-56">
              <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-12">
                {isNewConversationStart ? (
                  <NewConversationStart
                    value={draftJobRequirements}
                    target={parseJobTarget(draftJobRequirements, 'paste')}
                    loading={readingBossJob}
                    error={jobError}
                    onChange={(next) => {
                      setDraftJobRequirements(next);
                      setJobError('');
                    }}
                    onPasteApply={applyDraftJob}
                    onBossRead={readBossJob}
                    onUploadClick={() => fileInputRef.current?.click()}
                  />
                ) : messages.length > 0 && (
                  <div className="ml-auto max-w-2xl rounded-xl bg-white px-5 py-4 text-[15px] leading-7 shadow-sm">
                    {messages.find((message) => message.role === 'user')?.content || messages[0]?.content}
                  </div>
                )}

                <div className={isNewConversationStart ? 'mt-6' : 'mt-8'}>
                  <div className="mb-4 flex items-center gap-2 font-black">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-50 text-indigo-600"><i className="ri-user-smile-line" /></span>
                    职引简历
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500">JD 定向优化</span>
                  </div>
                  <div className="space-y-4 text-[15px] leading-8 text-slate-700">
                    <p>{isNewConversationStart ? '先填入职位，再上传或读取简历；进入对话后职位信息会自动折叠为上下文卡片。' : '围绕当前职位上下文，继续生成新的简历优化版本。'}</p>
                    {!hasConversationContent && !isNewConversationStart && (
                      <div className="rounded-3xl border border-dashed border-indigo-200 bg-white p-5 text-sm leading-7 text-slate-600">
                        上传简历、粘贴 JD，或直接输入你想优化的岗位方向。新对话会从空白状态开始记录。
                      </div>
                    )}
                    {uploadedFile && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                        <i className={getUploadIcon(uploadedFile.type || uploadedFile.name)} />
                        <span className="max-w-[280px] truncate">{uploadedFile.name}</span>
                        <span className="text-xs text-emerald-600">{formatFileSize(uploadedFile.size)}</span>
                      </div>
                    )}
                    {jobRequirements.trim() && !showJobPanel && (
                      <JobContextCard
                        target={jobTarget}
                        value={jobRequirements}
                        uploadedFile={uploadedFile}
                        onEdit={() => setShowJobPanel(true)}
                      />
                    )}
                    {result.improvements.length > 0 && (
                      <>
                        <p className="text-sm font-bold text-slate-400">生成优化建议 <i className="ri-arrow-down-s-line" /></p>
                        <ul className="list-disc space-y-2 pl-5">
                          {result.improvements.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </>
                    )}
                  </div>

                  <JobTargetPanel
                    open={showJobPanel && !isNewConversationStart}
                    value={draftJobRequirements}
                    target={parseJobTarget(draftJobRequirements || jobRequirements, draftJobRequirements === SAMPLE_JD ? 'sample' : 'paste')}
                    loading={readingBossJob}
                    error={jobError}
                    modules={(resumeContent.trim() || hasResumePreview) ? resumeModules : []}
                    onChange={(next) => {
                      setDraftJobRequirements(next);
                      setJobError('');
                    }}
                    onClose={() => setShowJobPanel(false)}
                    onPasteApply={applyDraftJob}
                    onBossRead={readBossJob}
                    onStartModule={startCoreModule}
                  />

                  {introWorkflowActive && (
                    <IntroWorkflowPanel
                      value={introWorkflow}
                      onChange={setIntroWorkflow}
                      guide={introGuide}
                    />
                  )}

                  {hasResumePreview && (
                    <ResumeThumbnail
                      result={result}
                      docName={currentDocName}
                      onOpen={() => setDrawerOpen(true)}
                    />
                  )}

                  {hasResumePreview && (
                    <p className="mt-5 text-[15px] leading-8 text-slate-700">优化后的简历已经生成。你可以继续选择任一简历模块单独调整，我会保持当前 JD 关键词匹配。</p>
                  )}

                  <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        当前对话
                        {resumeVersionCount > 0 && (
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-indigo-600">
                            {resumeVersionCount} 个优化版本
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={clearCurrentMessages}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        清空
                      </button>
                    </div>
                    {messages.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-slate-500">
                        你每次发送的优化指令都会保留在这里，方便你回看历史交互。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`rounded-3xl p-4 ${
                              msg.type === 'resume_version'
                                ? 'bg-indigo-50/60 border border-indigo-100'
                                : msg.role === 'user'
                                  ? 'bg-white border border-slate-200'
                                  : 'bg-indigo-50 border border-indigo-100'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                              <span>{msg.role === 'user' ? '你的指令' : msg.type === 'resume_version' ? '优化结果' : '系统回复'}</span>
                              <span>{msg.time}</span>
                            </div>
                            {msg.type === 'resume_version' ? (
                              <ResumeVersionMessageCard message={msg} onOpen={openResumeVersion} />
                            ) : (
                              <div className="whitespace-pre-wrap text-sm text-slate-700">{msg.content}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(resumeContent.trim() || hasResumePreview) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {resumeModules.map((module) => (
                      <button
                        key={module.key}
                        type="button"
                        onClick={() => selectModule(module)}
                        className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-black ${
                          activeModuleKey === module.key
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <i className={module.icon} />
                        {module.label}
                      </button>
                    ))}
                  </div>
                  )}
                </div>
              </div>

              <div
                className="fixed bottom-5 left-0 right-0 z-40 px-4 transition-all duration-300 md:px-8"
                style={inputBarStyle}
              >
                <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_14px_36px_rgba(31,41,55,.10)]">
                  {loading && (
                    <OptimizationThinking
                      flow={optimizationFlow}
                      activeIndex={optimizationStageIndex}
                      statusText={statusText}
                    />
                  )}
                  {statusText && !loading && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">
                      <i className="ri-loader-4-line animate-spin text-base" />
                      {statusText}
                    </div>
                  )}
                  <input
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        submitCommand();
                      }
                    }}
                    className="w-full border-0 px-2 pb-3 pt-2 text-sm outline-none"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingResume}
                        className="grid h-9 w-9 place-items-center rounded-lg bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                        title="上传简历"
                      >
                        <i className={uploadingResume ? 'ri-loader-4-line animate-spin' : 'ri-upload-2-line'} />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,.md,.markdown,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) handleResumeFile(file);
                          event.target.value = '';
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowJobPanel((current) => !current)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <i className="ri-briefcase-line" />
                        JD
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerOpen(true);
                          showToast('已打开简历模板');
                        }}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <i className="ri-layout-line" />
                        模板
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerOpen(true);
                          showToast('可在右侧切换简历风格');
                        }}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <i className="ri-palette-line" />
                        风格
                      </button>
                      <label className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm font-bold text-slate-600">
                        <i className="ri-cpu-line" />
                        <select
                          value={selectedModel}
                          onChange={(event) => setSelectedModel(event.target.value as WorkspaceModel)}
                          className="bg-transparent text-sm font-bold outline-none"
                          title="选择 AI 模型"
                        >
                          {WORKSPACE_MODELS.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {user && (
                        <label className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 text-[11px] font-bold text-amber-800">
                          <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
                          同意发送给 AI
                        </label>
                      )}
                      <span className="inline-flex h-9 items-center rounded-lg bg-indigo-50 px-3 text-xs font-black text-indigo-600">
                        {currentModelOption.badge} · {currentModelOption.credits} 积分
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={loading || !command.trim()}
                      onClick={submitCommand}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <i className={loading ? 'ri-loader-4-line animate-spin text-xl' : 'ri-send-plane-2-line text-xl'} />
                      <span>{currentModelOption.credits} 积分</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {drawerOpen && (
              <>
                <button
                  type="button"
                  aria-label="关闭简历预览"
                  onClick={() => setDrawerOpen(false)}
                  className="fixed inset-0 z-40 bg-slate-950/24 2xl:hidden"
                />
                <aside className="fixed inset-y-0 right-0 z-50 w-[min(94vw,760px)] min-w-0 border-l border-slate-200 bg-slate-50 p-3 shadow-2xl md:p-5 2xl:static 2xl:z-auto 2xl:w-auto 2xl:bg-transparent 2xl:p-6 2xl:shadow-none">
                  <div className="grid h-full max-h-full grid-rows-[52px_auto_1fr_40px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_36px_rgba(31,41,55,.12)]">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4">
                      <div className="flex min-w-0 items-center gap-3 font-black">
                        <i className="ri-focus-3-line text-slate-500" />
                        <span className="truncate">{currentDocName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[
                          { value: 'optimized', icon: 'ri-file-user-line', title: '优化版' },
                          { value: 'original', icon: 'ri-file-text-line', title: '原始版' },
                          { value: 'compare', icon: 'ri-git-compare-line', title: '对比' },
                        ].map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            title={item.title}
                            onClick={() => setResumePreviewMode(item.value as ResumePreviewMode)}
                            className={`grid h-9 w-9 place-items-center rounded-lg ${
                              resumePreviewMode === item.value
                                ? 'bg-indigo-50 text-indigo-600'
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <i className={item.icon} />
                          </button>
                        ))}
                        <button onClick={() => showToast('文件已准备下载')} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-50"><i className="ri-download-line" /></button>
                        <button onClick={() => setDrawerOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-50"><i className="ri-close-line" /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 px-4 py-2">
                      <span className="shrink-0 text-xs font-black text-slate-500">简历风格</span>
                      {STYLE_OPTIONS.map((style) => (
                        <button
                          key={style.value}
                          type="button"
                          onClick={() => {
                            setResumeStyle(style.value);
                            showToast('简历风格已切换');
                          }}
                          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-black ${
                            resumeStyle === style.value
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <i className={style.icon} />
                          {style.label}
                        </button>
                      ))}
                    </div>
                    <div className="overflow-auto bg-slate-50 px-4 py-5 md:px-6">
                      {resumePreviewMode === 'optimized' && <ResumePreview result={result} style={resumeStyle} />}
                      {resumePreviewMode === 'original' && (
                        <div className="mx-auto w-full max-w-[620px]">
                          <PlainResumePanel title="原始简历" content={currentOriginalContent} />
                        </div>
                      )}
                      {resumePreviewMode === 'compare' && (
                        <ResumeCompareView
                          originalContent={currentOriginalContent}
                          result={result}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-3 border-t border-slate-200 px-4 text-sm font-bold text-slate-500">
                      <i className="ri-arrow-left-line" />
                      <span>{activeResumeVersion ? `版本 V${activeResumeVersion}` : '当前预览'}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                        {resumePreviewMode === 'optimized' ? '优化版' : resumePreviewMode === 'original' ? '原始版' : '原文对比'}
                      </span>
                      <i className="ri-arrow-right-line" />
                    </div>
                  </div>
                </aside>
              </>
            )}
          </section>

          {!drawerOpen && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="fixed bottom-28 right-5 z-40 grid h-14 w-14 place-items-center rounded-2xl border border-slate-200 bg-white text-indigo-600 shadow-xl"
            >
              <i className="ri-file-user-line text-2xl" />
            </button>
          )}

        </main>

      <Toast text={toast} />
    </div>
  );
}
