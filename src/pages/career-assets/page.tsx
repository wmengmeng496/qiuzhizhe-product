import { useMemo, useRef, useState } from 'react';
import { generateCareerPhoto } from '@/lib/career-assets-service';

type ActiveModule = 'photo' | 'card';
type Gender = 'male' | 'female';
type PhotoStyle = 'haimati' | 'finance' | 'tech' | 'natural' | 'creative';
type CardTemplate = 'interview' | 'referral' | 'networking' | 'campus';
type CardTone = 'ink' | 'blue' | 'green' | 'warm';

const PHOTO_STYLES: Array<{
  value: PhotoStyle;
  label: string;
  icon: string;
  description: string;
  outfit: Record<Gender, string>;
  scene: string;
}> = [
  {
    value: 'haimati',
    label: '海马体证件风',
    icon: 'ri-camera-lens-line',
    description: '柔和布光、浅色背景、干净亲和',
    outfit: { male: '深色西装或白衬衫', female: '浅色西装或通勤衬衫' },
    scene: '适合简历头像、求职平台和面试资料',
  },
  {
    value: 'finance',
    label: '商务金融风',
    icon: 'ri-bank-card-line',
    description: '稳重背景、利落西装、可信赖气质',
    outfit: { male: '深蓝西装配白衬衫', female: '深色西装配低饱和内搭' },
    scene: '适合咨询、金融、运营和管理岗',
  },
  {
    value: 'tech',
    label: '科技简洁风',
    icon: 'ri-code-box-line',
    description: '浅灰背景、清爽服装、理性专业',
    outfit: { male: '纯色衬衫或简洁夹克', female: '简洁衬衫或针织外套' },
    scene: '适合研发、产品、数据和设计岗',
  },
  {
    value: 'natural',
    label: '自然亲和风',
    icon: 'ri-leaf-line',
    description: '自然光感、轻商务、沟通感更强',
    outfit: { male: '浅色衬衫或休闲西装', female: '浅色通勤上衣或西装外套' },
    scene: '适合销售、客服、HR 和客户成功',
  },
  {
    value: 'creative',
    label: '创意品牌风',
    icon: 'ri-palette-line',
    description: '质感背景、轻松姿态、个人辨识度',
    outfit: { male: '有层次的深浅搭配', female: '有设计感的简洁通勤装' },
    scene: '适合品牌、内容、设计和自由职业',
  },
];

const CARD_TEMPLATES: Array<{
  value: CardTemplate;
  label: string;
  icon: string;
  scene: string;
  tagline: string;
  cta: string;
}> = [
  {
    value: 'interview',
    label: '面试递交',
    icon: 'ri-briefcase-4-line',
    scene: '面试结束后留下联系方式和在线简历入口',
    tagline: 'React / TypeScript / 前端工程化',
    cta: '扫码查看在线简历',
  },
  {
    value: 'referral',
    label: '内推沟通',
    icon: 'ri-user-shared-line',
    scene: '朋友或前同事帮忙转给招聘方',
    tagline: '前端开发工程师，关注业务增长与交付质量',
    cta: '加微信沟通岗位匹配',
  },
  {
    value: 'networking',
    label: '线下社交',
    icon: 'ri-chat-smile-2-line',
    scene: '招聘会、行业活动、咖啡聊机会',
    tagline: '可快速对齐岗位需求，提供作品集与项目案例',
    cta: '添加联系人，后续发送作品集',
  },
  {
    value: 'campus',
    label: '校招投递',
    icon: 'ri-graduation-cap-line',
    scene: '宣讲会、校招摊位、导师推荐',
    tagline: '计算机相关背景，项目经历扎实，学习速度快',
    cta: '扫码获取简历与项目经历',
  },
];

