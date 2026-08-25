"""Ledger FastAPI application entrypoint.

Serves the JSON API, the dynamically-rendered agent install script, and the
compiled frontend (single deployable container).
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import settings
from .routers import auth, crypto, devices, enrollment, export, usage

app = FastAPI(
    title="Ledger — Coding-Agent Usage Tracker",
    version=__version__,
    description="Self-hosted, permanent-retention usage tracking for AI coding tools.",
)

app.include_router(auth.router)
app.include_router(enrollment.router)
app.include_router(devices.router)
app.include_router(usage.router)
app.include_router(crypto.router)
app.include_router(export.router)

# Resolve paths relative to this file so it works both in Docker and locally.
_APP_DIR = os.path.dirname(os.path.abspath(__file__))
_SERVER_DIR = os.path.dirname(_APP_DIR)
_REPO_DIR = os.path.dirname(_SERVER_DIR)


def _resolve_agent_dir() -> str:
    """Locate the bundled agent scripts across dev and container layouts."""
    override = os.environ.get("LEDGER_AGENT_DIR")
    candidates = [
        c
        for c in (
            override,
            os.path.join(_SERVER_DIR, "agent"),  # container: /app/agent
            os.path.join(_REPO_DIR, "agent"),  # local checkout: <repo>/agent
        )
        if c
    ]
    for c in candidates:
        if os.path.isfile(os.path.join(c, "install.sh")):
            return c
    return candidates[-1]


_AGENT_DIR = _resolve_agent_dir()
_FRONTEND_DIST = os.environ.get(
    "LEDGER_FRONTEND_DIST", os.path.join(_SERVER_DIR, "static")
)


@app.on_event("startup")
def _ensure_dirs() -> None:
    os.makedirs(settings.archive_dir, exist_ok=True)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "version": __version__}


@app.get("/api/meta", tags=["meta"])
def meta(request: Request) -> dict:
    base = settings.public_base_url.rstrip("/") or str(request.base_url).rstrip("/")
    return {
        "version": __version__,
        "ccusage_version": settings.ccusage_version,
        "base_url": base,
        "device_stale_after_hours": settings.device_stale_after_hours,
    }


def _render_install_script(base_url: str) -> str:
    template_path = os.path.join(_AGENT_DIR, "install.sh")
    with open(template_path, "r", encoding="utf-8") as fh:
        script = fh.read()
    # Inject server-known defaults so the one-liner needs only the token.
    script = script.replace("@@LEDGER_SERVER_URL@@", base_url)
    script = script.replace("@@LEDGER_CCUSAGE_VERSION@@", settings.ccusage_version)
    return script


@app.get("/install.sh", include_in_schema=False)
def install_script(request: Request) -> PlainTextResponse:
    base = settings.public_base_url.rstrip("/") or str(request.base_url).rstrip("/")
    return PlainTextResponse(
        _render_install_script(base), media_type="text/x-shellscript"
    )


@app.get("/ledger-agent.sh", include_in_schema=False)
def agent_script() -> FileResponse:
    return FileResponse(
        os.path.join(_AGENT_DIR, "ledger-agent.sh"),
        media_type="text/x-shellscript",
        filename="ledger-agent.sh",
    )


# --- Frontend (SPA) --------------------------------------------------------
# Mounted last so API routes take precedence. If the frontend hasn't been built
# yet, we degrade gracefully to a small placeholder.

if os.path.isdir(_FRONTEND_DIST) and os.path.isfile(os.path.join(_FRONTEND_DIST, "index.html")):

    class SPAStaticFiles(StaticFiles):
        """Serve static assets, falling back to index.html for client routes."""

        async def get_response(self, path: str, scope):  # type: ignore[override]
            from starlette.exceptions import HTTPException as StarletteHTTPException

            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code == 404:
                    return await super().get_response("index.html", scope)
                raise

    app.mount("/", SPAStaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
else:

    @app.get("/", include_in_schema=False)
    def _no_frontend() -> PlainTextResponse:
        return PlainTextResponse(
            "Ledger API is running, but the frontend has not been built.\n"
            "Build it with: cd frontend && npm install && npm run build\n"
            "API docs: /docs\n"
        )
