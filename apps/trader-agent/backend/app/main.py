from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent import knowledge_router
from app.api.agent import router as agent_router
from app.api.rule_candidates import router as rule_candidates_router
from app.core.config import Settings
from app.intel.api import intel_router
from app.intel.db.schema import init_intel_db

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
]


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Trader Agent Backend")
    app.state.settings = settings or Settings()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_DEFAULT_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str | int]:
        intel_route_count = sum(
            1
            for route in app.routes
            if getattr(route, "path", None) and "/api/intel" in route.path
        )
        return {"status": "ok", "intel_route_count": intel_route_count}

    app.include_router(agent_router)
    app.include_router(knowledge_router)
    app.include_router(rule_candidates_router)
    app.include_router(intel_router, prefix="/api/intel")
    init_intel_db(app.state.settings)
    return app


app = create_app()
