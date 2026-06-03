import json

from app.intel.schemas.stage1_records import ContextSnapshotOut
from app.modules.json_row_codec import (
    deserialize_json_fields_in_row,
    serialize_json_field,
    serialize_json_fields_in_row,
)


def test_serialize_and_deserialize_round_trip() -> None:
    items = [{"item_id": "signal:1", "summary": "test"}]
    text_items = serialize_json_field(items)
    row = {"items_json": text_items, "evidence_refs_json": "[]"}
    decoded = deserialize_json_fields_in_row(
        row,
        ("items_json", "evidence_refs_json"),
        default=[],
    )
    assert decoded["items_json"] == items
    assert decoded["evidence_refs_json"] == []


def test_deserialize_is_idempotent_on_parsed_values() -> None:
    row = {"items_json": [{"a": 1}], "evidence_refs_json": []}
    once = deserialize_json_fields_in_row(row, ("items_json", "evidence_refs_json"), default=[])
    twice = deserialize_json_fields_in_row(once, ("items_json", "evidence_refs_json"), default=[])
    assert twice == once


def test_context_snapshot_out_decodes_sqlite_row() -> None:
    items = [{"source": "signal", "weight": 1.0}]
    row = {
        "snapshot_id": "snap-1",
        "symbol": "TSLA",
        "asof_ts": "2026-06-01T12:00:00Z",
        "context_version": "v1",
        "items_json": json.dumps(items),
        "evidence_refs_json": json.dumps([{"ref": "sig-1"}]),
        "weighting_policy_version": "wp-v1",
        "context_hash": "hash-abc",
        "created_at": "2026-06-01T12:00:01Z",
    }
    out = ContextSnapshotOut.from_db_row(row)
    assert isinstance(out.items_json, list)
    assert out.items_json[0]["source"] == "signal"


def test_serialize_json_fields_in_row() -> None:
    row = {"tags_json": ["a"], "title": "x"}
    encoded = serialize_json_fields_in_row(row, ("tags_json",))
    assert encoded["title"] == "x"
    assert isinstance(encoded["tags_json"], str)
    assert json.loads(encoded["tags_json"]) == ["a"]
