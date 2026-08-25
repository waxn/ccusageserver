# Ledger — Self-Hosted Coding-Agent Usage Tracker

Permanent, cross-machine usage tracking for AI coding tools (Claude Code today;
OpenCode and others are pluggable). It exists because Claude Code deletes local
session logs after 30 days and Anthropic doesn't expose historical token data
for Pro/Max subscriptions — so if you don't capture it yourself, it's gone.

Ledger has two pieces:

- **Server** — a single Dockerized FastAPI app with a SQLite store and a
  web dashboard. Runs behind your existing reverse proxy (plain HTTP internally).
- **Agent** — a dependency-light shell client installed per-machine via a
  `curl | sh` one-liner, scheduled as a systemd user timer. It shells out to
  [`ccusage`](https://github.com/ryoppippi/ccusage) for parsed usage **and**
  uploads a raw tarball of the source log directories as an insurance copy.

```
┌────────────┐  ccusage --json + raw tarball   ┌─────────────────────────┐
│  Machine A │ ───────────────────────────────▶│  Ledger server (Docker) │
│  (agent)   │                                  │  FastAPI + SQLite       │
└────────────┘                                  │  + React dashboard      │
┌────────────┐                                  │  + /data volume:        │
│  Machine B │ ───────────────────────────────▶│    ledger.db + archives │
│  (agent)   │        device API key            └─────────────────────────┘
└────────────┘                                            ▲
                                                          │ JWT (browser)
                                                     ┌──────────┐
                                                     │Dashboard │
                                                     └──────────┘
```

---

## 1. Bring up the server

Prerequisites: Docker + Docker Compose.

```sh
git clone <this-repo> ledger && cd ledger
cp .env.example .env
```

Edit `.env` and set at minimum:

```sh
LEDGER_SECRET_KEY=<paste output of: openssl rand -hex 32>
LEDGER_PUBLIC_BASE_URL=https://ledger.example.com   # how agents/browsers reach you
```

Then build and start:

```sh
docker compose up -d --build
```

This single container:

- runs Alembic migrations on startup,
- serves the JSON API and the compiled dashboard on port **8000** (published to
  `${LEDGER_PORT:-8787}` on the host),
- persists `ledger.db` and raw archives under the `ledger-data` volume (`/data`).

Point your reverse proxy (Pangolin/Newt, Caddy, nginx, …) at the published port.
TLS is terminated upstream; the container speaks plain HTTP.

Health check: `curl http://localhost:8787/api/health` → `{"status":"ok",...}`.
API docs (OpenAPI/Swagger): `https://ledger.example.com/docs`.

### Configuration reference (`.env`)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `LEDGER_SECRET_KEY` | **yes** | — | Signs dashboard session JWTs. |
| `LEDGER_PUBLIC_BASE_URL` | recommended | request origin | Rendered into the install one-liner. |
| `LEDGER_PORT` | no | `8787` | Host port to publish. |
| `LEDGER_CCUSAGE_VERSION` | no | `17.1.3` | Pinned ccusage version for every agent. |
| `LEDGER_DEVICE_STALE_AFTER_HOURS` | no | `24` | When a device is flagged "stale". |

---

## 2. Create the first account

There's no seeded admin — the first person to register owns their data. Open the
dashboard in a browser and use **Create account** (email + password), or via API:

```sh
curl -X POST https://ledger.example.com/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"a-strong-password"}'
```

Accounts are isolated: every device, token, and usage row belongs to one user.
Passwords are hashed with argon2; sessions are standard HS256 JWTs.

---

## 3. Enroll a machine (the install one-liner)

1. In the dashboard go to **Settings → Enroll a new device**, optionally give it
   a label, and click **Generate token**. You'll get a one-liner like:

   ```sh
   curl -fsSL https://ledger.example.com/install.sh | sh -s -- <enrollment-token>
   ```

2. Run it on the target machine (as the user whose `~/.claude` you want tracked —
   **not** root). The installer will:
   - detect the OS (Linux is fully automated),
   - check for `curl`, `tar`, and Node.js (`node`/`npx`, needed to run ccusage),
   - exchange the enrollment token for a permanent, per-device API key,
   - write `~/.config/ledger-agent/config.toml`,
   - install `~/.local/bin/ledger-agent` and a **systemd user timer** that syncs
     every ~45 minutes,
   - run an initial sync immediately.

Enrollment tokens are single-use and expire (default 7 days). The long-lived
**device API key** never appears in the dashboard and can be revoked per-device
from **Devices** if a machine is lost or wiped.

> **Keep the timer alive when logged out:** systemd user timers stop when your
> session ends unless lingering is enabled:
> ```sh
> loginctl enable-linger "$USER"
> ```

### What the agent uploads

On each run (`ledger-agent sync`) it:

- runs `npx -y ccusage@<pinned> daily --json` with `TZ` and `CCUSAGE_TIMEZONE`
  pinned (so every device buckets days on the same clock) and POSTs the JSON to
  `/api/usage/report`. ccusage reports the **entire local history** it can find
  (there's no date limit), so the first sync backfills all usage still on disk;
  the server upserts idempotently on `(device, tool, model, date)`, so
  re-sending overlapping ranges on every run never duplicates. (The only history
  Ledger can't recover is data Claude Code already deleted locally before the
  agent's first run — hence the raw archive below.)
- at most once per `archive_interval_hours` (default 24), tars the raw source
  directory (`~/.claude/projects` for Claude) and POSTs it to
  `/api/usage/archive`. **This tarball is the real insurance policy** — if the
  parsing pipeline is ever wrong or ccusage's format changes, the raw data still
  exists server-side under `/data/archives/<device>/<tool>/` and can be
  reprocessed.

### Agent config (`~/.config/ledger-agent/config.toml`)

```toml
server_url = "https://ledger.example.com"
api_key = "…"                 # per-device key, obtained at enrollment
ccusage_version = "17.1.3"    # pinned so all machines report comparably
timezone = "UTC"              # pin this identically across devices
tools = "claude"              # space-separated: claude, opencode, …
archive_interval_hours = 24
```

Change the reporting timezone or tracked tools by editing this file; the next
scheduled run picks it up. The installed command is `ledger-agent`
(in `~/.local/bin`):

```sh
ledger-agent sync       # run a sync now (backfills full local history)
ledger-agent update     # pull the latest agent from the server + re-pin ccusage
ledger-agent version    # show agent version and config path
# inspect / manage the timer:
systemctl --user status ledger-agent.timer
journalctl --user -u ledger-agent.service -e
```

### Updating the agent

To upgrade an already-enrolled machine without re-running the installer:

```sh
ledger-agent update && ledger-agent sync
```

`update` re-downloads the agent script from your server (the same
`/ledger-agent.sh` the installer used) and, if the server's pinned
`ccusage_version` has changed, updates it in the local config so every machine
stays comparable. It replaces the running script atomically, so it's safe to run
even while a sync is in progress. Running `sync` afterward re-affirms the full
history immediately rather than waiting for the timer.

No systemd (containers, non-Linux)? Schedule `ledger-agent sync` from cron:

```
*/45 * * * * $HOME/.local/bin/ledger-agent sync >/dev/null 2>&1
```

---

## 4. Using the dashboard

- **Dashboard** — a monthly *notional cost estimate* (clearly labeled *not
  billed*, since Pro/Max usage isn't real spend), a stacked daily-token trend
  chart, and breakdowns by model, device, and tool. Range toggle: this month /
  30d / 90d / all time.
- **Devices** — every enrolled machine with a last-synced timestamp. A device
  that stops checking in is flagged **Stale** in red, so silent sync failure —
  the exact failure mode that caused the original data loss — is visible.
- **Settings** — generate/revoke enrollment tokens and see the pinned ccusage
  version. Light/dark mode toggle lives in the sidebar.

---

## Adding another tool (e.g. OpenCode)

The server is tool-agnostic: `/api/usage/report?source_tool=<name>` accepts any
ccusage-shaped daily JSON and tags rows with `source_tool`. To wire up a new
tool end-to-end, extend two small switch statements in `agent/ledger-agent.sh`:
`run_ccusage()` (how to produce the JSON) and `tool_source_dir()` (which raw
directory to archive), then add the tool name to `tools` in the config. Nothing
in the server or schema needs to change.

---

## Development

**Server** (Python 3.12):

```sh
cd server
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
export LEDGER_SECRET_KEY=dev LEDGER_DATABASE_URL="sqlite:///./dev.db" LEDGER_ARCHIVE_DIR=./archives
alembic upgrade head
uvicorn app.main:app --reload
pytest            # runs the unit + integration suite
```

**Frontend** (Node 18+):

```sh
cd frontend
npm install
npm run dev       # Vite dev server on :5173, proxies /api to :8000
npm run build     # emits dist/, which FastAPI serves as static files in prod
```

In production the compiled `frontend/dist` is baked into the image and served by
FastAPI, so the whole thing stays one container.

### Data model

| Table | Purpose |
| --- | --- |
| `users` | accounts (argon2 password hashes) |
| `enrollment_tokens` | short-lived, single-use, revocable install tokens (stored hashed) |
| `devices` | per-machine records + hashed API key + `last_seen_at` |
| `usage_reports` | one row per `(device, tool, model, date)` — unique-constrained for idempotent upserts |
| `raw_archives` | metadata pointing at tarballs on the `/data` volume (blobs are **not** in SQLite) |

SQLite runs in WAL mode with foreign keys enforced. The models use SQLAlchemy +
Alembic so a future move to Postgres is just a connection-string change and a
migration run.

---

## Security notes

- Passwords: **argon2** (`argon2-cffi`). Sessions: **HS256 JWT** (PyJWT).
- Enrollment tokens and device API keys are high-entropy random secrets stored
  only as SHA-256 digests — the plaintext is shown once and never recoverable.
- No homegrown crypto anywhere.
- The server assumes it sits behind a trusted reverse proxy that terminates TLS.
  Don't expose port 8000/8787 directly to the internet.
- Rotating `LEDGER_SECRET_KEY` invalidates dashboard sessions (users re-login);
  it does **not** affect device API keys.
