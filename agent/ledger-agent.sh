#!/bin/sh
# Ledger sync agent.
#
# A thin wrapper: it shells out to ccusage for parsed usage and tars the raw
# source directories for the insurance archive. It never reimplements log
# parsing. Invoked by a systemd user timer (or cron) as: ledger-agent sync
set -eu

AGENT_VERSION="0.1.0"

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ledger-agent"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/ledger-agent"
CONFIG_FILE="$CONFIG_DIR/config.toml"

log()  { printf '\033[1;34m[ledger]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ledger] warning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[ledger] error:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$CONFIG_FILE" ] || die "No config at $CONFIG_FILE. Re-run the installer."

# --- Minimal TOML reader/writer (flat key = "value") -----------------------
conf() {
  sed -n 's/^[[:space:]]*'"$1"'[[:space:]]*=[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' \
    "$CONFIG_FILE" | head -n1
}

# Set a key in config.toml, replacing it in place or appending if absent.
set_conf() {
  key="$1"; val="$2"
  if grep -q "^[[:space:]]*$key[[:space:]]*=" "$CONFIG_FILE"; then
    tmp="$CONFIG_FILE.tmp.$$"
    sed "s|^[[:space:]]*$key[[:space:]]*=.*|$key = \"$val\"|" "$CONFIG_FILE" > "$tmp" \
      && mv "$tmp" "$CONFIG_FILE"
  else
    printf '%s = "%s"\n' "$key" "$val" >> "$CONFIG_FILE"
  fi
}

SERVER_URL="$(conf server_url)"
API_KEY="$(conf api_key)"
CCUSAGE_VERSION="$(conf ccusage_version)"
TIMEZONE="$(conf timezone)"
TOOLS="$(conf tools)"
ARCHIVE_INTERVAL_HOURS="$(conf archive_interval_hours)"
UPLOAD_ARCHIVES="$(conf upload_archives)"
ENCRYPTION_PASSWORD="$(conf encryption_password)"

[ -n "$SERVER_URL" ] || die "server_url missing from config."
[ -n "$API_KEY" ]    || die "api_key missing from config."
[ -n "$CCUSAGE_VERSION" ] || CCUSAGE_VERSION="latest"
[ -n "$TIMEZONE" ] || TIMEZONE="UTC"
[ -n "$TOOLS" ] || TOOLS="claude"
[ -n "$ARCHIVE_INTERVAL_HOURS" ] || ARCHIVE_INTERVAL_HOURS=24
# Default OFF: raw archives contain full session transcripts. Only enable if you
# explicitly want that insurance copy uploaded.
[ -n "$UPLOAD_ARCHIVES" ] || UPLOAD_ARCHIVES="false"

mkdir -p "$DATA_DIR"

# Pin the reporting timezone so every device buckets days identically.
export TZ="$TIMEZONE"
export CCUSAGE_TIMEZONE="$TIMEZONE"

have() { command -v "$1" >/dev/null 2>&1; }
have curl || die "curl is required."
have npx  || die "npx (Node.js) is required to run ccusage."

is_true() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    true|yes|1|on) return 0 ;;
    *) return 1 ;;
  esac
}

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
      # --by-agent adds a per-tool breakdown (ccusage >=20) so the server can
      # split usage by Claude / Codex / OpenCode / etc. Older ccusage ignores
      # the flag's effect and the server falls back to the default tool label.
      npx -y "ccusage@${CCUSAGE_VERSION}" daily --json --by-agent 2>/dev/null ;;
    opencode)
      # Placeholder for a future opencode usage command. Skip cleanly for now.
      warn "opencode usage parsing is not yet wired up; skipping parsed report."
      return 1 ;;
    *)
      warn "Unknown tool '$1'; skipping."
      return 1 ;;
  esac
}

# --- End-to-end encryption -------------------------------------------------
# Usage data is encrypted here, on the machine, with a key derived from your
# encryption password. The server only ever receives ciphertext. Node (already
# required for ccusage) does the crypto; it is WebCrypto-compatible so the
# browser decrypts the same blobs. See NODE_ENCRYPT below.

