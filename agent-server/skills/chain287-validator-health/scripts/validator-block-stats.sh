#!/bin/sh
# Chain287 验证者出块统计
# 用途：统计最近 N 个块中每个活跃验证者的出块数量，识别漏块节点
# Action: validator_block_stats [sample]
set -eu

action="validator_block_stats"
if [ "${1:-}" = "$action" ]; then
  sample_raw="${2:-100}"
else
  sample_raw="${1:-100}"
fi
case "$sample_raw" in
  '' | *'${'*) sample=100 ;;
  *) sample="$sample_raw" ;;
esac

rpc_url="${CHAIN287_RPC_URL:-${ETH_RPC_URL:-}}"

# shellcheck source=./lib.sh
. "$(dirname "$0")/lib.sh"

require_rpc
check_cast

python3 - "$rpc_url" "$sample" <<'PY'
import sys, json, subprocess, re
from collections import Counter

rpc_url = sys.argv[1]
sample = max(1, min(int(sys.argv[2]), 500))

def shell(args):
    return subprocess.check_output(args, text=True).strip()

def cast(args):
    return shell(["cast"] + args + ["--rpc-url", rpc_url])

def cast_block_json(number):
    raw = cast(["block", str(number), "--json"])
    payload = json.loads(raw)
    return payload.get("data", payload)

timestamp = shell(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"])
source = "validator_block_stats"

BSC_VALIDATOR_SET = "0x0000000000000000000000000000000000001000"
STAKE_HUB = "0x0000000000000000000000000000000000002002"

# 1. 获取当前活跃验证者（consensus 地址）
try:
    active_out = cast(["call", BSC_VALIDATOR_SET, "getValidators()(address[])"])
except subprocess.CalledProcessError as e:
    detail = f"读取活跃验证者失败: {e}"
    print(json.dumps({
        "version": "1.0", "status": "error", "message": detail,
        "error": {"code": "ACTIVE_VALIDATORS_FAILED", "detail": detail},
        "metadata": {"source": source, "timestamp": timestamp}
    }))
    sys.exit(0)

consensus_addrs = []
for line in active_out.splitlines():
    line = line.strip().replace("[", "").replace("]", "").replace(",", " ")
    for token in line.split():
        token = token.lower()
        if re.fullmatch(r"0x[0-9a-f]{40}", token):
            consensus_addrs.append(token)

consensus_addrs = sorted(set(consensus_addrs))
validator_count = len(consensus_addrs)

# 2. 尝试获取每个 consensus 对应的 operator 地址（用于展示，失败则填空）
consensus_to_operator = {}
for consensus in consensus_addrs:
    try:
        operator = cast(["call", STAKE_HUB, "consensusToOperator(address)(address)", consensus])
        operator = operator.strip().lower()
        if operator != "0x0000000000000000000000000000000000000000":
            consensus_to_operator[consensus] = operator
    except subprocess.CalledProcessError:
        pass

# 3. 获取最新块高并抓取最近 N 块
latest = int(cast(["block-number"]))
start_block = max(0, latest - sample + 1)

miners = []
for n in range(start_block, latest + 1):
    try:
        blk = cast_block_json(n)
        miners.append(blk["miner"].lower())
    except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError):
        detail = f"获取区块 {n} 失败"
        print(json.dumps({
            "version": "1.0", "status": "error", "message": detail,
            "error": {"code": "BLOCK_FETCH_FAILED", "detail": detail},
            "metadata": {"source": source, "timestamp": timestamp}
        }))
        sys.exit(0)

miner_counts = Counter(miners)
actual_sample = len(miners)
expected = actual_sample / max(validator_count, 1)

# 4. 构造每个验证者的统计
validators = []
all_ok = True
for consensus in consensus_addrs:
    count = miner_counts.get(consensus, 0)
    share = round(count / actual_sample * 100, 2) if actual_sample else 0
    if expected > 0 and count == 0:
        status = "missing"
        all_ok = False
    elif expected > 0 and count < expected * 0.5:
        status = "low"
        all_ok = False
    else:
        status = "ok"
    validators.append({
        "consensus": consensus,
        "operator": consensus_to_operator.get(consensus, ""),
        "blocks": count,
        "expected": round(expected, 2),
        "sharePercent": share,
        "status": status
    })

unknown_miners = {addr: cnt for addr, cnt in miner_counts.items() if addr not in consensus_addrs}

status = "ok" if all_ok and not unknown_miners else ("error" if unknown_miners else "partial")
message = "Chain287 验证者出块统计正常" if status == "ok" else "Chain287 存在验证者出块异常"

print(json.dumps({
    "version": "1.0",
    "status": status,
    "message": message,
    "data": {
        "latestBlock": latest,
        "sampledBlocks": actual_sample,
        "validatorCount": validator_count,
        "expectedPerValidator": round(expected, 2),
        "validators": validators,
        "unknownMiners": unknown_miners
    },
    "metadata": {"source": source, "timestamp": timestamp}
}))
PY
