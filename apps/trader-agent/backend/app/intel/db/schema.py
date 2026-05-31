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


def init_intel_db(settings: Settings | None = None, engine: Engine | None = None) -> Engine:
    eng = engine or get_intel_engine(settings)
    with eng.begin() as conn:
        for stmt in _SCHEMA_STATEMENTS:
            conn.execute(text(stmt))
        _migrate_lessons_columns(conn)
        _seed_symbols(conn)
        _seed_patterns(conn)
    logger.info("Intel database initialized")
    from app.intel.ingestion.seed_lessons import seed_lessons_if_empty

    seed_lessons_if_empty(settings, eng)
    return eng
