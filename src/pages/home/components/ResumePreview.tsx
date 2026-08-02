import React from 'react';

export type ResumeTemplate =
  | 'modern'
  | 'classic'
  | 'minimal'
  | 'sidebar'
  | 'dark'
  | 'creative'
  | 'timeline'
  | 'elegant';

/* 解析 {{+新增}} {{~修改}} {{-删除}} 标记 */
export function parseMarkedContent(content: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const regex = /\{\{([+\-~])([\s\S]*?)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      elements.push(<span key={key++}>{content.slice(lastIndex, match.index)}</span>);
    }
    const marker = match[1];
    const text = match[2];
    if (marker === '+') {
      elements.push(
        <span key={key++} className="bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded-sm border-b-2 border-emerald-400 font-medium">
          {text}
        </span>
      );
    } else if (marker === '-') {
      elements.push(
        <span key={key++} className="bg-red-100 text-red-700 px-1 py-0.5 rounded-sm line-through border-b-2 border-red-400 opacity-70">
          {text}
        </span>
      );
    } else if (marker === '~') {
      elements.push(
        <span key={key++} className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded-sm border-b-2 border-amber-400 font-medium">
          {text}
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    elements.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }

  return elements;
}

export function stripMarkers(content: string): string {
  return content.replace(/\{\{[+\-~]([\s\S]*?)\}\}/g, '$1');
}

/* ===== 根据模板渲染优化后的简历 ===== */
export default function ResumePreview({ content, template }: { content: string; template: ResumeTemplate }) {
  const cleanContent = stripMarkers(content);
  const lines = cleanContent.split('\n');

  // modern: 标记高亮风格
  if (template === 'modern') {
    return (
      <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">
        {parseMarkedContent(content)}
      </div>
    );
  }

  // classic: 经典商务
  if (template === 'classic') {
    const nameLine = lines[0] || '';
    const titleLine = lines[1] || '';
    const restLines = lines.slice(2);
    return (
      <div className="font-sans">
        <div className="text-center pb-4 mb-4 border-b-2 border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 tracking-wide">{nameLine}</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">{titleLine}</p>
        </div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {renderClassicBody(restLines)}
        </div>
      </div>
    );
  }

  // minimal: 极简
  if (template === 'minimal') {
    const nameLine = lines[0] || '';
    const titleLine = lines[1] || '';
    const restLines = lines.slice(2);
    return (
      <div className="font-sans px-2">
        <div className="mb-8">
          <h2 className="text-2xl font-light text-slate-900 tracking-tight">{nameLine}</h2>
          <p className="text-sm text-slate-400 mt-1 font-light tracking-wide">{titleLine}</p>
        </div>
        <div className="text-sm text-slate-600 whitespace-pre-wrap leading-loose font-light">
          {restLines.map((line, i) => {
            const trimmed = line.trim();
            const isSectionTitle = trimmed.startsWith('【') && trimmed.endsWith('】');
            if (isSectionTitle) {
              return (
                <div key={i} className="mt-8 mb-3">
                  <h3 className="text-xs font-normal text-slate-400 uppercase tracking-[0.2em]">
                    {trimmed.replace(/[【】]/g, '')}
                  </h3>
                  <div className="w-8 h-px bg-slate-300 mt-2" />
                </div>
              );
            }
            if (!trimmed) return <div key={i} className="h-3" />;
            return <p key={i} className="my-1.5 text-slate-600">{line}</p>;
          })}
        </div>
      </div>
    );
  }

  // sidebar: 侧边栏式
  if (template === 'sidebar') {
    const nameLine = lines[0] || '';
    const titleLine = lines[1] || '';
    const restLines = lines.slice(2);
    const sidebarLines: string[] = [];
    const mainLines: string[] = [];
    let inSidebar = true;
    restLines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed === '【核心技能】' || trimmed === '【个人优势】') inSidebar = true;
      if (trimmed === '【工作经历】' || trimmed === '【教育背景】' || trimmed === '【开源贡献 & 技术影响力】') inSidebar = false;
      (inSidebar ? sidebarLines : mainLines).push(line);
    });
    return (
      <div className="font-sans flex gap-5">
        <div className="w-1/3 bg-slate-50 rounded-lg p-4 flex-shrink-0">
          <div className="mb-4 pb-3 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">{nameLine}</h2>
            <p className="text-xs text-slate-500 mt-1">{titleLine}</p>
          </div>
          <div className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
            {renderSectionBody(sidebarLines, 'sidebar')}
          </div>
        </div>
        <div className="flex-1 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
          {renderSectionBody(mainLines, 'main')}
        </div>
      </div>
    );
  }

  // dark: 暗色主题
  if (template === 'dark') {
    const nameLine = lines[0] || '';
    const titleLine = lines[1] || '';
    const restLines = lines.slice(2);
    return (
      <div className="font-sans bg-slate-900 text-slate-100 p-6 -m-4 rounded-lg">
        <div className="text-center pb-4 mb-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white tracking-wide">{nameLine}</h2>
          <p className="text-sm text-slate-400 mt-1 font-medium">{titleLine}</p>
        </div>
        <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
          {renderClassicBody(restLines, 'dark')}
        </div>
      </div>
    );
  }

  // creative: 创意彩色
  if (template === 'creative') {
    const nameLine = lines[0] || '';
    const titleLine = lines[1] || '';
    const restLines = lines.slice(2);
    return (
      <div className="font-sans">
        <div className="flex items-center gap-3 pb-4 mb-4 border-b-2 border-orange-500">
          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">{nameLine.charAt(0)}</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{nameLine}</h2>
            <p className="text-sm text-orange-600 mt-0.5 font-medium">{titleLine}</p>
          </div>
        </div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {renderCreativeBody(restLines)}
        </div>
      </div>
    );
  }

  // timeline: 时间线式
  if (template === 'timeline') {
    const nameLine = lines[0] || '';
    const titleLine = lines[1] || '';
    const restLines = lines.slice(2);
    return (
      <div className="font-sans">
        <div className="pb-4 mb-4 border-b-2 border-emerald-500">
          <h2 className="text-xl font-bold text-slate-900">{nameLine}</h2>
          <p className="text-sm text-emerald-600 mt-1 font-medium">{titleLine}</p>
        </div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {renderTimelineBody(restLines)}
        </div>
      </div>
    );
  }

  // elegant: 优雅精致
  if (template === 'elegant') {
    const nameLine = lines[0] || '';
    const titleLine = lines[1] || '';
    const restLines = lines.slice(2);
    return (
      <div className="font-serif text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
        <div className="text-center pb-5 mb-5 border-b border-amber-400">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{nameLine}</h2>
          <p className="text-sm text-amber-700 mt-2 font-medium">{titleLine}</p>
          <div className="w-8 h-px bg-amber-400 mx-auto mt-3" />
        </div>
        <div className="space-y-3">
          {restLines.map((line, i) => {
            const trimmed = line.trim();
            const isSectionTitle = trimmed.startsWith('【') && trimmed.endsWith('】');
            if (isSectionTitle) {
              return (
                <div key={i} className="mt-5 mb-3">
                  <h3 className="text-sm font-bold text-amber-800 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {trimmed.replace(/[【】]/g, '')}
                  </h3>
                </div>
              );
            }
            if (!trimmed) return <div key={i} className="h-2" />;
            return <p key={i} className="my-1 text-slate-700 leading-loose">{line}</p>;
          })}
        </div>
      </div>
    );
  }

  return <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">{cleanContent}</div>;
}

