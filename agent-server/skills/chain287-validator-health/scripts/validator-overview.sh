#!/bin/sh
# Chain287 验证者总览
# 用途：从链上读取注册验证者、活跃集合、jail、StakeCredit、余额、近期出块。
# Action: validator_overview [sample]
set -eu

if [ "${1:-}" = "validator_overview" ]; then
  sample_raw="${2:-80}"
else
  sample_raw="${1:-80}"
fi
case "$sample_raw" in
  '' | *'${'*) sample=80 ;;
  *) sample="$sample_raw" ;;
esac

rpc_url="${CHAIN287_RPC_URL:-${ETH_RPC_URL:-}}"

# shellcheck source=./lib.sh
. "$(dirname "$0")/lib.sh"

require_rpc

python3 - "$rpc_url" "$sample" <<'PY'
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from collections import Counter

for proxy_var in ("http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
    os.environ.pop(proxy_var, None)
os.environ["NO_PROXY"] = "*"
os.environ["no_proxy"] = "*"

rpc_url = sys.argv[1]
sample = max(1, min(int(sys.argv[2]), 500))

BSC_VALIDATOR_SET = "0x0000000000000000000000000000000000001000"
STAKE_HUB = "0x0000000000000000000000000000000000002002"
SEL_ACTIVE_VALIDATORS = "0xb7ab4db5"
SEL_REGISTERED_VALIDATORS = "0xbff02e20"
SEL_CONSENSUS = "0x059ddd22"
SEL_BASIC = "0xcbb04d9d"
SEL_SYMBOL = "0x95d89b41"
SEL_TOTAL_POOLED = "0x15d1f898"
SEL_GET_POOLED = "0x0913db47"
SEL_PENDING_UNBOND = "0x038c0023"
SEL_CLAIMABLE_UNBOND = "0x2f2d448a"


def timestamp():
    return subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()


def emit(status, message, data=None, error=None):
    payload = {
        "version": "1.0",
        "status": status,
        "message": message,
        "metadata": {"source": "validator_overview", "timestamp": timestamp()},
        "display": {"format": "table", "title": "验证者总览"},
    }
    if data is not None:
        payload["data"] = data
    if error is not None:
        payload["error"] = error
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def rpc(method, params=None, timeout=12):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params or [], "id": 1}).encode()
    req = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read())
    if "error" in payload:
        raise RuntimeError(f"{method} RPC error: {payload['error']}")
    return payload.get("result")


def eth_call(to, data, block="latest"):
    return rpc("eth_call", [{"to": to, "data": data}, block])


def hex_int(value):
    if value in (None, "", "0x"):
        return 0
    if isinstance(value, int):
        return value
    return int(str(value), 16) if str(value).startswith("0x") else int(value)


def netx(wei):
    return round(int(wei) / 10**18, 9)


def pad_uint(value):
    return f"{int(value):064x}"


def pad_addr(addr):
    return addr.lower().replace("0x", "").zfill(64)


def decode_addr_word(word):
    return "0x" + word[-40:].lower()


def decode_dynamic_address_array(raw):
    if not raw or raw == "0x":
        return []
    data = raw[2:] if raw.startswith("0x") else raw
    if len(data) < 128:
        return []
    offset = int(data[:64], 16) * 2
    return decode_address_array_at(data, offset)


def decode_address_array_at(data, offset):
    if len(data) < offset + 64:
        return []
    count = int(data[offset:offset + 64], 16)
    base = offset + 64
    out = []
    for i in range(count):
        word = data[base + i * 64:base + (i + 1) * 64]
        if len(word) == 64:
            out.append(decode_addr_word(word))
    return out


def decode_registered(raw):
    if not raw or raw == "0x":
        return [], [], 0
    data = raw[2:] if raw.startswith("0x") else raw
    if len(data) < 192:
        return [], [], 0
    op_offset = int(data[0:64], 16) * 2
    credit_offset = int(data[64:128], 16) * 2
    total = int(data[128:192], 16)
    return decode_address_array_at(data, op_offset), decode_address_array_at(data, credit_offset), total


def decode_string(raw):
    if not raw or raw == "0x":
        return ""
    data = raw[2:] if raw.startswith("0x") else raw
    if len(data) < 128:
        return ""
    try:
        offset = int(data[:64], 16) * 2
        length = int(data[offset:offset + 64], 16)
        body = data[offset + 64:offset + 64 + length * 2]
        return bytes.fromhex(body).decode("utf-8", errors="ignore")
    except Exception:
        return ""


def decode_basic_info(raw):
    if not raw or raw == "0x":
        return {"createdTime": 0, "jailed": False, "jailUntil": 0}
    data = raw[2:] if raw.startswith("0x") else raw
    words = [data[i:i + 64] for i in range(0, min(len(data), 192), 64)]
    if len(words) < 3:
        return {"createdTime": 0, "jailed": False, "jailUntil": 0}
    return {
        "createdTime": int(words[0], 16),
        "jailed": int(words[1], 16) != 0,
        "jailUntil": int(words[2], 16),
    }


def safe_call(default, fn):
    try:
        return fn()
    except Exception:
        return default


