import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/api';
import { listResumeOptimizations } from '@/lib/backend-service';
import ResumePreview, { ResumeTemplate } from '../home/components/ResumePreview';

export interface OptimizationRecord {
  id: string;
  company: string;
  position: string;
  industry: string;
  optimizeMode: string;
  model: string;
  matchScore: number;
  keywords: string[];
  improvements: string[];
  optimizedContent?: string;
  date: string;
  status: 'completed' | 'failed';
}

const MODE_LABELS: Record<string, string> = {
  full: '整体优化',
  project: '项目经历',
  intro: '自我介绍',
  experience: '工作经历',
  skills: '技能描述',
};

const MODEL_NAMES: Record<string, string> = {
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-4': 'GPT-4',
  'gpt-4o': 'GPT-4o',
  'gpt-3.5': 'GPT-3.5',
  'claude-3': 'Claude 3',
  'gemini-pro': 'Gemini Pro',
};

const TEMPLATE_OPTIONS: Array<{ value: ResumeTemplate; label: string; icon: string }> = [
  { value: 'classic', label: '经典商务', icon: 'ri-briefcase-line' },
  { value: 'minimal', label: '极简清爽', icon: 'ri-layout-line' },
  { value: 'sidebar', label: '侧栏重点', icon: 'ri-sidebar-fold-line' },
  { value: 'dark', label: '深色高级', icon: 'ri-moon-line' },
];

function buildResumeContent(record: OptimizationRecord) {
  if (record.optimizedContent) return record.optimizedContent;

  return `${record.company}候选人
${record.position}
目标行业：${record.industry} | JD 匹配度：${record.matchScore}%

【个人优势】
围绕 ${record.position} 岗位要求，已强化 ${record.keywords.slice(0, 4).join('、')} 等核心关键词，并将经历描述调整为更适合投递的结果导向表达。

【工作经历】
- 根据目标 JD 重新组织工作经历，优先展示与岗位职责直接相关的项目、技术栈和业务成果。
- 将泛泛描述改为“动作 + 方法 + 结果”的表达方式，让招聘方能更快判断能力匹配度。

【项目经历】
- 突出和 ${record.position} 相关的关键项目，补充问题背景、个人职责、解决方案和可量化结果。
- 保留高价值技术关键词，减少低匹配度信息对简历版面的占用。

【技能描述】
${record.keywords.map((keyword) => `- ${keyword}：已结合岗位要求融入简历表达。`).join('\n')}

【优化说明】
${record.improvements.map((item) => `- ${item}`).join('\n')}`;
}

const INITIAL_RECORDS: OptimizationRecord[] = [
  {
    id: 'opt-001',
    company: '字节跳动',
    position: '高级前端工程师',
    industry: '互联网',
    optimizeMode: 'full',
    model: 'gpt-4o',
    matchScore: 88,
    keywords: ['React', 'TypeScript', 'Node.js', '前端开发', '性能优化', '团队协作'],
    improvements: [
      '根据 JD 关键词重写了工作经历描述，提升关键词密度',
      '量化了 3 处工作成果，增强说服力',
      '补充了岗位要求中提到的 TypeScript 和 Node.js 技能',
      '优化了项目描述的 STAR 结构，逻辑更清晰',
    ],
    date: '2026-05-10',
    status: 'completed',
  },
  {
    id: 'opt-002',
    company: '阿里巴巴',
    position: 'Java 开发工程师',
    industry: '电商',
    optimizeMode: 'project',
    model: 'gpt-4o',
    matchScore: 92,
    keywords: ['微服务', '高并发', 'Redis', 'Spring Boot', '分布式'],
    improvements: [
      '将项目描述重构为 STAR 结构，突出技术难点与解决方案',
      '量化了项目数据指标（QPS 提升、用户数等）',
      '补充了技术选型的决策过程和对比分析',
      '增加了个人在项目中的具体职责和贡献占比',
    ],
    date: '2026-05-08',
    status: 'completed',
  },
  {
    id: 'opt-003',
    company: '腾讯',
    position: '产品经理',
    industry: '互联网',
    optimizeMode: 'intro',
    model: 'claude-3',
    matchScore: 85,
    keywords: ['用户增长', '数据分析', '需求管理', '跨部门协作'],
    improvements: [
      '从 JD 中提取关键词融入自我介绍，提高匹配度',
      '突出 5 年产品经验和具体业务深度',
      '用数据化语言代替空泛描述',
      '强化了与目标岗位直接相关的核心优势',
    ],
    date: '2026-05-05',
    status: 'completed',
  },
  {
    id: 'opt-004',
    company: '美团',
    position: '前端开发工程师',
    industry: '互联网',
    optimizeMode: 'experience',
    model: 'gpt-3.5',
    matchScore: 78,
    keywords: ['Vue', 'Webpack', '移动端', '性能优化'],
    improvements: [
      '将描述改为结果导向，用数据量化工作成果',
      '补充了与 JD 要求匹配的技术栈关键词',
      '使用强动词开头（主导、推动、设计、实现等）',
    ],
    date: '2026-04-28',
    status: 'completed',
  },
  {
    id: 'opt-005',
    company: '某新能源车企',
    position: '测试工程师',
    industry: '新能源/车企',
    optimizeMode: 'skills',
    model: 'gemini-pro',
    matchScore: 82,
    keywords: ['自动化测试', 'Selenium', 'CI/CD', '接口测试'],
    improvements: [
      '按 JD 要求重新排序技能列表，高匹配度优先',
      '补充了 JD 明确要求的但原简历缺失的技能项',
      '为每项技能增加了熟练度描述和使用场景',
    ],
    date: '2026-04-20',
    status: 'completed',
  },
];

