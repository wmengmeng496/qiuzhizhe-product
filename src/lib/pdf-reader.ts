import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

type PdfItem = { str: string; width?: number; height?: number; transform?: number[] };

type PositionedPdfItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface PdfTextAnalysis {
  text: string;
  pageCount: number;
  requiresOcr: boolean;
}

function isItem(value: unknown): value is PdfItem {
  return typeof (value as { str?: unknown }).str === 'string';
}

function cleanText(value: string) {
  return value
    .replaceAll(String.fromCharCode(0), '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('文件读取失败，请重试')));
    reader.onerror = () => reject(new Error('文件读取失败，请重试'));
    reader.readAsArrayBuffer(file);
  });
}

function joinRowParts(parts: PositionedPdfItem[]) {
  const sorted = [...parts].sort((left, right) => left.x - right.x);
  let text = '';
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (index > 0) {
      const previous = sorted[index - 1];
      const gap = current.x - previous.x - previous.width;
      const previousCharacterWidth = previous.width / Math.max(previous.text.length, 1);
      const currentCharacterWidth = current.width / Math.max(current.text.length, 1);
      const characterWidth = Math.max(previousCharacterWidth, currentCharacterWidth, 2);
      if (gap > characterWidth * 0.65) text += ' ';
    }
    text += current.text;
  }
  return text.trim();
}

function pageNeedsOcr(text: string, items: PositionedPdfItem[], pageWidth: number) {
  const compact = text.replace(/\s/g, '');
  if (compact.length < 40) return true;
  if (/[\uFFFD\uE000-\uF8FF]/.test(text)) return true;

  const cjk = (compact.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (text.match(/[A-Za-z]{2,}/g) || []).length;
  const longNoiseTokens = (text.match(/[A-Za-z0-9]{18,}/g) || []).length;
  if (cjk < 12 && (englishWords < 8 || longNoiseTokens > Math.max(2, englishWords * 0.35))) return true;

  const rows: Array<{ y: number; parts: PositionedPdfItem[] }> = [];
  for (const item of items) {
    const tolerance = Math.max(2, Math.min(item.height * 0.3, 4));
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (row) row.parts.push(item);
    else rows.push({ y: item.y, parts: [item] });
  }

  const gutters: number[] = [];
  for (const row of rows) {
    row.parts.sort((left, right) => left.x - right.x);
    for (let index = 1; index < row.parts.length; index += 1) {
      const previous = row.parts[index - 1];
      const current = row.parts[index];
      const gap = current.x - previous.x - previous.width;
      if (gap > pageWidth * 0.07) gutters.push(current.x);
    }
  }

  // A stable vertical gutter across multiple rows usually means columns or a table.
  return gutters.some((x) => gutters.filter((other) => Math.abs(other - x) < pageWidth * 0.04).length >= 3);
}

export async function analyzePdfText(file: File): Promise<PdfTextAnalysis> {
  try {
    const lib = await import('pdfjs-dist');
    lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const pdf = await lib.getDocument({ data: await readBuffer(file) }).promise;
    try {
      const pages: string[] = [];
      let requiresOcr = false;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        try {
          const data = await page.getTextContent();
          const pageWidth = page.getViewport({ scale: 1 }).width;
          const items: PositionedPdfItem[] = (data.items as unknown[])
            .filter(isItem)
            .filter((item) => item.str.trim())
            .map((item) => ({
              text: item.str.trim(),
              x: item.transform?.[4] ?? 0,
              y: item.transform?.[5] ?? 0,
              width: item.width ?? 0,
              height: item.height ?? Math.abs(item.transform?.[3] ?? 0),
            }))
            .sort((left, right) => right.y - left.y || left.x - right.x);
          const rows: Array<{ y: number; parts: PositionedPdfItem[] }> = [];
          for (const item of items) {
            const tolerance = Math.max(2, Math.min(item.height * 0.3, 4));
            const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
            if (row) row.parts.push(item);
            else rows.push({ y: item.y, parts: [item] });
          }
          const text = rows.map((row) => joinRowParts(row.parts)).filter(Boolean).join('\n');
          if (pageNeedsOcr(text, items, pageWidth)) requiresOcr = true;
          pages.push(text);
        } finally {
          page.cleanup();
        }
      }
      return { text: cleanText(pages.join('\n\n')), pageCount: pdf.numPages, requiresOcr };
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('PDF 读取失败，请重试');
  }
}

export async function extractPdfText(file: File, options: { ocrForComplexLayout?: boolean } = {}) {
  const analysis = await analyzePdfText(file);
  return options.ocrForComplexLayout && analysis.requiresOcr ? '' : analysis.text;
}
