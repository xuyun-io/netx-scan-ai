#!/bin/sh
# Chain287 validator and node-level queries via RPC.
# Actions: active_validators, peer_count
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
  active_validators)
    python3 - "$rpc_url" <<'PY'
import sys, json, subprocess, re

rpc_url = sys.argv[1]

def shell(args):
    return subprocess.check_output(args, text=True).strip()

source = "cast call BSCValidatorSet.getValidators()"
try:
    out = shell([
        "cast", "call", "0x0000000000000000000000000000000000001000",
        "getValidators()(address[])", "--rpc-url", rpc_url
    ])
except subprocess.CalledProcessError as e:
    detail = f"failed to read validator set: {e}"
    print(json.dumps({
        "version": "1.0", "status": "error", "message": detail,
        "error": {"code": "VALIDATOR_SET_READ_FAILED", "detail": detail},
        "metadata": {"source": source, "timestamp": shell(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"])}
    }))
    sys.exit(0)

validators = []
for line in out.splitlines():
    line = line.strip().replace("[", "").replace("]", "").replace(",", " ")
    for token in line.split():
        token = token.lower()
        if re.fullmatch(r"0x[0-9a-f]{40}", token):
            validators.append(token)

validators = sorted(set(validators))
count = len(validators)

print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": f"Chain287 active validator set has {count} validator{'s' if count != 1 else ''}",
    "data": {"validators": validators, "count": count},
    "metadata": {"source": source, "timestamp": shell(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"])}
}))
PY
    ;;

  peer_count)
    raw="$(cast rpc net_peerCount --rpc-url "$rpc_url" | tr -d '\r\n ')"
    python3 - "$raw" <<'PY'
import sys, json, subprocess
raw = sys.argv[1].strip().strip('"')
try:
    peers = int(raw, 16)
except ValueError as e:
    detail = f"failed to parse peer count '{raw}': {e}"
    print(json.dumps({
        "version": "1.0", "status": "error", "message": detail,
        "error": {"code": "PEER_COUNT_PARSE_FAILED", "detail": detail},
        "metadata": {"source": "cast rpc net_peerCount", "timestamp": subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()}
    }))
    sys.exit(0)
print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": f"Chain287 peer count is {peers}",
    "data": {"peerCount": peers},
    "metadata": {
        "source": "cast rpc net_peerCount",
        "timestamp": subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()
    }
}))
PY
    ;;

  *)
    print_error "UNSUPPORTED_ACTION" "unsupported validator-node action: ${action}"
    exit 2
    ;;
esac
