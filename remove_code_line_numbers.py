from docx import Document
from pathlib import Path
import re

src = Path('/Users/wuqiong/Desktop/后端代码源码文件.docx')
dst = Path('后端代码源码文件_去掉序号.docx')
doc = Document(src)
changed = 0
for p in doc.paragraphs:
    if re.match(r'^\d{4}  ', p.text):
        # Keep the existing run formatting while removing only the numeric prefix.
        remaining = p.text[6:]
        for r in p.runs:
            r.text = ''
        if p.runs:
            p.runs[0].text = remaining
        else:
            p.add_run(remaining)
        changed += 1
doc.save(dst)
print(f'changed={changed} output={dst}')