const CARD_TONES: Array<{ value: CardTone; label: string; color: string }> = [
  { value: 'ink', label: '黑白极简', color: 'bg-slate-950' },
  { value: 'blue', label: '专业蓝', color: 'bg-blue-600' },
  { value: 'green', label: '成长绿', color: 'bg-emerald-600' },
  { value: 'warm', label: '暖白商务', color: 'bg-amber-500' },
];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function getPhotoStyle(style: PhotoStyle) {
  return PHOTO_STYLES.find((item) => item.value === style) || PHOTO_STYLES[0];
}

function getCardTemplate(template: CardTemplate) {
  return CARD_TEMPLATES.find((item) => item.value === template) || CARD_TEMPLATES[0];
}

function buildCareerPhotoPrompt(input: {
  gender: Gender;
  style: ReturnType<typeof getPhotoStyle>;
}) {
  const genderText = input.gender === 'male' ? 'male candidate' : 'female candidate';
  return [
    `Use the uploaded photo as the identity reference for the ${genderText}.`,
    'Create a formal professional headshot for job search, resume profile, interview material, and recruiting platforms.',
    'Preserve the same face identity, facial features, face shape, age impression, and natural expression from the reference image.',
    `Replace casual clothing and background with: ${input.style.outfit[input.gender]}; ${input.style.description}.`,
    'Half-body portrait, upright posture, clean composition, realistic photography, soft studio lighting, natural skin texture, high-end but not overly retouched.',
    'Plain clean background, no logo, no text, no watermark, no ID card frame, no exaggerated beauty filter, no cartoon style.',
    `Style direction: ${input.style.label}. Use case: ${input.style.scene}.`,
  ].join('\n');
}

