import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Download, FileText, Loader2, Paperclip, Sparkles, Upload, Wand2 } from 'lucide-react';
import JSZip from 'jszip';
import { createResumeOptimization, listResumeOptimizations } from '@/lib/backend-service';
import { fetchJobDescription, getMe, getStoredUser, type CurrentUser } from '@/lib/api';
import { extractDocxText } from '@/lib/docx-reader';
import { extractPdfText } from '@/lib/pdf-reader';
import { extractPdfPageImages } from '@/lib/pdf-image-reader';
import { parseMarkedContent, stripMarkers } from '../home/components/ResumePreview';

export type OptimizeMode = 'full' | 'intro' | 'skills' | 'experience' | 'project';

type ModelId = 'server-default' | 'gpt-5.6-sol' | 'gpt-4o' | 'gpt-3.5' | 'gpt-4';

interface OptimizeResult {
  id: string;
  originalContent: string;
  optimizedContent: string;
  highlightedContent?: string | null;
  keywords: string[];
  improvements: string[];
  matchScore: number;
  mode: OptimizeMode;
  model?: string;
  jobTitle?: string | null;
  company?: string | null;
  createdAt: string;
}

interface OptimizationHistoryItem {
  id: string;
  job_title: string | null;
  company: string | null;
  job_requirements: string;
  resume_content: string;
  optimize_mode: OptimizeMode;
  model: string;
  optimized_content: string;
  highlighted_content: string | null;
  keywords: string[];
  improvements: string[];
  match_score: number;
  status: 'completed' | 'failed';
  created_at: string;
}

const MODE_OPTIONS: Array<{ id: OptimizeMode; label: string; hint: string }> = [
  { id: 'full', label: '整体优化', hint: '适合第一次投递' },
  { id: 'project', label: '项目经历', hint: '强化项目贡献' },
  { id: 'experience', label: '工作经历', hint: '突出职责结果' },
  { id: 'skills', label: '技能描述', hint: '重排关键词' },
  { id: 'intro', label: '自我介绍', hint: '用于开场表达' },
];

const MODEL_OPTIONS: Array<{ id: ModelId; name: string; desc: string; locked?: boolean }> = [
  { id: 'server-default', name: '智能默认', desc: '优先使用 GPT-5.6 Sol，失败时自动回退' },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', desc: '高质量简历分析与定向改写' },
  { id: 'gpt-4o', name: 'GPT-4o', desc: '速度和质量均衡' },
  { id: 'gpt-3.5', name: 'GPT-3.5', desc: '基础优化更轻量' },
  { id: 'gpt-4', name: 'GPT-4', desc: '更强推理，部分套餐可用', locked: true },
];

const RESUME_DRAFT_KEY = 'resume_optimizer_draft_v2';

interface ResumeDraft {
  model: ModelId;
  mode: OptimizeMode;
  keywordMatch: boolean;
  resumeContent: string;
  jobRequirements: string;
  jobUrl: string;
  jobSummary: string;
  jobCompany: string;
  jobPosition: string;
  previewTab: 'optimized' | 'original' | 'diff';
  resultContent: string;
  result: OptimizeResult | null;
}

function getFileExtension(name: string) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function cleanText(value: string) {
  return value.split('\u0000').join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeDocxLines(content: string) {
  return stripMarkers(content)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, '').trimEnd());
}

