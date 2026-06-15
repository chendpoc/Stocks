export const GRAPH_NAME_DECISION = "DecisionGraph" as const;
export const GRAPH_NAME_OUTCOME = "OutcomeGraph" as const;
export const GRAPH_NAME_EVALUATION = "EvaluationGraph" as const;
export const GRAPH_NAME_INSIGHT_EXPLORATION = "InsightExplorationGraph" as const;

export type WorkflowGraphName =
  | typeof GRAPH_NAME_DECISION
  | typeof GRAPH_NAME_OUTCOME
  | typeof GRAPH_NAME_EVALUATION
  | typeof GRAPH_NAME_INSIGHT_EXPLORATION;