function RecordCard({
  record,
  active,
  onOpen,
}: {
  record: OptimizationRecord;
  active: boolean;
  onOpen: () => void;
}) {
  const scoreColor =
    record.matchScore >= 85
      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
      : record.matchScore >= 70
        ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-red-600 bg-red-50 border-red-200';

  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden transition-all duration-300 ${
        active ? 'border-amber-300 shadow-md shadow-amber-100/80' : 'border-slate-100 hover:shadow-sm hover:shadow-slate-200/50'
      }`}
    >
      <button
        onClick={onOpen}
        className="w-full text-left p-5 flex items-start gap-4 cursor-pointer"
      >
        <div className="w-12 h-12 flex items-center justify-center bg-slate-100 rounded-xl flex-shrink-0">
          <i className="ri-file-list-3-line text-slate-500 text-lg" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-sm font-bold text-slate-800">{record.company}</span>
            <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-full text-xs border border-slate-100">
              {record.position}
            </span>
            <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-full text-xs border border-slate-100">
              {record.industry}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${scoreColor}`}>
              匹配度 {record.matchScore}%
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{record.date}</span>
            <span>·</span>
            <span>{MODE_LABELS[record.optimizeMode] || record.optimizeMode}</span>
            <span>·</span>
            <span>模型：{MODEL_NAMES[record.model] || record.model}</span>
          </div>
        </div>
        <div className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 flex-shrink-0">
          <i className="ri-layout-right-line text-lg" />
        </div>
      </button>
    </div>
  );
}

