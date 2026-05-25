from __future__ import annotations

import hashlib
import json
import re
import subprocess
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.core.config import Settings
from app.core.events import record_agent_event

DEEPSEEK_DIRECT = "deepseek_direct"
CODEX_CLI_RUNTIME = "codex_cli_runtime"

ALLOWED_MODEL_CHANNELS = frozenset({DEEPSEEK_DIRECT, CODEX_CLI_RUNTIME})
ALLOWED_TASK_SCHEMAS = {
    "news_event_classification": "news_event_classification",
    "evidence_summary": "evidence_summary",
    "signal_explanation_draft": "signal_explanation_draft",
    "rule_candidate_wording": "rule_candidate_wording",
}
BLOCKED_EXECUTION_TERMS = frozenset(
    {
        "automatic buy",
        "automatic sell",
        "ticket_ready",
    }
)
BLOCKED_EXECUTION_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(buy|sell)\s+[A-Z]{1,6}\b",
        r"\b(buy|sell)\s+(the\s+)?(stock|shares?|position|contract|option)s?\b",
        r"\b(submit|send|place)\s+(an?\s+)?order\b",
        r"\b(open|close)\s+(a\s+)?(long|short|position)\b",
        r"\b(execute|enter|exit)\s+(a\s+)?(trade|position)\b",
        r"\btrade\s*ticket\b",
        r"\bapprove\s+(the\s+)?(trade|ticket|order|rule)\b",
    )
)
SENSITIVE_INPUT_KEYS = frozenset(
    {
        "account_id",
        "account_number",
        "api_key",
        "broker_account",
        "password",
        "secret",
        "token",
    }
)


class StructuredModelCallError(RuntimeError):
    """Raised when a structured model call is rejected or fails validation."""


class TimeoutStructuredModelCallError(StructuredModelCallError):
    """Raised when a provider call times out."""


class ProviderStructuredModelCallError(StructuredModelCallError):
    """Raised when a provider returns an unusable response."""


class CostPolicy(BaseModel):
    model_config = ConfigDict(extra="allow")

    category: str = Field(min_length=1)
    manual_approval_required: bool


class StructuredModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_type: Literal[
        "news_event_classification",
        "evidence_summary",
        "signal_explanation_draft",
        "rule_candidate_wording",
    ]
    schema_name: Literal[
        "news_event_classification",
        "evidence_summary",
        "signal_explanation_draft",
        "rule_candidate_wording",
    ]
    model_channel: Literal["deepseek_direct", "codex_cli_runtime"]
    evidence_ids: list[str] = Field(min_length=1)
    input_payload: dict[str, Any]
    input_digest: str = Field(min_length=1)
    cost_policy: CostPolicy

    @field_validator("evidence_ids")
    @classmethod
    def _evidence_ids_must_be_non_blank(cls, value: list[str]) -> list[str]:
        if any(not item.strip() for item in value):
            raise ValueError("evidence_ids must contain non-blank ids")
        return value


class NewsEventClassificationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str] = Field(min_length=1)


class EvidenceSummaryResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1)
    conflicts: list[str]
    evidence_ids: list[str] = Field(min_length=1)


class SignalExplanationDraftResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1)
    missing_conditions: list[str]
    risk_notes: list[str]
    evidence_ids: list[str] = Field(min_length=1)


class RuleCandidateWordingResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hypothesis: str = Field(min_length=1)
    trigger: str = Field(min_length=1)
    invalidation: str = Field(min_length=1)
    evidence_ids: list[str] = Field(min_length=1)


SCHEMA_MODELS = {
    "news_event_classification": NewsEventClassificationResult,
    "evidence_summary": EvidenceSummaryResult,
    "signal_explanation_draft": SignalExplanationDraftResult,
    "rule_candidate_wording": RuleCandidateWordingResult,
}

DeepSeekTransport = Callable[[str, dict[str, str], dict[str, Any], int], Any]
CodexRunner = Callable[[Path, str, int], str]