export default function CareerAssetsPage() {
  const [activeModule, setActiveModule] = useState<ActiveModule>('photo');
  const [gender, setGender] = useState<Gender>('female');
  const [photoStyle, setPhotoStyle] = useState<PhotoStyle>('haimati');
  const [cardTemplate, setCardTemplate] = useState<CardTemplate>('interview');
  const [cardTone, setCardTone] = useState<CardTone>('ink');
  const [photoUrl, setPhotoUrl] = useState('');
  const [generatedPhotoUrl, setGeneratedPhotoUrl] = useState('');
  const [photoModel, setPhotoModel] = useState('');
  const [photoGenerationMode, setPhotoGenerationMode] = useState('');
  const [generatedPhoto, setGeneratedPhoto] = useState(false);
  const [generatingPhoto, setGeneratingPhoto] = useState(false);
  const [generatingCard, setGeneratingCard] = useState(false);
  const [toast, setToast] = useState('');
  const [scenario, setScenario] = useState('面试结束后，希望对方扫码看简历，也可以加微信继续沟通岗位。');
  const [profile, setProfile] = useState({
    name: '王同学',
    title: '前端开发工程师',
    phone: '138-0000-0000',
    email: 'wang@example.com',
    city: '上海',
    wechat: 'wang-career',
    tagline: CARD_TEMPLATES[0].tagline,
    cta: CARD_TEMPLATES[0].cta,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const activeStyle = getPhotoStyle(photoStyle);
  const activeTemplate = getCardTemplate(cardTemplate);

  const cardClasses = useMemo(() => {
    if (cardTone === 'blue') return 'border-blue-100 bg-blue-50 text-blue-950';
    if (cardTone === 'green') return 'border-emerald-100 bg-emerald-50 text-emerald-950';
    if (cardTone === 'warm') return 'border-amber-100 bg-amber-50 text-stone-950';
    return 'border-slate-200 bg-white text-slate-950';
  }, [cardTone]);

  const accentClasses = useMemo(() => {
    if (cardTone === 'blue') return 'bg-blue-600 text-white';
    if (cardTone === 'green') return 'bg-emerald-600 text-white';
    if (cardTone === 'warm') return 'bg-amber-500 text-slate-950';
    return 'bg-slate-950 text-white';
  }, [cardTone]);

  const photoRecipe = useMemo(
    () => [
      `参考图：使用你上传的本人照片`,
      `保留本人五官与脸型`,
      activeStyle.outfit[gender],
      activeStyle.description,
      '半身构图，适合求职头像',
    ],
    [activeStyle, gender],
  );
  const photoPrompt = useMemo(() => buildCareerPhotoPrompt({ gender, style: activeStyle }), [activeStyle, gender]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2000);
  };

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('请上传 JPG、PNG 或 WebP 图片');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast('图片超过 8MB，请压缩后再上传');
      return;
    }
    try {
      setPhotoUrl(await readFileAsDataUrl(file));
      setGeneratedPhotoUrl('');
      setGeneratedPhoto(false);
      setPhotoModel('');
      setPhotoGenerationMode('');
      showToast('本人照片已上传');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片读取失败');
    }
  };

  const generatePhoto = async () => {
    if (!photoUrl) {
      showToast('请先上传一张清晰正脸照片');
      return;
    }
    setGeneratingPhoto(true);
    try {
      const next = await generateCareerPhoto({
        imageDataUrl: photoUrl,
        gender,
        style: photoStyle,
        prompt: photoPrompt,
      });
      setGeneratedPhotoUrl(next.imageUrl);
      setPhotoModel(next.model);
      setPhotoGenerationMode(next.mode === 'edit' ? '参考图生成' : '提示词生成');
      setGeneratedPhoto(true);
      showToast('形象照已生成');
    } catch (error) {
      setGeneratedPhoto(false);
      setGeneratedPhotoUrl('');
      setPhotoGenerationMode('');
      showToast(error instanceof Error ? error.message : '形象照生成失败');
    } finally {
      setGeneratingPhoto(false);
    }
  };

  const updateProfile = (key: keyof typeof profile, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const applyTemplate = (template: CardTemplate) => {
    const nextTemplate = getCardTemplate(template);
    setCardTemplate(template);
    setProfile((current) => ({ ...current, tagline: nextTemplate.tagline, cta: nextTemplate.cta }));
  };

  const generateCardCopy = async () => {
    setGeneratingCard(true);
    await new Promise((resolve) => window.setTimeout(resolve, 800));
    setGeneratingCard(false);
    const sceneText = scenario.trim();
    setProfile((current) => ({
      ...current,
      tagline: sceneText ? `${current.title}，可围绕${sceneText.slice(0, 18)}沟通` : activeTemplate.tagline,
      cta: sceneText.includes('微信') ? '加微信继续沟通' : activeTemplate.cta,
    }));
    showToast('已根据场景调整名片文案');
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-50 text-slate-900 lg:min-h-screen">
      <header className="border-b border-slate-200 bg-white px-5 py-5 md:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-xl font-black tracking-normal text-slate-950">职业形象</h1>
            <p className="mt-1 text-sm font-bold text-slate-400">生成形象照和标准求职名片，用在简历、投递和线下沟通</p>
          </div>
          <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 md:w-[360px]">
            {[
              ['photo', '形象照', 'ri-user-smile-line'],
              ['card', '名片', 'ri-bank-card-2-line'],
            ].map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setActiveModule(value as ActiveModule)}
                className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-black ${
                  activeModule === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <i className={icon} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="grid gap-5 p-5 md:p-8 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="space-y-5">
          {activeModule === 'photo' ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-black">形象照生成</div>
                    <p className="mt-1 text-sm font-bold text-slate-400">上传本人清晰照片，选择风格后保留五官生成职业头像</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
                    >
                      <i className="ri-upload-2-line" />
                      上传本人照
                    </button>
                    <button
                      type="button"
                      onClick={generatePhoto}
                      disabled={generatingPhoto}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-sm font-black text-indigo-700 disabled:opacity-60"
                    >
                      <i className={generatingPhoto ? 'ri-loader-4-line animate-spin' : 'ri-sparkling-line'} />
                      生成形象照
                    </button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadPhoto(file);
                        event.target.value = '';
                      }}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div>
                    <div className="mb-2 text-xs font-black text-slate-500">人物性别</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['female', '女生', 'ri-women-line'],
                        ['male', '男生', 'ri-men-line'],
                      ].map(([value, label, icon]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setGender(value as Gender);
                            setGeneratedPhoto(false);
                            setGeneratedPhotoUrl('');
                            setPhotoModel('');
                            setPhotoGenerationMode('');
                          }}
                          className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-black ${
                            gender === value
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <i className={icon} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-black text-slate-500">参考风格</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {PHOTO_STYLES.map((style) => (
                        <button
                          key={style.value}
                          type="button"
                          onClick={() => {
                            setPhotoStyle(style.value);
                            setGeneratedPhoto(false);
                            setGeneratedPhotoUrl('');
                            setPhotoModel('');
                            setPhotoGenerationMode('');
                          }}
                          className={`rounded-xl border p-4 text-left ${
                            photoStyle === style.value
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-lg">
                              <i className={style.icon} />
                            </span>
                            <div>
                              <div className="text-sm font-black">{style.label}</div>
                              <div className="mt-1 text-xs font-bold opacity-70">{style.description}</div>
                              <div className="mt-2 text-xs font-bold opacity-60">{style.scene}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="font-black">生成规则</div>
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">{activeStyle.label}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {photoRecipe.map((item, index) => (
                    <div key={item} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-xs font-black text-indigo-600">{index + 1}</span>
                      {item}
                    </div>
                  ))}
                </div>
                <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-black text-slate-700">查看内置正式形象照提示词</summary>
                  <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap text-xs font-bold leading-5 text-slate-500">{photoPrompt}</pre>
                </details>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-black">名片场景</div>
                    <p className="mt-1 text-sm font-bold text-slate-400">选择使用场景，再补充一句需求，自动调整名片文案</p>
                  </div>
                  <span className="inline-flex h-8 w-fit items-center rounded-full bg-slate-100 px-3 text-xs font-black text-slate-500">
                    标准尺寸 90mm x 54mm
                  </span>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {CARD_TEMPLATES.map((template) => (
                    <button
                      key={template.value}
                      type="button"
                      onClick={() => applyTemplate(template.value)}
                      className={`rounded-xl border p-4 text-left ${
                        cardTemplate === template.value
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-lg">
                          <i className={template.icon} />
                        </span>
                        <div>
                          <div className="text-sm font-black">{template.label}</div>
                          <div className="mt-1 text-xs font-bold opacity-70">{template.scene}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <label className="mt-5 block text-xs font-black text-slate-500">
                  对话描述使用场景
                  <textarea
                    value={scenario}
                    onChange={(event) => setScenario(event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-300"
                    placeholder="例如：面试后加微信、招聘会扫码留资、朋友内推转给 HR..."
                  />
                </label>
                <button
                  type="button"
                  onClick={generateCardCopy}
                  disabled={generatingCard}
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  <i className={generatingCard ? 'ri-loader-4-line animate-spin' : 'ri-message-3-line'} />
                  生成名片文案
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <div className="mb-4 font-black">联系信息</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ['name', '姓名'],
                    ['title', '职位'],
                    ['phone', '电话'],
                    ['email', '邮箱'],
                    ['city', '城市'],
                    ['wechat', '微信号'],
                    ['tagline', '个人介绍'],
                    ['cta', '行动按钮文案'],
                  ].map(([key, label]) => (
                    <label key={key} className="text-xs font-black text-slate-500">
                      {label}
                      <input
                        value={profile[key as keyof typeof profile]}
                        onChange={(event) => updateProfile(key as keyof typeof profile, event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-300"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {CARD_TONES.map((tone) => (
                    <button
                      key={tone.value}
                      type="button"
                      onClick={() => setCardTone(tone.value)}
                      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-black ${
                        cardTone === tone.value
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full ${tone.color}`} />
                      {tone.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-black">{activeModule === 'photo' ? '形象照预览' : '名片预览'}</div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-600">
                {activeModule === 'photo' ? activeStyle.label : '90 x 54mm'}
              </span>
            </div>

            {activeModule === 'photo' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="relative mx-auto aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {photoUrl ? (
                    <img src={photoUrl} alt="上传的本人照片" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center px-8 text-center text-sm font-bold text-slate-400">
                      <div>
                        <i className="ri-user-3-line text-5xl" />
                        <p className="mt-3">上传清晰正脸照片</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-600">原图</div>
                </div>
                <div className="relative mx-auto aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-100">
                  {generatedPhotoUrl && generatedPhoto ? (
                    <>
                      <img src={generatedPhotoUrl} alt="生成的形象照预览" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-indigo-900/15" />
                    </>
                  ) : (
                    <div className="grid h-full place-items-center px-8 text-center text-sm font-bold text-slate-400">
                      <div>
                        <i className={generatingPhoto ? 'ri-loader-4-line animate-spin text-5xl text-indigo-500' : 'ri-sparkling-2-line text-5xl'} />
                        <p className="mt-3">{generatingPhoto ? '正在生成形象照' : '生成后展示替换效果'}</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white">
                    {photoModel ? `生成图 · ${photoGenerationMode || photoModel}` : '生成图'}
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-white/90 px-3 py-2 text-xs font-black text-slate-700 backdrop-blur">
                    {activeStyle.description} · {activeStyle.outfit[gender]}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`mx-auto aspect-[5/3] w-full max-w-[420px] rounded-xl border p-5 shadow-sm ${cardClasses}`}>
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-2xl font-black tracking-normal">{profile.name || '姓名'}</div>
                      <div className="mt-1 text-sm font-extrabold opacity-70">{profile.title || '职位'}</div>
                    </div>
                    <div className={`grid h-12 w-12 place-items-center rounded-xl ${accentClasses}`}>
                      <i className="ri-briefcase-4-line text-xl" />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-4">
                    <div className="min-w-0 space-y-1.5 text-xs font-bold opacity-80">
                      <div className="truncate"><i className="ri-phone-line mr-2" />{profile.phone || '电话'}</div>
                      <div className="truncate"><i className="ri-mail-line mr-2" />{profile.email || '邮箱'}</div>
                      <div className="truncate"><i className="ri-wechat-line mr-2" />{profile.wechat || '微信号'}</div>
                      <div className="truncate"><i className="ri-map-pin-line mr-2" />{profile.city || '城市'}</div>
                    </div>
                    <div className="grid h-20 w-20 place-items-center rounded-lg border border-current/15 bg-white/70 text-center text-[10px] font-black text-slate-500">
                      微信
                      <br />
                      二维码
                    </div>
                  </div>
                  <div className="border-t border-current/15 pt-3">
                    <div className="line-clamp-1 text-xs font-black opacity-70">{profile.tagline || '个人介绍'}</div>
                    <div className="mt-1 text-xs font-black">{profile.cta || '行动按钮文案'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 font-black">下一步</div>
            {activeModule === 'photo' ? (
              <button
                type="button"
                onClick={generatePhoto}
                disabled={generatingPhoto}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <i className={generatingPhoto ? 'ri-loader-4-line animate-spin' : 'ri-sparkling-line'} />
                生成形象照
              </button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="button"
                  onClick={() => showToast('名片已生成预览')}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm font-black text-white hover:bg-slate-800"
                >
                  <i className="ri-bank-card-2-line" />
                  生成名片
                </button>
                <button
                  type="button"
                  onClick={() => showToast('已复制联系信息')}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  <i className="ri-file-copy-line" />
                  复制联系信息
                </button>
              </div>
            )}
          </div>
        </aside>
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
