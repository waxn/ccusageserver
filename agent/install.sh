#!/bin/sh
# Ledger agent installer.
#
#   curl -fsSL https://<host>/install.sh | sh -s -- <enrollment-token>
#
# Placeholders @@LEDGER_SERVER_URL@@ / @@LEDGER_CCUSAGE_VERSION@@ are filled in
# by the server when this script is served. When run from a local checkout they
# remain literal, so LEDGER_SERVER_URL must be supplied via the environment.
set -eu

# --- Defaults (server-injected) --------------------------------------------
SERVER_URL="${LEDGER_SERVER_URL:-@@LEDGER_SERVER_URL@@}"
CCUSAGE_VERSION="${LEDGER_CCUSAGE_VERSION:-@@LEDGER_CCUSAGE_VERSION@@}"
TIMEZONE="${LEDGER_TIMEZONE:-UTC}"
TOOLS="${LEDGER_TOOLS:-claude}"
SYNC_INTERVAL_MIN="${LEDGER_SYNC_INTERVAL_MIN:-45}"

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ledger-agent"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/ledger-agent"
BIN_DIR="$HOME/.local/bin"
AGENT_PATH="$BIN_DIR/ledger-agent"

log()  { printf '\033[1;34m[ledger]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ledger] warning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[ledger] error:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Args ------------------------------------------------------------------
ENROLLMENT_TOKEN="${1:-${LEDGER_ENROLLMENT_TOKEN:-}}"
[ -n "$ENROLLMENT_TOKEN" ] || die "Missing enrollment token. Usage: install.sh <enrollment-token>"

case "$SERVER_URL" in
  *@@*|"") die "Server URL not configured. Set LEDGER_SERVER_URL or run via the served install.sh." ;;
esac
# Normalize the scheme. A scheme-less URL makes curl default to http://, which a
# TLS-terminating proxy then 307-redirects to https:// — and the agent's POSTs
# don't follow redirects, so enrollment fails. Default to https:// when missing.
case "$SERVER_URL" in
  http://*|https://*) ;;
  *) SERVER_URL="https://$SERVER_URL" ;;
esac
SERVER_URL="${SERVER_URL%/}"  # strip any trailing slash
case "$CCUSAGE_VERSION" in
  *@@*|"") CCUSAGE_VERSION="latest"; warn "ccusage version not pinned; falling back to 'latest'." ;;
esac

# --- OS detection (Linux first; structured for later macOS/Windows) --------
OS_KERNEL="$(uname -s 2>/dev/null || echo unknown)"
case "$OS_KERNEL" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
  *)      PLATFORM="unknown" ;;
esac
OS_LABEL="$OS_KERNEL"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  OS_LABEL="$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-$OS_KERNEL}")"
fi
log "Detected platform: $PLATFORM ($OS_LABEL)"

if [ "$PLATFORM" != "linux" ]; then
  warn "Only Linux (systemd user timer) install is automated today."
  warn "The agent script itself is portable; schedule it manually on $PLATFORM."
fi

# --- Dependency checks -----------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

have curl || die "curl is required."
have tar  || die "tar is required."
if ! have node || ! have npx; then
  die "Node.js (node + npx) is required to run ccusage. Install Node 18+ and re-run."
fi

# --- Enroll: exchange the enrollment token for a device API key ------------
HOSTNAME_VAL="$(hostname 2>/dev/null || echo unknown-host)"
log "Enrolling '$HOSTNAME_VAL' with $SERVER_URL ..."

enroll_payload() {
  printf '{"enrollment_token":"%s","hostname":"%s","os":"%s"}' \
    "$ENROLLMENT_TOKEN" "$HOSTNAME_VAL" "$OS_LABEL"
}

ENROLL_RESPONSE="$(enroll_payload | curl -fsSL -X POST \
  -H 'Content-Type: application/json' \
  --data @- \
  "$SERVER_URL/api/devices/enroll")" || die "Enrollment failed. Check the token and server URL."

