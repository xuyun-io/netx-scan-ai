#!/bin/sh
set -eu

action="${1:-}"
rpc_url="${CHAIN287_RPC_URL:-${ETH_RPC_URL:-}}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

if [ -z "$action" ]; then
  echo "missing action" >&2
  exit 2
fi

if [ -z "$rpc_url" ]; then
  echo "CHAIN287_RPC_URL or ETH_RPC_URL is required" >&2
  exit 2
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "cast command not found in PATH" >&2
  exit 127
fi

case "$action" in
  latest_block)
    block_number="$(cast block-number --rpc-url "$rpc_url" | tr -d '\r\n ')"
    checked_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf '{"status":"ok","network":"chain287","action":"latest_block","blockNumber":%s,"checkedAt":"%s","source":"cast block-number"}\n' "$block_number" "$checked_at"
    ;;
  *)
    escaped="$(json_escape "$action")"
    echo "unsupported chain query action: $escaped" >&2
    exit 2
    ;;
esac

