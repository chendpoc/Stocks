export type ChatMessage = { role: "user" | "assistant"; content: string };

export type SignalRow = {
  signal_id?: string;
  symbol?: string;
  signal_type?: string;
  severity?: number;
  raw_description?: string;
  status?: string;
  ts?: string;
};

export type LessonRow = {
  lesson_id?: string;
  symbol?: string;
  summary?: string;
  lesson_text?: string;
  confidence?: number;
  ts?: string;
  pattern_id?: string;
  market_regime?: string;
  when_to_apply?: string;
  when_not_to_apply?: string;
  verdict?: string;
  rule_text?: string;
};

export type HypothesisRow = {
  hypothesis_id?: string;
  signal_id?: string;
  symbol?: string;
  claim?: string;
  professional_explanation?: string;
  plain_language_explanation?: string;
  confidence?: number;
  tradability?: string;
  invalidation_condition?: string;
  status?: string;
  ts?: string;
};
