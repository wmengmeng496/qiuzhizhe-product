import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStoredUser, type CurrentUser } from '@/lib/api';

const FEATURES = [
  {
    title: 'JD 定向简历优化',
    detail: '围绕目标岗位提取关键词，优化个人总结、项目经历、工作经历和技能描述。',
    icon: 'ri-focus-3-line',
  },
  {
    title: '自我介绍生成',
    detail: '根据岗位方向、表达风格和候选人亮点，生成能在面试开场直接使用的版本。',
    icon: 'ri-user-voice-line',
  },
  {
    title: '面试准备与复盘',
    detail: '把简历内容、岗位要求和常见追问整理成结构化准备材料。',
    icon: 'ri-chat-quote-line',
  },
  {
    title: '职业形象材料',
    detail: '整理求职头像、作品展示和补充材料，让投递资料更完整统一。',
    icon: 'ri-image-edit-line',
  },
];

const PROCESS = [
  ['上传简历', '支持上传简历文件或直接粘贴简历文本。'],
  ['粘贴 JD', '输入目标岗位职责、任职要求或招聘链接内容。'],
  ['生成版本', '系统输出优化建议、关键词和可继续调整的投递版本。'],
];

export default function LandingPage() {
  const [user, setUser] = useState<CurrentUser | null>(() => getStoredUser());
  const workbenchLink = user ? '/workspace' : '/auth?redirect=/workspace';

  useEffect(() => {
    const syncUser = () => setUser(getStoredUser());
    window.addEventListener('auth-change', syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener('auth-change', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "'Inter', 'PingFang SC', sans-serif" }}>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.svg" alt="职引简历" className="h-10 w-10 rounded-xl object-contain" />
            <div>
              <div className="text-base font-black text-slate-950">职引简历</div>
              <div className="text-xs font-bold text-slate-400">AI 求职材料工作台</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-bold text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-950">产品能力</a>
            <a href="#workflow" className="hover:text-slate-950">使用流程</a>
            <a href="#result" className="hover:text-slate-950">结果示例</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/account" className="hidden max-w-[180px] truncate rounded-lg px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50 md:block">
                {user.displayName || user.phone || user.email || '已登录'}
              </Link>
            ) : (
              <Link to="/auth?redirect=/workspace" className="hidden rounded-lg px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50 md:inline-flex">
                注册/登录
              </Link>
            )}
            <Link to={workbenchLink} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
              免费体验
              <i className="ri-arrow-right-line" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-100 bg-slate-50">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <h1 className="text-4xl font-black leading-tight text-slate-950 md:text-6xl">
                职引简历
                <span className="block text-indigo-600">AI 求职材料工作台</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                面向求职者的简历优化、JD 匹配、自我介绍生成和面试准备工具。把真实经历整理成更清晰、更贴近目标岗位的求职材料。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={workbenchLink} className="inline-flex h-12 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800">
                  <i className="ri-file-user-line text-lg" />
                  免费体验
                </Link>
                <a href="#result" className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:bg-slate-50">
                  <i className="ri-eye-line text-lg" />
                  查看结果示例
                </a>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,.12)]">
              <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-white px-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs font-black text-slate-400">职引简历工作台</span>
              </div>
              <div className="grid bg-slate-100 md:grid-cols-[148px_minmax(0,1fr)]">
                <aside className="hidden border-r border-slate-200 bg-white p-3 md:block">
                  <div className="mb-4 flex items-center gap-2">
                    <img src="/logo.svg" alt="职引简历" className="h-7 w-7 rounded-lg object-contain" />
                    <div>
                      <div className="text-xs font-black text-slate-900">职引简历</div>
                      <div className="text-[10px] font-bold text-slate-400">AI 工作台</div>
                    </div>
                  </div>
                  {[
                    ['ri-chat-3-line', '求职工作台', true],
                    ['ri-chat-quote-line', '面试助手', false],
                    ['ri-history-line', '优化记录', false],
                  ].map(([icon, label, active]) => (
                    <div
                      key={label as string}
                      className={`mb-1 flex h-8 items-center gap-2 rounded-lg px-2 text-[11px] font-black ${
                        active ? 'bg-slate-950 text-white' : 'text-slate-500'
                      }`}
                    >
                      <i className={`${icon} text-sm`} />
                      {label}
                    </div>
                  ))}
                  <div className="mt-5 rounded-lg bg-indigo-50 p-3">
                    <div className="text-[11px] font-black text-indigo-900">JD 匹配</div>
                    <div className="mt-2 h-1.5 rounded-full bg-indigo-100">
                      <div className="h-1.5 w-[78%] rounded-full bg-indigo-600" />
                    </div>
                  </div>
                </aside>
                <div className="p-3 md:p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-950">新的简历对话</div>
                      <div className="text-xs font-bold text-slate-400">候选人目标岗位</div>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      {['上传简历', 'JD', '模板', '风格'].map((item) => (
                        <span key={item} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-600">{item}</span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[0.82fr_1.18fr]">
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-indigo-600">目标 JD</span>
                          <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-600">88% 匹配</span>
                        </div>
                        <div className="mt-3 text-sm font-black text-slate-950">前端开发工程师</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {['React', 'TypeScript', '权限配置', '复杂表单'].map((item) => (
                            <span key={item} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{item}</span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="text-xs font-black text-slate-950">优化指令</div>
                        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
                          基于当前 JD 优化项目经验，突出职责、技术难点和业务结果。
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {['整体优化', '项目经验', '技能描述', '自我介绍'].map((item) => (
                          <div key={item} className="rounded-lg bg-white px-3 py-2 text-center text-xs font-black text-slate-700">{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <div className="text-lg font-black text-slate-950">王同学</div>
                          <div className="text-xs font-black text-indigo-600">前端开发工程师 · 3 年经验</div>
                        </div>
                        <i className="ri-download-2-line text-lg text-slate-400" />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-2 text-xs font-black text-slate-950">项目经历</div>
                          <p className="text-xs font-bold leading-6 text-slate-700">
                            负责 AI 客服中台核心页面建设，抽象复杂表单与权限组件，支持多业务线复用并提升交付稳定性。
                          </p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <div className="text-xs font-black text-emerald-700">优化后</div>
                          <p className="mt-2 text-xs font-bold leading-5 text-emerald-950">
                            补充技术方案、协作边界和可量化结果，形成可直接投递的项目表达。
                          </p>
                        </div>
                        <div className="space-y-2 pt-1">
                          <div className="h-2 w-full rounded-full bg-slate-100" />
                          <div className="h-2 w-10/12 rounded-full bg-slate-100" />
                          <div className="h-2 w-7/12 rounded-full bg-slate-100" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="bg-white px-4 py-16 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-black text-slate-950">围绕求职全过程整理材料</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">从投递前的简历改写，到面试前的表达准备，再到职业形象材料整理，集中在一个工作台完成。</p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-white text-indigo-600">
                    <i className={`${feature.icon} text-xl`} />
                  </div>
                  <h3 className="mt-4 text-base font-black text-slate-950">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{feature.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="border-y border-slate-200 bg-slate-50 px-4 py-16 md:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-3xl font-black text-slate-950">三步生成可投递版本</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {PROCESS.map(([title, detail], index) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="text-sm font-black text-indigo-600">0{index + 1}</div>
                  <h3 className="mt-3 text-lg font-black text-slate-950">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="result" className="bg-white px-4 py-16 md:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <div className="text-sm font-black text-slate-400">优化前</div>
              <p className="mt-4 text-base leading-8 text-slate-600">负责社群运营和内容发布，参与活动策划，整理用户反馈。</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
              <div className="text-sm font-black text-emerald-700">优化后</div>
              <p className="mt-4 text-base leading-8 text-emerald-950">负责求职社群增长与内容运营，围绕简历优化、面试准备等高频需求设计内容选题和活动机制，结合用户反馈复盘转化路径并持续优化触达效果。</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-950 px-4 py-10 text-white md:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="职引简历" className="h-10 w-10 rounded-xl bg-white object-contain" />
              <div>
                <div className="text-base font-black">职引简历</div>
                <div className="text-xs font-bold text-slate-400">AI 求职材料工作台</div>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
              职引简历提供 AI 简历优化、JD 匹配、自我介绍生成、面试准备和职业形象材料整理服务。
            </p>
          </div>
          <div>
            <div className="text-sm font-black">产品入口</div>
            <div className="mt-3 grid gap-2 text-sm font-bold text-slate-400">
              <Link to="/workspace" className="hover:text-white">求职工作台</Link>
              <Link to="/interview-prep" className="hover:text-white">面试助手</Link>
              <Link to="/career-assets" className="hover:text-white">职业形象</Link>
            </div>
          </div>
          <div>
            <div className="text-sm font-black">网站信息</div>
            <div className="mt-3 grid gap-2 text-sm font-bold text-slate-400">
              <span>备案号：京ICP备2026036209号</span>
              <span>网站名称：职引简历</span>
              <span>服务范围：求职材料生成与优化</span>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-2 border-t border-slate-800 pt-5 text-xs font-bold text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>© 2026 职引简历. All rights reserved.</span>
          <span>京ICP备2026036209号</span>
        </div>
      </footer>
    </div>
  );
}
