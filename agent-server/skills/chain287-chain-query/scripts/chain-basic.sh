#!/bin/sh
# Chain287 basic chain queries.
# Actions: block_height, latest_block, chain_id, rpc_alive, genesis_hash
set -eu

action="${1:-}"
rpc_url="${CHAIN287_RPC_URL:-${ETH_RPC_URL:-}}"

# shellcheck source=./lib.sh
. "$(dirname "$0")/lib.sh"

if [ -z "$action" ]; then
  print_error "MISSING_ACTION" "missing action"
  exit 2
fi

require_rpc
check_cast

case "$action" in
  block_height | latest_block)
    block_number="$(cast block-number --rpc-url "$rpc_url" | tr -d '\r\n ')"
    python3 - "$block_number" <<'PY'
import sys, json, subprocess
bn = sys.argv[1]
print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": f"Chain287 latest block is {bn}",
    "data": {"blockNumber": int(bn)},
    "metadata": {
        "source": "cast block-number",
        "timestamp": subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()
    }
}))
PY
    ;;

  chain_id)
    chain_id="$(cast chain-id --rpc-url "$rpc_url" | tr -d '\r\n ')"
    python3 - "$chain_id" <<'PY'
import sys, json, subprocess
cid = sys.argv[1]
print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": f"Chain287 chain ID is {cid}",
    "data": {"chainId": int(cid)},
    "metadata": {
        "source": "cast chain-id",
        "timestamp": subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()
    }
}))
PY
    ;;

  rpc_alive)
    start_s="$(date +%s)"
    if cast chain-id --rpc-url "$rpc_url" >/dev/null 2>&1; then
      end_s="$(date +%s)"
      latency_ms=$(( (end_s - start_s) * 1000 ))
      python3 - "$latency_ms" <<'PY'
import sys, json, subprocess
latency = int(sys.argv[1])
print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": f"Chain287 RPC is alive ({latency}ms)",
    "data": {"alive": True, "latencyMs": latency},
    "metadata": {
        "source": "cast chain-id",
        "timestamp": subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()
    }
}))
PY
    else
      print_error "RPC_UNREACHABLE" "Chain287 RPC is unreachable" "cast chain-id"
      exit 1
    fi
    ;;

  genesis_hash)
    hash="$(cast block 0 --field hash --rpc-url "$rpc_url" | tr -d '\r\n ')"
    python3 - "$hash" <<'PY'
import sys, json, subprocess
h = sys.argv[1]
print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": f"Chain287 genesis hash is {h}",
    "data": {"genesisHash": h},
    "metadata": {
        "source": "cast block 0 --field hash",
        "timestamp": subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()
    }
}))
PY
    ;;

  *)
    print_error "UNSUPPORTED_ACTION" "unsupported chain-basic action: ${action}"
    exit 2
    ;;
esac
