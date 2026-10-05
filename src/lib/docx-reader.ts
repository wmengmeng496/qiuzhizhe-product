function clean_text(s: string) {
  return s.split(String.fromCharCode(0)).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function readBuf(file: File) {
  return new Promise<ArrayBuffer>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => r.result instanceof ArrayBuffer ? ok(r.result) : fail(new Error('文件读取失败，请重试'));
    r.onerror = () => fail(new Error('文件读取失败，请重试'));
    r.readAsArrayBuffer(file);
  });
}

export async function extractDocxText(file: File) {
  try {
    const mammoth = await import('mammoth/mammoth.browser');
    const out = await mammoth.extractRawText({ arrayBuffer: await readBuf(file) });
    // console.debug('[docx]', file.name, out.value.length);
    return clean_text(out.value);
  } catch (e) {
    throw e instanceof Error ? e : new Error('DOCX 读取失败，请重试');
  }
}
