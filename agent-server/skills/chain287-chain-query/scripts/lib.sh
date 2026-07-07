#!/bin/sh
# Common helpers for chain287-chain-query skill scripts.
# All scripts source this file to emit the standardized SkillOutput envelope.

export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

timestamp_utc() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

require_rpc() {
  if [ -z "${rpc_url:-}" ]; then
    print_error "MISSING_RPC_URL" "CHAIN287_RPC_URL or ETH_RPC_URL is required"
    exit 2
  fi
}

check_cast() {
  if ! command -v cast >/dev/null 2>&1; then
    print_error "CAST_NOT_FOUND" "cast command not found in PATH"
    exit 127
  fi
}

print_output() {
  _status="$1"
  _message="$2"
  _data="${3:-{}}"
  _source="${4:-cast-query}"
  _checked_at="$(timestamp_utc)"
  cat <<EOF
{"version":"1.0","status":"${_status}","message":"$(json_escape "$_message")","data":${_data},"metadata":{"source":"$(json_escape "$_source")","timestamp":"${_checked_at}"}}
EOF
}

print_error() {
  _code="$1"
  _detail="$2"
  _source="${3:-cast-query}"
  _escaped_detail="$(json_escape "$_detail")"
  cat <<EOF
{"version":"1.0","status":"error","message":"${_escaped_detail}","error":{"code":"${_code}","detail":"${_escaped_detail}"},"metadata":{"source":"$(json_escape "$_source")","timestamp":"$(timestamp_utc)"}}
EOF
}