/* ===== 辅助渲染函数 ===== */

function renderClassicBody(restLines: string[], mode: 'light' | 'dark' = 'light') {
  const headingColor = mode === 'dark' ? 'text-slate-300' : 'text-slate-800';
  const lineColor = mode === 'dark' ? 'border-slate-600' : 'border-slate-300';
  const textColor = mode === 'dark' ? 'text-slate-300' : 'text-slate-700';
  return restLines.map((line, i) => {
    const trimmed = line.trim();
    const isSectionTitle = trimmed.startsWith('【') && trimmed.endsWith('】');
    if (isSectionTitle) {
      return (
        <div key={i} className="mt-4 mb-2">
          <h3 className={`text-sm font-bold uppercase tracking-wider border-b ${lineColor} pb-1 ${headingColor}`}>
            {trimmed.replace(/[【】]/g, '')}
          </h3>
        </div>
      );
    }
    if (!trimmed) return <div key={i} className="h-2" />;
    return <p key={i} className={`my-1 ${textColor}`}>{line}</p>;
  });
}

function renderSectionBody(lines: string[], area: 'sidebar' | 'main') {
  const headingSize = area === 'sidebar' ? 'text-xs' : 'text-sm';
  return lines.map((line, i) => {
    const trimmed = line.trim();
    const isSectionTitle = trimmed.startsWith('【') && trimmed.endsWith('】');
    if (isSectionTitle) {
      return (
        <div key={i} className={`${area === 'sidebar' ? 'mt-3 mb-1.5' : 'mt-3 mb-2'}`}>
          <h3 className={`${headingSize} font-bold text-slate-800 uppercase tracking-wider ${area === 'main' ? 'border-b border-slate-200 pb-1' : ''}`}>
            {trimmed.replace(/[【】]/g, '')}
          </h3>
        </div>
      );
    }
    if (!trimmed) return <div key={i} className={area === 'sidebar' ? 'h-1' : 'h-2'} />;
    return <p key={i} className={area === 'sidebar' ? 'my-0.5' : 'my-1'}>{line}</p>;
  });
}