function ResumeDrawer({
  record,
  template,
  onTemplateChange,
  onClose,
}: {
  record: OptimizationRecord;
  template: ResumeTemplate;
  onTemplateChange: (template: ResumeTemplate) => void;
  onClose: () => void;
}) {
  return (
    <aside className="fixed inset-0 z-40 bg-slate-950/20 xl:static xl:z-auto xl:bg-transparent">
      <div className="ml-auto grid h-full w-full max-w-[920px] grid-rows-[58px_auto_1fr_54px] overflow-hidden bg-white shadow-2xl xl:sticky xl:top-6 xl:h-[calc(100vh-48px)] xl:rounded-2xl xl:border xl:border-slate-200 xl:shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <i className="ri-file-user-line text-slate-500" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{record.company}_{record.position}_优化简历.md</p>
              <p className="text-xs text-slate-400">匹配度 {record.matchScore}% · {MODE_LABELS[record.optimizeMode] || record.optimizeMode}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-50">
              <i className="ri-download-line" />
            </button>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-50">
              <i className="ri-close-line" />
            </button>
          </div>
        </div>

        <div className="space-y-3 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-xs font-bold text-slate-500">简历风格</span>
            {TEMPLATE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onTemplateChange(option.value)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-all ${
                  template === option.value
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <i className={option.icon} />
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {record.keywords.slice(0, 8).map((kw) => (
              <span key={kw} className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                {kw}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-auto bg-slate-50 px-4 py-6 md:px-8">
          <div className="mx-auto min-h-[820px] max-w-[760px] bg-white p-8 shadow-[0_18px_46px_rgba(31,41,55,.08)] md:p-10">
            <ResumePreview content={buildResumeContent(record)} template={template} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 text-xs font-semibold text-slate-500">
          <span>优化项：{record.improvements.length} 条</span>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-slate-200 px-3 py-2 hover:border-amber-300 hover:text-amber-600">
              查看原文
            </button>
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-800">
              下载优化版
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ===== 主页面 ===== */
export default function OptimizationHistoryPage() {
  const [records, setRecords] = useState<OptimizationRecord[]>(INITIAL_RECORDS);
  const [loadError, setLoadError] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('全部');
  const [filterMode, setFilterMode] = useState('全部');
  const [selectedRecord, setSelectedRecord] = useState<OptimizationRecord | null>(INITIAL_RECORDS[0] || null);
  const [template, setTemplate] = useState<ResumeTemplate>('classic');

  useEffect(() => {
    if (!getStoredUser()) return;
    listResumeOptimizations()
      .then((items) => {
        const nextRecords = items.map((item) => ({
          id: item.id,
          company: item.company || item.job_requirements.slice(0, 18) || '未知公司',
          position: item.job_title || '未知职位',
          industry: '互联网',
          optimizeMode: item.optimize_mode,
          model: item.model,
          matchScore: item.match_score || 0,
          keywords: item.keywords || [],
          improvements: item.improvements || [],
          optimizedContent: item.optimized_content,
          date: item.created_at.slice(0, 10),
          status: item.status,
        }));
        setRecords(nextRecords);
        setSelectedRecord(nextRecords[0] || null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : '读取历史记录失败'));
  }, []);

  const industries = ['全部', ...Array.from(new Set(records.map((r) => r.industry)))];
  const modes = ['全部', ...Array.from(new Set(records.map((r) => r.optimizeMode)))];

  const filtered = records.filter((r) => {
    const matchIndustry = filterIndustry === '全部' || r.industry === filterIndustry;
    const matchMode = filterMode === '全部' || r.optimizeMode === filterMode;
    return matchIndustry && matchMode;
  });

  const avgScore = Math.round(
    filtered.reduce((sum, r) => sum + r.matchScore, 0) / Math.max(filtered.length, 1),
  );

  return (
    <div className="min-h-[calc(100vh-56px)]">
      <main className="mx-auto w-full max-w-[1680px] px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600">
            <i className="ri-history-line" />
            优化历史
          </div>
          <h1 className="text-2xl font-black text-slate-900">简历优化记录</h1>
          <p className="text-sm font-medium text-slate-500">左侧选择记录，右侧查看可投递的优化简历。</p>
        </div>

        {loadError && (
          <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {loadError}
          </div>
        )}
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: '总优化次数',
              value: records.length,
              icon: 'ri-stack-line',
              color: 'bg-slate-900 text-white',
            },
            {
              label: '平均匹配度',
              value: `${avgScore}%`,
              icon: 'ri-bar-chart-line',
              color: 'bg-amber-500 text-white',
            },
            {
              label: '覆盖公司',
              value: `${new Set(records.map((r) => r.company)).size}`,
              icon: 'ri-building-2-line',
              color: 'bg-emerald-500 text-white',
            },
            {
              label: '最近优化',
              value: records[0]?.date || '-',
              icon: 'ri-calendar-line',
              color: 'bg-slate-700 text-white',
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4">
              <div className={`w-12 h-12 flex items-center justify-center rounded-xl flex-shrink-0 ${stat.color}`}>
                <i className={`${stat.icon} text-lg`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 筛选器 */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-500">行业</span>
            <div className="flex flex-wrap gap-2">
              {industries.map((ind) => (
                <button
                  key={ind}
                  onClick={() => setFilterIndustry(ind)}
                  className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    filterIndustry === ind
                      ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {ind}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-500">模块</span>
            <div className="flex flex-wrap gap-2">
              {modes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    filterMode === mode
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/15'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {MODE_LABELS[mode] || mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 结果数 */}
        <p className="text-sm text-slate-400 mb-4">
          共 <span className="font-semibold text-slate-700">{filtered.length}</span> 条记录
        </p>

        <div className={`grid gap-6 ${selectedRecord ? 'xl:grid-cols-[minmax(420px,520px)_minmax(620px,1fr)]' : 'grid-cols-1'}`}>
          <section className="min-w-0">
            <div className="space-y-3">
              {filtered.map((record) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  active={selectedRecord?.id === record.id}
                  onOpen={() => setSelectedRecord(record)}
                />
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 flex items-center justify-center bg-slate-50 rounded-2xl mx-auto mb-4">
                  <i className="ri-inbox-line text-slate-300 text-2xl" />
                </div>
                <p className="text-sm text-slate-400">暂无记录</p>
                <p className="text-xs text-slate-400 mt-1">去求职工作台开始你的第一次优化吧</p>
              </div>
            )}
          </section>

          {selectedRecord && (
            <ResumeDrawer
              record={selectedRecord}
              template={template}
              onTemplateChange={setTemplate}
              onClose={() => setSelectedRecord(null)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
