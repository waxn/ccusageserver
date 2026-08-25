"""Test fixtures. Env vars are set *before* importing app modules so the
engine/settings pick up an isolated temp database and archive directory.
"""

from __future__ import annotations

import os
import tempfile

import pytest

# Configure an isolated environment before the app imports its settings.
_TMP = tempfile.mkdtemp(prefix="ledger-test-")
os.environ.setdefault("LEDGER_SECRET_KEY", "test-secret-key-not-for-production")
os.environ["LEDGER_DATABASE_URL"] = f"sqlite:///{os.path.join(_TMP, 'test.db')}"
os.environ["LEDGER_ARCHIVE_DIR"] = os.path.join(_TMP, "archives")
os.environ["LEDGER_ENROLLMENT_TOKEN_EXPIRE_HOURS"] = "24"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_client(client):
    """A client with a registered, logged-in user (unique email per test)."""
    import uuid

    email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/api/auth/register", json={"email": email, "password": "supersecret"})
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client