# Guard against a proxy returning an HTML login/redirect page instead of JSON
# (e.g. reverse-proxy SSO still gating the API paths).
case "$ENROLL_RESPONSE" in
  *"<html"*|*"<!DOCTYPE"*|"Temporary Redirect"|"Moved Permanently")
    die "Enrollment endpoint did not return JSON (got a redirect/HTML page). Your reverse proxy is likely gating /api or redirecting http->https. Ensure the API paths are reachable over https without SSO." ;;
esac

# Extract fields from JSON without requiring jq.
json_get() {
  # json_get <key>  — extracts a string value from a flat JSON object.
  printf '%s' "$ENROLL_RESPONSE" | sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}
API_KEY="$(json_get api_key)"
SERVER_CCUSAGE="$(json_get ccusage_version)"
[ -n "$API_KEY" ] || die "Enrollment succeeded but no API key was returned. Response: $ENROLL_RESPONSE"
[ -n "$SERVER_CCUSAGE" ] && CCUSAGE_VERSION="$SERVER_CCUSAGE"

log "Enrolled successfully. Pinned ccusage version: $CCUSAGE_VERSION"

# --- Write config ----------------------------------------------------------
mkdir -p "$CONFIG_DIR" "$DATA_DIR" "$BIN_DIR"
CONFIG_FILE="$CONFIG_DIR/config.toml"
umask 077
cat > "$CONFIG_FILE" <<EOF
# Ledger agent configuration. Written by install.sh; safe to edit.
server_url = "$SERVER_URL"
api_key = "$API_KEY"
ccusage_version = "$CCUSAGE_VERSION"
# Pin the reporting timezone so cross-device daily aggregation lines up.
timezone = "$TIMEZONE"
# Tools to track (space-separated inside the array): claude, opencode, ...
tools = "$TOOLS"
# Upload a raw source-directory tarball at most this often (hours).
archive_interval_hours = 24
EOF
chmod 600 "$CONFIG_FILE"
log "Wrote config to $CONFIG_FILE"

# --- Install the agent script ----------------------------------------------
log "Downloading agent script ..."
if curl -fsSL "$SERVER_URL/ledger-agent.sh" -o "$AGENT_PATH.tmp"; then
  mv "$AGENT_PATH.tmp" "$AGENT_PATH"
  chmod +x "$AGENT_PATH"
  log "Installed agent to $AGENT_PATH"
else
  rm -f "$AGENT_PATH.tmp"
  die "Failed to download the agent script from $SERVER_URL/ledger-agent.sh"
fi

# --- Schedule (systemd user timer on Linux) --------------------------------
if [ "$PLATFORM" = "linux" ] && have systemctl; then
  UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  mkdir -p "$UNIT_DIR"

  cat > "$UNIT_DIR/ledger-agent.service" <<EOF
[Unit]
Description=Ledger usage-tracker sync
After=network-online.target

[Service]
Type=oneshot
ExecStart=$AGENT_PATH sync
Nice=10
EOF

  cat > "$UNIT_DIR/ledger-agent.timer" <<EOF
[Unit]
Description=Run Ledger usage sync every ${SYNC_INTERVAL_MIN} minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=${SYNC_INTERVAL_MIN}min
Persistent=true

[Install]
WantedBy=timers.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now ledger-agent.timer >/dev/null 2>&1 || \
    warn "Could not enable the user timer (is a user session/linger available?)."
  log "Installed and enabled systemd user timer (every ${SYNC_INTERVAL_MIN}m)."
  log "Tip: 'loginctl enable-linger $USER' keeps the timer running when logged out."
else
  warn "systemd not available. Schedule '$AGENT_PATH sync' via cron, e.g.:"
  warn "  */${SYNC_INTERVAL_MIN} * * * * $AGENT_PATH sync >/dev/null 2>&1"
fi

# --- First run -------------------------------------------------------------
log "Running an initial sync ..."
if "$AGENT_PATH" sync; then
  log "Done. First sync complete — check your dashboard."
else
  warn "Initial sync did not complete cleanly. It will retry on the next scheduled run."
fi