try:
    latest = hex_int(rpc("eth_blockNumber"))
    start = max(0, latest - sample + 1)
    miners = []
    for number in range(start, latest + 1):
        block = rpc("eth_getBlockByNumber", [hex(number), False])
        if block and block.get("miner"):
            miners.append(block["miner"].lower())
    miner_counts = Counter(miners)

    active_raw = eth_call(BSC_VALIDATOR_SET, SEL_ACTIVE_VALIDATORS)
    active_consensus = decode_dynamic_address_array(active_raw)
    active_set = set(active_consensus)

    registered_raw = eth_call(STAKE_HUB, SEL_REGISTERED_VALIDATORS + pad_uint(0) + pad_uint(200))
    operators, credits, total_length = decode_registered(registered_raw)

    validators = []
    active_count = 0
    jailed_count = 0
    not_in_set_count = 0
    missing_block_count = 0

    expected = len(miners) / max(len(active_consensus), 1)
    now_ts = int(time.time())

    for index, operator in enumerate(operators):
        credit = credits[index] if index < len(credits) else "0x0000000000000000000000000000000000000000"
        consensus = safe_call("", lambda op=operator: decode_addr_word(eth_call(STAKE_HUB, SEL_CONSENSUS + pad_addr(op))[-64:]))
        basic = safe_call({"createdTime": 0, "jailed": False, "jailUntil": 0}, lambda op=operator: decode_basic_info(eth_call(STAKE_HUB, SEL_BASIC + pad_addr(op))))
        symbol = safe_call("", lambda c=credit: decode_string(eth_call(c, SEL_SYMBOL)))
        moniker = symbol[2:] if symbol.startswith("st") else symbol or f"validator-{index + 1}"

        total_pool = safe_call(0, lambda c=credit: hex_int(eth_call(c, SEL_TOTAL_POOLED)))
        self_pooled = safe_call(0, lambda c=credit, op=operator: hex_int(eth_call(c, SEL_GET_POOLED + pad_addr(op))))
        pending_unbond = safe_call(0, lambda c=credit, op=operator: hex_int(eth_call(c, SEL_PENDING_UNBOND + pad_addr(op))))
        claimable_unbond = safe_call(0, lambda c=credit, op=operator: hex_int(eth_call(c, SEL_CLAIMABLE_UNBOND + pad_addr(op))))
        operator_balance = safe_call(0, lambda op=operator: hex_int(rpc("eth_getBalance", [op, "latest"])))
        consensus_balance = safe_call(0, lambda cons=consensus: hex_int(rpc("eth_getBalance", [cons, "latest"])) if re.fullmatch(r"0x[0-9a-f]{40}", cons) else 0)

        blocks = miner_counts.get(consensus.lower(), 0) if consensus else 0
        is_active = consensus.lower() in active_set if consensus else False
        if is_active:
            active_count += 1

        if basic.get("jailed"):
            status = "jailed"
            jailed_count += 1
        elif not is_active:
            status = "not_in_set"
            not_in_set_count += 1
        elif blocks == 0 and len(miners) >= len(active_consensus):
            status = "missing_blocks"
            missing_block_count += 1
        elif expected > 0 and blocks < expected * 0.5:
            status = "low_blocks"
            missing_block_count += 1
        else:
            status = "active"

        jail_until = basic.get("jailUntil", 0)
        validators.append({
            "moniker": moniker,
            "operator": operator,
            "consensus": consensus,
            "creditContract": credit,
            "active": is_active,
            "status": status,
            "createdTime": basic.get("createdTime", 0),
            "jailed": basic.get("jailed", False),
            "jailUntil": jail_until,
            "jailRemainingSeconds": max(0, jail_until - now_ts) if jail_until else 0,
            "recentBlocks": blocks,
            "recentBlockSharePercent": round(blocks / len(miners) * 100, 2) if miners else 0,
            "totalPoolNetx": netx(total_pool),
            "selfPooledNetx": netx(self_pooled),
            "operatorBalanceNetx": netx(operator_balance),
            "consensusBalanceNetx": netx(consensus_balance),
            "pendingUnbondRequests": pending_unbond,
            "claimableUnbondRequests": claimable_unbond,
        })

    status = "ok"
    if jailed_count or not_in_set_count:
        status = "error"
    elif missing_block_count:
        status = "partial"

    message = (
        f"Chain287 验证者总览：注册 {len(validators)}/{total_length}，"
        f"活跃 {active_count}，jailed {jailed_count}，未入集 {not_in_set_count}，"
        f"出块异常 {missing_block_count}"
    )
    emit(status, message, {
        "latestBlock": latest,
        "sampledBlocks": len(miners),
        "expectedBlocksPerActiveValidator": round(expected, 2),
        "registeredCount": len(validators),
        "registeredTotalLength": total_length,
        "activeCount": active_count,
        "jailedCount": jailed_count,
        "notInSetCount": not_in_set_count,
        "blockAnomalyCount": missing_block_count,
        "validators": validators,
    })
except Exception as exc:
    emit("error", f"Chain287 验证者总览读取失败: {exc}", error={"code": "VALIDATOR_OVERVIEW_FAILED", "detail": str(exc)})
PY
