#!/bin/sh
# Chain287 验证者窗口统计
# 用途：统计一个时间窗口或块区间内的出块、tx、gasUsed、operator 余额变化。
# Action: validator_window_stats [window_sec] [from_block] [to_block]
set -eu

normalize_arg() {
  case "${1:-}" in
    '' | *'${'*) printf '' ;;
    *) printf '%s' "$1" ;;
  esac
}

if [ "${1:-}" = "validator_window_stats" ]; then
  window_raw="${2:-300}"
  from_raw="${3:-}"
  to_raw="${4:-}"
else
  window_raw="${1:-300}"
  from_raw="${2:-}"
  to_raw="${3:-}"
fi

window_sec="$(normalize_arg "$window_raw")"
from_block="$(normalize_arg "$from_raw")"
to_block="$(normalize_arg "$to_raw")"
[ -n "$window_sec" ] || window_sec=300

rpc_url="${CHAIN287_RPC_URL:-${ETH_RPC_URL:-}}"

# shellcheck source=./lib.sh
. "$(dirname "$0")/lib.sh"

require_rpc

python3 - "$rpc_url" "$window_sec" "$from_block" "$to_block" <<'PY'
import json
import os
import re
import statistics
import subprocess
import sys
import time
import urllib.request
from collections import Counter, defaultdict

for proxy_var in ("http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
    os.environ.pop(proxy_var, None)
os.environ["NO_PROXY"] = "*"
os.environ["no_proxy"] = "*"

rpc_url = sys.argv[1]
window_sec = max(1, min(int(sys.argv[2]), 86400))
from_arg = sys.argv[3].strip()
to_arg = sys.argv[4].strip()

BSC_VALIDATOR_SET = "0x0000000000000000000000000000000000001000"
STAKE_HUB = "0x0000000000000000000000000000000000002002"
SEL_ACTIVE_VALIDATORS = "0xb7ab4db5"
SEL_REGISTERED_VALIDATORS = "0xbff02e20"
SEL_CONSENSUS = "0x059ddd22"
SEL_SYMBOL = "0x95d89b41"
MAX_SCAN_BLOCKS = 1200
BATCH_SIZE = 100
SOFT_DEADLINE_SECONDS = 105
started_at = time.monotonic()


def timestamp():
    return subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()


def emit(status, message, data=None, error=None):
    payload = {
        "version": "1.0",
        "status": status,
        "message": message,
        "metadata": {"source": "validator_window_stats", "timestamp": timestamp()},
        "display": {"format": "table", "title": "验证者窗口统计"},
    }
    if data is not None:
        payload["data"] = data
    if error is not None:
        payload["error"] = error
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def remaining_seconds():
    return SOFT_DEADLINE_SECONDS - (time.monotonic() - started_at)


def rpc(method, params=None, timeout=12):
    remaining = remaining_seconds()
    if remaining <= 0:
        raise TimeoutError(f"validator_window_stats exceeded internal {SOFT_DEADLINE_SECONDS}s deadline")
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params or [], "id": 1}).encode()
    req = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=max(1, min(timeout, remaining))) as resp:
        payload = json.loads(resp.read())
    if "error" in payload:
        raise RuntimeError(f"{method} RPC error: {payload['error']}")
    return payload.get("result")


