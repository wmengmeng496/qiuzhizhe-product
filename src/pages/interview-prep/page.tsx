import { useState, useRef, useEffect } from 'react';

import InterviewReview from './components/InterviewReview';
export interface Question {
  id: string;
  category: string;
  industry: string;
  position: string;
  question: string;
  answer: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

const INDUSTRIES = ['全部', '互联网', '金融', '电商', '新能源/车企', '教育'];
const POSITIONS = ['全部', '前端开发', '后端开发', '产品经理', '测试工程师', '运维工程师', '数据分析师'];

const QUESTIONS: Question[] = [
  // ===== 自我介绍 =====
  {
    id: 'intro-1',
    category: '自我介绍',
    industry: '互联网',
    position: '前端开发',
    question: '请做一个简短的自我介绍',
    answer: '建议结构：\n1. 基本信息（姓名、学历、工作年限）\n2. 核心经验（与岗位最相关的 1-2 段经历）\n3. 核心能力（与 JD 匹配的 2-3 项技能）\n4. 求职动机（为什么应聘这个岗位）\n\n控制在 1-2 分钟，约 200-300 字。',
    tags: ['高频', '必问'],
    difficulty: 'easy',
  },
  {
    id: 'intro-2',
    category: '自我介绍',
    industry: '互联网',
    position: '后端开发',
    question: '你的优势和劣势分别是什么？',
    answer: '优势：选择与岗位直接相关的优点，用具体事例佐证。\n劣势：选择一个真实的、非致命的弱点，并说明正在如何改进。避免说"我太追求完美"这类假弱点。',
    tags: ['高频'],
    difficulty: 'easy',
  },
  {
    id: 'intro-3',
    category: '自我介绍',
    industry: '金融',
    position: '产品经理',
    question: '你的职业规划是什么？',
    answer: '短期（1年内）：快速融入团队，熟悉业务，成为独立贡献者。\n中期（1-3年）：深耕专业领域，能够带领小团队或成为领域专家。\n长期（3-5年）：根据公司发展方向，成长为技术负责人或架构师。\n\n重点：要体现与应聘岗位的契合度。',
    tags: ['高频'],
    difficulty: 'easy',
  },

  // ===== 技术面试 - 前端 =====
  {
    id: 'tech-fe-1',
    category: '技术面试',
    industry: '互联网',
    position: '前端开发',
    question: 'React 的 useEffect 和 useLayoutEffect 有什么区别？',
    answer: 'useEffect：在浏览器绘制完成后异步执行，不会阻塞 UI 渲染。用于副作用如数据获取、订阅等。\nuseLayoutEffect：在浏览器绘制之前同步执行，会阻塞渲染。用于需要在绘制前同步读取或修改 DOM 的场景（如测量元素尺寸）。\n\n绝大多数场景用 useEffect 即可。',
    tags: ['React', '高频'],
    difficulty: 'medium',
  },
  {
    id: 'tech-fe-2',
    category: '技术面试',
    industry: '电商',
    position: '前端开发',
    question: '前端性能优化的常见手段有哪些？',
    answer: '1. 加载优化：代码分割、懒加载、预加载、CDN、Gzip 压缩\n2. 渲染优化：虚拟列表、防抖节流、避免重排重绘、使用 requestAnimationFrame\n3. 缓存优化：Service Worker、HTTP 缓存策略、LocalStorage\n4. 网络优化：减少 HTTP 请求、HTTP/2、图片懒加载、WebP 格式\n5. 构建优化：Tree Shaking、代码压缩、Scope Hoisting\n6. 运行时优化：避免内存泄漏、合理使用 Web Worker',
    tags: ['性能', '高频'],
    difficulty: 'medium',
  },
  {
    id: 'tech-fe-3',
    category: '技术面试',
    industry: '互联网',
    position: '前端开发',
    question: '什么是闭包？在实际开发中有什么应用？',
    answer: '闭包是指有权访问另一个函数作用域中变量的函数。\n\n应用场景：\n1. 模块化封装：创建私有变量和方法\n2. 防抖/节流函数：保留定时器引用\n3. 柯里化函数：逐步接收参数\n4. React 的 useState/useEffect 等 Hook 底层原理也依赖闭包\n\n注意事项：闭包可能导致内存泄漏，注意及时释放引用。',
    tags: ['JavaScript', '高频'],
    difficulty: 'easy',
  },
  {
    id: 'tech-fe-4',
    category: '技术面试',
    industry: '新能源/车企',
    position: '前端开发',
    question: '浏览器的 Event Loop 机制是什么？',
    answer: '浏览器 Event Loop 包含：\n1. 执行同步代码（Call Stack）\n2. 异步任务分为宏任务（MacroTask）和微任务（MicroTask）\n3. 当前 Call Stack 清空后，先执行所有微任务（Promise.then、MutationObserver）\n4. 然后执行一个宏任务（setTimeout、setInterval、I/O、UI 渲染）\n5. 循环往复\n\n关键：微任务优先级高于宏任务，且同类型任务按队列顺序执行。',
    tags: ['JavaScript', '高频'],
    difficulty: 'hard',
  },

  // ===== 技术面试 - 后端 =====
  {
    id: 'tech-be-1',
    category: '技术面试',
    industry: '互联网',
    position: '后端开发',
    question: 'Redis 常见的数据结构有哪些？分别适用什么场景？',
    answer: '1. String：缓存、计数器、分布式锁（SETNX）\n2. Hash：存储对象（用户信息、商品信息）\n3. List：消息队列、时间线（LPUSH + LRANGE）\n4. Set：去重、共同关注（SINTER）、随机抽奖（SRANDMEMBER）\n5. Sorted Set：排行榜、延迟队列（ZRANGEBYSCORE）\n6. Bitmap：签到统计、用户在线状态\n7. HyperLogLog：UV 统计（基数估算，误差 0.81%）\n8. Geo：地理位置（附近的人）',
    tags: ['Redis', '高频'],
    difficulty: 'medium',
  },
  {
    id: 'tech-be-2',
    category: '技术面试',
    industry: '金融',
    position: '后端开发',
    question: '如何保证分布式系统中的一致性？',
    answer: '常见方案：\n1. 强一致性：2PC（两阶段提交）、3PC（三阶段提交）—— 性能差，阻塞\n2. 最终一致性：TCC（Try-Confirm-Cancel）、Saga 模式、本地消息表、最大努力通知\n3. 基于共识：Paxos、Raft（如 etcd、Consul）\n4. 基于版本：MVCC（乐观锁）、CAS（Compare And Swap）\n\n实际选择：根据业务容忍度，大多数场景用最终一致性即可。',
    tags: ['分布式', '高频'],
    difficulty: 'hard',
  },

  // ===== 技术面试 - 产品经理 =====
  {
    id: 'tech-pm-1',
    category: '技术面试',
    industry: '互联网',
    position: '产品经理',
    question: '如何评估一个功能是否需要开发？',
    answer: '评估框架：\n1. 用户价值：解决多少用户的什么问题？ pain point 有多痛？\n2. 商业价值：能带来的收入、留存提升、成本降低？\n3. 技术成本：开发周期、维护成本、技术债务？\n4. 战略契合度：是否符合公司当前战略方向？\n5. 替代方案：是否有更低成本的实现方式？\n\n常用方法：ICE 评分（Impact × Confidence × Ease）、RICE 评分（Reach × Impact × Confidence ÷ Effort）。',
    tags: ['决策', '高频'],
    difficulty: 'medium',
  },
  {
    id: 'tech-pm-2',
    category: '技术面试',
    industry: '电商',
    position: '产品经理',
    question: '如何做竞品分析？',
    answer: '分析维度：\n1. 功能层：核心功能对比、功能覆盖度、差异化功能\n2. 体验层：交互流程、视觉设计、信息架构\n3. 数据层：用户规模、活跃度、增长率、市场份额\n4. 商业层：盈利模式、定价策略、推广渠道\n5. 战略层：产品定位、目标人群、发展阶段\n\n输出：SWOT 分析表 + 功能矩阵图 + 可借鉴点清单。',
    tags: ['分析'],
    difficulty: 'medium',
  },

  // ===== 技术面试 - 测试 =====
  {
    id: 'tech-qa-1',
    category: '技术面试',
    industry: '互联网',
    position: '测试工程师',
    question: '接口测试的核心关注点有哪些？',
    answer: '1. 功能正确性：请求参数、响应数据是否符合预期\n2. 边界值：空值、超长字符串、特殊字符、极值\n3. 异常处理：超时、404/500、鉴权失败、参数缺失\n4. 性能指标：响应时间、并发承载、吞吐量\n5. 安全性：SQL 注入、XSS、越权访问、敏感信息加密\n6. 幂等性：重复提交是否产生副作用\n7. 兼容性：不同版本、不同环境的一致性\n\n工具：Postman、JMeter、Charles、Python + Requests。',
    tags: ['接口测试', '高频'],
    difficulty: 'medium',
  },
  {
    id: 'tech-qa-2',
    category: '技术面试',
    industry: '金融',
    position: '测试工程师',
    question: '自动化测试框架怎么选型？',
    answer: '选型因素：\n1. 技术栈匹配：Java → TestNG/JUnit + Selenium；Python → Pytest + Playwright\n2. 团队能力：维护成本、学习曲线、社区生态\n3. 测试类型：UI 自动化（Selenium/Playwright/Cypress）、接口（RestAssured/Requests）、单元（Jest/JUnit）\n4. CI/CD 集成：是否支持 Jenkins/GitLab CI、Allure 报告\n5. 可维护性：Page Object 模式、数据驱动、关键字驱动\n\n建议：接口自动化 ROI 最高，优先做；UI 自动化维护成本高，聚焦核心链路。',
    tags: ['自动化', '高频'],
    difficulty: 'medium',
  },

  // ===== 技术面试 - 运维 =====
  {
    id: 'tech-ops-1',
    category: '技术面试',
    industry: '互联网',
    position: '运维工程师',
    question: 'Kubernetes 中 Pod 的调度策略有哪些？',
    answer: '核心策略：\n1. nodeSelector：按标签选择节点\n2. Affinity/Anti-Affinity：节点亲和性、Pod 亲和性、Pod 反亲和性\n3. Taints & Tolerations：节点污点 + Pod 容忍度（如 master 节点默认有 NoSchedule）\n4. Priority & Preemption：优先级 + 抢占低优先级 Pod\n5. Topology Spread Constraints：跨拓扑域均匀分布\n6. Scheduler Extender：自定义调度逻辑\n\n常用场景：负载均衡分布、高可用部署（跨 AZ）、资源隔离（GPU/SSD 节点）。',
    tags: ['K8s', '高频'],
    difficulty: 'hard',
  },

  // ===== 技术面试 - 数据分析 =====
  {
    id: 'tech-da-1',
    category: '技术面试',
    industry: '电商',
    position: '数据分析师',
    question: '如何衡量一个推荐系统的效果？',
    answer: '评估指标：\n1. 准确率：Precision@K、Recall@K、F1、MAP、NDCG\n2. 覆盖率：长尾商品曝光占比、用户覆盖度\n3. 多样性：推荐结果的类目分布、新颖度\n4. 商业指标：点击率 CTR、转化率 CVR、人均 GMV、留存率\n5. A/B 测试：流量分组、显著性检验（t-test、χ²）\n\n注意：线上 A/B 测试是最可靠的评估方式，离线指标仅供参考。',
    tags: ['推荐系统', '高频'],
    difficulty: 'hard',
  },

  // ===== 项目经历 =====
  {
    id: 'proj-1',
    category: '项目经历',
    industry: '互联网',
    position: '前端开发',
    question: '请介绍一个你觉得最有挑战性的项目',
    answer: '建议用 STAR 法回答：\nSituation（背景）：项目是什么，团队规模，你的角色\nTask（任务）：你面临的核心挑战或目标\nAction（行动）：你做了什么，技术方案是什么，为什么这样选\nResult（结果）：量化成果（用户数、性能提升、收入等）\n\n注意：选择能体现你技术深度和解决问题能力的项目。',
    tags: ['高频', '必问'],
    difficulty: 'medium',
  },
  {
    id: 'proj-2',
    category: '项目经历',
    industry: '金融',
    position: '后端开发',
    question: '项目中遇到的最大困难是什么？如何解决的？',
    answer: '选择一个真实的技术难题（而非沟通问题）。\n\n回答框架：\n1. 描述问题：具体场景、影响范围\n2. 分析原因：技术层面的根因分析\n3. 解决方案：你的方案设计过程、对比了哪些方案、为什么选这个\n4. 最终效果：量化结果，以及从中获得的经验\n\n重点体现你的分析能力和执行力。',
    tags: ['高频'],
    difficulty: 'medium',
  },
  {
    id: 'proj-3',
    category: '项目经历',
    industry: '电商',
    position: '产品经理',
    question: '如果让你重新做一次这个项目，你会怎么做？',
    answer: '这道题考察反思能力。可以从以下角度回答：\n1. 技术选型：当时选择的技术栈是否有更好的替代方案\n2. 架构设计：是否有更简洁、更易维护的方案\n3. 团队协作：沟通方式、代码规范是否有改进空间\n4. 风险管理：是否能更早发现和规避某些风险\n\n注意：不要全盘否定原方案，而是展示成长和思考深度。',
    tags: ['反思'],
    difficulty: 'medium',
  },

  // ===== 行为面试 =====
  {
    id: 'beh-1',
    category: '行为面试',
    industry: '互联网',
    position: '前端开发',
    question: '描述一次你和同事发生冲突的经历，怎么处理的？',
    answer: '用 STAR 法回答，重点展示：\n1. 冲突的原因是什么（技术分歧、优先级不同等）\n2. 你的态度：先倾听对方观点，而非直接反驳\n3. 你的做法：寻找数据支撑、邀请第三方评审、妥协方案等\n4. 结果：达成了什么共识，学到了什么\n\n不要选过于情绪化的冲突，也不要说"从没和同事冲突过"——这反而显得不真诚。',
    tags: ['团队协作', '高频'],
    difficulty: 'medium',
  },
  {
    id: 'beh-2',
    category: '行为面试',
    industry: '新能源/车企',
    position: '后端开发',
    question: '描述一次你在压力下完成工作的经历',
    answer: '回答框架：\n1. 压力来源：时间紧、需求变更、资源不足等\n2. 你的应对：优先级排序、与相关方沟通、加班或寻求支持\n3. 最终结果：按时交付，质量达标\n4. 经验总结：如何在今后更好地管理压力\n\n重点体现你的抗压能力和问题解决能力。',
    tags: ['压力', '高频'],
    difficulty: 'easy',
  },
  {
    id: 'beh-3',
    category: '行为面试',
    industry: '教育',
    position: '产品经理',
    question: '如果领导安排了一个你认为不合理的任务，你会怎么办？',
    answer: '展示成熟的工作态度：\n1. 先执行，不直接拒绝：理解领导可能有更多信息或更高视角\n2. 私下沟通：选择合适的时机，用数据表达你的顾虑\n3. 提出替代方案：不只说"不行"，而是说"我觉得可以这样"\n4. 尊重最终决定：如果领导坚持，全力以赴执行\n\n不要表现出消极对抗的态度。',
    tags: ['沟通'],
    difficulty: 'medium',
  },

  // ===== 场景面试 =====
  {
    id: 'scene-1',
    category: '场景面试',
    industry: '互联网',
    position: '前端开发',
    question: '如果一个页面加载很慢，你会如何排查？',
    answer: '排查步骤：\n1. 打开 Network 面板，查看资源加载瀑布流，定位慢资源\n2. 查看 Performance 面板，分析主线程执行耗时\n3. 检查是否存在阻塞渲染的 JS/CSS（如未优化的第三方库）\n4. 分析 TTFB、FCP、LCP、CLS 等核心指标\n5. 检查后端接口响应时间\n6. 查看是否有内存泄漏\n\n优化方向：按需加载、缓存、压缩、CDN、服务端渲染等。',
    tags: ['性能', '排查'],
    difficulty: 'medium',
  },
  {
    id: 'scene-2',
    category: '场景面试',
    industry: '电商',
    position: '后端开发',
    question: '设计一个前端埋点系统，你会怎么设计？',
    answer: '核心设计要点：\n1. 采集层：无痕埋点（自动收集页面 PV/UV/点击）、代码埋点（精确业务事件）\n2. 上报策略：批量上报 + 防抖、错误恢复（LocalStorage 缓存 + 重试）\n3. 性能保障：Web Worker 处理、压缩上报数据、采样上报\n4. 数据结构：事件名、参数、时间戳、页面路径、用户 ID、设备信息\n5. 可视化：提供 SDK 和可视化配置平台\n\n可拓展：AB 实验、热力图、漏斗分析等。',
    tags: ['系统设计'],
    difficulty: 'hard',
  },
];

/* ===== 面试技巧数据 ===== */
const TIPS = [
  {
    icon: 'ri-time-line',
    title: '时间管理',
    desc: '自我介绍控制在 1-2 分钟，每个问题回答 2-3 分钟。不要过度展开，面试官会追问。',
  },
  {
    icon: 'ri-speak-line',
    title: '表达技巧',
    desc: '使用 STAR 法回答经历类问题。先说结论，再说过程。用"首先...其次...最后..."结构化表达。',
  },
  {
    icon: 'ri-questionnaire-line',
    title: '反问环节',
    desc: '准备 2-3 个高质量问题：团队技术栈、项目挑战、晋升路径等。不要只问薪资和加班。',
  },
  {
    icon: 'ri-user-search-line',
    title: '提前调研',
    desc: '了解公司产品、技术栈、最近新闻。面试中自然提及，会让面试官觉得你是认真准备的。',
  },
  {
    icon: 'ri-draft-line',
    title: '简历熟悉度',
    desc: '简历上的每一个字都要经得起追问。不要写自己不熟悉的技术，不要夸大项目成果。',
  },
  {
    icon: 'ri-emotion-line',
    title: '情绪管理',
    desc: '遇到不会的问题不要慌，可以说"这个我没有深入了解过，但我推测..."展示思考过程。',
  },
];

/* ===== 面试模拟数据 ===== */
const MOCK_INTERVIEW: Question[] = [
  QUESTIONS[0], // 自我介绍
  QUESTIONS[3], // useEffect
  QUESTIONS[6], // 最有挑战性的项目
  QUESTIONS[9], // 和同事冲突
  QUESTIONS[12], // 页面加载慢
  {
    id: 'end',
    category: '结束',
    industry: '互联网',
    position: '前端开发',
    question: '你有什么想问我们的吗？',
    answer: '这是展示你对岗位兴趣的机会！可以问：\n1. 团队目前面临的最大技术挑战是什么？\n2. 这个岗位的短期目标和长期期望？\n3. 团队的技术成长路径是怎样的？\n\n避免只问薪资、加班、年假等福利问题。',
    tags: ['结束'],
    difficulty: 'easy',
  },
];

/* ===== 子组件 ===== */
function DifficultyBadge({ d }: { d: 'easy' | 'medium' | 'hard' }) {
  const config = {
    easy: { label: '简单', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    medium: { label: '中等', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    hard: { label: '困难', color: 'bg-red-50 text-red-600 border-red-200' },
  };
  const c = config[d];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${c.color}`}>{c.label}</span>
  );
}

/* ===== 面试准备页面 ===== */
export default function InterviewPrepPage() {
  const [activeSection, setActiveSection] = useState<'questions' | 'mock' | 'tips' | 'review'>('questions');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('全部');
  const [selectedPosition, setSelectedPosition] = useState<string>('全部');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Mock interview states
  const [mockIndex, setMockIndex] = useState(0);
  const [mockAnswers, setMockAnswers] = useState<Record<number, string>>({});
  const [mockShowAnswer, setMockShowAnswer] = useState(false);
  const [mockCompleted, setMockCompleted] = useState(false);
  const mockTextRef = useRef<HTMLTextAreaElement>(null);

  const filteredQuestions = QUESTIONS.filter((q) => {
    const matchIndustry = selectedIndustry === '全部' || q.industry === selectedIndustry;
    const matchPosition = selectedPosition === '全部' || q.position === selectedPosition;
    return matchIndustry && matchPosition;
  });

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleMockNext = () => {
    if (mockIndex < MOCK_INTERVIEW.length - 1) {
      setMockIndex(mockIndex + 1);
      setMockShowAnswer(false);
    } else {
      setMockCompleted(true);
    }
  };

  const handleMockPrev = () => {
    if (mockIndex > 0) {
      setMockIndex(mockIndex - 1);
      setMockShowAnswer(false);
    }
  };

  const handleMockRestart = () => {
    setMockIndex(0);
    setMockAnswers({});
    setMockShowAnswer(false);
    setMockCompleted(false);
  };

  useEffect(() => {
    if (activeSection === 'mock') {
      setMockIndex(0);
      setMockShowAnswer(false);
      setMockCompleted(false);
    }
  }, [activeSection]);

  return (
    <div className="min-h-[calc(100vh-56px)]">
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
            <i className="ri-chat-quote-line" />
            全面备战面试
          </div>
          <h1 className="text-2xl font-black text-slate-900">面试题库 + 模拟问答</h1>
          <p className="text-sm font-medium text-slate-500">高频面试题、模拟问答练习、面试技巧锦囊，集中在一个工作区完成。</p>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-8 mx-auto">
          {[
            { key: 'questions' as const, label: '面试题库', icon: 'ri-book-2-line' },
            { key: 'mock' as const, label: '模拟面试', icon: 'ri-chat-voice-line' },
            { key: 'tips' as const, label: '面试技巧', icon: 'ri-lightbulb-line' },
            { key: 'review' as const, label: '面试复盘', icon: 'ri-file-list-3-line' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`whitespace-nowrap px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                activeSection === tab.key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <i className={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== 面试题库 ===== */}
        {activeSection === 'questions' && (
          <div>
            {/* Industry + Position Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              {/* Industry Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-500">行业</span>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      onClick={() => { setSelectedIndustry(ind); setExpandedId(null); }}
                      className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        selectedIndustry === ind
                          ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15'
                          : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {ind}
                      {ind !== '全部' && (
                        <span className="ml-1.5 text-xs opacity-70">
                          ({QUESTIONS.filter((q) => q.industry === ind).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Position Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-500">岗位</span>
                <div className="flex flex-wrap gap-2">
                  {POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      onClick={() => { setSelectedPosition(pos); setExpandedId(null); }}
                      className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        selectedPosition === pos
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-500/15'
                          : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {pos}
                      {pos !== '全部' && (
                        <span className="ml-1.5 text-xs opacity-70">
                          ({QUESTIONS.filter((q) => q.position === pos).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Result count */}
            <div className="text-sm text-slate-400 mb-4">
              共 <span className="font-semibold text-slate-700">{filteredQuestions.length}</span> 道题目
              {selectedIndustry !== '全部' && (
                <span className="ml-1">· 行业 <span className="text-slate-700 font-semibold">{selectedIndustry}</span></span>
              )}
              {selectedPosition !== '全部' && (
                <span className="ml-1">· 岗位 <span className="text-slate-700 font-semibold">{selectedPosition}</span></span>
              )}
            </div>

            {/* Questions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredQuestions.map((q) => {
                const isExpanded = expandedId === q.id;
                return (
                  <div
                    key={q.id}
                    className={`bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all duration-300 ${
                      isExpanded ? 'shadow-md shadow-slate-200/60' : 'hover:shadow-sm hover:shadow-slate-200/50'
                    }`}
                  >
                    <button
                      onClick={() => toggleExpand(q.id)}
                      className="w-full text-left p-5 flex items-start gap-3 cursor-pointer"
                    >
                      <div className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl flex-shrink-0">
                        <i className="ri-question-line text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-slate-400">{q.category}</span>
                          <DifficultyBadge d={q.difficulty} />
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-full text-xs border border-slate-100">
                            {q.industry}
                          </span>
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-xs border border-amber-100">
                            {q.position}
                          </span>
                          {q.tags.map((t) => (
                            <span key={t} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-full text-xs border border-slate-100">
                              {t}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm font-semibold text-slate-800">{q.question}</p>
                      </div>
                      <div className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 flex-shrink-0">
                        <i className={isExpanded ? 'ri-arrow-up-s-line text-lg' : 'ri-arrow-down-s-line text-lg'} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 pt-0">
                        <div className="border-t border-slate-100 pt-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className="w-5 h-5 flex items-center justify-center text-emerald-500">
                              <i className="ri-lightbulb-line" />
                            </div>
                            <span className="text-xs font-bold text-slate-600">参考答案</span>
                          </div>
                          <pre className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed font-sans bg-slate-50 rounded-xl p-4">
                            {q.answer}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {filteredQuestions.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 flex items-center justify-center bg-slate-50 rounded-2xl mx-auto mb-4">
                  <i className="ri-inbox-line text-slate-300 text-2xl" />
                </div>
                <p className="text-sm text-slate-400">该筛选条件下暂无题目</p>
                <p className="text-xs text-slate-400 mt-1">试试切换行业或岗位</p>
              </div>
            )}
          </div>
        )}

        {/* ===== 模拟面试 ===== */}
        {activeSection === 'mock' && (
          <div className="max-w-3xl mx-auto">
            {!mockCompleted ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50 overflow-hidden">
                {/* Progress Header */}
                <div className="px-8 py-5 border-b border-slate-50 bg-gradient-to-r from-white to-slate-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">模拟面试</span>
                    <span className="text-xs text-slate-500">
                      第 {mockIndex + 1} / {MOCK_INTERVIEW.length} 题
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-slate-700 to-slate-800 rounded-full transition-all duration-500"
                      style={{ width: `${((mockIndex + 1) / MOCK_INTERVIEW.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="p-8">
                  {/* Question */}
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 flex items-center justify-center bg-slate-900 rounded-2xl flex-shrink-0 shadow-lg shadow-slate-900/15">
                      <i className="ri-user-voice-line text-white text-lg" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-1">
                        {MOCK_INTERVIEW[mockIndex].category}
                        {MOCK_INTERVIEW[mockIndex].tags.includes('必问') && (
                          <span className="ml-2 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200">必问</span>
                        )}
                      </p>
                      <p className="text-lg font-bold text-slate-800 leading-relaxed">
                        {MOCK_INTERVIEW[mockIndex].question}
                      </p>
                    </div>
                  </div>

                  {/* Answer Input */}
                  <div className="mb-6">
                    <label className="text-xs font-semibold text-slate-500 mb-2 block flex items-center gap-1.5">
                      <i className="ri-edit-line" />
                      你的回答（建议先思考，写出要点）
                    </label>
                    <textarea
                      ref={mockTextRef}
                      value={mockAnswers[mockIndex] || ''}
                      onChange={(e) => setMockAnswers({ ...mockAnswers, [mockIndex]: e.target.value })}
                      placeholder="在此输入你的回答思路...&#10;&#10;建议用 STAR 法：Situation → Task → Action → Result"
                      rows={5}
                      className="w-full border-2 border-slate-200 rounded-xl p-4 text-sm text-slate-700 placeholder-slate-400 bg-white outline-none focus:border-amber-400 focus:shadow-md focus:shadow-amber-500/10 transition-all resize-none leading-relaxed"
                    />
                    <p className="text-xs text-slate-400 mt-1.5 text-right">
                      {(mockAnswers[mockIndex] || '').length} 字
                    </p>
                  </div>

                  {/* Show Answer */}
                  {mockShowAnswer && (
                    <div className="mb-6 animate-[fadeIn_0.3s_ease]">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-5 h-5 flex items-center justify-center text-emerald-500">
                          <i className="ri-lightbulb-line" />
                        </div>
                        <span className="text-xs font-bold text-slate-600">参考答案</span>
                      </div>
                      <pre className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed font-sans bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                        {MOCK_INTERVIEW[mockIndex].answer}
                      </pre>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => setMockShowAnswer(!mockShowAnswer)}
                      className="whitespace-nowrap flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-600 transition-all cursor-pointer"
                    >
                      <i className={mockShowAnswer ? 'ri-eye-off-line' : 'ri-eye-line'} />
                      {mockShowAnswer ? '隐藏答案' : '查看答案'}
                    </button>
                    <div className="flex-1" />
                    {mockIndex > 0 && (
                      <button
                        onClick={handleMockPrev}
                        className="whitespace-nowrap flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
                      >
                        <i className="ri-arrow-left-line" />
                        上一题
                      </button>
                    )}
                    <button
                      onClick={handleMockNext}
                      className="whitespace-nowrap flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer shadow-lg shadow-slate-900/15"
                    >
                      {mockIndex < MOCK_INTERVIEW.length - 1 ? (
                        <>
                          下一题
                          <i className="ri-arrow-right-line" />
                        </>
                      ) : (
                        <>
                          完成面试
                          <i className="ri-check-line" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Completed State */
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50 p-10 text-center">
                <div className="w-20 h-20 flex items-center justify-center bg-emerald-500 rounded-2xl mx-auto mb-5 shadow-lg shadow-emerald-500/25">
                  <i className="ri-trophy-line text-white text-3xl" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">模拟面试完成！</h3>
                <p className="text-sm text-slate-500 mb-6">
                  你已完成 {MOCK_INTERVIEW.length} 道题的练习。建议对照参考答案，优化你的回答。
                </p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-slate-800">{MOCK_INTERVIEW.length}</p>
                    <p className="text-xs text-slate-500 mt-1">总题数</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-emerald-600">
                      {Object.values(mockAnswers).filter((a) => a.trim().length > 10).length}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">已作答</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-amber-600">
                      {Math.round(
                        Object.values(mockAnswers).reduce((sum, a) => sum + a.length, 0) /
                          Math.max(Object.values(mockAnswers).filter((a) => a.trim()).length, 1),
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">平均字数</p>
                  </div>
                </div>

                <button
                  onClick={handleMockRestart}
                  className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-lg shadow-slate-900/15"
                >
                  <i className="ri-refresh-line" />
                  再来一次
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== 面试技巧 ===== */}
        {activeSection === 'tips' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
              {TIPS.map((tip, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md hover:shadow-slate-200/50 transition-all duration-300"
                >
                  <div className="w-12 h-12 flex items-center justify-center bg-amber-50 rounded-2xl mb-4">
                    <i className={`${tip.icon} text-amber-500 text-xl`} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mb-2">{tip.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{tip.desc}</p>
                </div>
              ))}
            </div>

            {/* Interview Checklist */}
            <div className="bg-white rounded-2xl border border-slate-100 p-8">
              <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
                <i className="ri-checkbox-multiple-line text-emerald-500" />
                面试前检查清单
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  '了解公司产品和业务方向',
                  '熟悉 JD 中的每一项要求',
                  '准备好自我介绍（中英文各一份）',
                  '回顾简历上的每个项目，准备好被追问',
                  '提前查好面试地点/准备好线上面试环境',
                  '准备 2-3 个反问问题',
                  '技术题复习：数据结构、算法、框架原理',
                  '行为题准备：至少 3 个 STAR 案例',
                  '着装得体，提前 10 分钟到场',
                  '带好简历打印件和笔记本',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="w-6 h-6 flex items-center justify-center bg-white rounded-full border border-slate-200 text-xs text-slate-400 font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <span className="text-sm text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== 面试复盘 ===== */}
        {activeSection === 'review' && (
          <InterviewReview />
        )}

      </main>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
