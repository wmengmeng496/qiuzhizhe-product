import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getStoredUser, login, register } from '@/lib/api';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [channel, setChannel] = useState<'phone' | 'email'>('phone');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/workspace';

  useEffect(() => {
    if (getStoredUser()) {
      navigate(redirect, { replace: true });
      return;
    }
    const reason = params.get('error');
    if (reason) setError(reason);
  }, [navigate, params, redirect]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedAccount = account.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedAccount);
    const isPhone = /^1[3-9]\d{9}$/.test(normalizedAccount);
    if (!normalizedAccount) {
      setError(channel === 'phone' ? '请输入手机号' : '请输入邮箱');
      return;
    }
    if (channel === 'phone' && !isPhone) {
      setError('请输入有效的 11 位手机号');
      return;
    }
    if (channel === 'email' && !isEmail) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (mode === 'register' && !termsAccepted) {
      setError('请先阅读并同意用户协议和隐私政策');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(channel === 'email' ? normalizedAccount.toLowerCase() : normalizedAccount, password);
      } else {
        await register(
          channel === 'email' ? normalizedAccount.toLowerCase() : normalizedAccount,
          password,
          displayName.trim(),
          termsAccepted,
        );
      }
      navigate(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: "'Inter', 'PingFang SC', sans-serif" }}>
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 md:px-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden lg:block">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.svg" alt="职引简历" className="h-11 w-11 rounded-xl object-contain" />
            <div>
              <div className="text-lg font-black text-slate-950">职引简历</div>
              <div className="text-xs font-bold text-slate-400">AI求职工作台</div>
            </div>
          </Link>
          <h1 className="mt-12 max-w-xl text-5xl font-black leading-tight text-slate-950">
            登录后继续保存你的求职材料版本
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
            支持手机号或邮箱注册登录，保存简历优化记录、面试准备内容、职业形象材料和会员额度。
          </p>
          <div className="mt-8 grid max-w-xl gap-3">
            {[
              ['ri-history-line', '云端保存优化历史'],
              ['ri-file-user-line', '跨设备继续编辑投递版本'],
              ['ri-vip-crown-line', '同步会员额度和订单状态'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                  <i className={`${icon} text-lg`} />
                </span>
                {text}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,.08)] md:p-8">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800">
            <i className="ri-arrow-left-line" />
            返回首页
          </Link>
          <div>
            <h2 className="text-2xl font-black text-slate-950">{mode === 'login' ? '登录账号' : '创建账号'}</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {mode === 'login' ? '使用手机号或邮箱进入你的工作台。' : '注册后可保存历史记录和会员额度。'}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
            {[
              ['login', '登录'],
              ['register', '注册'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value as 'login' | 'register');
                  setConfirmPassword('');
                  setTermsAccepted(false);
                  setError('');
                }}
                className={`h-10 rounded-md text-sm font-black transition-colors ${
                  mode === value ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ['phone', '手机号', 'ri-smartphone-line'],
              ['email', '邮箱', 'ri-mail-line'],
            ].map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setChannel(value as 'phone' | 'email');
                  setAccount('');
                  setError('');
                }}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-black ${
                  channel === value
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <i className={icon} />
                {label}
              </button>
            ))}
          </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="mb-1.5 block text-xs font-black text-slate-500">昵称</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                placeholder="怎么称呼你，可不填"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-black text-slate-500">{channel === 'phone' ? '手机号' : '邮箱'}</label>
            <input
              type={channel === 'phone' ? 'tel' : 'email'}
              required
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete={channel === 'phone' ? 'tel' : 'email'}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              placeholder={channel === 'phone' ? '请输入 11 位手机号' : 'you@example.com'}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black text-slate-500">密码</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              placeholder="至少 6 位"
            />
          </div>
          {mode === 'register' && (
            <div>
              <label className="mb-1.5 block text-xs font-black text-slate-500">确认密码</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                placeholder="再输入一次密码"
              />
            </div>
          )}

          {mode === 'register' ? (
            <label className="flex cursor-pointer items-start gap-3 text-xs font-medium leading-5 text-slate-500">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => {
                  setTermsAccepted(e.target.checked);
                  if (e.target.checked) setError('');
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
              />
              <span>
                我已阅读并同意
                <Link to="/terms" target="_blank" className="mx-1 font-bold text-indigo-600 hover:text-indigo-700">《职引简历用户协议》</Link>
                和
                <Link to="/privacy" target="_blank" className="ml-1 font-bold text-indigo-600 hover:text-indigo-700">《职引简历隐私政策》</Link>
              </span>
            </label>
          ) : (
            <p className="text-center text-xs font-medium leading-5 text-slate-400">
              登录即表示你已阅读并同意
              <Link to="/terms" target="_blank" className="mx-1 text-slate-600 hover:text-indigo-600">用户协议</Link>
              和
              <Link to="/privacy" target="_blank" className="ml-1 text-slate-600 hover:text-indigo-600">隐私政策</Link>
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 py-3.5 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className={loading ? 'ri-loader-4-line animate-spin' : 'ri-login-circle-line'} />
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setConfirmPassword('');
            setTermsAccepted(false);
            setError('');
          }}
          className="mt-5 w-full text-sm font-bold text-slate-500 hover:text-indigo-600"
        >
          {mode === 'login' ? '还没有账号？立即注册' : '已有账号？返回登录'}
        </button>
        </section>
      </div>
    </div>
  );
}
