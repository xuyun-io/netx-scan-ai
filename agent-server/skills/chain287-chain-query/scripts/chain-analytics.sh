#!/bin/sh
# Chain287 chain analytics: multi-block analysis and health aggregation.
# Actions: recent_blocks, chain_health
set -eu

action="${1:-}"
_raw_count="${2:-10}"
# tools.yaml substitutes ${count}; if the var is missing the literal placeholder remains.
case "$_raw_count" in
  '' | *'${'*) count=10 ;;
  *) count="$_raw_count" ;;
esac
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
  recent_blocks)
    python3 - "$rpc_url" "$count" <<'PY'
import sys, json, subprocess
from collections import Counter

rpc_url = sys.argv[1]
count = max(1, min(int(sys.argv[2]), 200))

def shell(args):
    return subprocess.check_output(args, text=True).strip()

source = "cast block <n> --json"
timestamp = shell(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"])

try:
    latest = int(shell(["cast", "block-number", "--rpc-url", rpc_url]))
except subprocess.CalledProcessError as e:
    detail = f"failed to fetch latest block: {e}"
    print(json.dumps({
        "version": "1.0", "status": "error", "message": detail,
        "error": {"code": "BLOCK_FETCH_FAILED", "detail": detail},
        "metadata": {"source": source, "timestamp": timestamp}
    }))
    sys.exit(0)

blocks = []
start_block = max(0, latest - count + 1)
for n in range(start_block, latest + 1):
    try:
        raw = shell(["cast", "block", str(n), "--json", "--rpc-url", rpc_url])
        blk = json.loads(raw)["data"]
        blocks.append({
            "number": int(blk["number"], 16),
            "timestamp": int(blk["timestamp"], 16),
            "miner": blk["miner"].lower(),
            "gasUsed": int(blk["gasUsed"], 16),
            "gasLimit": int(blk["gasLimit"], 16),
            "txCount": len(blk["transactions"]),
        })
    except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError) as e:
        detail = f"failed to fetch block {n}: {e}"
        print(json.dumps({
            "version": "1.0", "status": "error", "message": detail,
            "error": {"code": "BLOCK_FETCH_FAILED", "detail": detail},
            "metadata": {"source": source, "timestamp": timestamp}
        }))
        sys.exit(0)

intervals = []
for i in range(1, len(blocks)):
    intervals.append(blocks[i]["timestamp"] - blocks[i - 1]["timestamp"])

miner_counts = Counter(b["miner"] for b in blocks)

avg_interval = round(sum(intervals) / len(intervals), 3) if intervals else 0
max_interval = max(intervals) if intervals else 0

print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": f"Chain287 recent {len(blocks)} blocks analyzed (avg interval {avg_interval}s)",
    "data": {
        "latestBlock": latest,
        "sampledBlocks": len(blocks),
        "averageInterval": avg_interval,
        "maxInterval": max_interval,
        "minerDistribution": dict(miner_counts),
        "blocks": blocks,
    },
    "metadata": {"source": source, "timestamp": timestamp}
}))
PY
    ;;

  chain_health)
    python3 - "$rpc_url" "$count" <<'PY'
import sys, json, subprocess, time

rpc_url = sys.argv[1]
count = max(1, min(int(sys.argv[2]), 50))

def shell(args):
    return subprocess.check_output(args, text=True).strip()

def cast(args):
    return shell(["cast"] + args + ["--rpc-url", rpc_url])

