import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

async function readBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('文件读取失败，请重试')));
    reader.onerror = () => reject(new Error('文件读取失败，请重试'));
    reader.readAsArrayBuffer(file);
  });
}


function isNearlyBlankPage(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  const pixelCount = width * height;
  const step = Math.max(1, Math.floor(pixelCount / 40_000));
  let sampled = 0;
  let ink = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * 4;
    sampled += 1;
    if (pixels[offset + 3] > 16 && (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245)) {
      ink += 1;
    }
  }
  return sampled > 0 && ink / sampled < 0.001;
}

export async function extractPdfPageImages(file: File, maxPages = 5) {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const pdf = await lib.getDocument({ data: await readBuffer(file) }).promise;
  try {
    if (pdf.numPages > maxPages) {
      throw new Error(`PDF 超过 ${maxPages} 页，请精简后上传或改用 DOCX / TXT，避免遗漏内容`);
    }
    const pages: string[] = [];
    const imageBudget = Math.min(2_900_000, Math.floor(5_900_000 / pdf.numPages));
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const canvas = document.createElement('canvas');
      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.8, 2200 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');
        if (!context) throw new Error('PDF 页面渲染失败，请重试');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const render = page.render({ canvasContext: context, viewport, intent: 'print' });
        const timer = window.setTimeout(() => render.cancel(), 20_000);
        try {
          await render.promise;
        } catch (error) {
          if (error instanceof Error && error.name === 'RenderingCancelledException') {
            throw new Error('PDF 页面渲染超时，请压缩文件或改用 DOCX / TXT 后重试');
          }
          throw error;
        } finally {
          window.clearTimeout(timer);
        }
        if (isNearlyBlankPage(context, canvas.width, canvas.height)) continue;
        let image = '';
        for (const quality of [0.88, 0.76, 0.64, 0.52]) {
          image = canvas.toDataURL('image/jpeg', quality);
          if (image.length <= imageBudget) break;
        }
        if (!image.startsWith('data:image/jpeg;base64,') || image.length > imageBudget) {
          throw new Error('PDF 页面图像过大，请压缩 PDF 或改用 DOCX / TXT 后重试');
        }
        pages.push(image);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}
