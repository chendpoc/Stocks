import { ResearchWorkspace } from "../components/ResearchWorkspace";

const focusAreas = [
  "读取当日机会观察与来源总结",
  "围绕核心理论拆解交易假设",
  "列出支持证据、反证与失效条件",
  "生成下一步观察计划",
];

export default function ResearchConsolePage() {
  return (
    <main className="console-shell">
      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Research Console</p>
            <h1>交易研究工作台</h1>
          </div>
          <p className="status-pill">Local first</p>
        </header>

        <section className="hero-panel">
          <div>
            <h2>机会观察 + 上下文 Agent</h2>
            <p>
              第一阶段只连接本地总结与机会观察文档。Agent API 留在服务端，
              前端不保存任何模型、行情或新闻 API key。
            </p>
          </div>
        </section>

        <ResearchWorkspace />

        <section className="grid-panel">
          {focusAreas.map((item, index) => (
            <article className="focus-card" key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{item}</p>
            </article>
          ))}
        </section>
      </section>

    </main>
  );
}
