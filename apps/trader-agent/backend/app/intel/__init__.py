from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger("intel")
_level = os.getenv("INTEL_LOG_LEVEL", "INFO").upper()
logger.setLevel(getattr(logging, _level, logging.INFO))
_handler = logging.StreamHandler(sys.stderr)
_handler.setFormatter(
    logging.Formatter("[%(asctime)s] %(levelname)s %(name)s:%(lineno)d — %(message)s")
)
logger.addHandler(_handler)
logger.propagate = False
