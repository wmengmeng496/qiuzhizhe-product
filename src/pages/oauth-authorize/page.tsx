import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { authorizeWorkBuddy, getStoredUser } from '@/lib/api';

const scopeLabels: Record<string, string> = {
  openid: '确认当前登录账号',
  profile: '读取昵称和会员套餐',
  'resume.read': '读取简历优化记录摘要',
  'resume.write': '调用额度优化并保存简历',
};

export default function OAuthAuthorizePage() {
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const user = getStoredUser();
  const required = ['client_id', 'redirect_uri', 'scope', 'code_challenge'] as const;
  if (required.some((key) => !params.get(key))) return <Navigate to="/?error=授权参数不完整" replace />;
  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  const scopes = (params.get('scope') || '').split(/\s+/).filter(Boolean);

  const submit = async (approved: boolean) => {
    setLoading(true);
    setError('');
    try {
      const data = await authorizeWorkBuddy({
        clientId: params.get('client_id') || '',
        redirectUri: params.get('redirect_uri') || '',
        scope: params.get('scope') || '',
        state: params.get('state') || '',
        codeChallenge: params.get('code_challenge') || '',
        approved,
      });
      location.replace(data.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '授权失败，请重试');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <section className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="职引简历" className="h-12 w-12 rounded-2xl" />
          <div><div className="font-black">职引简历</div><div className="text-xs font-bold text-indigo-600">连接 WorkBuddy</div></div>
        </div>
        <h1 className="mt-8 text-2xl font-black">授权 WorkBuddy 使用你的职引简历账号</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">你正在以 <b>{user.displayName || user.phone || user.email}</b> 登录。授权后，简历专家可使用以下能力：</p>
        <div className="mt-5 space-y-3">
          {scopes.map((scope) => <div key={scope} className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold"><span className="text-emerald-500">✓</span><span>{scopeLabels[scope] || scope}</span></div>)}
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">授权不会把你的密码交给 WorkBuddy。你可随时在账号管理中撤销连接。</p>
        {error && <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</div>}
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button disabled={loading} onClick={() => submit(false)} className="rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 disabled:opacity-50">取消</button>
          <button disabled={loading} onClick={() => submit(true)} className="rounded-xl bg-slate-950 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? '处理中...' : '同意并绑定'}</button>
        </div>
      </section>
    </main>
  );
}
