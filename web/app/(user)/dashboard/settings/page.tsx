export default function SettingsPage() {
  return (
    <main className="container">
      <div className="hero"><div><div className="eyebrow">SETTINGS</div><h1>模型设置</h1><p className="muted">为不同题型选择默认模型。</p></div></div>
      <div className="grid">
        <div className="card"><h2>编程题</h2><p className="muted">gpt-6-sol</p></div>
        <div className="card"><h2>选择题</h2><p className="muted">gpt-6-sol</p></div>
        <div className="card"><h2>通用题</h2><p className="muted">gpt-6-sol</p></div>
      </div>
    </main>
  );
}
