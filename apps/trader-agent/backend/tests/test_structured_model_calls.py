from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events
from app.db.session import create_sqlite_engine
from app.modules.structured_model_calls import (
    ProviderStructuredModelCallError,
    StructuredModelCallError,
    TimeoutStructuredModelCallError,
    canonical_input_digest,
    generate_structured_model_result,
)


def _settings(temp_settings, **overrides) -> Settings:
    values = {
        "repo_root": temp_settings.repo_root,
        "data_dir": temp_settings.data_dir,
        "rulepack_path": temp_settings.rulepack_path,
        "enable_event_jsonl_mirror": False,
    }
    values.update(overrides)
    return Settings(**values)


def _request(**overrides) -> dict:
    payload = {"headline": "Company beats estimates", "source": "fixture"}
    request = {
        "task_type": "news_event_classification",
        "schema_name": "news_event_classification",
        "model_channel": "deepseek_direct",
        "evidence_ids": ["ev-1"],
        "input_payload": payload,
        "input_digest": canonical_input_digest(payload),
        "cost_policy": {"category": "bounded_structural", "manual_approval_required": True},
    }
    request.update(overrides)
    return request


def _events(settings: Settings) -> list[dict]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = (
            conn.execute(select(agent_events).order_by(agent_events.c.timestamp))
            .mappings()
            .all()
        )
    return [dict(row) for row in rows]


def _event_output(row: dict) -> dict:
    return json.loads(row["output_summary"])


def test_disabled_deepseek_rejects_before_transport(temp_settings) -> None:
    settings = _settings(temp_settings)
    bootstrap_database(settings)
    called = False

    def transport(_url, _headers, _payload, _timeout):
        nonlocal called
        called = True
        return {}

    with pytest.raises(StructuredModelCallError, match="disabled"):
        generate_structured_model_result(settings, _request(), deepseek_transport=transport)

    assert called is False
    events = _events(settings)
    assert events[-1]["event_type"] == "structured_model_call.rejected"
    assert events[-1]["status"] == "rejected"
    assert _event_output(events[-1])["reason"] == "model_channel_disabled"


def test_missing_deepseek_api_key_rejects_before_transport(temp_settings) -> None:
    settings = _settings(temp_settings, enabled_model_channels=frozenset({"deepseek_direct"}))
    bootstrap_database(settings)
    called = False

    def transport(_url, _headers, _payload, _timeout):
        nonlocal called
        called = True
        return {}

    with pytest.raises(StructuredModelCallError, match="api key"):
        generate_structured_model_result(settings, _request(), deepseek_transport=transport)

    assert called is False
    assert _event_output(_events(settings)[-1])["reason"] == "missing_deepseek_api_key"


def test_disabled_codex_runtime_rejects_before_runner(temp_settings) -> None:
    settings = _settings(temp_settings)
    bootstrap_database(settings)
    called = False

    def runner(_executable, _prompt, _timeout):
        nonlocal called
        called = True
        return {}

    with pytest.raises(StructuredModelCallError, match="disabled"):
        generate_structured_model_result(
            settings,
            _request(model_channel="codex_cli_runtime"),
            codex_runner=runner,
        )

    assert called is False
    assert _event_output(_events(settings)[-1])["reason"] == "model_channel_disabled"


def test_enabled_codex_runtime_without_executable_rejects_before_runner(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"codex_cli_runtime"}),
    )
    bootstrap_database(settings)
    called = False

    def runner(_executable, _prompt, _timeout):
        nonlocal called
        called = True
        return {}

    with pytest.raises(StructuredModelCallError, match="executable"):
        generate_structured_model_result(
            settings,
            _request(model_channel="codex_cli_runtime"),
            codex_runner=runner,
        )

    assert called is False
    assert _event_output(_events(settings)[-1])["reason"] == "missing_codex_cli_executable"


def test_codex_prompt_too_large_rejects_before_runner(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"codex_cli_runtime"}),
        codex_cli_executable=temp_settings.repo_root / "fake-codex.exe",
        codex_cli_max_prompt_chars=20,
    )
    bootstrap_database(settings)
    called = False

    def runner(_executable, _prompt, _timeout):
        nonlocal called
        called = True
        return {}

    with pytest.raises(StructuredModelCallError, match="prompt"):
        generate_structured_model_result(
            settings,
            _request(model_channel="codex_cli_runtime"),
            codex_runner=runner,
        )

    assert called is False
    assert _event_output(_events(settings)[-1])["reason"] == "codex_prompt_too_large"


def test_digest_mismatch_rejects_before_provider(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)
    called = False

    def transport(_url, _headers, _payload, _timeout):
        nonlocal called
        called = True
        return {}

    with pytest.raises(StructuredModelCallError, match="digest"):
        generate_structured_model_result(
            settings,
            _request(input_digest="API_KEY_SECRET", evidence_ids=["RAW_PROMPT_SECRET"]),
            deepseek_transport=transport,
        )

    assert called is False
    event = _events(settings)[-1]
    event_text = json.dumps(
        {
            "input_summary": json.loads(event["input_summary"]),
            "output_summary": json.loads(event["output_summary"]),
            "error": event["error"],
        },
        ensure_ascii=False,
    )
    assert _event_output(event)["reason"] == "input_digest_mismatch"
    assert "API_KEY_SECRET" not in event_text
    assert "RAW_PROMPT_SECRET" not in event_text


