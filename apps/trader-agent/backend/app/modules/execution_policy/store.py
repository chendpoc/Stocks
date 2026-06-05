from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.intel.db.connection import get_intel_engine


def save_execution_policy(engine: Engine, policy: dict[str, Any]) -> dict[str, Any]:
    policy_id = str(policy["execution_policy_id"])
    created_at = str(policy["created_at"])
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO execution_policies (execution_policy_id, payload_json, created_at)
                VALUES (:id, :payload, :created)
                ON CONFLICT(execution_policy_id) DO UPDATE SET
                  payload_json = excluded.payload_json,
                  created_at = excluded.created_at
                """
            ),
            {
                "id": policy_id,
                "payload": json.dumps(policy, ensure_ascii=False),
                "created": created_at,
            },
        )
    return policy


def get_execution_policy(engine: Engine, execution_policy_id: str) -> dict[str, Any] | None:
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT payload_json FROM execution_policies
                WHERE execution_policy_id = :id
                """
            ),
            {"id": execution_policy_id},
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])
