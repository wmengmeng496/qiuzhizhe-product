import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getMe, getStoredUser, type CurrentUser } from '@/lib/api';

const MENU = [
  { label: '求职工作台', icon: 'ri-chat-3-line', path: '/workspace' },
  { label: '面试助手', icon: 'ri-chat-quote-line', path: '/interview-prep' },
  { label: '优化记录', icon: 'ri-history-line', path: '/optimization-history' },
  { label: '职业形象', icon: 'ri-image-edit-line', path: '/career-assets' },
  { label: '积分账单', icon: 'ri-copper-coin-line', path: '/credits' },
  { label: '会员额度', icon: 'ri-vip-crown-line', path: '/membership' },
];

const PAGE_TITLES: Record<string, string> = {
  '/workspace': '求职工作台',
  '/resume-optimizer': '求职工作台',
  '/interview-prep': '面试助手',
  '/optimization-history': '优化记录',
  '/career-assets': '职业形象',
  '/credits': '积分账单',
  '/membership': '会员额度',
  '/account': '个人中心',
};

function SideNav({
  user,
  onNavigate,
  onLogout,
}: {
  user: CurrentUser | null;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const location = useLocation();
  const accountLabel = user?.phone || user?.email || '已登录';

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white px-4 py-5">
      <Link to="/workspace" onClick={onNavigate} className="mb-7 flex items-center gap-3 px-2">
        <img src="/logo.svg" alt="职引简历" className="h-10 w-10 rounded-xl object-contain" />
        <div>
          <div className="text-base font-black text-slate-900">职引简历</div>
          <div className="text-xs font-bold text-slate-400">AI 求职材料工作台</div>
        </div>
      </Link>

      <nav className="space-y-1">
        {MENU.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-bold transition-colors ${
                active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <i className={`${item.icon} text-lg`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
        <div className="text-sm font-black text-indigo-900">默认 JD 匹配</div>
        <p className="mt-2 text-xs leading-5 text-indigo-700">所有优化都会结合目标岗位关键词，保持内容和投递方向一致。</p>
      </div>

      <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        {user ? (
          <div className="space-y-3">
            <Link
              to="/account"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-white"
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-700 text-xs font-black text-white">
                {user.displayName?.slice(0, 2).toUpperCase() || 'ZH'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-slate-800">{user.displayName || '已登录用户'}</div>
                <div className="truncate text-xs font-bold text-slate-400">{accountLabel}</div>
              </div>
              <i className="ri-arrow-right-s-line text-lg text-slate-400" />
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/account"
                onClick={onNavigate}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-600 hover:text-slate-950"
              >
                <i className="ri-user-settings-line text-base" />
                个人中心
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-600 hover:text-rose-600"
              >
                <i className="ri-logout-box-r-line text-base" />
                退出登录
              </button>
            </div>
          </div>
        ) : (
          <Link to="/auth?redirect=/workspace" onClick={onNavigate} className="flex h-10 items-center justify-center rounded-lg bg-slate-950 text-sm font-black text-white">
            登录账号
          </Link>
        )}
      </div>
    </aside>
  );
}

export default function ProductShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(() => getStoredUser());
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const syncUser = () => setUser(getStoredUser());
    window.addEventListener('auth-change', syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener('auth-change', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  useEffect(() => {
    if (!getStoredUser()) return;
    let alive = true;
    getMe()
      .then((data) => {
        if (alive) setUser(data.user);
      })
      .catch(() => {
        if (alive) setUser(getStoredUser());
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleLogout = () => {
    clearSession();
    setMobileOpen(false);
    navigate('/auth?redirect=/workspace', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-900" style={{ fontFamily: "'Inter', 'PingFang SC', sans-serif" }}>
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[244px_minmax(0,1fr)]">
        <div className="hidden xl:block">
          <SideNav user={user} onLogout={handleLogout} />
        </div>

        <main className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/82 px-4 backdrop-blur-xl xl:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <i className="ri-menu-line text-xl" />
            </button>
            <div className="text-sm font-black">{PAGE_TITLES[location.pathname] || '职引简历'}</div>
            <Link to="/account" className="grid h-9 w-9 place-items-center rounded-lg text-slate-700">
              <i className="ri-user-settings-line text-lg" />
            </Link>
          </header>
          {children}
        </main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="关闭菜单"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/28"
          />
          <div className="relative h-full w-[280px] shadow-2xl">
            <SideNav user={user} onNavigate={() => setMobileOpen(false)} onLogout={handleLogout} />
          </div>
        </div>
      )}
    </div>
  );
}
