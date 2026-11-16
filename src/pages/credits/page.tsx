import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listResumeOptimizations } from '@/lib/backend-service';

export default function CreditsPage() {
  const [logs, setLogs] = useState<Array<{ id: string; time: string; title: string; detail: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    listResumeOptimizations().then((items) => setLogs(items.map((item) => ({
      id: item.id,
      time: new Date(item.created_at).toLocaleString('zh-CN', { hour12: false }),
      title: item.optimize_mode === 'full' ? '整份简历优化' : `${item.optimize_mode} 模块优化`,
      detail: `${item.model} · 正式优化成功`,
    })))).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);
  return (
    <div className="min-h-[calc(100vh-56px)]">
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950">消耗明细</h1>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500">
              查看每次正式优化的消耗记录。
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

        <section>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-xs font-bold text-slate-500">仅显示已成功保存并扣除额度的正式优化。</p>
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                    <i className="ri-subtract-line" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{log.title}</div>
                        <div className="mt-1 text-xs font-bold text-slate-500">{log.time} · {log.detail}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {loading && <div className="py-8 text-center text-sm text-slate-500">正在读取消耗明细...</div>}
              {!loading && error && <div role="alert" className="py-8 text-center text-sm text-slate-500">读取失败，请刷新页面重试</div>}
              {!loading && !error && logs.length === 0 && <div className="py-8 text-center text-sm font-bold text-slate-400">暂无真实消耗记录</div>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
