"""Integration tests covering the auth → enroll → report → summary flow."""

import io

CCUSAGE_PAYLOAD = {
    "daily": [
        {
            "date": "2025-01-01",
            "modelBreakdowns": [
                {
                    "modelName": "claude-sonnet-4",
                    "inputTokens": 100,
                    "outputTokens": 50,
                    "cacheCreationTokens": 10,
                    "cacheReadTokens": 5,
                    "cost": 1.25,
                }
            ],
        },
        {
            "date": "2025-01-02",
            "modelBreakdowns": [
                {
                    "modelName": "claude-opus-4",
                    "inputTokens": 200,
                    "outputTokens": 80,
                    "cost": 3.0,
                }
            ],
        },
    ]
}


def _enroll(client, auth_client):
    # Create an enrollment token as the authed user.
    resp = auth_client.post("/api/enrollment/create", json={"label": "test"})
    assert resp.status_code == 201, resp.text
    token = resp.json()["token"]

    # Exchange it for a device API key (public endpoint).
    resp = client.post(
        "/api/devices/enroll",
        json={"enrollment_token": token, "hostname": "test-host", "os": "Linux"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["api_key"]


def test_register_and_login(client):
    r = client.post("/api/auth/register", json={"email": "a@b.com", "password": "password1"})
    assert r.status_code == 201
    r = client.post("/api/auth/register", json={"email": "a@b.com", "password": "password1"})
    assert r.status_code == 409  # duplicate
    r = client.post("/api/auth/login", json={"email": "a@b.com", "password": "password1"})
    assert r.status_code == 200 and "access_token" in r.json()
    r = client.post("/api/auth/login", json={"email": "a@b.com", "password": "wrong"})
    assert r.status_code == 401


def test_enrollment_token_single_use(client, auth_client):
    resp = auth_client.post("/api/enrollment/create", json={})
    token = resp.json()["token"]
    body = {"enrollment_token": token, "hostname": "h1", "os": "Linux"}
    assert client.post("/api/devices/enroll", json=body).status_code == 201
    # Second use of the same token must fail.
    assert client.post("/api/devices/enroll", json=body).status_code == 401


def test_report_ingestion_is_idempotent(client, auth_client):
    api_key = _enroll(client, auth_client)
    dev_headers = {"Authorization": f"Bearer {api_key}"}

    r1 = client.post("/api/usage/report", json=CCUSAGE_PAYLOAD, headers=dev_headers)
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"inserted": 2, "updated": 0, "rows": 2}

    # Re-submitting the same report updates in place — no duplicates.
    r2 = client.post("/api/usage/report", json=CCUSAGE_PAYLOAD, headers=dev_headers)
    assert r2.json() == {"inserted": 0, "updated": 2, "rows": 2}

    summary = auth_client.get("/api/usage/summary").json()
    assert summary["totals"]["input_tokens"] == 300
    assert summary["totals"]["output_tokens"] == 130
    assert summary["totals"]["total_tokens"] == 300 + 130 + 10 + 5
    # Two distinct models seen.
    assert len(summary["by_model"]) == 2
    assert len(summary["by_device"]) == 1
    assert len(summary["trend"]) == 2


def test_summary_date_filtering(client, auth_client):
    api_key = _enroll(client, auth_client)
    dev_headers = {"Authorization": f"Bearer {api_key}"}
    client.post("/api/usage/report", json=CCUSAGE_PAYLOAD, headers=dev_headers)

    only_first = auth_client.get(
        "/api/usage/summary", params={"start_date": "2025-01-01", "end_date": "2025-01-01"}
    ).json()
    assert only_first["totals"]["input_tokens"] == 100
    assert len(only_first["trend"]) == 1


def test_report_requires_device_auth(client):
    assert client.post("/api/usage/report", json=CCUSAGE_PAYLOAD).status_code == 401
    assert (
        client.post(
            "/api/usage/report", json=CCUSAGE_PAYLOAD, headers={"X-API-Key": "bogus"}
        ).status_code
        == 401
    )


def test_devices_listing_and_revoke(client, auth_client):
    api_key = _enroll(client, auth_client)
    devices = auth_client.get("/api/devices").json()
    assert len(devices) == 1
    dev = devices[0]
    assert dev["hostname"] == "test-host"
    assert dev["stale"] is False

    # Revoke → device auth stops working.
    rid = dev["id"]
    assert auth_client.post(f"/api/devices/{rid}/revoke").status_code == 200
    assert (
        client.post(
            "/api/usage/report", json=CCUSAGE_PAYLOAD, headers={"Authorization": f"Bearer {api_key}"}
        ).status_code
        == 401
    )


def test_device_label_from_token_and_rename_and_delete(client, auth_client):
    # Enroll with a labelled token -> device display name comes from the label.
    resp = auth_client.post("/api/enrollment/create", json={"label": "thinkpad"})
    token = resp.json()["token"]
    client.post(
        "/api/devices/enroll",
        json={"enrollment_token": token, "hostname": "same-host", "os": "Linux"},
    )
    devices = auth_client.get("/api/devices").json()
    dev = devices[-1]
    assert dev["label"] == "thinkpad"
    assert dev["display_name"] == "thinkpad"  # not the hostname

    # Rename it.
    renamed = auth_client.patch(f"/api/devices/{dev['id']}", json={"label": "desktop"}).json()
    assert renamed["display_name"] == "desktop"

    # Delete it -> gone from the list.
    assert auth_client.delete(f"/api/devices/{dev['id']}").status_code == 204
    ids = [d["id"] for d in auth_client.get("/api/devices").json()]
    assert dev["id"] not in ids


def test_summary_by_device_uses_label(client, auth_client):
    resp = auth_client.post("/api/enrollment/create", json={"label": "thinkpad"})
    token = resp.json()["token"]
    api_key = client.post(
        "/api/devices/enroll",
        json={"enrollment_token": token, "hostname": "shared-hostname", "os": "Linux"},
    ).json()["api_key"]
    client.post(
        "/api/usage/report",
        json=CCUSAGE_PAYLOAD,
        headers={"Authorization": f"Bearer {api_key}"},
    )
    summary = auth_client.get("/api/usage/summary").json()
    keys = [b["key"] for b in summary["by_device"]]
    assert "thinkpad" in keys
    assert "shared-hostname" not in keys


def test_display_name_falls_back_to_hostname(client, auth_client):
    resp = auth_client.post("/api/enrollment/create", json={})  # no label
    token = resp.json()["token"]
    client.post(
        "/api/devices/enroll",
        json={"enrollment_token": token, "hostname": "bare-host", "os": "Linux"},
    )
    dev = auth_client.get("/api/devices").json()[-1]
    assert dev["label"] is None
    assert dev["display_name"] == "bare-host"


def test_delete_enrollment_token(client, auth_client):
    tid = auth_client.post("/api/enrollment/create", json={}).json()["id"]
    assert auth_client.delete(f"/api/enrollment/{tid}").status_code == 204
    ids = [t["id"] for t in auth_client.get("/api/enrollment").json()]
    assert tid not in ids


def test_archive_upload(client, auth_client):
    api_key = _enroll(client, auth_client)
    dev_headers = {"Authorization": f"Bearer {api_key}"}
    fake_tar = io.BytesIO(b"not-really-a-tarball-but-fine-for-storage")
    resp = client.post(
        "/api/usage/archive",
        headers=dev_headers,
        files={"file": ("claude-source.tar.gz", fake_tar, "application/gzip")},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["size_bytes"] > 0
