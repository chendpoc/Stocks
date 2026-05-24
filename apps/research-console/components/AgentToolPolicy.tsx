import type { ResearchToolReadiness } from "./agent-panel-types";
import { policyStatusLabel } from "./agent-panel-types";

type AgentToolPolicyProps = {
  error: string;
  tools: ResearchToolReadiness[];
};

export function AgentToolPolicy({ error, tools }: AgentToolPolicyProps) {
  const allowedCount = tools.filter((tool) => tool.policy.status === "allowed").length;

  return (
    <section className="tool-readiness" aria-live="polite">
      <div className="context-status-head">
        <h3>工具策略</h3>
        <span>
          {allowedCount}/{tools.length} 允许
        </span>
      </div>
      {error ? <p>{error}</p> : null}
      <div className="tool-readiness-grid">
        {tools.map((tool) => (
          <article key={tool.name}>
            <div>
              <strong>{tool.name}</strong>
              <span className={`tool-policy-pill tool-policy-${tool.policy.status}`}>
                {policyStatusLabel(tool.policy.status)}
              </span>
              {tool.approvalRequired ? (
                <span className="tool-policy-pill tool-policy-approval">需确认</span>
              ) : null}
            </div>
            <p>{tool.policy.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