def rpc_batch(calls, timeout=30):
    """Execute JSON-RPC calls in one HTTP request and preserve input order.

    Some RPC gateways disable batch requests. In that case callers can fall
    back to regular rpc() without changing the report output schema.
    """
    if not calls:
        return []
    remaining = remaining_seconds()
    if remaining <= 0:
        raise TimeoutError(f"validator_window_stats exceeded internal {SOFT_DEADLINE_SECONDS}s deadline")
    request_payload = [
        {"jsonrpc": "2.0", "method": method, "params": params or [], "id": index + 1}
        for index, (method, params) in enumerate(calls)
    ]
    req = urllib.request.Request(
        rpc_url,
        data=json.dumps(request_payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=max(1, min(timeout, remaining))) as resp:
        payload = json.loads(resp.read())
    if not isinstance(payload, list):
        raise RuntimeError("RPC endpoint does not support JSON-RPC batch requests")
    by_id = {item.get("id"): item for item in payload if isinstance(item, dict)}
    results = []
    for index in range(len(calls)):
        item = by_id.get(index + 1)
        if item is None:
            raise RuntimeError(f"batch RPC response missing id {index + 1}")
        if "error" in item:
            raise RuntimeError(f"batch RPC error: {item['error']}")
        results.append(item.get("result"))
    return results


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


def decode_address_array_at(data, offset):
    if len(data) < offset + 64:
        return []
    count = int(data[offset:offset + 64], 16)
    base = offset + 64
    return [decode_addr_word(data[base + i * 64:base + (i + 1) * 64]) for i in range(count) if len(data[base + i * 64:base + (i + 1) * 64]) == 64]


def decode_dynamic_address_array(raw):
    if not raw or raw == "0x":
        return []
    data = raw[2:] if raw.startswith("0x") else raw
    if len(data) < 128:
        return []
    offset = int(data[:64], 16) * 2
    return decode_address_array_at(data, offset)


def decode_registered(raw):
    if not raw or raw == "0x":
        return [], [], 0
    data = raw[2:] if raw.startswith("0x") else raw
    if len(data) < 192:
        return [], [], 0
    op_offset = int(data[:64], 16) * 2
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


def safe(default, fn):
    try:
        return fn()
    except Exception:
        return default


def parse_block_arg(raw, fallback):
    if raw == "":
        return fallback
    value = int(raw, 0)
    if value < 0:
        raise ValueError("block must be non-negative")
    return value


def block_by_number(number):
    return rpc("eth_getBlockByNumber", [hex(number), False])


def blocks_by_number(numbers):
    """Read blocks in bounded batches, falling back for non-batch RPC nodes."""
    blocks = []
    used_fallback = False
    batch_enabled = True
    for offset in range(0, len(numbers), BATCH_SIZE):
        chunk = numbers[offset:offset + BATCH_SIZE]
        calls = [("eth_getBlockByNumber", [hex(number), False]) for number in chunk]
        if batch_enabled:
            try:
                blocks.extend(rpc_batch(calls))
                continue
            except Exception:
                if remaining_seconds() < 20:
                    raise
                used_fallback = True
                batch_enabled = False
        if not batch_enabled:
            blocks.extend(block_by_number(number) for number in chunk)
    return blocks, used_fallback


def first_block_at_or_after_timestamp(low, high, threshold):
    """Find the first block whose timestamp is >= threshold in O(log n) RPCs."""
    answer = high
    while low <= high:
        middle = (low + high) // 2
        block = block_by_number(middle)
        if not block:
            low = middle + 1
            continue
        if hex_int(block.get("timestamp")) >= threshold:
            answer = middle
            high = middle - 1
        else:
            low = middle + 1
    return answer


try:
    latest = hex_int(rpc("eth_blockNumber"))
    to_block = parse_block_arg(to_arg, latest)
    if to_block > latest:
        to_block = latest
    to_block_data = block_by_number(to_block)
    to_ts = hex_int(to_block_data.get("timestamp"))

    truncated = False
    if from_arg:
        from_block = parse_block_arg(from_arg, to_block)
    else:
        threshold = to_ts - window_sec
        search_low = max(0, to_block - MAX_SCAN_BLOCKS + 1)
        oldest = block_by_number(search_low)
        oldest_ts = hex_int(oldest.get("timestamp")) if oldest else to_ts
        if search_low > 0 and oldest_ts > threshold:
            truncated = True
            from_block = search_low
        else:
            from_block = first_block_at_or_after_timestamp(search_low, to_block, threshold)

    if from_block > to_block:
        raise ValueError(f"from_block({from_block}) > to_block({to_block})")

    blocks = []
    block_numbers = list(range(from_block, to_block + 1))
    raw_blocks, used_batch_fallback = blocks_by_number(block_numbers)
    for number, block in zip(block_numbers, raw_blocks):
        if not block:
            continue
        blocks.append({
            "number": number,
            "timestamp": hex_int(block.get("timestamp")),
            "miner": (block.get("miner") or "").lower(),
            "gasUsed": hex_int(block.get("gasUsed")),
            "txCount": len(block.get("transactions") or []),
        })

    if not blocks:
        emit("error", "窗口内没有成功读取到区块", error={"code": "NO_BLOCKS_READ", "detail": f"{from_block}-{to_block}"})
        sys.exit(0)

    intervals = [blocks[i]["timestamp"] - blocks[i - 1]["timestamp"] for i in range(1, len(blocks))]
    miner_counts = Counter(block["miner"] for block in blocks if block["miner"])
    miner_txs = defaultdict(int)
    miner_gas = defaultdict(int)
    for block in blocks:
        miner_txs[block["miner"]] += block["txCount"]
        miner_gas[block["miner"]] += block["gasUsed"]

    active_consensus = decode_dynamic_address_array(eth_call(BSC_VALIDATOR_SET, SEL_ACTIVE_VALIDATORS))
    active_set = set(active_consensus)
    operators, credits, total_length = decode_registered(eth_call(STAKE_HUB, SEL_REGISTERED_VALIDATORS + pad_uint(0) + pad_uint(200)))

    validators = []
    consensus_seen = set()
    missing_count = 0
    low_count = 0
    expected = len(blocks) / max(len(active_consensus), 1)

    for index, operator in enumerate(operators):
        credit = credits[index] if index < len(credits) else "0x0000000000000000000000000000000000000000"
        consensus = safe("", lambda op=operator: decode_addr_word(eth_call(STAKE_HUB, SEL_CONSENSUS + pad_addr(op))[-64:]))
        consensus_lower = consensus.lower()
        consensus_seen.add(consensus_lower)
        symbol = safe("", lambda c=credit: decode_string(eth_call(c, SEL_SYMBOL)))
        moniker = symbol[2:] if symbol.startswith("st") else symbol or f"validator-{index + 1}"
        block_count = miner_counts.get(consensus_lower, 0)
        tx_count = miner_txs.get(consensus_lower, 0)
        gas_used = miner_gas.get(consensus_lower, 0)

        bal_from = safe(None, lambda op=operator: hex_int(rpc("eth_getBalance", [op, hex(from_block)])))
        bal_to = safe(None, lambda op=operator: hex_int(rpc("eth_getBalance", [op, hex(to_block)])))
        delta = None if bal_from is None or bal_to is None else bal_to - bal_from

        active = consensus_lower in active_set
        if active and block_count == 0 and len(blocks) >= len(active_consensus):
            status = "missing_blocks"
            missing_count += 1
        elif active and expected > 0 and block_count < expected * 0.5:
            status = "low_blocks"
            low_count += 1
        elif active:
            status = "ok"
        else:
            status = "not_active"

        validators.append({
            "moniker": moniker,
            "operator": operator,
            "consensus": consensus,
            "active": active,
            "status": status,
            "blocks": block_count,
            "sharePercent": round(block_count / len(blocks) * 100, 2),
            "txsInMinedBlocks": tx_count,
            "gasUsedInMinedBlocks": gas_used,
            "operatorBalanceFromNetx": netx(bal_from) if bal_from is not None else None,
            "operatorBalanceToNetx": netx(bal_to) if bal_to is not None else None,
            "operatorBalanceDeltaNetx": netx(delta) if delta is not None else None,
        })

    unknown_miners = {
        miner: {
            "blocks": count,
            "sharePercent": round(count / len(blocks) * 100, 2),
            "txsInMinedBlocks": miner_txs.get(miner, 0),
            "gasUsedInMinedBlocks": miner_gas.get(miner, 0),
        }
        for miner, count in miner_counts.items()
        if miner not in consensus_seen
    }

    status = "ok"
    notes = []
    if truncated:
        status = "partial"
        notes.append(f"窗口过大，最多回扫 {MAX_SCAN_BLOCKS} 块")
    if missing_count or unknown_miners:
        status = "error"
    elif low_count and status == "ok":
        status = "partial"

    elapsed = blocks[-1]["timestamp"] - blocks[0]["timestamp"] if len(blocks) > 1 else 0
    summary = {
        "fromBlock": blocks[0]["number"],
        "toBlock": blocks[-1]["number"],
        "fromTimestamp": blocks[0]["timestamp"],
        "toTimestamp": blocks[-1]["timestamp"],
        "elapsedSeconds": elapsed,
        "requestedWindowSeconds": window_sec,
        "sampledBlocks": len(blocks),
        "activeValidatorCount": len(active_consensus),
        "registeredCount": len(validators),
        "registeredTotalLength": total_length,
        "expectedBlocksPerActiveValidator": round(expected, 2),
        "totalTxs": sum(block["txCount"] for block in blocks),
        "totalGasUsed": sum(block["gasUsed"] for block in blocks),
        "averageInterval": round(statistics.mean(intervals), 3) if intervals else 0,
        "medianInterval": round(statistics.median(intervals), 3) if intervals else 0,
        "maxInterval": max(intervals) if intervals else 0,
        "missingBlockValidators": missing_count,
        "lowBlockValidators": low_count,
        "unknownMiners": unknown_miners,
        "notes": notes,
        "collection": {
            "windowLookup": "binary_search",
            "blockReadMode": "sequential_fallback" if used_batch_fallback else "json_rpc_batch",
            "batchSize": BATCH_SIZE,
            "durationMillis": round((time.monotonic() - started_at) * 1000),
        },
    }

    message = (
        f"Chain287 窗口统计 #{summary['fromBlock']}~#{summary['toBlock']}："
        f"{summary['sampledBlocks']} 块，tx={summary['totalTxs']}，"
        f"平均间隔 {summary['averageInterval']}s，出块异常 {missing_count + low_count}"
    )
    emit(status, message, {"summary": summary, "validators": validators})
except Exception as exc:
    emit("error", f"Chain287 验证者窗口统计失败: {exc}", error={"code": "VALIDATOR_WINDOW_STATS_FAILED", "detail": str(exc)})
PY
