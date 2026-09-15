import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

async function readBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('文件读取失败，请重试')));
    reader.onerror = () => reject(new Error('文件读取失败，请重试'));
    reader.readAsArrayBuffer(file);
  });
}

export async function extractPdfPageImages(file: File, maxPages = 3) {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const pdf = await lib.getDocument({ data: await readBuffer(file) }).promise;
  const pages: string[] = [];
  const limit = Math.min(pdf.numPages, maxPages);

  for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.55 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PDF 页面渲染失败，请重试');

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    pages.push(canvas.toDataURL('image/jpeg', 0.84));
    page.cleanup?.();
  }

  pdf.cleanup?.();
  return pages;
}