def test_missing_evidence_ids_rejects_before_provider(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)
    called = False

    def transport(_url, _headers, _payload, _timeout):
        nonlocal called
        called = True
        return {}

    with pytest.raises(StructuredModelCallError, match="evidence"):
        generate_structured_model_result(
            settings,
            _request(evidence_ids=[]),
            deepseek_transport=transport,
        )

    assert called is False
    assert _event_output(_events(settings)[-1])["reason"] == "missing_evidence_ids"


def test_sensitive_input_payload_rejects_before_provider(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)
    payload = {"headline": "Company beats estimates", "api_key": "secret-value"}
    called = False

    def transport(_url, _headers, _payload, _timeout):
        nonlocal called
        called = True
        return {}

    with pytest.raises(StructuredModelCallError, match="sensitive"):
        generate_structured_model_result(
            settings,
            _request(input_payload=payload, input_digest=canonical_input_digest(payload)),
            deepseek_transport=transport,
        )

    assert called is False
    assert _event_output(_events(settings)[-1])["reason"] == "sensitive_input_rejected"


def test_schema_validation_failure_rejects_output(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)

    def transport(_url, _headers, _payload, _timeout):
        return {"choices": [{"message": {"content": json.dumps({"summary": "missing category"})}}]}

    with pytest.raises(StructuredModelCallError, match="schema"):
        generate_structured_model_result(settings, _request(), deepseek_transport=transport)

    event = _events(settings)[-1]
    assert event["event_type"] == "structured_model_call.schema_failed"
    assert event["status"] == "failed"
    assert "missing category" not in event["error"]
    assert "ValidationError" in event["error"]


def test_invalid_request_error_does_not_persist_raw_payload(temp_settings) -> None:
    settings = _settings(temp_settings)
    bootstrap_database(settings)

    with pytest.raises(StructuredModelCallError, match="invalid_request"):
        generate_structured_model_result(
            settings,
            {
                **_request(),
                "input_payload": "RAW_PROMPT_SECRET",
                "input_digest": canonical_input_digest({"safe": "payload"}),
            },
        )

    event = _events(settings)[-1]
    assert event["event_type"] == "structured_model_call.rejected"
    assert "RAW_PROMPT_SECRET" not in event["error"]
    assert "ValidationError" in event["error"]


def test_invalid_request_metadata_does_not_persist_raw_prompt_or_key(temp_settings) -> None:
    settings = _settings(temp_settings)
    bootstrap_database(settings)

    with pytest.raises(StructuredModelCallError):
        generate_structured_model_result(
            settings,
            {
                **_request(),
                "task_type": "RAW_PROMPT_SECRET",
                "schema_name": "RAW_PROMPT_SECRET",
                "model_channel": "RAW_PROMPT_SECRET",
                "evidence_ids": ["RAW_PROMPT_SECRET"],
                "input_digest": "API_KEY_SECRET",
                "input_payload": "RAW_PROMPT_SECRET",
            },
        )

    event = _events(settings)[-1]
    serialized_event = json.dumps(
        {
            "input_summary": json.loads(event["input_summary"]),
            "output_summary": json.loads(event["output_summary"]),
            "error": event["error"],
        },
        ensure_ascii=False,
    )
    assert "RAW_PROMPT_SECRET" not in serialized_event
    assert "API_KEY_SECRET" not in serialized_event
    assert _event_output(event)["evidence_id_count"] == 1


def test_provider_timeout_is_typed_and_audited(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)

    def transport(_url, _headers, _payload, _timeout):
        raise TimeoutError("provider timed out")

    with pytest.raises(TimeoutStructuredModelCallError):
        generate_structured_model_result(settings, _request(), deepseek_transport=transport)

    event = _events(settings)[-1]
    assert event["event_type"] == "structured_model_call.timeout"
    assert event["status"] == "failed"
    assert "TimeoutError" in event["error"]


def test_provider_builtin_timeout_is_typed_and_audited(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)

    def transport(_url, _headers, _payload, _timeout):
        raise TimeoutError("socket timed out")

    with pytest.raises(TimeoutStructuredModelCallError):
        generate_structured_model_result(settings, _request(), deepseek_transport=transport)

    assert _events(settings)[-1]["event_type"] == "structured_model_call.timeout"


def test_provider_error_is_audited(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)

    def transport(_url, _headers, _payload, _timeout):
        raise RuntimeError("provider rejected request")

    with pytest.raises(StructuredModelCallError, match="provider"):
        generate_structured_model_result(settings, _request(), deepseek_transport=transport)

    event = _events(settings)[-1]
    assert event["event_type"] == "structured_model_call.provider_failed"
    assert event["status"] == "failed"
    assert "provider rejected request" not in event["error"]
    assert "RuntimeError" in event["error"]


