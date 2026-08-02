import { Link, useNavigate } from 'react-router-dom';
import { clearSession, getStoredUser } from '@/lib/api';

const PLAN_LABELS = {
  free: '免费版',
  pro: '专业版',
  ultimate: '旗舰版',
};

function formatDate(value: string) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function AccountPage() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    clearSession();
    navigate('/auth?redirect=/workspace', { replace: true });
  };

  if (!user) {
    return null;
  }

  const account = user.phone || user.email || '未绑定';
  const planLabel = PLAN_LABELS[user.plan] || '免费版';

  return (
    <div className="min-h-screen bg-[#f4f5f7] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-950 text-lg font-black text-white">
                {user.displayName?.slice(0, 2).toUpperCase() || 'ZH'}
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-950">{user.displayName || '已登录用户'}</h1>
                <p className="mt-1 text-sm font-bold text-slate-500">{account}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            >
              <i className="ri-logout-box-r-line text-lg" />
              退出登录
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="text-xs font-black text-slate-400">当前套餐</div>
            <div className="mt-3 text-xl font-black text-slate-950">{planLabel}</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">可在会员额度页面查看权益和申请升级。</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="text-xs font-black text-slate-400">登录方式</div>
            <div className="mt-3 text-xl font-black text-slate-950">{user.phone ? '手机号' : '邮箱'}</div>
            <p className="mt-2 truncate text-sm leading-6 text-slate-500">{account}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="text-xs font-black text-slate-400">注册时间</div>
            <div className="mt-3 text-xl font-black text-slate-950">{formatDate(user.createdAt)}</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">账号信息保存在当前登录会话中。</p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black text-slate-950">常用入口</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Link
              to="/workspace"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700 hover:bg-white hover:text-slate-950"
            >
              求职工作台
              <i className="ri-arrow-right-line text-lg" />
            </Link>
            <Link
              to="/membership"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700 hover:bg-white hover:text-slate-950"
            >
              会员额度
              <i className="ri-arrow-right-line text-lg" />
            </Link>
            <Link
              to="/"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700 hover:bg-white hover:text-slate-950"
            >
              返回首页
              <i className="ri-arrow-right-line text-lg" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
