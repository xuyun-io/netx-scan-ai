#!/bin/sh
# Chain287 验证者状态检查
# 用途：检查每个已注册验证者是否处于活跃、被 jail 或未入集状态
# Action: validator_jailed_status
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
source = "validator_jailed_status"

BSC_VALIDATOR_SET = "0x0000000000000000000000000000000000001000"
STAKE_HUB = "0x0000000000000000000000000000000000002002"

# 1. 从 StakeHub 获取所有已注册验证者
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

def parse_addr_array(line):
    line = line.replace("[", "").replace("]", "").replace(",", " ")
    return [t.strip().lower() for t in line.split() if t.strip().startswith("0x")]

operators = parse_addr_array(lines[0])

# 2. 逐个检查状态
results = []
active_count = 0
jailed_count = 0
not_in_set_count = 0

for operator in operators:
    try:
        consensus = cast(["call", STAKE_HUB, "getValidatorConsensusAddress(address)(address)", operator]).strip().lower()
    except subprocess.CalledProcessError:
        consensus = ""
        results.append({"operator": operator, "consensus": "", "status": "unknown", "reason": "无法读取共识地址"})
        continue

    try:
        is_current = cast(["call", BSC_VALIDATOR_SET, "isCurrentValidator(address)(bool)", consensus]).strip().lower()
        is_current = is_current == "true"
    except subprocess.CalledProcessError:
        is_current = False

    if is_current:
        status = "active"
        reason = "活跃验证者"
        active_count += 1
    else:
        # 检查是否在 currentValidatorSet 中但被 jail
        try:
            idx_raw = cast(["call", BSC_VALIDATOR_SET, "currentValidatorSetMap(address)(uint256)", consensus]).strip()
            idx = int(idx_raw.split()[0])
        except (subprocess.CalledProcessError, ValueError):
            idx = 0

        if idx == 0:
            status = "not_in_set"
            reason = "已注册但未进入当前验证者集合"
            not_in_set_count += 1
        else:
            # 读取 jailed 字段（tuple 第 5 个返回值，索引 4）
            try:
                val_lines = cast([
                    "call", BSC_VALIDATOR_SET,
                    "currentValidatorSet(uint256)(address,address,address,uint64,bool,uint256)",
                    str(idx - 1)
                ]).splitlines()
                jailed = val_lines[4].strip().lower() == "true" if len(val_lines) >= 5 else False
            except (subprocess.CalledProcessError, IndexError):
                jailed = False

            if jailed:
                status = "jailed"
                reason = "已被 jail"
                jailed_count += 1
            else:
                status = "not_working"
                reason = "在集合中但未正常工作（可能处于维护模式）"
                jailed_count += 1

    results.append({"operator": operator, "consensus": consensus, "status": status, "reason": reason})

overall_status = "ok" if jailed_count == 0 and not_in_set_count == 0 else "error"
message = f"Chain287 验证者状态：活跃 {active_count} 个"
if jailed_count:
    message += f"，异常 {jailed_count} 个"
if not_in_set_count:
    message += f"，未入集 {not_in_set_count} 个"

print(json.dumps({
    "version": "1.0",
    "status": overall_status,
    "message": message,
    "data": {
        "activeCount": active_count,
        "jailedCount": jailed_count,
        "notInSetCount": not_in_set_count,
        "totalCount": len(results),
        "validators": results
    },
    "metadata": {"source": source, "timestamp": timestamp}
}))
PY