def test_provider_error_does_not_persist_raw_stderr_or_prompt(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"codex_cli_runtime"}),
        codex_cli_executable=temp_settings.repo_root / "fake-codex.exe",
    )
    bootstrap_database(settings)

    def runner(_executable, _prompt, _timeout):
        raise ProviderStructuredModelCallError("RAW_PROMPT_SECRET from stderr")

    with pytest.raises(ProviderStructuredModelCallError, match="provider") as excinfo:
        generate_structured_model_result(
            settings,
            _request(model_channel="codex_cli_runtime"),
            codex_runner=runner,
        )

    event = _events(settings)[-1]
    assert event["event_type"] == "structured_model_call.provider_failed"
    assert "RAW_PROMPT_SECRET" not in event["error"]
    assert "ProviderStructuredModelCallError" in event["error"]
    assert "RAW_PROMPT_SECRET" not in str(excinfo.value)
    assert excinfo.value.__cause__ is None


def test_successful_mocked_deepseek_generation_returns_validated_result(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)
    request = _request()
    captured = {}

    def transport(url, headers, payload, timeout):
        captured.update({"url": url, "headers": headers, "payload": payload, "timeout": timeout})
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "category": "earnings",
                                "summary": "Company reported stronger revenue.",
                                "confidence": 0.82,
                                "evidence_ids": ["ev-1"],
                            }
                        )
                    }
                }
            ]
        }

    result = generate_structured_model_result(settings, request, deepseek_transport=transport)

    assert result == {
        "task_type": "news_event_classification",
        "schema_name": "news_event_classification",
        "model_channel": "deepseek_direct",
        "evidence_ids": ["ev-1"],
        "input_digest": request["input_digest"],
        "result": {
            "category": "earnings",
            "summary": "Company reported stronger revenue.",
            "confidence": 0.82,
            "evidence_ids": ["ev-1"],
        },
    }
    assert captured["url"] == settings.deepseek_base_url
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["timeout"] == settings.model_call_timeout_seconds
    assert captured["payload"]["model"] == settings.deepseek_model
    event = _events(settings)[-1]
    assert event["event_type"] == "structured_model_call.completed"
    assert event["status"] == "completed"
    assert _event_output(event)["model_channel"] == "deepseek_direct"


def test_successful_mocked_codex_runtime_generation_returns_validated_result(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"codex_cli_runtime"}),
        codex_cli_executable=temp_settings.repo_root / "fake-codex.exe",
    )
    bootstrap_database(settings)
    request = _request(
        model_channel="codex_cli_runtime",
        task_type="evidence_summary",
        schema_name="evidence_summary",
    )
    captured = {}

    def runner(executable, prompt, timeout):
        captured.update({"executable": executable, "prompt": prompt, "timeout": timeout})
        return json.dumps(
            {
                "summary": "Evidence is positive but narrow.",
                "conflicts": [],
                "evidence_ids": ["ev-1"],
            }
        )

    result = generate_structured_model_result(settings, request, codex_runner=runner)

    assert result["model_channel"] == "codex_cli_runtime"
    assert result["result"]["summary"] == "Evidence is positive but narrow."
    assert captured["executable"] == settings.codex_cli_executable
    assert len(captured["prompt"]) <= settings.codex_cli_max_prompt_chars
    assert _events(settings)[-1]["event_type"] == "structured_model_call.completed"


def test_model_output_execution_terms_are_redacted_and_audited(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)
    request = _request(task_type="evidence_summary", schema_name="evidence_summary")

    def transport(_url, _headers, _payload, _timeout):
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "summary": "Do not place order from this evidence.",
                                "conflicts": ["ticket_ready is not allowed"],
                                "evidence_ids": ["ev-1"],
                            }
                        )
                    }
                }
            ]
        }

    result = generate_structured_model_result(settings, request, deepseek_transport=transport)

    result_text = json.dumps(result["result"], ensure_ascii=False).lower()
    assert "place order" not in result_text
    assert "ticket_ready" not in result_text
    events = _events(settings)
    assert any(event["event_type"] == "structured_model_call.redacted" for event in events)


def test_direct_execution_intent_terms_are_redacted_and_audited(temp_settings) -> None:
    settings = _settings(
        temp_settings,
        enabled_model_channels=frozenset({"deepseek_direct"}),
        deepseek_api_key="test-key",
    )
    bootstrap_database(settings)
    request = _request(task_type="evidence_summary", schema_name="evidence_summary")

    def transport(_url, _headers, _payload, _timeout):
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "summary": "Buy AAPL now and sell the position later.",
                                "conflicts": [
                                    "submit an order",
                                    "open a long position",
                                ],
                                "evidence_ids": ["ev-1"],
                            }
                        )
                    }
                }
            ]
        }

    result = generate_structured_model_result(settings, request, deepseek_transport=transport)

    result_text = json.dumps(result["result"], ensure_ascii=False).lower()
    forbidden = (
        "buy aapl",
        "sell the position",
        "submit an order",
        "open a long position",
    )
    assert not any(term in result_text for term in forbidden)
    assert any(
        event["event_type"] == "structured_model_call.redacted" for event in _events(settings)
    )