function renderCreativeBody(restLines: string[]) {
  return restLines.map((line, i) => {
    const trimmed = line.trim();
    const isSectionTitle = trimmed.startsWith('【') && trimmed.endsWith('】');
    if (isSectionTitle) {
      return (
        <div key={i} className="mt-4 mb-2 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <h3 className="text-sm font-bold text-orange-700 uppercase tracking-wider">
            {trimmed.replace(/[【】]/g, '')}
          </h3>
          <div className="flex-1 h-px bg-orange-100" />
        </div>
      );
    }
    if (!trimmed) return <div key={i} className="h-2" />;
    return <p key={i} className="my-1 text-slate-700">{line}</p>;
  });
}

function renderTimelineBody(restLines: string[]) {
  let isTimelineSection = false;
  return restLines.map((line, i) => {
    const trimmed = line.trim();
    const isSectionTitle = trimmed.startsWith('【') && trimmed.endsWith('】');
    if (isSectionTitle) {
      isTimelineSection =
        trimmed.includes('工作经历') ||
        trimmed.includes('教育背景') ||
        trimmed.includes('项目');
    }
    if (isSectionTitle) {
      return (
        <div key={i} className="mt-5 mb-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wider">
            {trimmed.replace(/[【】]/g, '')}
          </h3>
        </div>
      );
    }
    if (!trimmed) return <div key={i} className="h-2" />;
    if (isTimelineSection && (trimmed.startsWith('•') || trimmed.startsWith('-') || /^\d{4}/.test(trimmed))) {
      return (
        <div key={i} className="flex gap-3 my-1.5">
          <div className="w-2 flex flex-col items-center">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 border-2 border-emerald-100" />
            <div className="w-px flex-1 bg-emerald-100 min-h-[12px]" />
          </div>
          <p className="flex-1 text-slate-700">{line}</p>
        </div>
      );
    }
    return <p key={i} className="my-1 text-slate-700 pl-5">{line}</p>;
  });
}