timestamp = shell(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"])
source = "chain_health aggregation"

checks = {}
status = "ok"
messages = []

# 1. RPC alive
rpc_start = time.time()
try:
    cast(["chain-id"])
    rpc_latency_ms = int((time.time() - rpc_start) * 1000)
    checks["rpcAlive"] = {"ok": True, "latencyMs": rpc_latency_ms}
except subprocess.CalledProcessError:
    checks["rpcAlive"] = {"ok": False, "latencyMs": -1}
    status = "error"
    messages.append("RPC is unreachable")

if not checks["rpcAlive"]["ok"]:
    print(json.dumps({
        "version": "1.0", "status": status,
        "message": "; ".join(messages) if messages else "Chain287 RPC unreachable",
        "data": {"checks": checks},
        "error": {"code": "RPC_UNREACHABLE", "detail": "Chain287 RPC unreachable"},
        "metadata": {"source": source, "timestamp": timestamp}
    }))
    sys.exit(0)

# 2. Latest block and timestamp
latest_block = int(cast(["block-number"]))
latest_block_raw = json.loads(shell(["cast", "block", str(latest_block), "--json", "--rpc-url", rpc_url]))["data"]
latest_ts = int(latest_block_raw["timestamp"], 16)
now_ts = int(time.time())
block_age_s = max(0, now_ts - latest_ts)
checks["latestBlock"] = {"blockNumber": latest_block, "blockAgeSeconds": block_age_s}

if block_age_s > 180:
    status = "error"
    messages.append(f"latest block is {block_age_s}s old")
elif block_age_s > 60:
    if status == "ok":
        status = "partial"
    messages.append(f"latest block is {block_age_s}s old")

# 3. Recent block interval
intervals = []
for n in range(max(0, latest_block - count + 1), latest_block + 1):
    try:
        blk = json.loads(shell(["cast", "block", str(n), "--json", "--rpc-url", rpc_url]))["data"]
        if n > max(0, latest_block - count + 1):
            prev = json.loads(shell(["cast", "block", str(n - 1), "--json", "--rpc-url", rpc_url]))["data"]
            intervals.append(int(blk["timestamp"], 16) - int(prev["timestamp"], 16))
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        continue

avg_interval = round(sum(intervals) / len(intervals), 3) if intervals else 0
max_interval = max(intervals) if intervals else 0
checks["blockInterval"] = {"average": avg_interval, "max": max_interval}

if avg_interval > 6:
    if status == "ok":
        status = "partial"
    messages.append(f"average block interval {avg_interval}s exceeds 6s")
if max_interval > 15:
    status = "error"
    messages.append(f"max block interval {max_interval}s exceeds 15s")

# 4. Peer count
try:
    peer_raw = cast(["rpc", "net_peerCount"]).strip().strip('"')
    peer_count = int(peer_raw, 16)
except Exception as e:
    peer_count = -1
    messages.append(f"peer count check failed: {e}")
checks["peerCount"] = peer_count

if peer_count == 0:
    status = "error"
    messages.append("peer count is 0")

# 5. Active validators
try:
    val_out = shell(["cast", "call", "0x0000000000000000000000000000000000001000",
                     "getValidators()(address[])", "--rpc-url", rpc_url])
    import re
    validators = []
    for line in val_out.splitlines():
        line = line.strip().replace("[", "").replace("]", "").replace(",", " ")
        for token in line.split():
            token = token.lower()
            if re.fullmatch(r"0x[0-9a-f]{40}", token):
                validators.append(token)
    validators = sorted(set(validators))
    checks["activeValidators"] = {"count": len(validators), "validators": validators}
except subprocess.CalledProcessError as e:
    checks["activeValidators"] = {"count": -1, "validators": [], "error": str(e)}
    messages.append(f"validator set check failed: {e}")

if checks["activeValidators"]["count"] == 0:
    status = "error"
    messages.append("no active validators")

message = "; ".join(messages) if messages else "Chain287 chain health looks good"

print(json.dumps({
    "version": "1.0",
    "status": status,
    "message": message,
    "data": {"checks": checks, "sampledBlocks": count},
    "metadata": {"source": source, "timestamp": timestamp}
}))
PY
    ;;

  *)
    print_error "UNSUPPORTED_ACTION" "unsupported chain-analytics action: ${action}"
    exit 2
    ;;
esac
