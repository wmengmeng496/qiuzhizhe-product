import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createManualOrder, getStoredUser } from '@/lib/api';

/* ===== 会员等级配置 ===== */
const PLANS = [
  {
    id: 'free',
    name: '免费版',
    subtitle: '基础体验',
    price: '¥0',
    period: '永久',
    highlight: false,
    features: [
      { text: '简历优化 3 次/月', included: true },
      { text: '支持整体优化', included: true },
      { text: '基础 AI 模型（GPT-3.5）', included: true },
      { text: '面试题库浏览', included: true },
      { text: '模拟面试 1 次/月', included: true },
      { text: '分模块优化', included: false },
      { text: '高级 AI 模型（GPT-4）', included: false },
      { text: '面试复盘功能', included: false },
      { text: '无限优化次数', included: false },
      { text: '优先客服支持', included: false },
    ],
    cta: '当前方案',
    disabled: true,
  },
  {
    id: 'pro',
    name: '专业版',
    subtitle: '求职加速',
    price: '¥29',
    period: '/月',
    highlight: true,
    badge: '最受欢迎',
    features: [
      { text: '简历优化 50 次/月', included: true },
      { text: '支持整体优化', included: true },
      { text: '支持分模块优化', included: true },
      { text: '高级 AI 模型（GPT-4o）', included: true },
      { text: '面试题库全部解锁', included: true },
      { text: '模拟面试 20 次/月', included: true },
      { text: '面试复盘 10 次/月', included: true },
      { text: '优化记录云端保存', included: true },
      { text: 'AI 模型自由切换', included: false },
      { text: '优先客服支持', included: false },
    ],
    cta: '立即升级',
    disabled: false,
  },
  {
    id: 'ultimate',
    name: '终极版',
    subtitle: '无限畅享',
    price: '¥59',
    period: '/月',
    highlight: false,
    badge: '最佳价值',
    features: [
      { text: '简历优化无限次', included: true },
      { text: '支持整体优化', included: true },
      { text: '支持分模块优化', included: true },
      { text: '全部 AI 模型自由切换', included: true },
      { text: '面试题库全部解锁', included: true },
      { text: '模拟面试无限次', included: true },
      { text: '面试复盘无限次', included: true },
      { text: '优化记录云端保存', included: true },
      { text: '优先客服支持', included: true },
      { text: '1对1 简历诊断', included: true },
    ],
    cta: '立即升级',
    disabled: false,
  },
];

/* ===== FAQ 数据 ===== */
const FAQS = [
  {
    q: '升级后可以立即使用吗？',
    a: '当前采用线下确认方式，提交开通申请后由管理员确认，确认后会员权益立即生效。',
  },
  {
    q: '可以随时取消订阅吗？',
    a: '当前不是自动订阅，不会自动扣费。如需调整方案，可联系管理员处理。',
  },
  {
    q: '免费版和专业版有什么区别？',
    a: '免费版每月限 3 次简历优化，仅支持 GPT-3.5 和整体优化。专业版支持 50 次/月、分模块优化、GPT-4o、面试复盘等高级功能。',
  },
  {
    q: '支持哪些支付方式？',
    a: '当前先支持线下微信、支付宝或对公转账确认，线上支付会在后续版本接入。',
  },
  {
    q: '会员权益可以转让吗？',
    a: '会员权益绑定账号，不支持转让。但支持同一账号多端登录使用。',
  },
];

type PaidPlanId = 'pro' | 'ultimate';
type BillingCycle = 'monthly' | 'yearly';