json_field() {
  # json_field <json> <key> — extract a string/number field from a flat object.
  printf '%s' "$1" | sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\{0,1\}\([^",}]*\)"\{0,1\}.*/\1/p' | head -n1
}

NODE_ENCRYPT='
const crypto = require("node:crypto");
const pw = process.env.LP || "";
const salt = Buffer.from(process.env.LSALT || "", "base64");
const iter = parseInt(process.env.LITER || "200000", 10);
const key = crypto.pbkdf2Sync(pw, salt, iter, 32, "sha256");
// Verify the password matches the account before encrypting.
try {
  const vn = Buffer.from(process.env.LVN || "", "base64");
  const vc = Buffer.from(process.env.LVC || "", "base64");
  const body = vc.subarray(0, vc.length - 16), tag = vc.subarray(vc.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, vn); d.setAuthTag(tag);
  if (Buffer.concat([d.update(body), d.final()]).toString("utf8") !== "ledger-verify") throw 0;
} catch (e) { console.error("VERIFY_FAIL"); process.exit(3); }
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => input += d);
process.stdin.on("end", () => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(input, "utf8"), c.final()]);
  const data = Buffer.concat([enc, c.getAuthTag()]).toString("base64");
  process.stdout.write(JSON.stringify({ nonce: iv.toString("base64"), ciphertext: data }));
});
'

# Verify-only: exit 0 if the password derives the account key, 3 otherwise.
NODE_VERIFY='
const crypto = require("node:crypto");
const key = crypto.pbkdf2Sync(process.env.LP || "", Buffer.from(process.env.LSALT || "", "base64"),
  parseInt(process.env.LITER || "200000", 10), 32, "sha256");
try {
  const vn = Buffer.from(process.env.LVN || "", "base64");
  const vc = Buffer.from(process.env.LVC || "", "base64");
  const body = vc.subarray(0, vc.length - 16), tag = vc.subarray(vc.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, vn); d.setAuthTag(tag);
  if (Buffer.concat([d.update(body), d.final()]).toString("utf8") !== "ledger-verify") throw 0;
} catch (e) { process.exit(3); }
'

# Fetch KDF params for this account (device-authenticated). Populates globals.
CRYPTO_CONFIGURED=""; CRYPTO_SALT=""; CRYPTO_ITER=""; CRYPTO_VN=""; CRYPTO_VC=""
fetch_crypto_params() {
  resp="$(curl -fsSL -H "Authorization: Bearer $API_KEY" "$SERVER_URL/api/crypto/params" 2>/dev/null)" || return 1
  CRYPTO_CONFIGURED="$(json_field "$resp" configured)"
  CRYPTO_SALT="$(json_field "$resp" salt)"
  CRYPTO_ITER="$(json_field "$resp" iterations)"
  CRYPTO_VN="$(json_field "$resp" verifier_nonce)"
  CRYPTO_VC="$(json_field "$resp" verifier_ct)"
  return 0
}

