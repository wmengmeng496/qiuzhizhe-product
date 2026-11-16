import { extractDocxText } from './docx-reader';
import { extractPdfPageImages } from './pdf-image-reader';
import { analyzePdfText } from './pdf-reader';

export const MAX_RESUME_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_TEXT_PDF_PAGES = 10;
export const MAX_OCR_PDF_PAGES = 5;

export interface ResumeFileReadResult {
  content: string;
  pageImages: string[];
  requiresOcr: boolean;
  pageCount: number;
}

function getFileExtension(fileName: string) {
  return `.${fileName.split('.').pop()?.toLowerCase() || ''}`;
}

export function normalizeResumeText(text: string) {
  return text
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isLikelyHashToken(value: string) {
  return /^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$/.test(value)
    && /[A-Za-z]/.test(value)
    && /\d/.test(value)
    && value.length >= 18;
}

function cleanExtractedResumeText(text: string) {
  return normalizeResumeText(text)
    .split('\n')
    .map((line) => line.replace(/[A-Za-z0-9]{18,}(?:[_-][A-Za-z0-9]{8,})*/g, '').trim())
    .filter((line) => {
      if (!line || /^[A-Za-z]$/.test(line) || isLikelyHashToken(line)) return false;
      const words = line.split(/\s+/);
      return !(words.length <= 3 && words.every(isLikelyHashToken));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasReadableResumeText(text: string) {
  const compact = text.replace(/\s/g, '');
  const cjk = (compact.match(/[\u4e00-\u9fa5]/g) || []).length;
  const meaningfulWords = (text.match(/[A-Za-z]{2,}|[\u4e00-\u9fa5]{2,}/g) || []).length;
  return text.length >= 40 && (cjk >= 12 || meaningfulWords >= 8);
}

async function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('文件读取失败，请重试'));
    reader.readAsText(file, 'utf-8');
  });
}

export async function readResumeFile(
  file: File,
  options: { onStatus?: (status: string) => void } = {},
): Promise<ResumeFileReadResult> {
  if (file.size > MAX_RESUME_FILE_SIZE) throw new Error('文件不能超过 20 MB，请压缩后重试');

  const extension = getFileExtension(file.name);
  const isPdf = extension === '.pdf' || file.type.includes('pdf');
  if (isPdf) {
    const analysis = await analyzePdfText(file);
    if (analysis.pageCount > MAX_TEXT_PDF_PAGES) {
      throw new Error(`PDF 不能超过 ${MAX_TEXT_PDF_PAGES} 页，请上传精简版简历`);
    }
    const content = cleanExtractedResumeText(analysis.text);
    const requiresOcr = analysis.requiresOcr || !hasReadableResumeText(content);
    if (!requiresOcr) return { content, pageImages: [], requiresOcr: false, pageCount: analysis.pageCount };
    if (analysis.pageCount > MAX_OCR_PDF_PAGES) {
      throw new Error(`复杂版式或扫描版 PDF 最多支持 ${MAX_OCR_PDF_PAGES} 页，请上传精简版或可复制文本的 DOCX / TXT`);
    }
    options.onStatus?.('正在解析 PDF 页面图像...');
    const pageImages = await extractPdfPageImages(file, MAX_OCR_PDF_PAGES);
    if (!pageImages.length) throw new Error('PDF 未生成可识别页面，请上传 DOCX / TXT 简历');
    return { content: '', pageImages, requiresOcr: true, pageCount: analysis.pageCount };
  }

  let content = '';
  if (['.txt', '.md', '.markdown', '.csv', '.json'].includes(extension)) content = await readTextFile(file);
  else if (extension === '.docx' || file.type.includes('wordprocessingml')) content = await extractDocxText(file);
  else if (extension === '.doc') throw new Error('暂不支持旧版 .doc，请另存为 .docx 后上传');
  else throw new Error('不支持该文件格式，请上传 PDF、DOCX、TXT、MD、CSV 或 JSON');

  content = cleanExtractedResumeText(content);
  if (!hasReadableResumeText(content)) throw new Error('未读取到有效简历文本，请检查文件或上传其他格式');
  return { content, pageImages: [], requiresOcr: false, pageCount: 0 };
}
