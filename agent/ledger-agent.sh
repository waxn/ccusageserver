#!/bin/sh
# Ledger sync agent.
#
# A thin wrapper: it shells out to ccusage for parsed usage and tars the raw
# source directories for the insurance archive. It never reimplements log
# parsing. Invoked by a systemd user timer (or cron) as: ledger-agent sync
set -eu

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ledger-agent"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/ledger-agent"
CONFIG_FILE="$CONFIG_DIR/config.toml"

log()  { printf '\033[1;34m[ledger]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ledger] warning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[ledger] error:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$CONFIG_FILE" ] || die "No config at $CONFIG_FILE. Re-run the installer."

# --- Minimal TOML reader (flat key = "value") ------------------------------
conf() {
  sed -n 's/^[[:space:]]*'"$1"'[[:space:]]*=[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' \
    "$CONFIG_FILE" | head -n1
}

SERVER_URL="$(conf server_url)"
API_KEY="$(conf api_key)"
CCUSAGE_VERSION="$(conf ccusage_version)"
TIMEZONE="$(conf timezone)"
TOOLS="$(conf tools)"
ARCHIVE_INTERVAL_HOURS="$(conf archive_interval_hours)"

[ -n "$SERVER_URL" ] || die "server_url missing from config."
[ -n "$API_KEY" ]    || die "api_key missing from config."
[ -n "$CCUSAGE_VERSION" ] || CCUSAGE_VERSION="latest"
[ -n "$TIMEZONE" ] || TIMEZONE="UTC"
[ -n "$TOOLS" ] || TOOLS="claude"
[ -n "$ARCHIVE_INTERVAL_HOURS" ] || ARCHIVE_INTERVAL_HOURS=24

mkdir -p "$DATA_DIR"

# Pin the reporting timezone so every device buckets days identically.
export TZ="$TIMEZONE"
export CCUSAGE_TIMEZONE="$TIMEZONE"

have() { command -v "$1" >/dev/null 2>&1; }
have curl || die "curl is required."
have npx  || die "npx (Node.js) is required to run ccusage."

# --- Per-tool source directories (for the raw archive) ---------------------
tool_source_dir() {
  case "$1" in
    claude)   printf '%s' "$HOME/.claude/projects" ;;
    opencode)
      if [ -d "$HOME/.local/share/opencode" ]; then printf '%s' "$HOME/.local/share/opencode";
      else printf '%s' "$HOME/.config/opencode"; fi ;;
    *) printf '' ;;
  esac
}

# --- Run ccusage for a tool and echo its JSON ------------------------------
run_ccusage() {
  # $1 = tool. Only 'claude' is served by ccusage today; others are best-effort.
  case "$1" in
    claude)
      npx -y "ccusage@${CCUSAGE_VERSION}" daily --json 2>/dev/null ;;
    opencode)
      # Placeholder for a future opencode usage command. Skip cleanly for now.
      warn "opencode usage parsing is not yet wired up; skipping parsed report."
      return 1 ;;
    *)
      warn "Unknown tool '$1'; skipping."
      return 1 ;;
  esac
}

# --- Upload a parsed report ------------------------------------------------
post_report() {
  tool="$1"; json="$2"
  code="$(printf '%s' "$json" | curl -fsS -o "$DATA_DIR/last_report_response.json" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H 'Content-Type: application/json' \
    --data @- \
    "$SERVER_URL/api/usage/report?source_tool=$tool" 2>/dev/null)" || code="000"
  if [ "$code" = "200" ]; then
    log "Reported $tool usage: $(cat "$DATA_DIR/last_report_response.json")"
    return 0
  fi
  warn "Report upload for $tool failed (HTTP $code)."
  return 1
}

# --- Upload a raw archive (rate-limited by archive_interval_hours) ---------
should_archive() {
  stamp="$DATA_DIR/last_archive.$1"
  [ -f "$stamp" ] || return 0
  now="$(date +%s)"
  then_ts="$(cat "$stamp" 2>/dev/null || echo 0)"
  age_hours=$(( (now - then_ts) / 3600 ))
  [ "$age_hours" -ge "$ARCHIVE_INTERVAL_HOURS" ]
}

post_archive() {
  tool="$1"; src="$2"
  [ -n "$src" ] && [ -d "$src" ] || { warn "No source dir for $tool at '$src'; skipping archive."; return 1; }
  should_archive "$tool" || { log "Archive for $tool is fresh; skipping this cycle."; return 0; }

  tmp="$(mktemp "${TMPDIR:-/tmp}/ledger-${tool}-XXXXXX.tar.gz")"
  parent="$(dirname "$src")"; base="$(basename "$src")"
  if ! tar -czf "$tmp" -C "$parent" "$base" 2>/dev/null; then
    warn "Failed to create archive for $tool."; rm -f "$tmp"; return 1
  fi

  code="$(curl -fsS -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -F "file=@$tmp;type=application/gzip;filename=${tool}-source.tar.gz" \
    "$SERVER_URL/api/usage/archive?source_tool=$tool" 2>/dev/null)" || code="000"
  rm -f "$tmp"

  if [ "$code" = "201" ] || [ "$code" = "200" ]; then
    date +%s > "$DATA_DIR/last_archive.$tool"
    log "Uploaded raw archive for $tool."
    return 0
  fi
  warn "Archive upload for $tool failed (HTTP $code)."
  return 1
}

# --- Main sync -------------------------------------------------------------
cmd_sync() {
  log "Starting sync (tz=$TIMEZONE, ccusage=$CCUSAGE_VERSION, tools=$TOOLS)"
  rc=0
  for tool in $TOOLS; do
    log "Processing tool: $tool"
    if json="$(run_ccusage "$tool")" && [ -n "$json" ]; then
      post_report "$tool" "$json" || rc=1
    else
      warn "No parsed usage produced for $tool."
    fi
    post_archive "$tool" "$(tool_source_dir "$tool")" || rc=1
  done
  [ "$rc" -eq 0 ] && log "Sync complete." || warn "Sync completed with some failures."
  return "$rc"
}

case "${1:-sync}" in
  sync)    cmd_sync ;;
  version) echo "ledger-agent (config: $CONFIG_FILE)" ;;
  *)       die "Unknown command: $1 (expected: sync)" ;;
esac