# Encrypt the ccusage JSON and upload the blob for this device.
do_encrypted_report() {
  if ! fetch_crypto_params; then
    warn "Could not reach $SERVER_URL/api/crypto/params."; return 1
  fi
  case "$CRYPTO_CONFIGURED" in
    true|True|1) : ;;
    *) warn "End-to-end encryption isn't set up yet. Open the dashboard, set an encryption password, then re-run."; return 1 ;;
  esac
  if [ -z "$ENCRYPTION_PASSWORD" ]; then
    warn "encryption_password is empty in $CONFIG_FILE. Add the password you set in the dashboard, then re-run."
    return 1
  fi

  # ccusage --by-agent already covers every tool (claude/codex/opencode/...).
  json="$(run_ccusage claude)" || json=""
  if [ -z "$json" ]; then warn "ccusage produced no output."; return 1; fi

  body="$(printf '%s' "$json" | LP="$ENCRYPTION_PASSWORD" LSALT="$CRYPTO_SALT" \
    LITER="$CRYPTO_ITER" LVN="$CRYPTO_VN" LVC="$CRYPTO_VC" node -e "$NODE_ENCRYPT" 2>"$DATA_DIR/enc.err")"
  if [ $? -ne 0 ] || [ -z "$body" ]; then
    if grep -q VERIFY_FAIL "$DATA_DIR/enc.err" 2>/dev/null; then
      warn "Encryption password does not match the dashboard. Fix encryption_password in $CONFIG_FILE."
    else
      warn "Local encryption failed: $(cat "$DATA_DIR/enc.err" 2>/dev/null)"
    fi
    return 1
  fi

  code="$(printf '%s' "$body" | curl -fsSL -o /dev/null -w '%{http_code}' -X PUT \
    -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \
    --data @- "$SERVER_URL/api/usage/encrypted" 2>/dev/null)" || code="000"
  if [ "$code" = "204" ] || [ "$code" = "200" ]; then
    log "Uploaded encrypted usage blob."
    return 0
  fi
  warn "Encrypted upload failed (HTTP $code)."
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

  code="$(curl -fsSL -o /dev/null -w '%{http_code}' -X POST \
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
  log "Starting sync (tz=$TIMEZONE, ccusage=$CCUSAGE_VERSION)"
  rc=0

  # Encrypted usage (once; ccusage --by-agent covers every tool).
  do_encrypted_report || rc=1

  # Optional, plaintext raw archive (opt-in; NOT end-to-end encrypted).
  if is_true "$UPLOAD_ARCHIVES"; then
    for tool in $TOOLS; do
      post_archive "$tool" "$(tool_source_dir "$tool")" || rc=1
    done
  fi

  [ "$rc" -eq 0 ] && log "Sync complete." || warn "Sync completed with some failures."
  return "$rc"
}

# --- Set encryption password -----------------------------------------------
# Read a password without echoing (or from a pipe / arg).
read_password() {
  if [ -n "${1:-}" ]; then printf '%s' "$1"; return; fi
  if [ ! -t 0 ]; then IFS= read -r _pw || true; printf '%s' "$_pw"; return; fi
  printf 'Encryption password (matches the dashboard): ' >&2
  stty -echo 2>/dev/null || true
  IFS= read -r _pw || true
  stty echo 2>/dev/null || true
  printf '\n' >&2
  printf '%s' "$_pw"
}

# Write encryption_password into the config safely (no sed substitution, so any
# character except a double-quote is fine).
write_password() {
  val="$1"
  case "$val" in *\"*) die "Password contains a double-quote (\"), which the config can't store. Use one without it." ;; esac
  tmp="$CONFIG_FILE.tmp.$$"
  grep -v '^[[:space:]]*encryption_password[[:space:]]*=' "$CONFIG_FILE" > "$tmp" 2>/dev/null || : > "$tmp"
  printf 'encryption_password = "%s"\n' "$val" >> "$tmp"
  mv "$tmp" "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE" 2>/dev/null || true
}

cmd_set_password() {
  newpw="$(read_password "${1:-}")"
  [ -n "$newpw" ] || die "No password entered."

  # If the server already has encryption configured, verify before saving so a
  # typo can't lock in a wrong password.
  if fetch_crypto_params; then
    case "$CRYPTO_CONFIGURED" in
      true|True|1)
        if LP="$newpw" LSALT="$CRYPTO_SALT" LITER="$CRYPTO_ITER" LVN="$CRYPTO_VN" LVC="$CRYPTO_VC" \
            node -e "$NODE_VERIFY"; then
          log "Verified against the dashboard."
        else
          die "That password does not match the dashboard's encryption password. Nothing changed."
        fi ;;
      *)
        warn "Encryption isn't set up in the dashboard yet — saving locally. Set the SAME password there." ;;
    esac
  else
    warn "Couldn't reach the server to verify; saving locally anyway."
  fi

  write_password "$newpw"
  # Refresh the in-memory value (config was read once at startup) so the
  # immediate sync below uses the new password.
  ENCRYPTION_PASSWORD="$newpw"
  log "Saved encryption password to $CONFIG_FILE"
  log "Syncing now..."
  cmd_sync || true
}

