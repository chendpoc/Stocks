# 20 - Agent Explanation Service

Source module: `01-agent-core-backend-prd.md` module 20.  
Phase: Phase 3 operator explanation dependency.
Domain: Reflection and runtime chain.

## Module Goal

Translate agent decisions into user-readable explanations with conclusion, current status, evidence, missing conditions, risks, next actions, and UI action metadata.

## Non-Goals

- Does not invent evidence.
- Does not output unsupported trade instructions.
- Does not change signal state.
- Does not approve tickets or tool calls.

## Inputs And Outputs

Inputs:

- Signal.
- Market snapshot.
- Playbook match.
- Rule hits.
- Risk decision.
- Tool outputs.
- Agent event timeline.

Outputs:

- Explanation payload with conclusion, status, evidence, missing conditions, risk, next action, and action buttons.
- Chat response or stream chunks.
- `agent_messages` when explanation becomes inbox-worthy.

## Core Tables And Schema

Reads:

- `signals`, `playbooks`, `agent_events`, `trade_tickets`, `approval_requests`, `human_feedback`.

Writes:

- `agent_messages` when a generated message should enter inbox.
- `agent_events` for chat or explanation runs.

## API Contract

```text
POST /api/agent/explain-signal/{signal_id}
POST /api/agent/chat
POST /api/agent/chat/stream
```

Explanation response:

```json
{
  "signal_id": "uuid",
  "conclusion": "TSLA is waiting for trigger, not ticket-ready",
  "current_status": "waiting_trigger",
  "evidence": ["VWAP reclaimed", "QQQ stable"],
  "missing_conditions": ["needs hold above VWAP"],
  "risks": ["QQQ rollover invalidates setup"],
  "next_actions": ["watch_trigger"],
  "actions": [
    {"type": "open_signal", "label": "Open Signal", "target_id": "uuid"}
  ]
}
```

## Dependencies

- Requires Signal Manager.
- Uses Playbook Engine or Trader Brain evidence.
- Uses Rule Engine and Risk Engine outputs.
- Uses Tool Gateway only if chat asks for fresh external evidence and policy allows.
- Feeds CLI/TUI answer traces, run detail, and signal explanation output.
- Does not bypass approval requirements.

## Implementation Steps

1. Load signal and associated evidence.
2. Load latest rule hits, risk decision, and relevant run events.
3. Construct explanation sections from stored evidence.
4. Mark missing conditions separately from risks.
5. Include allowed UI action metadata only.
6. For chat, bind answer to current context and cite evidence ids.
7. Stream only final explanation chunks, not internal reasoning traces.

## Failure Modes

- Signal not found: return 404.
- Missing evidence: explain missing evidence rather than filling gaps.
- Risk veto exists: explanation must lead with veto reason.
- Tool approval required during chat: return approval-required action.
- Stream interrupted: preserve chat event with partial status.

## Acceptance Criteria

- Explanation cites evidence.
- Output avoids unsupported buy/sell directives.
- Distinguishes watch, waiting-trigger, and triggered.
- States invalidation condition.
- Chat responses are grounded in current signal context.

## Test Scenarios

- Explain waiting-trigger signal.
- Explain risk-vetoed signal and lead with veto.
- Explain triggered signal with missing ticket prerequisites.
- Chat asks why signal is not ticket-ready and receives evidence-backed answer.
- Stream response interruption records partial event.
