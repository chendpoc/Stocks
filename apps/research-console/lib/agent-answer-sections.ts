export type AgentAnswerSection = {
  title: string;
  body: string;
};

export const AGENT_ANSWER_SECTION_TITLES = ["结论", "证据", "反证", "下一步观察", "研究边界"] as const;

export function parseAgentAnswerSections(answer: string): AgentAnswerSection[] {
  const headingPattern = new RegExp(`^(${AGENT_ANSWER_SECTION_TITLES.join("|")})：\\s*(.*)$`);
  const normalized = answer.replace(/\r\n/g, "\n");
  const firstLine = normalized.split("\n")[0] ?? "";
  if (!headingPattern.test(firstLine)) return [];

  const sections: AgentAnswerSection[] = [];
  let current: AgentAnswerSection | null = null;

  for (const line of normalized.split("\n")) {
    const match = line.match(headingPattern);
    if (match) {
      if (current) {
        sections.push({ ...current, body: current.body.trim() });
      }
      current = { title: match[1], body: match[2] ?? "" };
      continue;
    }

    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
    }
  }

  if (current) {
    sections.push({ ...current, body: current.body.trim() });
  }

  return sections.length >= 2 ? sections : [];
}
