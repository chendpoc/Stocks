from __future__ import annotations

from fastapi import FastAPI

from app.api.agent import knowledge_router
from app.api.agent import router as agent_router
from app.core.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Trader Agent Backend")
    app.state.settings = settings or Settings()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(agent_router)
    app.include_router(knowledge_router)
    return app


app = create_app()