function buildDocxXml(content: string, title = '优化简历') {
  const lines = normalizeDocxLines(content);
  const paragraphs = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return '<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>';
      }
      if (/^#{1,3}\s+/.test(trimmed)) {
        const text = escapeXml(trimmed.replace(/^#{1,3}\s+/, ''));
        return `<w:p><w:pPr><w:spacing w:before="120" w:after="40"/><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
      }
      if (/^(?:-|\*|•)\s+/.test(trimmed)) {
        const text = escapeXml(trimmed.replace(/^(?:-|\*|•)\s+/, ''));
        return `<w:p><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr><w:r><w:t xml:space="preserve">• ${text}</w:t></w:r></w:p>`;
      }
      if (/^>/.test(trimmed)) {
        const text = escapeXml(trimmed.replace(/^>\s*/, ''));
        return `<w:p><w:pPr><w:ind w:left="360"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
      }
      if ((trimmed.startsWith('【') && trimmed.endsWith('】')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        const text = escapeXml(trimmed.split('【').join('').split('】').join('').split('[').join('').split(']').join(''));
        return `<w:p><w:pPr><w:spacing w:before="160" w:after="60"/><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
      }
      const text = escapeXml(trimmed);
      return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14 wp14">
  <w:body>
    <w:p>
      <w:pPr><w:spacing w:before="0" w:after="100"/><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="34"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r>
    </w:p>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function buildDocxBlob(content: string) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.folder('word')?.file('document.xml', buildDocxXml(content));
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  zip.folder('word')?.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:uiPriority w:val="10"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
  </w:style>
</w:styles>`);
  zip.folder('docProps')?.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>优化简历</dc:title>
  <dc:creator>职引简历</dc:creator>
  <cp:lastModifiedBy>职引简历</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);
  zip.folder('docProps')?.file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
</Properties>`);

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openPrintablePdf(content: string, title = '优化简历') {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 18mm; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #0f172a;
      background: #fff;
    }
    .sheet {
      padding: 22px 24px 28px;
      line-height: 1.74;
      font-size: 12.5px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    h1, h2, h3 {
      margin: 20px 0 8px;
      line-height: 1.3;
    }
    h1 { font-size: 22px; margin-top: 0; }
    h2 { font-size: 16px; margin-top: 18px; }
    h3 { font-size: 13px; margin-top: 14px; }
    p { margin: 0 0 8px; }
    .muted { color: #64748b; font-size: 12px; margin-bottom: 12px; }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 18px;
      margin-bottom: 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12px;
      color: #475569;
    }
    .pill {
      display: inline-block;
      margin: 0 6px 6px 0;
      padding: 2px 8px;
      border-radius: 999px;
      background: #eef2ff;
      color: #4338ca;
      font-size: 11px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(title)}</h1>
    <div class="muted">职引简历导出稿</div>
    <div class="meta">
      <div>导出类型：Word / PDF 投递稿</div>
      <div>生成时间：${escapeHtml(new Date().toLocaleString('zh-CN'))}</div>
    </div>
    ${stripMarkers(content)
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '<p>&nbsp;</p>';
        if (/^#{1,3}\s+/.test(trimmed)) return `<h2>${escapeHtml(trimmed.replace(/^#{1,3}\s+/, ''))}</h2>`;
        if ((trimmed.startsWith('【') && trimmed.endsWith('】')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          return `<h3>${escapeHtml(trimmed.split('【').join('').split('】').join('').split('[').join('').split(']').join(''))}</h3>`;
        }
        if (/^\*\*.*\*\*$/.test(trimmed)) {
          return `<p><strong>${escapeHtml(trimmed.replace(/^\*\*|\*\*$/g, ''))}</strong></p>`;
        }
        return `<p>${escapeHtml(trimmed)}</p>`;
      })
      .join('')}
  </div>
  <script>window.onload = () => { window.focus(); window.print(); setTimeout(() => window.close(), 300); };</script>
</body>
</html>`;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=1200');
  if (!win) throw new Error('浏览器阻止了 PDF 打印窗口，请允许弹窗后重试');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

async function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('文件读取失败，请重试'));
    reader.readAsText(file, 'utf-8');
  });
}

async function extractResumeText(file: File) {
  const ext = getFileExtension(file.name);
  if (['.txt', '.md', '.markdown', '.csv', '.json'].includes(ext)) {
    return cleanText(await readTextFile(file));
  }
  if (ext === '.pdf' || file.type.includes('pdf')) return cleanText(await extractPdfText(file));
  if (ext === '.docx' || file.type.includes('wordprocessingml')) return cleanText(await extractDocxText(file));
  if (ext === '.doc') throw new Error('暂不支持旧版 .doc，请另存为 .docx 后上传');
  throw new Error('不支持该文件格式，请上传 PDF、DOCX、TXT、MD、CSV 或 JSON');
}

function canUseModel(user: CurrentUser | null, model: ModelId) {
  if (model === 'server-default') return true;
  if (!user) return model === 'gpt-5.6-sol' || model === 'gpt-4o' || model === 'gpt-3.5';
  if (user.plan === 'free') return model === 'gpt-5.6-sol' || model === 'gpt-4o' || model === 'gpt-3.5';
  if (user.plan === 'pro') return model === 'gpt-5.6-sol' || model === 'gpt-4o' || model === 'gpt-3.5' || model === 'gpt-4';
  return true;
}

export default function ResumeOptimizerPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(() => getStoredUser());
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [model, setModel] = useState<ModelId>('server-default');
  const [mode, setMode] = useState<OptimizeMode>('full');
  const [keywordMatch, setKeywordMatch] = useState(true);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeContent, setResumeContent] = useState('');
  const [resumePageImages, setResumePageImages] = useState<string[]>([]);
  const [jobRequirements, setJobRequirements] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobSummary, setJobSummary] = useState('');
  const [jobCompany, setJobCompany] = useState('');
  const [jobPosition, setJobPosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [resultContent, setResultContent] = useState('');
  const [historyItems, setHistoryItems] = useState<OptimizationHistoryItem[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('上传简历并填写 JD 后即可开始优化');
  const [previewTab, setPreviewTab] = useState<'optimized' | 'original' | 'diff'>('optimized');
  const draftReadyRef = useRef(false);

  useEffect(() => {
    const sync = () => setUser(getStoredUser());
    window.addEventListener('auth-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('auth-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listResumeOptimizations()
      .then((items) => {
        if (!alive) return;
        setHistoryItems(items.slice(0, 5));
      })
      .catch(() => {
        if (!alive) return;
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getMe()
      .then((data) => {
        if (!alive) return;
        setUser(data.user);
        setUsage({
          used: data.usage.resume_optimize_used,
          limit: data.limits.resumeOptimize,
        });
      })
      .catch(() => {
        if (!alive) return;
        setUsage(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_DRAFT_KEY);
      if (!raw) {
        draftReadyRef.current = true;
        return;
      }
      const draft = JSON.parse(raw) as Partial<ResumeDraft>;
      if (draft.model) setModel(draft.model);
      if (draft.mode) setMode(draft.mode);
      if (typeof draft.keywordMatch === 'boolean') setKeywordMatch(draft.keywordMatch);
      if (typeof draft.resumeContent === 'string') setResumeContent(draft.resumeContent);
      if (typeof draft.jobRequirements === 'string') setJobRequirements(draft.jobRequirements);
      if (typeof draft.jobUrl === 'string') setJobUrl(draft.jobUrl);
      if (typeof draft.jobSummary === 'string') setJobSummary(draft.jobSummary);
      if (typeof draft.jobCompany === 'string') setJobCompany(draft.jobCompany);
      if (typeof draft.jobPosition === 'string') setJobPosition(draft.jobPosition);
      if (draft.previewTab) setPreviewTab(draft.previewTab);
      if (draft.result) {
        setResult(draft.result);
        setResultContent(draft.resultContent || draft.result.optimizedContent || '');
      }
    } catch {
      localStorage.removeItem(RESUME_DRAFT_KEY);
    } finally {
      draftReadyRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!draftReadyRef.current) return;
    const draft: ResumeDraft = {
      model,
      mode,
      keywordMatch,
      resumeContent,
      jobRequirements,
      jobUrl,
      jobSummary,
      jobCompany,
      jobPosition,
      previewTab,
      resultContent,
      result,
    };
    localStorage.setItem(RESUME_DRAFT_KEY, JSON.stringify(draft));
  }, [model, mode, keywordMatch, resumeContent, jobRequirements, jobUrl, jobSummary, jobCompany, jobPosition, previewTab, resultContent, result]);

  const allowedModels = useMemo(
    () => MODEL_OPTIONS.filter((option) => canUseModel(user, option.id)),
    [user],
  );

  const selectedModel = useMemo(() => {
    if (allowedModels.some((item) => item.id === model)) return model;
    return allowedModels[0]?.id || 'server-default';
  }, [allowedModels, model]);

  useEffect(() => {
    if (selectedModel !== model) setModel(selectedModel);
  }, [model, selectedModel]);

  const fileLabel = useMemo(() => {
    if (!resumeFile) return '未上传文件';
    return `${resumeFile.name} · ${(resumeFile.size / 1024).toFixed(1)} KB`;
  }, [resumeFile]);

  const keywords = result?.keywords || [];
  const improvements = result?.improvements || [];
  const activeOptimizedContent = result ? resultContent : '';

  const handleChooseFile = async (file: File) => {
    setError('');
    setStatus('正在读取简历文件');
    setResumePageImages([]);
    try {
      const content = await extractResumeText(file);
      const isPdf = getFileExtension(file.name) === '.pdf' || file.type.includes('pdf');
      const pageImages = isPdf && content.length < 120 ? await extractPdfPageImages(file, 3) : [];
      if (content.length < 20 && pageImages.length === 0) {
        throw new Error('简历文本太短，请检查文件是否可读');
      }
      setResumeFile(file);
      setResumeContent(content);
      setResumePageImages(pageImages);
      setStatus(pageImages.length ? `已读取 ${file.name}，AI 将辅助识别图片文本` : `已读取 ${file.name}`);
    } catch (err) {
      setStatus('读取简历失败');
      setError(err instanceof Error ? err.message : '文件读取失败，请重试');
    }
  };

  const handlePickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleChooseFile(file);
    event.target.value = '';
  };

  const handleFetchJob = async () => {
    const url = jobUrl.trim();
    if (!url) {
      setError('先填写 JD 链接');
      return;
    }
    setLoadingJob(true);
    setError('');
    setStatus('正在读取 JD');
    try {
      const job = await fetchJobDescription(url);
      const content = [
        job.company ? `公司：${job.company}` : '',
        job.position ? `岗位：${job.position}` : '',
        job.salary ? `薪资：${job.salary}` : '',
        job.location ? `地点：${job.location}` : '',
        job.content,
      ].filter(Boolean).join('\n\n');
      setJobRequirements(content);
      setJobSummary(`${job.company || '目标公司'} · ${job.position || '目标岗位'}`);
      setJobCompany(job.company || '');
      setJobPosition(job.position || '');
      setStatus('JD 已读取');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JD 读取失败，请重试');
      setStatus('读取 JD 失败');
    } finally {
      setLoadingJob(false);
    }
  };

  const handleOptimize = async () => {
    const resume = resumeContent.trim();
    const jd = jobRequirements.trim();
    if (!resume) {
      setError('请先上传简历文件');
      return;
    }
    if (!jd) {
      setError('请先填写目标岗位 JD');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('正在调用 AI 优化简历');
    try {
      const next = await createResumeOptimization({
        resumeContent: resume,
        jobRequirements: jd,
        optimizeMode: mode,
        model: selectedModel,
        keywordMatch,
        jobTitle: jobPosition,
        company: jobCompany,
        resumePageImages,
      });
      setResult(next);
      setResultContent(next.optimizedContent);
      setHistoryItems((current) => [
        {
          id: next.id,
          job_title: jobPosition || null,
          company: jobCompany || null,
          job_requirements: jd,
          resume_content: resume,
          optimize_mode: mode,
          model: next.model || selectedModel,
          optimized_content: next.optimizedContent,
          highlighted_content: next.highlightedContent || null,
          keywords: next.keywords,
          improvements: next.improvements,
          match_score: next.matchScore,
          status: 'completed',
          created_at: next.createdAt,
        } as OptimizationHistoryItem,
        ...current.filter((item) => item.id !== next.id),
      ].slice(0, 5));
      setPreviewTab('optimized');
      setStatus('简历已优化完成');
      if (usage) {
        setUsage((current) => (current ? { ...current, used: current.used + 1 } : current));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '优化失败，请稍后再试');
      setStatus('AI 优化失败');
    } finally {
      setLoading(false);
    }
  };

  const copyOptimized = async () => {
    if (!activeOptimizedContent) return;
    await navigator.clipboard.writeText(activeOptimizedContent);
    setStatus('优化稿已复制');
  };

  const downloadOptimizedMarkdown = () => {
    if (!activeOptimizedContent) return;
    const blob = new Blob([activeOptimizedContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '优化简历.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadOptimizedDocx = async () => {
    if (!activeOptimizedContent) return;
    const blob = await buildDocxBlob(activeOptimizedContent);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '优化简历.docx';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Word 已下载');
  };

  const downloadOptimizedPdf = () => {
    if (!activeOptimizedContent) return;
    openPrintablePdf(activeOptimizedContent, '优化简历');
  };

  const clearDraft = () => {
    localStorage.removeItem(RESUME_DRAFT_KEY);
    setResult(null);
    setResumeFile(null);
    setResumeContent('');
    setResumePageImages([]);
    setJobRequirements('');
    setJobUrl('');
    setJobSummary('');
    setJobCompany('');
    setJobPosition('');
    setMode('full');
    setModel('server-default');
    setKeywordMatch(true);
    setPreviewTab('optimized');
    setResultContent('');
    setStatus('已清空草稿');
  };

  const applyHistoryItem = (item: OptimizationHistoryItem) => {
    setResumeContent(item.resume_content);
    setJobRequirements(item.job_requirements);
    setJobCompany(item.company || '');
    setJobPosition(item.job_title || '');
    setMode(item.optimize_mode);
    setModel(item.model as ModelId);
    setResult({
      id: item.id,
      originalContent: item.resume_content,
      optimizedContent: item.optimized_content,
      highlightedContent: item.highlighted_content,
      keywords: item.keywords,
      improvements: item.improvements,
      matchScore: item.match_score,
      mode: item.optimize_mode,
      model: item.model,
      jobTitle: item.job_title,
      company: item.company,
      createdAt: item.created_at,
    });
    setResultContent(item.optimized_content);
    setPreviewTab(item.highlighted_content ? 'diff' : 'optimized');
    setStatus('已载入历史记录，可继续编辑');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">简历优化</div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">接入 AI 的简历优化工作页</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">上传 PDF / DOCX / TXT，填入 JD，直接生成可投递版本。</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{status}</span>
            {usage && <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{usage.used}/{usage.limit} 次</span>}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
              <FileText className="h-4 w-4" />
              输入
            </div>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 hover:bg-slate-100"
              >
                <Upload className="h-4 w-4" />
                上传简历
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.markdown,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handlePickFile} />
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">{fileLabel}</div>
              {resumePageImages.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  检测到 PDF 文本层不够完整，将用 GPT 视觉识别页面内容
                </div>
              )}
              <textarea
                value={resumeContent}
                onChange={(e) => setResumeContent(e.target.value)}
                placeholder="也可以直接粘贴简历文本"
                className="min-h-[160px] w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none ring-0 placeholder:text-slate-400 focus:border-indigo-300"
              />
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-black text-slate-900">目标 JD</div>
                <button
                  type="button"
                  onClick={handleFetchJob}
                  disabled={loadingJob}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-950 disabled:opacity-60"
                >
                  {loadingJob ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                  读取 JD
                </button>
              </div>
              <input
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="粘贴 JD 链接（可选）"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={jobCompany}
                  onChange={(e) => setJobCompany(e.target.value)}
                  placeholder="公司（可选）"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
                />
                <input
                  value={jobPosition}
                  onChange={(e) => setJobPosition(e.target.value)}
                  placeholder="岗位（可选）"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
                />
              </div>
              <textarea
                value={jobRequirements}
                onChange={(e) => setJobRequirements(e.target.value)}
                placeholder="粘贴目标岗位 JD"
                className="min-h-[170px] w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-300"
              />
              {jobSummary && <div className="text-xs font-bold text-indigo-600">{jobSummary}</div>}
            </div>

            <div className="mt-5 grid gap-3">
              <div>
                <div className="mb-2 text-sm font-black text-slate-900">优化模式</div>
                <div className="grid grid-cols-2 gap-2">
                  {MODE_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMode(item.id)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        mode === item.id ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-black">{item.label}</div>
                      <div className="text-[11px] font-medium opacity-70">{item.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-black text-slate-900">模型</div>
                <div className="grid gap-2">
                  {MODEL_OPTIONS.map((item) => {
                    const allowed = canUseModel(user, item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!allowed}
                        onClick={() => allowed && setModel(item.id)}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                          model === item.id ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-black">{item.name}</div>
                          {!allowed && <span className="text-[10px] font-black text-rose-500">受限</span>}
                        </div>
                        <div className="text-[11px] font-medium opacity-70">{item.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setKeywordMatch((v) => !v)}
                className={`inline-flex h-11 items-center justify-between rounded-lg border px-3 text-sm font-bold ${
                  keywordMatch ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  智能关键词匹配
                </span>
                <span>{keywordMatch ? '开启' : '关闭'}</span>
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleOptimize}
              disabled={loading}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm font-black text-white disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              开始优化
            </button>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Sparkles className="h-4 w-4" />
                  AI 结果
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">优化结果会直接来自后端模型返回。</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyOptimized}
                  disabled={!activeOptimizedContent}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-slate-950 disabled:opacity-50"
                >
                  复制
                </button>
                <button
                  type="button"
                  onClick={downloadOptimizedMarkdown}
                  disabled={!activeOptimizedContent}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-slate-950 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Markdown
                </button>
                <button
                  type="button"
                  onClick={downloadOptimizedDocx}
                  disabled={!activeOptimizedContent}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-slate-950 disabled:opacity-50"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Word
                </button>
                <button
                  type="button"
                  onClick={downloadOptimizedPdf}
                  disabled={!activeOptimizedContent}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-slate-950 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={clearDraft}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:text-rose-600"
                >
                  清空
                </button>
              </div>
            </div>

            {result ? (
              <div className="mt-4 grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-xs font-black text-slate-600">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('optimized')}
                      className={`rounded-md px-2.5 py-1 ${previewTab === 'optimized' ? 'bg-white text-slate-950 shadow-sm' : ''}`}
                    >
                      优化版
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('original')}
                      className={`rounded-md px-2.5 py-1 ${previewTab === 'original' ? 'bg-white text-slate-950 shadow-sm' : ''}`}
                    >
                      原文
                    </button>
                    {result.highlightedContent && (
                      <button
                        type="button"
                        onClick={() => setPreviewTab('diff')}
                        className={`rounded-md px-2.5 py-1 ${previewTab === 'diff' ? 'bg-white text-slate-950 shadow-sm' : ''}`}
                      >
                        差异
                      </button>
                    )}
                  </div>
                  <div className="max-h-[760px] overflow-auto px-4 py-4">
                    {previewTab === 'diff' && result.highlightedContent ? (
                      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                        {parseMarkedContent(result.highlightedContent)}
                      </div>
                    ) : (
                      <textarea
                        value={previewTab === 'optimized' ? activeOptimizedContent : result.originalContent}
                        onChange={previewTab === 'optimized' ? (e) => setResultContent(e.target.value) : undefined}
                        readOnly={previewTab !== 'optimized'}
                        className={`min-h-[560px] w-full resize-none border-0 bg-transparent text-sm leading-7 text-slate-700 outline-none ${
                          previewTab === 'optimized' ? 'rounded-lg focus:bg-white focus:p-3 focus:ring-1 focus:ring-indigo-200' : ''
                        }`}
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="text-sm font-black text-slate-900">匹配度</div>
                    <div className="mt-3 text-3xl font-black text-emerald-600">{result.matchScore}</div>
                    <div className="mt-1 text-xs font-medium text-slate-500">模型：{result.model || model}</div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="text-sm font-black text-slate-900">关键词</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {keywords.length ? keywords.map((item) => (
                        <span key={item} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                          {item}
                        </span>
                      )) : <span className="text-xs text-slate-400">暂无</span>}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="text-sm font-black text-slate-900">优化点</div>
                    <div className="mt-3 space-y-2">
                      {improvements.length ? improvements.map((item) => (
                        <div key={item} className="rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                          {item}
                        </div>
                      )) : <div className="text-xs text-slate-400">暂无</div>}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="mt-3 text-sm font-black text-slate-900">先上传简历，再开始优化</div>
                <div className="mt-1 text-xs font-medium text-slate-500">右侧会展示 AI 生成的完整优化稿、关键词和修改建议。</div>
              </div>
            )}

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-900">最近优化</div>
              <div className="mt-3 space-y-2">
                {historyItems.length ? historyItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyHistoryItem(item)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-bold text-slate-800">{item.company || '未命名优化'}</div>
                      <span className="shrink-0 text-xs font-black text-emerald-600">{item.match_score}%</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">{item.job_title || MODE_OPTIONS.find((m) => m.id === item.optimize_mode)?.label || '优化记录'}</div>
                  </button>
                )) : <div className="text-xs text-slate-400">暂无历史记录</div>}
              </div>
              {result?.optimizedContent && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  当前结果支持直接编辑，导出会使用你最后修改的内容。
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
