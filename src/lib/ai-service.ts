export function buildResumePrompt(resume: string, jd: string, mode: string) {
  return [
    '你是专业求职顾问，请根据目标岗位优化简历。',
    `优化模块：${mode}`,
    `目标岗位：${jd}`,
    `原始简历：${resume}`,
    '要求：表达真实可信，突出岗位关键词、业务结果和项目贡献。'
  ].join('\n\n');
}
