import { useState, useRef, useEffect } from 'react';
import { AI_MODELS } from '@/pages/home/components/OptimizationSettings';
import { createInterviewReview, listInterviewReviews } from '@/lib/backend-service';
import { getStoredUser } from '@/lib/api';

/* ===== 面试复盘数据类型 ===== */
export interface ReviewRecord {
  id: string;
  company: string;
  position: string;
  industry: string;
  date: string;
  questions: ReviewQuestion[];
  overallRating: number;
  status: 'draft' | 'completed';
  summary: string;
  improvements: string[];
  model: string;
}

export interface ReviewQuestion {
  id: string;
  question: string;
  answer: string;
  score: number;
  analysis: string;
  suggestion: string;
  isAnalyzing?: boolean;
}

interface RemoteReviewQuestion {
  id: string;
  question: string;
  answer: string;
  score: number;
  analysis: string;
  suggestion: string;
}

interface RemoteReviewRecord {
  id: string;
  company: string;
  position: string;
  industry: string;
  interview_date: string;
  overall_rating: number;
  status: 'draft' | 'completed';
  summary: string;
  improvements?: string[];
  model: string;
  questions?: RemoteReviewQuestion[];
}

/* ===== 初始化数据 ===== */
const INITIAL_RECORDS: ReviewRecord[] = [
  {
    id: 'demo-1',
    company: '字节跳动',
    position: '高级前端工程师',
    industry: '互联网',
    date: '2026-05-08',
    overallRating: 72,
    status: 'completed',
    summary: '整体表现中等偏上。技术基础扎实，项目经验描述清晰。但在架构设计深度和性能优化原理方面回答不够深入。表达逻辑尚可，但部分回答过于冗长，需要更精简有力。',
    improvements: [
      '补充 React 源码层面的理解，不只是 API 用法',
      '准备更多量化数据支撑项目成果',
      '缩短回答长度，控制在 2-3 分钟以内',
      '加强对微前端、模块联邦等前沿架构的了解',
    ],
    model: 'gpt-4o',
    questions: [
      {
        id: 'q-1',
        question: '请介绍一下你最有成就感的一个项目',
        answer: '我主导开发了一个后台管理系统，用了 React + Ant Design，做了权限管理和数据可视化，用 ECharts 做了图表展示，性能优化做了虚拟列表。',
        score: 75,
        analysis: '回答结构基本完整，提到了技术栈和核心功能。但缺少量化数据（用户数、性能提升百分比），没有体现你在项目中的决策过程和技术选型思考。',
        suggestion: '用 STAR 法重构回答：\nS：项目背景，团队规模，你的角色\nT：核心挑战是什么\nA：技术选型对比、为什么选这个方案、遇到什么问题怎么解决的\nR：量化结果（如：页面加载从 5s 降到 1.2s，日活从 2000 提升到 8000）',
      },
      {
        id: 'q-2',
        question: 'React 的 useEffect 依赖数组如果写错会有什么后果？',
        answer: '可能会死循环，或者没有正确更新数据。',
        score: 60,
        analysis: '回答过于笼统，停留在表面认知。面试官想考察的是你对闭包陷阱的理解、依赖数组的工作原理、以及 stale closure 问题的解决方案。',
        suggestion: '深入回答要点：\n1. 缺少依赖：闭包捕获旧值，导致状态不更新\n2. 错误依赖：无限重渲染，性能崩溃\n3. 函数依赖：每次渲染都是新函数引用，导致 effect 频繁执行\n4. 解决方案：useCallback/useMemo 缓存函数和值、使用 ref 绕过依赖、函数式更新 setState\n5. 实践经验：列举一次真实踩坑经历',
      },
      {
        id: 'q-3',
        question: '如果一个页面白屏了，你会怎么排查？',
        answer: '先看控制台有没有报错，然后看 Network 面板资源加载情况。',
        score: 68,
        analysis: '排查思路方向正确，但过于基础，缺少系统化的排查方法论。面试官期望看到一个完整的、分层的排查策略。',
        suggestion: '系统化排查方案：\n1. 收集信息：错误类型（JS 错误/资源加载失败/服务端错误）、浏览器版本、复现路径\n2. 快速定位：控制台报错 → SourceMap 定位源码 → Network 排查资源 → Performance 分析主线程\n3. 分层排查：DNS/TCP → HTTP 响应 → JS 执行 → DOM 渲染 → CSS 样式\n4. 工具链：Sentry 错误上报、Chrome DevTools、Charles 抓包、 Lighthouse 评分\n5. 复盘：修复后做根因分析，防止同类问题复发',
      },
    ],
  },
];

