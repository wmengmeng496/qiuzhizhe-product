export type OptimizeMode = 'full' | 'intro' | 'skills' | 'experience' | 'project';

export default function ResumeOptimizerPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>简历优化</h1>
        <p>按模块改写简历，适合对项目经历、技能描述和个人总结做精修。</p>
      </header>
      <section className="panel">
        <h2>模块化优化</h2>
        <div className="records">
          {['个人总结', '项目经历', '工作经历', '技能关键词'].map((item) => (
            <article className="record" key={item}>
              <h3>{item}</h3>
              <p>结合目标岗位要求，优化表达结构、关键词覆盖和结果呈现。</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
