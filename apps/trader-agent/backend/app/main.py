from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent import knowledge_router
from app.api.agent import router as agent_router
from app.core.config import Settings

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
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(agent_router)
    app.include_router(knowledge_router)
    return app


app = create_app()
