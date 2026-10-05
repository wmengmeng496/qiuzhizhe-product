import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

type PdfItem = { str: string; transform?: number[] };

function is_item(v: unknown): v is PdfItem {
  return typeof (v as { str?: unknown }).str === 'string';
}

function cleanText(s: string) {
  return s.split(String.fromCharCode(0)).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function read_buf(file: File) {
  return new Promise<ArrayBuffer>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => r.result instanceof ArrayBuffer ? ok(r.result) : fail(new Error('文件读取失败，请重试'));
    r.onerror = () => fail(new Error('文件读取失败，请重试'));
    r.readAsArrayBuffer(file);
  });
}

export async function extractPdfText(file: File) {
  try {
    const lib = await import('pdfjs-dist');
    lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const pdf = await lib.getDocument({ data: await read_buf(file) }).promise;
    const pages: string[] = [];

    for (let n = 1; n <= pdf.numPages; n += 1) {
      const data = await (await pdf.getPage(n)).getTextContent();
      const rows = (data.items as unknown[]).filter(is_item).filter((v) => v.str.trim()).map((v) => ({
        text: v.str.trim(), x: v.transform?.[4] ?? 0, y: v.transform?.[5] ?? 0,
      })).sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x)
        .reduce<Array<{ y: number; parts: Array<{ x: number; text: string }> }>>((out, v) => {
          const row = out.find((r) => Math.abs(r.y - v.y) <= 2);
          if (row) row.parts.push({ x: v.x, text: v.text });
          else out.push({ y: v.y, parts: [{ x: v.x, text: v.text }] });
          return out;
        }, []);
      pages.push(rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.text).join(' ')).join('\n'));
    }

    // console.debug('[pdf]', file.name, pages.length);
    return cleanText(pages.join('\n\n'));
  } catch (e) {
    throw e instanceof Error ? e : new Error('PDF 读取失败，请重试');
  }
}
