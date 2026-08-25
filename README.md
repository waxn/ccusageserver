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

0. **First, set an encryption password.** The first time you open the dashboard
   you'll be asked to choose one. Usage is end-to-end encrypted with it, so every
   machine's agent needs the *same* password (below). It's separate from your
   login password and unrecoverable if lost.

1. In the dashboard go to **Settings → Enroll a new device**, optionally give it
   a label, and click **Generate token**. Pass your encryption password to the
   installer via the environment so the agent can encrypt:

   ```sh
   LEDGER_ENCRYPTION_PASSWORD='your-encryption-password' \
     curl -fsSL https://ledger.example.com/install.sh | sh -s -- <enrollment-token>
   ```

   (You can also leave it out and add `encryption_password` to the config file
   afterward — the agent won't upload until it's set.)

2. Run it on the target machine (as the user whose `~/.claude` you want tracked —
   **not** root). The installer will:
   - detect the OS (Linux is fully automated),
   - check for `curl`, `tar`, and Node.js (`node`/`npx`, needed to run ccusage),
   - exchange the enrollment token for a permanent, per-device API key,
   - write `~/.config/ledger-agent/config.toml`,
   - install `~/.local/bin/ledger-agent` and a **systemd user timer** that syncs
     every ~45 minutes,
   - run an initial sync immediately.

If you didn't pass `LEDGER_ENCRYPTION_PASSWORD` at install time, set it
afterward with a command (prompts, hidden input, verified against the
dashboard, then syncs):

```sh
ledger-agent set-password
```

Enrollment tokens are single-use and expire (default 7 days). The long-lived
**device API key** never appears in the dashboard and can be revoked per-device
from **Devices** if a machine is lost or wiped.

> **Keep the timer alive when logged out:** systemd user timers stop when your
> session ends unless lingering is enabled:
> ```sh
> loginctl enable-linger "$USER"
> ```

### What the agent uploads (and end-to-end encryption)

Only the parsed ccusage token counts leave your machines, and they are
**end-to-end encrypted** — the server stores ciphertext it cannot read.

On each run (`ledger-agent sync`) the agent:

- runs `npx -y ccusage@<pinned> daily --json --by-agent` with `TZ` and
  `CCUSAGE_TIMEZONE` pinned (so every device buckets days on the same clock).
  `--by-agent` breaks usage out per tool (Claude / Codex / OpenCode …). ccusage
  reports the **entire local history** it can find (no date limit), so the first
  sync backfills all usage still on disk.
- derives an AES-256 key from your **encryption password** (PBKDF2-HMAC-SHA256,
  via Node — already required for ccusage) and encrypts the whole ccusage JSON
  with AES-256-GCM, then `PUT`s the single ciphertext blob to
  `/api/usage/encrypted`. One blob per device, overwritten each sync — idempotent
  by construction. The password and key never reach the server.

The browser derives the same key from your password, fetches every device's
blob, and **decrypts + parses + aggregates entirely client-side**. The server
never sees plaintext usage, your password, or the key (zero-knowledge).

> **Raw session transcripts are not uploaded.** The agent has an optional
> `upload_archives` mode (default **off**) that tars `~/.claude/projects`; that
> tarball contains full prompts/replies/file contents and is **not** end-to-end
> encrypted, so leave it off unless you specifically want that insurance copy.

### Agent config (`~/.config/ledger-agent/config.toml`)

```toml
server_url = "https://ledger.example.com"
api_key = "…"                 # per-device key, obtained at enrollment
ccusage_version = "20.0.20"   # pinned so all machines report comparably
timezone = "UTC"              # pin this identically across devices
tools = "claude"              # space-separated: claude, opencode, …
encryption_password = "…"     # must match the one you set in the dashboard
upload_archives = false       # keep off: raw transcripts are NOT E2E-encrypted
archive_interval_hours = 24
```

Change the reporting timezone or tracked tools by editing this file; the next
scheduled run picks it up. The installed command is `ledger-agent`
(in `~/.local/bin`):

```sh
ledger-agent sync          # run a sync now (backfills full local history)
ledger-agent set-password  # set/change the encryption password (prompts + verifies)
ledger-agent update        # pull the latest agent from the server + re-pin ccusage
ledger-agent version       # show agent version and config path
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

- **Usage data is end-to-end encrypted (zero-knowledge).** The agent encrypts
  with AES-256-GCM using a key derived (PBKDF2-HMAC-SHA256, 200k iterations) from
  your encryption password; the browser decrypts with the same key. The server
  stores only ciphertext plus a non-secret KDF salt + verifier — it never sees
  the password, the key, or plaintext usage. Lose the password and the data is
  unrecoverable (that's the point). Standard primitives only, no homegrown crypto.
- Passwords: **argon2** (`argon2-cffi`). Sessions: **HS256 JWT** (PyJWT).
- Enrollment tokens and device API keys are high-entropy random secrets stored
  only as SHA-256 digests — the plaintext is shown once and never recoverable.
- The server assumes it sits behind a trusted reverse proxy that terminates TLS.
  Don't expose port 8000/8787 directly to the internet.
- Rotating `LEDGER_SECRET_KEY` invalidates dashboard sessions (users re-login);
  it does **not** affect device API keys.