function OrderModal({
  plan,
  billingCycle,
  onClose,
}: {
  plan: PaidPlanId | null;
  billingCycle: BillingCycle;
  onClose: () => void;
}) {
  const [contact, setContact] = useState('');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const user = getStoredUser();

  if (!plan) return null;
  const planName = plan === 'pro' ? '专业版' : '终极版';

  const submit = async () => {
    if (!user) {
      setMessage('请先登录账号，再提交开通申请');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const order = await createManualOrder({ plan, billingCycle, contact, remark });
      setMessage(`申请已提交，订单尾号 ${order.id.slice(-6)}。线下确认后我会为你开通 ${planName}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

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

        <div className="w-16 h-16 flex items-center justify-center bg-amber-50 rounded-2xl mx-auto mb-5 border border-amber-100">
          <i className="ri-vip-crown-line text-amber-500 text-3xl" />
        </div>

        <h3 className="text-lg font-bold text-slate-800 text-center mb-2">
          申请开通 {planName}
        </h3>
        <p className="text-sm text-slate-500 text-center leading-relaxed mb-6">
          当前先走线下收款和人工确认。你提交后后台会生成待处理订单，确认后自动开通会员。
        </p>

        {!user && (
          <Link
            to={`/auth?redirect=${encodeURIComponent('/membership')}`}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-sm font-bold text-white"
          >
            <i className="ri-login-circle-line" />
            先登录账号
          </Link>
        )}

        <div className="space-y-3 text-left">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">微信/手机号/邮箱</label>
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="方便线下确认订单"
              className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">备注</label>
            <textarea
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="例如：已添加微信 / 想开通一年 / 公司报销"
              rows={3}
              className="w-full resize-none rounded-xl border-2 border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            {message}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !user}
          className="mt-5 whitespace-nowrap w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all cursor-pointer text-sm disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <i className={loading ? 'ri-loader-4-line animate-spin' : 'ri-send-plane-line'} />
          {loading ? '提交中...' : '提交开通申请'}
        </button>
      </div>
    </div>
  );
}

/* ===== FAQ 组件 ===== */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left p-5 flex items-center justify-between cursor-pointer"
      >
        <span className="text-sm font-semibold text-slate-800">{q}</span>
        <i className={`ri-arrow-down-s-line text-slate-400 text-lg transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-0">
          <div className="border-t border-slate-100 pt-3">
            <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== 会员页面 ===== */
export default function MembershipPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<PaidPlanId | null>(null);

  return (
    <div className="min-h-[calc(100vh-56px)]">
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div className="mb-8 flex flex-col gap-2 text-left">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600">
            <i className="ri-vip-crown-line" />
            解锁高级功能
          </div>
          <h1 className="text-2xl font-black text-slate-900">选择适合你的会员方案</h1>
          <p className="max-w-2xl text-sm font-medium text-slate-500">
            从简历优化到面试复盘，全方位助力求职。专业版即可满足大多数用户需求。
          </p>
        </div>

        {/* 计费周期切换 */}
        <div className="flex items-center justify-center mb-10">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`whitespace-nowrap px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              按月付费
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`whitespace-nowrap px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              按年付费
              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold border border-amber-200">
                省 20%
              </span>
            </button>
          </div>
        </div>

        {/* 价格卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">
          {PLANS.map((plan) => {
            const yearlyPrice = billingCycle === 'yearly' && plan.id !== 'free'
              ? `¥${Math.round(parseInt(plan.price.replace('¥', '')) * 12 * 0.8)}/年`
              : null;

            return (
              <div
                key={plan.id}
                className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
                  plan.highlight
                    ? 'bg-slate-900 text-white border-slate-800 shadow-xl shadow-slate-900/20 scale-[1.02] relative'
                    : 'bg-white border-slate-100 hover:shadow-md hover:shadow-slate-200/50'
                }`}
              >
                {plan.badge && (
                  <div className={`text-center py-2 text-xs font-bold ${
                    plan.highlight ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 border-b border-amber-100'
                  }`}>
                    {plan.badge}
                  </div>
                )}

                <div className="p-6">
                  {/* 方案名称 */}
                  <h3 className={`text-lg font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-slate-800'}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-sm mb-5 ${plan.highlight ? 'text-slate-400' : 'text-slate-500'}`}>
                    {plan.subtitle}
                  </p>

                  {/* 价格 */}
                  <div className="mb-6">
                    <span className={`text-3xl font-bold ${plan.highlight ? 'text-white' : 'text-slate-800'}`}>
                      {billingCycle === 'yearly' && plan.id !== 'free'
                        ? `¥${Math.round(parseInt(plan.price.replace('¥', '')) * 0.8)}`
                        : plan.price}
                    </span>
                    <span className={`text-sm ml-1 ${plan.highlight ? 'text-slate-400' : 'text-slate-400'}`}>
                      {billingCycle === 'yearly' && plan.id !== 'free' ? '/月' : plan.period}
                    </span>
                    {yearlyPrice && (
                      <p className="text-xs text-slate-400 mt-1">
                        原价 {plan.price}{plan.period} × 12 = {plan.price.replace('¥', '')}12/年，年付仅需 {yearlyPrice}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (!plan.disabled) setSelectedPlan(plan.id as PaidPlanId);
                    }}
                    className={`whitespace-nowrap w-full py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer mb-6 ${
                      plan.disabled
                        ? 'bg-slate-100 text-slate-400 cursor-default'
                        : plan.highlight
                          ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-500/25'
                          : 'bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/15'
                    }`}
                  >
                    {plan.disabled ? plan.cta : '提交线下开通申请'}
                  </button>

                  {/* 权益列表 */}
                  <div className="space-y-3">
                    {plan.features.map((feat, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        {feat.included ? (
                          <div className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                            plan.highlight ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-500'
                          }`}>
                            <i className="ri-check-line text-xs" />
                          </div>
                        ) : (
                          <div className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                            plan.highlight ? 'bg-slate-700 text-slate-500' : 'bg-slate-50 text-slate-300'
                          }`}>
                            <i className="ri-close-line text-xs" />
                          </div>
                        )}
                        <span className={`text-sm ${
                          feat.included
                            ? plan.highlight ? 'text-slate-200' : 'text-slate-700'
                            : plan.highlight ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                          {feat.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 功能对比 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-8 mb-16">
          <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">功能对比</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-4 text-slate-500 font-semibold">功能</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-semibold">免费版</th>
                  <th className="text-center py-3 px-4 text-amber-600 font-semibold bg-amber-50/50 rounded-t-lg">专业版</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-semibold">终极版</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: '简历优化次数', free: '3次/月', pro: '50次/月', ultimate: '无限次' },
                  { name: '整体优化', free: '✓', pro: '✓', ultimate: '✓' },
                  { name: '分模块优化', free: '—', pro: '✓', ultimate: '✓' },
                  { name: 'AI 模型', free: 'GPT-3.5', pro: 'GPT-4o', ultimate: '全部模型' },
                  { name: '面试题库', free: '部分', pro: '全部', ultimate: '全部' },
                  { name: '模拟面试', free: '1次/月', pro: '20次/月', ultimate: '无限次' },
                  { name: '面试复盘', free: '—', pro: '10次/月', ultimate: '无限次' },
                  { name: '优化记录', free: '本地', pro: '云端', ultimate: '云端' },
                  { name: '客服支持', free: '社区', pro: '标准', ultimate: '优先' },
                  { name: '1对1 简历诊断', free: '—', pro: '—', ultimate: '✓' },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 px-4 text-slate-700">{row.name}</td>
                    <td className="text-center py-3 px-4 text-slate-500">{row.free}</td>
                    <td className="text-center py-3 px-4 text-amber-600 font-medium bg-amber-50/30">{row.pro}</td>
                    <td className="text-center py-3 px-4 text-slate-700 font-medium">{row.ultimate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">常见问题</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <FaqItem key={i} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </main>

      <OrderModal plan={selectedPlan} billingCycle={billingCycle} onClose={() => setSelectedPlan(null)} />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
