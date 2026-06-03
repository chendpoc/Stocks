from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine
from app.intel.features.scanner import list_signals
from app.intel.ingestion.market_data import get_bars_from_db
from app.intel.postmortem.evaluator import _parse_window_days
from app.intel.postmortem.lessons import list_lessons
from app.intel.trade.ideas import generate_trade_idea_from_hypothesis
from app.modules.json_row_codec import serialize_json_field

router = APIRouter()


class PredictionInput(BaseModel):
    window: str
    expected_outcome: str
    invalid_if: str


class HypothesisInput(BaseModel):
    signal_id: str
    claim: str
    professional_explanation: str
    plain_language_explanation: str
    candidate_explanations: list[str] = Field(default_factory=list)
    evidence_for: list[str] = Field(default_factory=list)
    evidence_against: list[str] = Field(default_factory=list)
    reasoning_gap: str | None = None
    missing_evidence: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    tradability: str = "watchlist"
    invalidation_condition: str = ""
    predictions: list[PredictionInput] = Field(default_factory=list)
    audit_warnings: list[str] = Field(default_factory=list)
    created_by: str = "cli"


@router.post("")
def save_hypothesis(request: Request, payload: HypothesisInput) -> dict:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)

    with engine.connect() as conn:
        signal_row = conn.execute(
            text("SELECT symbol FROM signals WHERE signal_id = :signal_id"),
            {"signal_id": payload.signal_id},
        ).fetchone()
    if not signal_row:
        raise HTTPException(status_code=404, detail="signal not found")

    symbol = str(signal_row[0])
    hypothesis_id = str(uuid4())
    reference_price = get_bars_from_db(engine, symbol, "1d", limit=1)
    ref_close = reference_price[-1]["close"] if reference_price else None

    hypothesis_row = {
        "hypothesis_id": hypothesis_id,
        "signal_id": payload.signal_id,
        "ts": utc_now_iso(),
        "symbol": symbol,
        "claim": payload.claim,
        "professional_explanation": payload.professional_explanation,
        "plain_language_explanation": payload.plain_language_explanation,
        "candidate_explanations": serialize_json_field(payload.candidate_explanations),
        "evidence_for": serialize_json_field(payload.evidence_for),
        "evidence_against": serialize_json_field(payload.evidence_against),
        "reasoning_gap": payload.reasoning_gap,
        "missing_evidence": serialize_json_field(payload.missing_evidence),
        "audit_warnings": serialize_json_field(payload.audit_warnings),
        "confidence": payload.confidence,
        "tradability": payload.tradability,
        "invalidation_condition": payload.invalidation_condition,
        "created_by": payload.created_by,
        "status": "pending",
    }

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO hypotheses
                (hypothesis_id, signal_id, ts, symbol, claim, professional_explanation,
                 plain_language_explanation, candidate_explanations, evidence_for,
                 evidence_against, reasoning_gap, missing_evidence, audit_warnings,
                 confidence, tradability, invalidation_condition, created_by, status)
                VALUES (:hypothesis_id, :signal_id, :ts, :symbol, :claim,
                        :professional_explanation, :plain_language_explanation,
                        :candidate_explanations, :evidence_for, :evidence_against,
                        :reasoning_gap, :missing_evidence, :audit_warnings, :confidence,
                        :tradability, :invalidation_condition, :created_by, :status)
                """
            ),
            hypothesis_row,
        )
        for pred in payload.predictions:
            days = _parse_window_days(pred.window)
            due_at = (datetime.now(UTC) + timedelta(days=days)).isoformat()
            conn.execute(
                text(
                    """
                    INSERT INTO predictions
                    (prediction_id, hypothesis_id, window, expected_outcome, invalid_if,
                     due_at, reference_price, status)
                    VALUES (:prediction_id, :hypothesis_id, :window, :expected_outcome,
                            :invalid_if, :due_at, :reference_price, 'pending')
                    """
                ),
                {
                    "prediction_id": str(uuid4()),
                    "hypothesis_id": hypothesis_id,
                    "window": pred.window,
                    "expected_outcome": pred.expected_outcome,
                    "invalid_if": pred.invalid_if,
                    "due_at": due_at,
                    "reference_price": ref_close,
                },
            )

    hypothesis_row["hypothesis_id"] = hypothesis_id
    trade_idea = generate_trade_idea_from_hypothesis(engine, hypothesis_row)
    return {
        "hypothesis_id": hypothesis_id,
        "symbol": symbol,
        "trade_idea": trade_idea,
    }


@router.get("")
def list_hypotheses(
    request: Request,
    symbol: str | None = None,
    limit: int = 20,
) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    clauses = ["1=1"]
    params: dict = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    where = " AND ".join(clauses)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT hypothesis_id, signal_id, ts, symbol, claim,
                       professional_explanation, plain_language_explanation,
                       confidence, tradability, invalidation_condition, status, created_at
                FROM hypotheses
                WHERE {where}
                ORDER BY ts DESC
                LIMIT :limit
                """
            ),
            params,
        ).mappings().all()
    return {"hypotheses": [dict(row) for row in rows]}