/* ===== 生成 ID ===== */
const genId = () => `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* ===== 难度徽章 ===== */
function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85
      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
      : score >= 70
        ? 'bg-amber-50 text-amber-600 border-amber-200'
        : 'bg-red-50 text-red-600 border-red-200';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${color}`}>{score} 分</span>
  );
}

/* ===== 企业微信引导弹窗 ===== */
function WechatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
    >
      <div className="bg-white rounded-2xl max-w-sm w-full p-8 relative animate-[fadeIn_0.25s_ease]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
        >
          <i className="ri-close-line text-lg" />
        </button>

        <div className="w-16 h-16 flex items-center justify-center bg-emerald-50 rounded-2xl mx-auto mb-5 border border-emerald-100">
          <i className="ri-wechat-line text-emerald-500 text-3xl" />
        </div>

        <h3 className="text-lg font-bold text-slate-800 text-center mb-2">
          AI 面试复盘内测中
        </h3>
        <p className="text-sm text-slate-500 text-center leading-relaxed mb-6">
          功能正在灰度测试中<br />
          添加企业微信获取免费测试资格
        </p>

        <div className="w-48 h-48 rounded-xl mx-auto mb-5 overflow-hidden border border-slate-200">
          <img
            src="https://static.readdy.ai/image/413a5cdfec05ab2803b4f7e7408a34f3/61ed0bfd5a553e5c84cbd266c0d03216.png"
            alt="企业微信二维码"
            className="w-full h-full object-cover"
          />
        </div>

        <p className="text-xs text-slate-400 text-center mb-5">
          添加后回复「面试复盘」即可开通测试权限
        </p>

        <button
          onClick={onClose}
          className="whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all cursor-pointer text-sm"
        >
          <i className="ri-check-line" />
          我知道了
        </button>
      </div>
    </div>
  );
}

