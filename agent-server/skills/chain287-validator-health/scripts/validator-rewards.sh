#!/bin/sh
# Chain287 验证者收益快照
# 用途：读取每个已注册验证者的 StakeCredit Pool 总额，计算累计奖励
# Action: validator_rewards
set -eu

rpc_url="${CHAIN287_RPC_URL:-${ETH_RPC_URL:-}}"

# shellcheck source=./lib.sh
. "$(dirname "$0")/lib.sh"

require_rpc
check_cast

python3 - "$rpc_url" <<'PY'
import sys, json, subprocess

rpc_url = sys.argv[1]

def shell(args):
    return subprocess.check_output(args, text=True).strip()

def cast(args):
    return shell(["cast"] + args + ["--rpc-url", rpc_url])

timestamp = shell(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"])
source = "validator_rewards"

STAKE_HUB = "0x0000000000000000000000000000000000002002"
INIT_STAKE_WEI = 2000 * 10**18

# 1. 从 StakeHub 获取所有已注册验证者（operator + credit contract）
try:
    out = cast(["call", STAKE_HUB, "getValidators(uint256,uint256)(address[],address[],uint256)", "0", "100"])
except subprocess.CalledProcessError as e:
    detail = f"读取验证者列表失败: {e}"
    print(json.dumps({
        "version": "1.0", "status": "error", "message": detail,
        "error": {"code": "VALIDATOR_LIST_FAILED", "detail": detail},
        "metadata": {"source": source, "timestamp": timestamp}
    }))
    sys.exit(0)

lines = [l.strip() for l in out.splitlines() if l.strip()]
if len(lines) < 3:
    detail = "StakeHub.getValidators 返回格式异常"
    print(json.dumps({
        "version": "1.0", "status": "error", "message": detail,
        "error": {"code": "VALIDATOR_LIST_PARSE_FAILED", "detail": detail},
        "metadata": {"source": source, "timestamp": timestamp}
    }))
    sys.exit(0)

# Foundry 返回：operator[] 第一行、credit[] 第二行、totalLength 第三行
def parse_addr_array(line):
    line = line.replace("[", "").replace("]", "").replace(",", " ")
    return [t.strip().lower() for t in line.split() if t.strip().startswith("0x")]

operators = parse_addr_array(lines[0])
credits = parse_addr_array(lines[1])
total_length = int(lines[2])

# 2. 逐个读取收益
results = []
total_rewards = 0.0
for operator, credit in zip(operators, credits):
    try:
        consensus = cast(["call", STAKE_HUB, "getValidatorConsensusAddress(address)(address)", operator]).strip().lower()
    except subprocess.CalledProcessError:
        consensus = ""

    try:
        pool_raw = cast(["call", credit, "totalPooledBNB()(uint256)"])
        pool_wei = int(pool_raw.split()[0])
    except (subprocess.CalledProcessError, ValueError):
        pool_wei = 0

    pool_netx = pool_wei / 10**18
    rewards_netx = max(0.0, pool_netx - 2000.0)
    total_rewards += rewards_netx

    results.append({
        "operator": operator,
        "consensus": consensus,
        "creditContract": credit,
        "poolTotal": round(pool_netx, 6),
        "rewards": round(rewards_netx, 6)
    })

# 3. 输出
print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": f"Chain287 验证者收益快照，共 {len(results)} 个验证者，累计奖励 {total_rewards:.6f} NETX",
    "data": {
        "validatorCount": len(results),
        "totalRewards": round(total_rewards, 6),
        "validators": results
    },
    "metadata": {"source": source, "timestamp": timestamp}
}))
PY