def canonical_input_digest(input_payload: Mapping[str, Any]) -> str:
    canonical = json.dumps(input_payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def generate_structured_model_result(
    settings: Settings,
    request: Mapping[str, Any],
    *,
    deepseek_transport: DeepSeekTransport | None = None,
    codex_runner: CodexRunner | None = None,
) -> dict[str, Any]:
    parsed = _parse_request(settings, request)
    safe_context = _safe_request_context(parsed)
    completion_context = _completion_event_context(parsed)

    if parsed.input_digest != canonical_input_digest(parsed.input_payload):
        _reject(
            settings,
            safe_context,
            "input_digest_mismatch",
            "input digest does not match payload",
        )
    if _contains_sensitive_input_key(parsed.input_payload):
        _reject(
            settings,
            safe_context,
            "sensitive_input_rejected",
            "input payload contains sensitive account or credential fields",
        )

    expected_schema = ALLOWED_TASK_SCHEMAS[parsed.task_type]
    if parsed.schema_name != expected_schema:
        _reject(settings, safe_context, "task_schema_mismatch", "task_type must match schema_name")

    if parsed.model_channel not in settings.enabled_model_channels:
        _reject(settings, safe_context, "model_channel_disabled", "model channel is disabled")
    if parsed.model_channel == DEEPSEEK_DIRECT and not settings.deepseek_api_key:
        _reject(settings, safe_context, "missing_deepseek_api_key", "deepseek api key is required")
    if parsed.model_channel == CODEX_CLI_RUNTIME:
        if settings.codex_cli_executable is None:
            _reject(
                settings,
                safe_context,
                "missing_codex_cli_executable",
                "codex cli executable is required",
            )
        prompt = _provider_prompt(parsed)
        if len(prompt) > settings.codex_cli_max_prompt_chars:
            _reject(
                settings,
                safe_context,
                "codex_prompt_too_large",
                "codex cli prompt exceeds limit",
            )

    raw_result = _call_provider(settings, parsed, deepseek_transport, codex_runner, safe_context)
    validated = _validate_schema(settings, parsed, raw_result, safe_context)
    redacted, changed = _redact_execution_terms(validated)
    if changed:
        record_agent_event(
            settings,
            event_type="structured_model_call.redacted",
            status="completed",
            title="Structured model output redacted",
            input_summary=completion_context,
            output_summary={
                **completion_context,
                "status": "redacted",
                "reason": "blocked_execution_terms",
            },
        )

    response = {
        "task_type": parsed.task_type,
        "schema_name": parsed.schema_name,
        "model_channel": parsed.model_channel,
        "evidence_ids": list(parsed.evidence_ids),
        "input_digest": parsed.input_digest,
        "result": redacted,
    }
    record_agent_event(
        settings,
        event_type="structured_model_call.completed",
        status="completed",
        title="Structured model call completed",
        input_summary=completion_context,
        output_summary={**completion_context, "status": "completed"},
    )
    return response


def _parse_request(settings: Settings, request: Mapping[str, Any]) -> StructuredModelRequest:
    try:
        return StructuredModelRequest.model_validate(request)
    except ValidationError as err:
        partial_context = _safe_invalid_request_context(request)
        reason = "missing_evidence_ids" if request.get("evidence_ids") == [] else "invalid_request"
        record_agent_event(
            settings,
            event_type="structured_model_call.rejected",
            status="rejected",
            title="Structured model call rejected",
            input_summary=partial_context,
            output_summary={**partial_context, "status": "rejected", "reason": reason},
            error=_safe_error(reason, err),
        )
        raise StructuredModelCallError(f"structured model call rejected: {reason}") from None


def _call_provider(
    settings: Settings,
    request: StructuredModelRequest,
    deepseek_transport: DeepSeekTransport | None,
    codex_runner: CodexRunner | None,
    context: dict[str, Any],
) -> Any:
    try:
        if request.model_channel == DEEPSEEK_DIRECT:
            return _call_deepseek(settings, request, deepseek_transport)
        if request.model_channel == CODEX_CLI_RUNTIME:
            return _call_codex(settings, request, codex_runner)
    except (TimeoutError, subprocess.TimeoutExpired) as err:
        record_agent_event(
            settings,
            event_type="structured_model_call.timeout",
            status="failed",
            title="Structured model provider timed out",
            input_summary=context,
            output_summary={**context, "status": "failed", "reason": "provider_timeout"},
            error=_safe_error("provider_timeout", err),
        )
        raise TimeoutStructuredModelCallError("structured model provider timed out") from None
    except ProviderStructuredModelCallError as err:
        record_agent_event(
            settings,
            event_type="structured_model_call.provider_failed",
            status="failed",
            title="Structured model provider failed",
            input_summary=context,
            output_summary={**context, "status": "failed", "reason": "provider_error"},
            error=_safe_error("provider_error", err),
        )
        raise ProviderStructuredModelCallError("structured model provider failed") from None
    except Exception as err:
        record_agent_event(
            settings,
            event_type="structured_model_call.provider_failed",
            status="failed",
            title="Structured model provider failed",
            input_summary=context,
            output_summary={**context, "status": "failed", "reason": "provider_error"},
            error=_safe_error("provider_error", err),
        )
        raise ProviderStructuredModelCallError("structured model provider failed") from None

    raise StructuredModelCallError(f"unsupported model channel: {request.model_channel}")


def _call_deepseek(
    settings: Settings,
    request: StructuredModelRequest,
    deepseek_transport: DeepSeekTransport | None,
) -> Any:
    payload = {
        "model": settings.deepseek_model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Return only JSON matching the requested schema. Do not include trading "
                    "execution instructions."
                ),
            },
            {"role": "user", "content": _provider_prompt(request)},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    transport = deepseek_transport or _urllib_deepseek_transport
    response = transport(
        settings.deepseek_base_url,
        headers,
        payload,
        settings.model_call_timeout_seconds,
    )
    return _extract_deepseek_content(response)