# --- Self-update -----------------------------------------------------------
# Resolve the absolute path of the installed agent so `update` can replace it.
resolve_self() {
  if [ -n "${LEDGER_AGENT_PATH:-}" ]; then printf '%s' "$LEDGER_AGENT_PATH"; return; fi
  case "$0" in
    /*) if [ -f "$0" ]; then printf '%s' "$0"; return; fi ;;
  esac
  p="$(command -v ledger-agent 2>/dev/null || true)"
  [ -n "$p" ] && { printf '%s' "$p"; return; }
  printf '%s' "$HOME/.local/bin/ledger-agent"
}

cmd_update() {
  target="$(resolve_self)"
  log "Updating agent from $SERVER_URL (current v$AGENT_VERSION) -> $target"

  tmp="$target.tmp.$$"
  if ! curl -fsSL "$SERVER_URL/ledger-agent.sh" -o "$tmp"; then
    rm -f "$tmp"
    die "Failed to download update from $SERVER_URL/ledger-agent.sh"
  fi
  # Sanity-check the download before trusting it as an executable.
  if ! head -n1 "$tmp" | grep -q '^#!'; then
    rm -f "$tmp"
    die "Downloaded file does not look like a script; leaving current agent in place."
  fi
  chmod +x "$tmp"
  # Atomic rename: the running process keeps its open inode, so replacing the
  # path mid-run is safe.
  mv "$tmp" "$target"
  newver="$(sh "$target" version 2>/dev/null | sed -n 's/.*v\([0-9][^ ]*\).*/\1/p' | head -n1)"
  log "Agent updated${newver:+ to v$newver} at $target"

  # Best-effort: re-pin ccusage version from the server so all machines match.
  meta="$(curl -fsSL "$SERVER_URL/api/meta" 2>/dev/null || true)"
  srvver="$(printf '%s' "$meta" | sed -n 's/.*"ccusage_version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [ -n "$srvver" ] && [ "$srvver" != "$CCUSAGE_VERSION" ]; then
    set_conf ccusage_version "$srvver"
    log "Re-pinned ccusage version: $CCUSAGE_VERSION -> $srvver"
  fi

  # Prompt to set encryption password if not yet configured, to unblock uploads.
  storedpw="$(conf encryption_password)"
  if [ -z "$storedpw" ]; then
    read_password() {
      if [ -n "${1:-}" ]; then printf '%s' "$1"; return; fi
      printf 'Enter encryption password (same as dashboard): ' >&2
      stty -echo 2>/dev/null || true
      IFS= read -r _pw || true
      stty echo 2>/dev/null || true
      printf '\n' >&2
      printf '%s' "$_pw"
    }

    newpw="$(read_password)"
    [ -n "$newpw" ] || die "No encryption password provided. Usage is end-to-end encrypted, so you must set one."

    tmp="$CONFIG_FILE.tmp.$$"
    grep -v '^[[:space:]]*encryption_password[[:space:]]*=' "$CONFIG_FILE" > "$tmp" 2>/dev/null || : > "$tmp"
    printf 'encryption_password = "%s"\n' "$newpw" >> "$tmp"
    mv "$tmp" "$CONFIG_FILE"
    chmod 600 "$CONFIG_FILE" 2>/dev/null || true
    log "Saved encryption password to $CONFIG_FILE"

    # Refresh the in-memory value for the immediate sync below.
    ENCRYPTION_PASSWORD="$newpw"

    log "Syncing now..."
    cmd_sync || true
  else
    log "Encryption password is already set — no action needed."
  fi
}

usage() {
  cat <<EOF
ledger-agent v$AGENT_VERSION

Usage: ledger-agent <command>

Commands:
  sync            Run ccusage and upload encrypted usage (default).
  set-password    Set the end-to-end encryption password (prompts; verifies).
  update          Re-download the latest agent from the server and re-pin ccusage.
  version         Print the agent version and config path.
EOF
}

case "${1:-sync}" in
  sync)                  cmd_sync ;;
  set-password|password) cmd_set_password "${2:-}" ;;
  update)                cmd_update ;;
  version)               echo "ledger-agent v$AGENT_VERSION (config: $CONFIG_FILE)" ;;
  -h|--help|help)        usage ;;
  *)                     warn "Unknown command: $1"; usage; exit 2 ;;
esac
