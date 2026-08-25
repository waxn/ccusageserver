# ---- Stage 1: build the frontend ----
FROM node:22-slim AS frontend
WORKDIR /frontend

# Install deps first for better layer caching.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build
# Vite outputs to /frontend/dist

# ---- Stage 2: python runtime ----
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    LEDGER_DATABASE_URL=sqlite:////data/ledger.db \
    LEDGER_ARCHIVE_DIR=/data/archives

WORKDIR /app

# System deps: curl for healthcheck; build tools not needed (wheels available).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# App code + migrations.
COPY server/ ./
# The agent scripts are served by the API (install.sh, ledger-agent.sh).
COPY agent/ /app/agent/

# Compiled frontend served as static files.
COPY --from=frontend /frontend/dist ./static

COPY server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