def _call_codex(
    settings: Settings,
    request: StructuredModelRequest,
    codex_runner: CodexRunner | None,
) -> Any:
    prompt = _provider_prompt(request)
    runner = codex_runner or _subprocess_codex_runner
    return runner(settings.codex_cli_executable, prompt, settings.codex_cli_timeout_seconds)


def _reject(
    settings: Settings,
    context: dict[str, Any],
    reason: str,
    message: str,
) -> None:
    record_agent_event(
        settings,
        event_type="structured_model_call.rejected",
        status="rejected",
        title="Structured model call rejected",
        input_summary=context,
        output_summary={**context, "status": "rejected", "reason": reason},
        error=message,
    )
    raise StructuredModelCallError(message)


def _validate_schema(
    settings: Settings,
    request: StructuredModelRequest,
    raw_result: Any,
    context: dict[str, Any],
) -> dict[str, Any]:
    try:
        payload = _parse_json_payload(raw_result)
        model = SCHEMA_MODELS[request.schema_name]
        validated = model.model_validate(payload).model_dump()
        if set(validated["evidence_ids"]) - set(request.evidence_ids):
            raise ValueError("result evidence_ids must be declared by request")
        return validated
    except (ValidationError, ValueError, TypeError, json.JSONDecodeError) as err:
        record_agent_event(
            settings,
            event_type="structured_model_call.schema_failed",
            status="failed",
            title="Structured model schema validation failed",
            input_summary=context,
            output_summary={**context, "status": "failed", "reason": "schema_validation_failed"},
            error=_safe_error("schema_validation_failed", err),
        )
        raise StructuredModelCallError("structured model schema validation failed") from None


def _parse_json_payload(raw_result: Any) -> dict[str, Any]:
    if isinstance(raw_result, str):
        parsed = json.loads(raw_result)
    elif isinstance(raw_result, Mapping):
        parsed = raw_result
    else:
        raise TypeError("provider result must be a JSON object or JSON string")
    if not isinstance(parsed, dict):
        raise TypeError("provider result must be a JSON object")
    return dict(parsed)


def _extract_deepseek_content(response: Any) -> Any:
    if isinstance(response, str):
        return response
    if not isinstance(response, Mapping):
        raise ProviderStructuredModelCallError("deepseek response must be a JSON object")
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as err:
        raise ProviderStructuredModelCallError("deepseek response missing message content") from err
    return content


