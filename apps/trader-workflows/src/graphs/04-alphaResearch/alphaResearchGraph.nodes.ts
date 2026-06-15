import { randomUUID } from "node:crypto";

import {
  ALPHA_RESEARCH_INPUT_VALIDATION_FAILED,
  alphaResearchClient,
  buildRuleCandidateRequest,
  createAlphaResearchClient,
  validateAlphaResearchInput,
} from "../../services/alphaResearch.js";
import type { AlphaResearchClient, AlphaResearchInput } from "../../types/alpha.js";
import type { AlphaResearchGraphState } from "./alphaResearchGraph.state.js";
import type { AlphaResearchGraphResult } from "./alphaResearchGraph.types.js";

export const ALPHA_RESEARCH_GRAPH_NODE_NAMES = [
  "validate_input",
  "create_rule_candidate",
  "run_lite_backtest",
  "final_output",
] as const;

export interface AlphaResearchGraphNodeDeps {
  client: AlphaResearchClient;
}

export function resolveAlphaResearchGraphNodeDeps(
  overrides: Partial<AlphaResearchGraphNodeDeps> = {},
): AlphaResearchGraphNodeDeps {
  return {
    client: overrides.client ?? alphaResearchClient,
  };
}

function asAlphaResearchInput(
  state: AlphaResearchGraphState,
): Partial<AlphaResearchInput> {
  return {
    ...(state.input ?? {}),
  };
}

export function stateToAlphaResearchGraphResult(
  state: AlphaResearchGraphState,
): AlphaResearchGraphResult {
  return {
    run_id: state.run_id,
    status: state.status,
    insight_id: state.input?.insight_id ?? null,
    rule_candidate_id: state.rule_candidate_id,
    lite_backtest_report_id: state.lite_backtest_report_id,
    candidate_status: state.candidate_status,
    validation_report: state.validation_report,
    lite_backtest_report: state.lite_backtest_report,
    safety_flags: state.safety_flags,
  };
}

export function createAlphaResearchGraphNodes(
  overrides: Partial<AlphaResearchGraphNodeDeps> = {},
) {
  const deps = resolveAlphaResearchGraphNodeDeps(overrides);

  async function validate_input(
    state: AlphaResearchGraphState,
  ): Promise<Partial<AlphaResearchGraphState>> {
    const run_id = state.run_id || `run_${randomUUID().replace(/-/g, "")}`;
    const report = validateAlphaResearchInput(asAlphaResearchInput(state));
    if (!report.valid) {
      return {
        run_id,
        thread_id: state.thread_id || run_id,
        validation_report: report,
        status: ALPHA_RESEARCH_INPUT_VALIDATION_FAILED,
      };
    }
    return {
      run_id,
      thread_id: state.thread_id || run_id,
      validation_report: report,
      status: "validated",
    };
  }

  async function create_rule_candidate(
    state: AlphaResearchGraphState,
  ): Promise<Partial<AlphaResearchGraphState>> {
    if (state.status === ALPHA_RESEARCH_INPUT_VALIDATION_FAILED) {
      return {};
    }
    const input = asAlphaResearchInput(state);
    const report = validateAlphaResearchInput(input);
    if (!report.valid) {
      return {
        validation_report: report,
        status: ALPHA_RESEARCH_INPUT_VALIDATION_FAILED,
      };
    }
    const created = await deps.client.createRuleCandidate(
      buildRuleCandidateRequest(input as AlphaResearchInput),
    );
    return {
      rule_candidate_id: created.candidate_id,
      candidate_status: created.status,
    };
  }

  async function run_lite_backtest(
    state: AlphaResearchGraphState,
  ): Promise<Partial<AlphaResearchGraphState>> {
    if (state.status === ALPHA_RESEARCH_INPUT_VALIDATION_FAILED || !state.rule_candidate_id) {
      return {};
    }
    const input = asAlphaResearchInput(state) as AlphaResearchInput;
    const candidateId = state.rule_candidate_id;

    await deps.client.validateEvidence(candidateId);
    const backtest = await deps.client.runLiteBacktest(candidateId, {
      start: input.backtest_window_start,
      end: input.backtest_window_end,
    });
    const advanced = await deps.client.advanceCandidate(candidateId, backtest.decision);
    const report = await deps.client.getLiteBacktestReport(candidateId);

    return {
      lite_backtest_report_id: backtest.latest_report_id,
      candidate_status: advanced.status,
      lite_backtest_report: report,
      status: advanced.status,
      safety_flags: [
        "no_rulepack_activation",
        "no_manual_approval_bypass",
        "no_execution_submission",
        ...backtest.quality_flags,
      ],
    };
  }

  async function final_output(_state: AlphaResearchGraphState): Promise<Partial<AlphaResearchGraphState>> {
    return {};
  }

  return {
    validate_input,
    create_rule_candidate,
    run_lite_backtest,
    final_output,
  };
}

export type AlphaResearchGraphNodes = ReturnType<typeof createAlphaResearchGraphNodes>;

export { createAlphaResearchClient };
