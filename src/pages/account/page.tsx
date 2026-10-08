import { Link, useNavigate } from 'react-router-dom';
import { clearSession, deleteAccount, deleteAccountData, exportAccountData, getStoredUser } from '@/lib/api';
import { useState } from 'react';

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
  const [accountAction, setAccountAction] = useState('');
  const [accountError, setAccountError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => {
    clearSession();
    window.location.href = '/auth?redirect=/workspace';
  };

  const handleExport = async () => {
    setAccountError(''); setAccountAction('正在准备导出…');
    try {
      const response = await exportAccountData();
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `职引账号数据-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
      setAccountAction('数据已导出');
    } catch (error) { setAccountAction(''); setAccountError(error instanceof Error ? error.message : '导出失败，请稍后重试'); }
  };

  const handleDeleteData = async () => {
    if (!window.confirm('确定删除账号中的简历、优化记录和面试数据吗？此操作不可撤销。')) return;
    setAccountError(''); setAccountAction('正在删除数据…');
    try { await deleteAccountData(); setAccountAction('账号数据已删除'); }
    catch (error) { setAccountAction(''); setAccountError(error instanceof Error ? error.message : '删除失败，请稍后重试'); }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') return;
    setDeleting(true); setAccountError(''); setAccountAction('正在删除账号…');
    try { await deleteAccount(deleteConfirmation, deletePassword || undefined); clearSession(); navigate('/auth', { replace: true }); }
    catch (error) { setAccountAction(''); setAccountError(error instanceof Error ? error.message : '删除失败，请稍后重试'); setDeleting(false); }
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
          <h2 className="text-lg font-black text-slate-950">数据与账号管理</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">导出、清理或永久删除你的账号数据。删除操作不可撤销。</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={handleExport} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">导出我的数据</button>
            <button type="button" onClick={handleDeleteData} className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-black text-amber-700 hover:bg-amber-50">删除工作数据</button>
            <button type="button" onClick={() => { setDeleteOpen(true); setAccountError(''); }} disabled={deleting} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50">永久删除账号</button>
          </div>
          {accountAction && <p className="mt-3 text-sm font-bold text-emerald-700">{accountAction}</p>}
          {accountError && <p className="mt-3 text-sm font-bold text-rose-700">{accountError}</p>}
          {deleteOpen && (
            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <h3 className="text-sm font-black text-rose-900">确认永久删除账号</h3>
              <p className="mt-1 text-xs leading-5 text-rose-800">此操作不可撤销。请输入 DELETE，并输入当前密码；微信登录可留空。</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <input value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} placeholder="输入 DELETE" className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none" disabled={deleting} />
                <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="当前登录密码（可留空）" className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none" disabled={deleting} />
              </div>
              <div className="mt-3 flex gap-2"><button type="button" onClick={handleDeleteAccount} disabled={deleting || deleteConfirmation !== 'DELETE'} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{deleting ? '删除中…' : '确认删除'}</button><button type="button" onClick={() => setDeleteOpen(false)} disabled={deleting} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black">取消</button></div>
            </div>
          )}
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