/* ===== 面试复盘主组件 ===== */
export default function InterviewReview() {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [records, setRecords] = useState<ReviewRecord[]>(() => {
    try {
      const saved = localStorage.getItem('interview_review_records');
      return saved ? [...JSON.parse(saved), ...INITIAL_RECORDS] : INITIAL_RECORDS;
    } catch {
      return INITIAL_RECORDS;
    }
  });
  const [selectedRecord, setSelectedRecord] = useState<ReviewRecord | null>(null);

  // 创建/编辑表单
  const [form, setForm] = useState({ company: '', position: '', industry: '', date: '' });
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [showWechatModal, setShowWechatModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // 分析报告展开状态
  const [expandedQ, setExpandedQ] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view === 'create' || view === 'detail') {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [view]);

  useEffect(() => {
    if (!getStoredUser()) return;
    listInterviewReviews()
      .then((items) => {
        if (items.length === 0) return;
        const remoteRecords: ReviewRecord[] = (items as RemoteReviewRecord[]).map((item) => ({
          id: item.id,
          company: item.company,
          position: item.position,
          industry: item.industry,
          date: item.interview_date,
          overallRating: item.overall_rating,
          status: item.status,
          summary: item.summary,
          improvements: item.improvements || [],
          model: item.model,
          questions: (item.questions || []).map((q) => ({
            id: q.id,
            question: q.question,
            answer: q.answer,
            score: q.score,
            analysis: q.analysis,
            suggestion: q.suggestion,
          })),
        }));
        setRecords(remoteRecords);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '读取面试复盘失败'));
  }, []);

  // 保存到 localStorage
  useEffect(() => {
    try {
      const toSave = records.filter((r) => !r.id.startsWith('demo-'));
      localStorage.setItem('interview_review_records', JSON.stringify(toSave));
    } catch {
      // ignore
    }
  }, [records]);

  /* ---- 创建复盘 ---- */
  const handleCreate = async () => {
    if (!form.company || !form.position || !form.date) return;
    if (!getStoredUser()) {
      setError('请先登录，再生成 AI 复盘报告');
      return;
    }

    setError('');
    setIsGenerating(true);
    try {
      const review = await createInterviewReview({
        ...form,
        industry: form.industry || '其他',
        model: selectedModel,
        questions: questions.map((q) => ({ question: q.question, answer: q.answer })),
      }) as ReviewRecord;
      setRecords([review, ...records.filter((r) => !r.id.startsWith('demo-'))]);
      setSelectedRecord(review);
      resetForm();
      setView('detail');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成复盘失败，请稍后重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setForm({ company: '', position: '', industry: '', date: '' });
    setQuestions([]);
    setCurrentQuestion('');
    setCurrentAnswer('');
  };

  const addQuestion = () => {
    if (!currentQuestion.trim() || !currentAnswer.trim()) return;

    const q: ReviewQuestion = {
      id: genId(),
      question: currentQuestion.trim(),
      answer: currentAnswer.trim(),
      score: 0,
      analysis: '',
      suggestion: '',
      isAnalyzing: false,
    };

    setQuestions([...questions, q]);
    setCurrentQuestion('');
    setCurrentAnswer('');
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  /* ===== 列表视图 ===== */
  if (view === 'list') {
    return (
      <div className="space-y-6">
        {/* 头部操作区 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">我的面试复盘</h2>
            <p className="text-sm text-slate-400 mt-1">记录每次面试，AI 帮你分析问题、给出优化建议</p>
          </div>
          <button
            onClick={() => { resetForm(); setView('create'); }}
            className="whitespace-nowrap flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-slate-900/15"
          >
            <i className="ri-add-line" />
            新建复盘
          </button>
        </div>

        {/* 复盘卡片列表 */}
        {records.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
            <div className="w-20 h-20 flex items-center justify-center bg-slate-50 rounded-2xl mx-auto mb-5">
              <i className="ri-file-list-3-line text-slate-300 text-3xl" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">还没有面试记录</h3>
            <p className="text-sm text-slate-400 mb-6">每次面试后记录问题和回答，AI 帮你生成复盘报告</p>
            <button
              onClick={() => { resetForm(); setView('create'); }}
              className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer"
            >
              <i className="ri-add-line" />
              开始第一次复盘
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {records.map((r) => (
              <div
                key={r.id}
                onClick={() => { setSelectedRecord(r); setView('detail'); }}
                className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md hover:shadow-slate-200/50 transition-all duration-300 cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 flex items-center justify-center bg-slate-100 rounded-xl flex-shrink-0">
                      <i className="ri-building-2-line text-slate-500 text-lg" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{r.company}</h3>
                      <p className="text-xs text-slate-400">{r.position}</p>
                    </div>
                  </div>
                  <ScoreBadge score={r.overallRating} />
                </div>

                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="px-2.5 py-1 bg-slate-50 text-slate-500 rounded-full text-xs border border-slate-100">{r.industry}</span>
                  <span className="px-2.5 py-1 bg-slate-50 text-slate-500 rounded-full text-xs border border-slate-100">
                    {r.questions.length} 道题
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs border ${
                    r.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border-amber-200'
                  }`}>
                    {r.status === 'completed' ? '已复盘' : '草稿'}
                  </span>
                  {r.model && (
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs border border-indigo-100">
                      {AI_MODELS.find((m) => m.id === r.model)?.name || r.model}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{r.date}</span>
                  <span className="text-xs text-slate-500 font-medium group-hover:text-amber-600 transition-colors flex items-center gap-1">
                    查看报告
                    <i className="ri-arrow-right-line" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 企业微信弹窗 */}
        <WechatModal open={showWechatModal} onClose={() => setShowWechatModal(false)} />
      </div>
    );
  }

  /* ===== 创建复盘视图 ===== */
  if (view === 'create') {
    return (
      <div className="max-w-3xl mx-auto" ref={scrollRef}>
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setView('list')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
          >
            <i className="ri-arrow-left-line" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-800">新建面试复盘</h2>
            <p className="text-sm text-slate-400">填写面试信息，录入问答内容，AI 自动生成复盘报告</p>
          </div>
        </div>

        {/* AI 模型选择 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 flex items-center justify-center bg-indigo-50 rounded-lg text-indigo-600">
              <i className="ri-cpu-line" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">选择 AI 分析模型</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AI_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedModel === model.id
                    ? 'border-indigo-300 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedModel === model.id ? 'border-indigo-500' : 'border-slate-300'
                  }`}>
                    {selectedModel === model.id && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-700">{model.name}</span>
                    {model.badge && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold border border-amber-200">
                        {model.badge}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1 ml-7">{model.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Step 1: 面试信息 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-900 rounded-lg text-white text-sm font-bold">1</div>
            <h3 className="text-sm font-bold text-slate-800">面试信息</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">公司</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="如：字节跳动"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 bg-white outline-none focus:border-amber-400 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">岗位</label>
              <input
                type="text"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="如：高级前端工程师"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 bg-white outline-none focus:border-amber-400 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">行业</label>
              <select
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 bg-white outline-none focus:border-amber-400 transition-all cursor-pointer"
              >
                <option value="">请选择行业</option>
                <option value="互联网">互联网</option>
                <option value="金融">金融</option>
                <option value="电商">电商</option>
                <option value="新能源/车企">新能源/车企</option>
                <option value="教育">教育</option>
                <option value="医疗">医疗</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">面试日期</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 bg-white outline-none focus:border-amber-400 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Step 2: 录入问答 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-900 rounded-lg text-white text-sm font-bold">2</div>
            <h3 className="text-sm font-bold text-slate-800">录入面试问答</h3>
            <span className="text-xs text-slate-400">（{questions.length} 题已录入）</span>
          </div>

          {/* 已录入的题目列表 */}
          {questions.length > 0 && (
            <div className="space-y-3 mb-5">
              {questions.map((q, idx) => (
                <div key={q.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 mb-1">
                        <span className="text-slate-400 mr-1">{idx + 1}.</span>
                        {q.question}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-2">{q.answer}</p>
                    </div>
                    <button
                      onClick={() => removeQuestion(q.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer flex-shrink-0"
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 添加新题目 */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block flex items-center gap-1.5">
                <i className="ri-questionnaire-line" />
                面试问题
              </label>
              <textarea
                value={currentQuestion}
                onChange={(e) => setCurrentQuestion(e.target.value)}
                placeholder="面试官问了什么问题？"
                rows={2}
                className="w-full border-2 border-slate-200 rounded-xl p-4 text-sm text-slate-700 placeholder-slate-400 bg-white outline-none focus:border-amber-400 transition-all resize-none leading-relaxed"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block flex items-center gap-1.5">
                <i className="ri-chat-1-line" />
                你的回答（尽量回忆完整表述）
              </label>
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                placeholder="你当时是怎么回答的？尽可能回忆完整内容..."
                rows={4}
                className="w-full border-2 border-slate-200 rounded-xl p-4 text-sm text-slate-700 placeholder-slate-400 bg-white outline-none focus:border-amber-400 transition-all resize-none leading-relaxed"
              />
              <p className="text-xs text-slate-400 mt-1 text-right">{currentAnswer.length} 字</p>
            </div>
            <button
              onClick={addQuestion}
              disabled={!currentQuestion.trim() || !currentAnswer.trim()}
              className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed border-slate-300 text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className="ri-add-line" />
              添加这道题
            </button>
          </div>
        </div>

        {/* Step 3: 生成报告 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-8">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-900 rounded-lg text-white text-sm font-bold">3</div>
            <h3 className="text-sm font-bold text-slate-800">生成复盘报告</h3>
          </div>
          <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 flex items-center justify-center text-amber-500 flex-shrink-0 mt-0.5">
                <i className="ri-lightbulb-line" />
              </div>
              <div>
                <p className="text-sm text-slate-700 font-semibold mb-1">AI 会为你分析什么？</p>
                <ul className="text-xs text-slate-500 space-y-1 leading-relaxed">
                  <li>· 每道题的评分（从回答深度、结构化、数据支撑等维度）</li>
                  <li>· 逐题分析你的回答有哪些不足</li>
                  <li>· 给出每道题的优化版本建议</li>
                  <li>· 整体复盘总结和下一步提升方向</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={!form.company || !form.position || !form.date || questions.length === 0 || isGenerating}
            className="whitespace-nowrap w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-slate-900/15 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className={isGenerating ? 'ri-loader-4-line animate-spin' : 'ri-magic-line'} />
            {isGenerating ? 'AI 正在生成复盘…' : '生成 AI 复盘报告'}
          </button>
          {error && (
            <p className="text-xs text-red-500 text-center mt-3">{error}</p>
          )}
        </div>

        {/* 企业微信弹窗 */}
        <WechatModal open={showWechatModal} onClose={() => setShowWechatModal(false)} />
      </div>
    );
  }

  /* ===== 复盘详情视图 ===== */
  if (view === 'detail' && selectedRecord) {
    const r = selectedRecord;
    return (
      <div className="max-w-4xl mx-auto" ref={scrollRef}>
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setView('list')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
          >
            <i className="ri-arrow-left-line" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-slate-800">{r.company}</h2>
              <ScoreBadge score={r.overallRating} />
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400 flex-wrap">
              <span>{r.position}</span>
              <span>·</span>
              <span>{r.industry}</span>
              <span>·</span>
              <span>{r.date}</span>
              <span>·</span>
              <span>{r.questions.length} 道题</span>
              {r.model && (
                <>
                  <span>·</span>
                  <span className="text-indigo-500">
                    {AI_MODELS.find((m) => m.id === r.model)?.name || r.model}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 整体总结 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-5">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-amber-50 rounded-lg">
              <i className="ri-bar-chart-box-line text-amber-500" />
            </div>
            整体复盘总结
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">{r.summary}</p>

          {/* 分数分布 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {r.questions.map((q, idx) => (
              <div key={q.id} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{q.score}</p>
                <p className="text-xs text-slate-400 mt-1">题 {idx + 1}</p>
              </div>
            ))}
          </div>

          {/* 改进建议 */}
          <div className="border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">下一步提升方向</h4>
            <div className="space-y-2">
              {r.improvements.map((imp, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 flex items-center justify-center bg-emerald-50 rounded-full border border-emerald-200 text-emerald-600 text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed pt-0.5">{imp}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 逐题分析 */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg">
              <i className="ri-list-check-2 text-slate-500" />
            </div>
            逐题分析与优化建议
          </h3>

          {r.questions.map((q, idx) => {
            const isExpanded = expandedQ === q.id;
            return (
              <div
                key={q.id}
                className={`bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all duration-300 ${
                  isExpanded ? 'shadow-md shadow-slate-200/60' : 'hover:shadow-sm hover:shadow-slate-200/50'
                }`}
              >
                {/* 题目头部 */}
                <button
                  onClick={() => setExpandedQ(isExpanded ? null : q.id)}
                  className="w-full text-left p-5 flex items-start gap-3 cursor-pointer"
                >
                  <div className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl flex-shrink-0">
                    <span className="text-sm font-bold text-slate-500">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <ScoreBadge score={q.score} />
                      <p className="text-sm font-semibold text-slate-800">{q.question}</p>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-1">{q.answer.slice(0, 60)}...</p>
                  </div>
                  <div className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 flex-shrink-0">
                    <i className={isExpanded ? 'ri-arrow-up-s-line text-lg' : 'ri-arrow-down-s-line text-lg'} />
                  </div>
                </button>

                {/* 展开内容 */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-0">
                    <div className="border-t border-slate-100 pt-4 space-y-4">
                      {/* 你的回答 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="w-5 h-5 flex items-center justify-center text-slate-500">
                            <i className="ri-user-line" />
                          </div>
                          <span className="text-xs font-bold text-slate-600">你的回答</span>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{q.answer}</p>
                        </div>
                      </div>

                      {/* AI 分析 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="w-5 h-5 flex items-center justify-center text-amber-500">
                            <i className="ri-sparkling-line" />
                          </div>
                          <span className="text-xs font-bold text-slate-600">AI 分析</span>
                        </div>
                        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                          <p className="text-sm text-slate-600 leading-relaxed">{q.analysis}</p>
                        </div>
                      </div>

                      {/* 优化建议 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="w-5 h-5 flex items-center justify-center text-emerald-500">
                            <i className="ri-lightbulb-line" />
                          </div>
                          <span className="text-xs font-bold text-slate-600">优化建议</span>
                        </div>
                        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                          <pre className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed font-sans">
                            {q.suggestion}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between mt-8 mb-12">
          <button
            onClick={() => setView('list')}
            className="whitespace-nowrap flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
          >
            <i className="ri-arrow-left-line" />
            返回列表
          </button>
          <button
            onClick={() => { resetForm(); setView('create'); }}
            className="whitespace-nowrap flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-slate-900/15"
          >
            <i className="ri-add-line" />
            再录一次复盘
          </button>
        </div>
      </div>
    );
  }

  return null;
}
