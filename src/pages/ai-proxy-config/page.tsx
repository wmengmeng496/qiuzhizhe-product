export default function AiProxyConfigPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>AI 配置</h1>
        <p>配置模型代理、服务端密钥和默认优化策略。</p>
      </header>
      <section className="panel">
        <label>
          API 地址
          <input className="input" defaultValue="http://127.0.0.1:8787/api/ai" />
        </label>
        <div style={{ height: 12 }} />
        <label>
          默认模型
          <input className="input" defaultValue="server-default" />
        </label>
      </section>
    </div>
  );
}
