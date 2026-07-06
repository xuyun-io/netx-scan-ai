#!/bin/sh
set -eu

action="${1:-}"
rpc_url="${CHAIN287_RPC_URL:-${ETH_RPC_URL:-}}"

timestamp_utc() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

print_output() {
  status="$1"
  message="$2"
  data="$3"
  checked_at="$(timestamp_utc)"
  cat <<EOF
{"version":"1.0","status":"${status}","message":"${message}","data":${data},"metadata":{"source":"cast block-number","timestamp":"${checked_at}"}}
EOF
}

print_error() {
  code="$1"
  detail="$2"
  escaped_detail="$(json_escape "$detail")"
  cat <<EOF
{"version":"1.0","status":"error","message":"${escaped_detail}","error":{"code":"${code}","detail":"${escaped_detail}"},"metadata":{"source":"cast block-number","timestamp":"$(timestamp_utc)"}}
EOF
}

if [ -z "$action" ]; then
  print_error "MISSING_ACTION" "missing action" >&2
  exit 2
fi

if [ -z "$rpc_url" ]; then
  print_error "MISSING_RPC_URL" "CHAIN287_RPC_URL or ETH_RPC_URL is required" >&2
  exit 2
fi

if ! command -v cast >/dev/null 2>&1; then
  print_error "CAST_NOT_FOUND" "cast command not found in PATH" >&2
  exit 127
fi

case "$action" in
  latest_block)
    block_number="$(cast block-number --rpc-url "$rpc_url" | tr -d '\r\n ')"
    checked_at="$(timestamp_utc)"
    print_output "ok" "Chain287 latest block is ${block_number}" "{\"blockNumber\":${block_number}}"
    ;;
  *)
    escaped="$(json_escape "$action")"
    print_error "UNSUPPORTED_ACTION" "unsupported chain query action: ${escaped}" >&2
    exit 2
    ;;
esac
