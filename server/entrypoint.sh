#!/bin/sh
# Container entrypoint: run DB migrations, then launch the API server.
set -e

# Ensure the data + archive directories exist on the mounted volume.
mkdir -p /data "${LEDGER_ARCHIVE_DIR:-/data/archives}"

echo "[ledger] Applying database migrations..."
alembic upgrade head

echo "[ledger] Starting API server on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
