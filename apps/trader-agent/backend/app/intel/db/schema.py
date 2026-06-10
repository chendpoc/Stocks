from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.core.config import Settings
from app.intel import logger
from app.intel.db.connection import get_intel_engine

MVP_SYMBOLS = [
    ("TSLA", "Tesla Inc", "stock", "Consumer Discretionary", "QQQ", None),
    ("TSLL", "Direxion Daily TSLA Bull 2X", "leveraged_etf", None, "QQQ", "TSLA"),
    ("QQQ", "Invesco QQQ Trust", "etf", None, None, None),
    ("SPY", "SPDR S&P 500 ETF", "etf", None, None, None),
    ("ARKK", "ARK Innovation ETF", "etf", None, "QQQ", None),
    ("NVDA", "NVIDIA Corp", "stock", "Technology", "QQQ", None),
    ("COIN", "Coinbase Global", "stock", "Financials", "QQQ", None),
    ("BMNR", "Bitcoin Miner", "stock", "Crypto", "QQQ", None),
]

MVP_PATTERNS = [
    (
        "higher_low_accumulation",
        "higher_low_accumulation",
        "technical",
        "更高低点+下跌缩量=卖压可能衰竭。确认需反弹放量或站回关键位。风险：缩量也可能是无人买入。",
        "回踩→低点高于前低→成交量低于前次下跌",
        "回踩不破前低+下跌缩量",
        "放量跌破前低且无收回",
        '["TSLA","TSLL","NVDA"]',
        0.65,
        0,
    ),
    (
        "volume_contraction_pullback",
        "volume_contraction_pullback",
        "technical",
        "缩量回踩支撑位是潜在吸筹信号。必须等放量反弹确认，不能单独作为入场依据。",
        "下跌→缩量→触及支撑区域",
        "触及支撑+缩量+未破位",
        "放量跌破支撑且无收回",
        '["TSLA","TSLL","QQQ"]',
        0.60,
        0,
    ),
    (
        "vwap_reclaim",
        "vwap_reclaim",
        "technical",
        "价格站回VWAP上方且放量=盘中买方重新控盘。风险：无量站回VWAP后快速回落。",
        "盘中跌破VWAP→反弹→站回VWAP",
        "站回VWAP+放量+QQQ配合",
        "无量站回或QQQ反向破位",
        '["TSLA","TSLL","NVDA","QQQ"]',
        0.70,
        0,
    ),
    (
        "relative_strength_divergence",
        "relative_strength_divergence",
        "technical",
        "个股在QQQ下跌时抗跌=有独立买盘支撑。需区分真实强势vs滞后补跌。",
        "QQQ下跌→个股不跟跌或跌幅明显更小",
        "QQQ跌>1%且个股跌<0.3%或上涨",
        "个股补跌且放量跌破前低",
        '["TSLA","NVDA","COIN","BMNR"]',
        0.60,
        0,
    ),
    (
        "taco_pattern",
        "taco_pattern",
        "macro",
        "Trump强硬威胁→市场恐慌下跌→政策软化/延期→反弹。宏观节奏模式，非精确入场信号。风险：政策可能不软化。",
        "政策威胁→市场Risk-off→后续软化信号",
        "威胁言论+VIX上升+后续出现软化迹象",
        "政策升级而非软化，或VIX持续上行",
        '["QQQ","SPY","TSLA","TSLL","ARKK"]',
        0.55,
        0,
    ),
]

_SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS symbols (
      symbol TEXT PRIMARY KEY,
      name TEXT,
      asset_type TEXT,
      sector TEXT,
      benchmark_symbol TEXT,
      underlying_symbol TEXT,
      is_active INTEGER DEFAULT 1,
      notes TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS market_bars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      ts TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      vwap REAL,
      source TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(symbol, timeframe, ts)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_market_bars_symbol_tf_ts ON market_bars(symbol, timeframe, ts)",
    """
    CREATE TABLE IF NOT EXISTS feature_snapshots (
      feature_snapshot_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframe TEXT,
      asof_ts TEXT NOT NULL,
      features_json TEXT NOT NULL,
      tags_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_feature_snapshots_symbol ON feature_snapshots(symbol, created_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_snapshots_symbol_tf_asof ON feature_snapshots(symbol, timeframe, asof_ts)",
    """
    CREATE TABLE IF NOT EXISTS setup_events (
      setup_event_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_ts TEXT NOT NULL,
      setup_json TEXT NOT NULL,
      context_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_setup_events_symbol ON setup_events(symbol, event_ts)",
    "CREATE INDEX IF NOT EXISTS idx_setup_events_type ON setup_events(event_type)",
    """
    CREATE TABLE IF NOT EXISTS pattern_memories (
      pattern_memory_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      pattern_id TEXT NOT NULL,
      confidence REAL,
      memory_json TEXT NOT NULL,
      evidence_refs_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_pattern_memories_symbol ON pattern_memories(symbol, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_pattern_memories_pattern ON pattern_memories(pattern_id)",
    """
    CREATE TABLE IF NOT EXISTS failure_memories (
      failure_memory_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      failure_type TEXT NOT NULL,
      failed_ts TEXT NOT NULL,
      failure_json TEXT NOT NULL,
      context_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_failure_memories_symbol ON failure_memories(symbol, failed_ts)",
    "CREATE INDEX IF NOT EXISTS idx_failure_memories_type ON failure_memories(failure_type)",
    """
    CREATE TABLE IF NOT EXISTS session_context_packs (
      session_context_pack_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      symbol TEXT,
      context_pack_json TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_session_context_packs_symbol ON session_context_packs(symbol, created_at)",
    """
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      event_type TEXT,
      actor TEXT,
      title TEXT,
      raw_text TEXT,
      source TEXT,
      source_type TEXT,
      affected_symbols TEXT,
      confidence REAL DEFAULT 0.5,
      url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)",
    "CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)",
    """
    CREATE TABLE IF NOT EXISTS smart_money_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      actor TEXT NOT NULL,
      action_type TEXT NOT NULL,
      symbol TEXT NOT NULL,
      quantity REAL,
      value_estimate REAL,
      price_estimate REAL,
      source TEXT,
      delay_type TEXT,
      confidence REAL DEFAULT 0.5,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_smart_money_symbol_ts ON smart_money_actions(symbol, ts)",
    """
    CREATE TABLE IF NOT EXISTS patterns (
      pattern_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      typical_sequence TEXT,
      trigger_conditions TEXT,
      invalidation_conditions TEXT,
      affected_assets TEXT,
      reliability_score REAL DEFAULT 0.5,
      sample_size INTEGER DEFAULT 0,
      notes TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS signals (
      signal_id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      symbol TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      raw_description TEXT,
      severity REAL DEFAULT 0.5,
      feature_snapshot TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_signals_symbol_ts ON signals(symbol, ts)",
    """
    CREATE TABLE IF NOT EXISTS hypotheses (
      hypothesis_id TEXT PRIMARY KEY,
      signal_id TEXT,
      ts TEXT NOT NULL,
      symbol TEXT NOT NULL,
      claim TEXT NOT NULL,
      professional_explanation TEXT,
      plain_language_explanation TEXT,
      candidate_explanations TEXT,
      evidence_for TEXT,
      evidence_against TEXT,
      reasoning_gap TEXT,
      missing_evidence TEXT,
      audit_warnings TEXT,
      confidence REAL DEFAULT 0.5,
      tradability TEXT,
      invalidation_condition TEXT,
      created_by TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_hypotheses_symbol_ts ON hypotheses(symbol, ts)",
    """
    CREATE TABLE IF NOT EXISTS predictions (
      prediction_id TEXT PRIMARY KEY,
      hypothesis_id TEXT NOT NULL,
      window TEXT NOT NULL,
      expected_outcome TEXT,
      invalid_if TEXT,
      due_at TEXT,
      reference_price REAL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_predictions_due ON predictions(status, due_at)",
    """
    CREATE TABLE IF NOT EXISTS outcomes (
      outcome_id TEXT PRIMARY KEY,
      prediction_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      evaluated_at TEXT NOT NULL,
      return_pct REAL,
      relative_return_vs_benchmark REAL,
      max_favorable_excursion REAL,
      max_adverse_excursion REAL,
      invalidation_triggered INTEGER,
      verdict TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS lessons (
      lesson_id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      symbol TEXT,
      symbols_json TEXT,
      pattern_id TEXT,
      explanation_type TEXT,
      market_regime TEXT,
      lesson_text TEXT NOT NULL,
      summary TEXT,
      rule_text TEXT,
      tags_json TEXT,
      confidence REAL DEFAULT 0.5,
      source_type TEXT,
      when_to_apply TEXT,
      when_not_to_apply TEXT,
      weight_update TEXT,
      verdict TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_lessons_symbol ON lessons(symbol)",
    """
    CREATE TABLE IF NOT EXISTS trade_ideas (
      trade_idea_id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT,
      setup_type TEXT,
      status TEXT,
      thesis TEXT,
      trigger_conditions TEXT,
      invalidation_conditions TEXT,
      suggested_structure TEXT,
      risk_notes TEXT,
      confidence REAL DEFAULT 0.5,
      hypothesis_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_trade_ideas_symbol_status ON trade_ideas(symbol, status)",
    """
    CREATE TABLE IF NOT EXISTS report_cache (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      report_date TEXT NOT NULL,
      latest_signal_ts TEXT,
      report_json TEXT NOT NULL,
      content_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(symbol, report_date, latest_signal_ts)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_report_cache_symbol_date ON report_cache(symbol, report_date)",
    """
    CREATE TABLE IF NOT EXISTS context_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      asof_ts TEXT NOT NULL,
      context_version TEXT,
      items_json TEXT NOT NULL,
      evidence_refs_json TEXT,
      weighting_policy_version TEXT,
      context_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(context_hash)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_context_snapshots_symbol ON context_snapshots(symbol, created_at)",
    """
    CREATE TABLE IF NOT EXISTS model_decisions (
      decision_id TEXT PRIMARY KEY,
      run_id TEXT,
      snapshot_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      model_provider TEXT,
      model_name TEXT,
      model_version TEXT,
      action TEXT NOT NULL,
      confidence REAL,
      uncertainty REAL,
      decision_json TEXT NOT NULL,
      human_overrides_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_model_decisions_symbol ON model_decisions(symbol, created_at)",
    """
    CREATE TABLE IF NOT EXISTS decision_outcomes (
      outcome_id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      horizon TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT 'model_path',
      status TEXT NOT NULL DEFAULT 'pending',
      due_at TEXT,
      scheduled_at TEXT,
      reference_price REAL,
      future_price REAL,
      absolute_return_pct REAL,
      benchmark_symbol TEXT,
      benchmark_return_pct REAL,
      relative_return_pct REAL,
      hit_invalidation_proxy INTEGER,
      hit_target_proxy INTEGER,
      label TEXT,
      outcome_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT,
      labeled_at TEXT,
      UNIQUE(decision_id, horizon, path)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_decision_outcomes_due ON decision_outcomes(status, due_at)",
    "CREATE INDEX IF NOT EXISTS idx_decision_outcomes_decision ON decision_outcomes(decision_id)",
    """
    CREATE TABLE IF NOT EXISTS insight_candidates (
      insight_id TEXT PRIMARY KEY,
      run_id TEXT,
      symbols_json TEXT NOT NULL,
      window_start TEXT,
      window_end TEXT,
      thesis TEXT,
      evidence_refs_json TEXT,
      verification_status TEXT DEFAULT 'pending',
      weight_cap REAL,
      candidate_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_insight_candidates_symbol ON insight_candidates(created_at)",
    """
    CREATE TABLE IF NOT EXISTS insight_candidate_outcomes (
      outcome_id TEXT PRIMARY KEY,
      insight_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      horizon TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_at TEXT,
      scheduled_at TEXT,
      normalized_label TEXT,
      metrics_json TEXT,
      reason_codes_json TEXT,
      evidence_refs_json TEXT,
      outcome_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      labeled_at TEXT,
      UNIQUE(insight_id, horizon)
    )
    """,
    (
      "CREATE INDEX IF NOT EXISTS idx_insight_candidate_outcomes_due"
      " ON insight_candidate_outcomes(status, due_at)"
    ),
    "CREATE INDEX IF NOT EXISTS idx_insight_candidate_outcomes_insight ON insight_candidate_outcomes(insight_id)",
    """
    CREATE TABLE IF NOT EXISTS evaluation_reports (
      report_id TEXT PRIMARY KEY,
      model_version TEXT NOT NULL,
      window_start TEXT,
      window_end TEXT,
      metrics_json TEXT,
      recommendation TEXT NOT NULL,
      report_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_evaluation_reports_model ON evaluation_reports(model_version, created_at)",
    """
    CREATE TABLE IF NOT EXISTS weighting_policy_stats (
      policy_version TEXT NOT NULL,
      source_key TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (policy_version, source_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS m2_provider_traces (
      provider_trace_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_m2_provider_traces_symbol ON m2_provider_traces(symbol, received_at)",
    """
    CREATE TABLE IF NOT EXISTS m2_quote_snapshots (
      quote_snapshot_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      asof_ts TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_m2_quote_snapshots_symbol ON m2_quote_snapshots(symbol, asof_ts)",
    """
    CREATE TABLE IF NOT EXISTS m2_market_state_snapshots (
      market_state_snapshot_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      asof_ts TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_m2_market_state_symbol ON m2_market_state_snapshots(symbol, asof_ts)",
    """
    CREATE TABLE IF NOT EXISTS m2_order_book_snapshots (
      order_book_snapshot_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      asof_ts TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_m2_order_book_symbol ON m2_order_book_snapshots(symbol, asof_ts)",
    """
    CREATE TABLE IF NOT EXISTS m2_trade_ticks (
      trade_tick_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      asof_ts TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_m2_trade_ticks_symbol ON m2_trade_ticks(symbol, asof_ts)",
    """
    CREATE TABLE IF NOT EXISTS execution_policies (
      execution_policy_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS guided_paper_runs (
      run_id TEXT PRIMARY KEY,
      execution_policy_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_guided_paper_runs_policy ON guided_paper_runs(execution_policy_id)",
    """
    CREATE TABLE IF NOT EXISTS paper_order_intents (
      order_intent_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      market_state_snapshot_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS paper_order_events (
      order_event_id TEXT PRIMARY KEY,
      order_intent_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      event_ts TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_paper_order_events_intent ON paper_order_events(order_intent_id)",
    """
    CREATE TABLE IF NOT EXISTS paper_position_snapshots (
      position_snapshot_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      asof_ts TEXT NOT NULL
    )
    """,
]


def _seed_symbols(conn) -> None:
    for row in MVP_SYMBOLS:
        conn.execute(
            text(
                """
                INSERT OR IGNORE INTO symbols
                (symbol, name, asset_type, sector, benchmark_symbol, underlying_symbol)
                VALUES (:symbol, :name, :asset_type, :sector, :benchmark, :underlying)
                """
            ),
            {
                "symbol": row[0],
                "name": row[1],
                "asset_type": row[2],
                "sector": row[3],
                "benchmark": row[4],
                "underlying": row[5],
            },
        )


def _seed_patterns(conn) -> None:
    for row in MVP_PATTERNS:
        conn.execute(
            text(
                """
                INSERT OR IGNORE INTO patterns
                (pattern_id, name, category, description, typical_sequence,
                 trigger_conditions, invalidation_conditions, affected_assets,
                 reliability_score, sample_size)
                VALUES (:pattern_id, :name, :category, :description, :typical_sequence,
                        :trigger_conditions, :invalidation_conditions, :affected_assets,
                        :reliability_score, :sample_size)
                """
            ),
            {
                "pattern_id": row[0],
                "name": row[1],
                "category": row[2],
                "description": row[3],
                "typical_sequence": row[4],
                "trigger_conditions": row[5],
                "invalidation_conditions": row[6],
                "affected_assets": row[7],
                "reliability_score": row[8],
                "sample_size": row[9],
            },
        )


_LESSON_COLUMN_MIGRATIONS = (
    ("symbols_json", "TEXT"),
    ("summary", "TEXT"),
    ("rule_text", "TEXT"),
    ("tags_json", "TEXT"),
    ("confidence", "REAL DEFAULT 0.5"),
    ("source_type", "TEXT"),
)


def _migrate_lessons_columns(conn) -> None:
    existing = {
        row[1] for row in conn.execute(text("PRAGMA table_info(lessons)")).fetchall()
    }
    for column, ddl in _LESSON_COLUMN_MIGRATIONS:
        if column not in existing:
            conn.execute(text(f"ALTER TABLE lessons ADD COLUMN {column} {ddl}"))


_MARKET_BARS_COLUMN_MIGRATIONS = (
    ("ingested_at", "TEXT"),
    ("quality_status", "TEXT"),
)


def _migrate_market_bars_columns(conn) -> None:
    existing = {
        row[1] for row in conn.execute(text("PRAGMA table_info(market_bars)")).fetchall()
    }
    for column, ddl in _MARKET_BARS_COLUMN_MIGRATIONS:
        if column not in existing:
            conn.execute(text(f"ALTER TABLE market_bars ADD COLUMN {column} {ddl}"))


_PATTERN_TRIGGER_SQL = {
    "taco_pattern": (
        "SELECT COUNT(*) FROM events WHERE event_type='policy_threat' "
        "AND ts > date('now','-3 days')"
    ),
    "higher_low_accumulation": (
        "SELECT COUNT(*) FROM signals WHERE signal_type='higher_low_candidate' "
        "AND ts > datetime('now','-1 day')"
    ),
    "volume_contraction_pullback": (
        "SELECT COUNT(*) FROM signals WHERE signal_type='volume_contraction' "
        "AND ts > datetime('now','-1 day')"
    ),
    "vwap_reclaim": (
        "SELECT COUNT(*) FROM signals WHERE signal_type='reclaim_vwap' "
        "AND ts > datetime('now','-4 hour')"
    ),
    "relative_strength_divergence": (
        "SELECT COUNT(*) FROM signals WHERE signal_type IN ('relative_weakness','relative_strength') "
        "AND ts > datetime('now','-1 day')"
    ),
}


def _migrate_pattern_trigger_sql(conn) -> None:
    existing = {
        row[1] for row in conn.execute(text("PRAGMA table_info(patterns)")).fetchall()
    }
    if "trigger_sql" not in existing:
        conn.execute(text("ALTER TABLE patterns ADD COLUMN trigger_sql TEXT"))
    for pattern_id, sql in _PATTERN_TRIGGER_SQL.items():
        conn.execute(
            text(
                """
                UPDATE patterns SET trigger_sql = :sql
                WHERE pattern_id = :pid AND (trigger_sql IS NULL OR trigger_sql = '')
                """
            ),
            {"sql": sql, "pid": pattern_id},
        )


def init_intel_db(settings: Settings | None = None, engine: Engine | None = None) -> Engine:
    eng = engine or get_intel_engine(settings)
    with eng.begin() as conn:
        for stmt in _SCHEMA_STATEMENTS:
            conn.execute(text(stmt))
        _migrate_lessons_columns(conn)
        _migrate_market_bars_columns(conn)
        _seed_symbols(conn)
        _seed_patterns(conn)
        _migrate_pattern_trigger_sql(conn)
    logger.info("Intel database initialized")
    from app.intel.ingestion.seed_lessons import seed_lessons_if_empty

    seed_lessons_if_empty(settings, eng)
    return eng