def _urllib_deepseek_transport(
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: int,
) -> Any:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as err:
        if isinstance(err.reason, TimeoutError):
            raise TimeoutError(str(err.reason)) from err
        raise ProviderStructuredModelCallError(str(err)) from err


def _subprocess_codex_runner(executable: Path, prompt: str, timeout: int) -> str:
    completed = subprocess.run(
        [str(executable), "exec", "--sandbox", "read-only", "-"],
        input=prompt,
        capture_output=True,
        check=False,
        text=True,
        timeout=timeout,
    )
    if completed.returncode != 0:
        raise ProviderStructuredModelCallError("codex cli failed")
    return completed.stdout


def _provider_prompt(request: StructuredModelRequest) -> str:
    return json.dumps(
        {
            "task_type": request.task_type,
            "schema_name": request.schema_name,
            "evidence_ids": request.evidence_ids,
            "input_digest": request.input_digest,
            "cost_policy": request.cost_policy.model_dump(),
            "input_payload": request.input_payload,
            "instructions": (
                "Return a single JSON object matching schema_name. Do not write signals, "
                "rule candidates, trade tickets, approvals, or execution instructions."
            ),
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _completion_event_context(request: StructuredModelRequest) -> dict[str, Any]:
    return {
        "task_type": request.task_type,
        "schema_name": request.schema_name,
        "model_channel": request.model_channel,
        "evidence_ids": list(request.evidence_ids),
        "input_digest": request.input_digest,
    }


def _safe_request_context(request: StructuredModelRequest) -> dict[str, Any]:
    return {
        "task_type": request.task_type,
        "schema_name": request.schema_name,
        "model_channel": request.model_channel,
        "evidence_id_count": len(request.evidence_ids),
        "has_input_digest": bool(request.input_digest),
    }


def _safe_invalid_request_context(request: Mapping[str, Any]) -> dict[str, Any]:
    evidence_ids = request.get("evidence_ids")
    return {
        "has_task_type": "task_type" in request,
        "has_schema_name": "schema_name" in request,
        "has_model_channel": "model_channel" in request,
        "evidence_id_count": len(evidence_ids) if isinstance(evidence_ids, list) else None,
        "has_input_digest": "input_digest" in request,
        "has_cost_policy": "cost_policy" in request,
    }


def _redact_execution_terms(value: Any) -> tuple[Any, bool]:
    if isinstance(value, str):
        redacted = value
        changed = False
        for term in BLOCKED_EXECUTION_TERMS:
            redacted_next = re.sub(
                re.escape(term),
                "[redacted_execution_instruction]",
                redacted,
                flags=re.IGNORECASE,
            )
            if redacted_next != redacted:
                changed = True
                redacted = redacted_next
        for pattern in BLOCKED_EXECUTION_PATTERNS:
            redacted_next = pattern.sub("[redacted_execution_instruction]", redacted)
            if redacted_next != redacted:
                changed = True
                redacted = redacted_next
        return redacted, changed
    if isinstance(value, list):
        changed = False
        items = []
        for item in value:
            redacted_item, item_changed = _redact_execution_terms(item)
            changed = changed or item_changed
            items.append(redacted_item)
        return items, changed
    if isinstance(value, dict):
        changed = False
        items = {}
        for key, item in value.items():
            redacted_key, key_changed = _redact_execution_terms(key)
            redacted_item, item_changed = _redact_execution_terms(item)
            changed = changed or key_changed or item_changed
            items[redacted_key] = redacted_item
        return items, changed
    return value, False


def _contains_sensitive_input_key(value: Any) -> bool:
    if isinstance(value, Mapping):
        for key, item in value.items():
            if str(key).lower() in SENSITIVE_INPUT_KEYS:
                return True
            if _contains_sensitive_input_key(item):
                return True
    if isinstance(value, list):
        return any(_contains_sensitive_input_key(item) for item in value)
    return False


def _safe_error(reason: str, err: BaseException) -> str:
    return f"{reason}:{err.__class__.__name__}"
