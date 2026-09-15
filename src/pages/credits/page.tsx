import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMe } from '@/lib/api';
import { listResumeOptimizations } from '@/lib/backend-service';

const CREDIT_PACKAGES = [
  { id: 'starter', name: '轻量补充包', credits: 100, price: '¥9.9', desc: '适合临时多跑几版简历' },
  { id: 'standard', name: '求职冲刺包', credits: 500, price: '¥39', desc: '适合集中投递期反复调整' },
  { id: 'pro', name: '深度优化包', credits: 1200, price: '¥79', desc: '适合多岗位、多版本测试' },
];

const CREDIT_RULES = [
  { name: '智能默认模型', cost: '1 积分/次', desc: '适合大多数模块优化，优先走稳定模型链路。' },
  { name: 'GPT-5.4', cost: '2 积分/次', desc: '适合完整简历、复杂岗位和高质量表达。' },
  { name: 'GPT-5.5', cost: '3 积分/次', desc: '适合深度诊断、多轮复杂改写。' },
  { name: '读取 JD / 上传简历', cost: '0 积分', desc: '准备材料不扣积分，生成优化版本时才扣除。' },
];

export default function CreditsPage() {
  const [usage, setUsage] = useState<{ used: number; limit: number; period: string } | null>(null);
  const [logs, setLogs] = useState<Array<{ id: string; time: string; title: string; detail: string }>>([]);
  useEffect(() => {
    getMe().then((data) => setUsage({
      used: data.usage.resume_optimize_used,
      limit: data.limits.resumeOptimize,
      period: data.usage.period,
    })).catch(() => setUsage(null));
    listResumeOptimizations().then((items) => setLogs(items.map((item) => ({
      id: item.id,
      time: new Date(item.created_at).toLocaleString('zh-CN', { hour12: false }),
      title: item.optimize_mode === 'full' ? '整份简历优化' : `${item.optimize_mode} 模块优化`,
      detail: `${item.model} · 正式优化成功`,
    })))).catch(() => setLogs([]));
  }, []);
  const used = usage?.used ?? 0;
  const limit = usage?.limit ?? 0;
  const available = Math.max(limit - used, 0);
  return (
    <div className="min-h-[calc(100vh-56px)]">
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-indigo-600">
              <i className="ri-copper-coin-line" />
              积分账单
            </div>
            <h1 className="mt-2 text-2xl font-black text-slate-950">充值与消耗</h1>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500">
              查看当前余额、每次优化的扣除明细，以及不同模型的积分规则。
            </p>
          </div>
          <Link
            to="/workspace"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            <i className="ri-chat-3-line" />
            回到工作台
          </Link>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-black text-slate-500">当前可用积分</div>
                <div className="mt-2 text-5xl font-black tracking-normal text-slate-950">{available.toLocaleString()}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['本月上限', limit],
                  ['本月消耗', used],
                  ['冻结中', 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs font-black text-slate-400">{label}</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }} />
            </div>
            <div className="mt-3 text-xs font-bold text-slate-500">
              {usage ? `统计周期 ${usage.period}，剩余 ${available} 次简历优化。只有正式 AI 优化成功后才会扣除次数。` : '正在读取真实额度，请确认已登录并连接后端。'}
            </div>
          </div>

          <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5">
            <div className="text-sm font-black text-indigo-700">扣除规则</div>
            <div className="mt-4 space-y-3">
              {CREDIT_RULES.map((rule) => (
                <div key={rule.name} className="rounded-2xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-slate-900">{rule.name}</div>
                    <div className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-600">{rule.cost}</div>
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{rule.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-950">充值套餐</div>
                <div className="mt-1 text-xs font-bold text-slate-500">当前为线下确认，提交后由管理员入账。</div>
              </div>
              <Link to="/membership" className="text-xs font-black text-indigo-600 hover:text-indigo-700">
                查看会员
              </Link>
            </div>
            <div className="space-y-3">
              {CREDIT_PACKAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-indigo-200 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-950">{item.name}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{item.desc}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-indigo-600">{item.credits} 积分</div>
                      <div className="text-xs font-black text-slate-500">{item.price}</div>
                    </div>
                  </div>
                  <div className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-black text-white">
                    <i className="ri-add-circle-line" />
                    提交充值申请
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-950">消耗明细</div>
                <div className="mt-1 text-xs font-bold text-slate-500">仅显示已成功保存并扣除额度的正式优化。</div>
              </div>
              <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-600">
                <i className="ri-download-line" />
                导出
              </button>
            </div>
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div key={log.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    'bg-indigo-50 text-indigo-600'
                  }`}>
                    <i className="ri-subtract-line" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{log.title}</div>
                        <div className="mt-1 text-xs font-bold text-slate-500">{log.time} · {log.detail}</div>
                      </div>
                      <div className="shrink-0 text-sm font-black text-slate-950">-1</div>
                    </div>
                    <div className="mt-2 text-xs font-bold text-slate-400">当期消耗后剩余 {Math.min(limit, available + index)} 次</div>
                  </div>
                </div>
              ))}
              {logs.length === 0 && <div className="py-8 text-center text-sm font-bold text-slate-400">暂无真实消耗记录</div>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
