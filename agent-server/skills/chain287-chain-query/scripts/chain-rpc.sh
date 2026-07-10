#!/bin/sh
# Chain287 RPC, node, account, transaction, and onboarding catalog queries.
# Actions:
#   command_catalog
#   rpc_snapshot
#   sync_status
#   chain_mode
#   address_balance <address>
#   transaction_lookup <tx_hash>
#   transaction_receipt <tx_hash>
#   block_lookup <block_number|latest>
set -eu

action="${1:-}"
arg1="${2:-}"

normalize_arg() {
  case "${1:-}" in
    '' | *'${'*) printf '' ;;
    *) printf '%s' "$1" ;;
  esac
}

rpc_url="${CHAIN287_RPC_URL:-${ETH_RPC_URL:-}}"
arg1="$(normalize_arg "$arg1")"

# shellcheck source=./lib.sh
. "$(dirname "$0")/lib.sh"

if [ -z "$action" ]; then
  print_error "MISSING_ACTION" "missing action"
  exit 2
fi

if [ "$action" = "command_catalog" ]; then
  python3 <<'PY'
import json
import subprocess

catalog = [
    {
        "category": "快速体检",
        "description": "先判断链和公共 RPC 是否健康。",
        "commands": [
            {
                "title": "RPC 快照",
                "prompt": "检查 Chain287 RPC 快照和链上模式",
                "skill": "chain287-chain-query",
                "action": "rpc_snapshot",
                "vars": {},
            },
            {
                "title": "综合健康检查",
                "prompt": "检查 Chain287 最近 20 个块的综合健康状态",
                "skill": "chain287-chain-query",
                "action": "chain_health",
                "vars": {"sample": "20"},
            },
            {
                "title": "同步状态",
                "prompt": "检查 Chain287 RPC 节点是否正在同步",
                "skill": "chain287-chain-query",
                "action": "sync_status",
                "vars": {},
            },
        ],
    },
    {
        "category": "链基础查询",
        "description": "适合确认链 ID、块高、创世块和近期出块节奏。",
        "commands": [
            {
                "title": "最新块高",
                "prompt": "Chain287 最新块高是多少？",
                "skill": "chain287-chain-query",
                "action": "block_height",
                "vars": {},
            },
            {
                "title": "近期区块统计",
                "prompt": "分析 Chain287 最近 50 个块的 miner 分布和间隔",
                "skill": "chain287-chain-query",
                "action": "recent_blocks",
                "vars": {"count": "50"},
            },
            {
                "title": "指定区块",
                "prompt": "查询 Chain287 最新区块详情",
                "skill": "chain287-chain-query",
                "action": "block_lookup",
                "vars": {"block": "latest"},
            },
        ],
    },
    {
        "category": "交易与地址",
        "description": "只读排查交易、余额、receipt 和确认数。",
        "commands": [
            {
                "title": "地址余额",
                "prompt": "查询 0x... 在 Chain287 上的余额和 nonce",
                "skill": "chain287-chain-query",
                "action": "address_balance",
                "vars": {"address": "0x..."},
            },
            {
                "title": "交易详情",
                "prompt": "查询 Chain287 交易 0x... 的详情",
                "skill": "chain287-chain-query",
                "action": "transaction_lookup",
                "vars": {"tx_hash": "0x..."},
            },
            {
                "title": "交易回执",
                "prompt": "查询 Chain287 交易 0x... 的 receipt 和确认数",
                "skill": "chain287-chain-query",
                "action": "transaction_receipt",
                "vars": {"tx_hash": "0x..."},
            },
        ],
    },
    {
        "category": "验证者巡检",
        "description": "面向 SRE 的 validator 集合、出块、jail、收益与质押检查。",
        "commands": [
            {
                "title": "验证者总览",
                "prompt": "给我 Chain287 验证者总览，采样最近 80 个块",
                "skill": "chain287-validator-health",
                "action": "validator_overview",
                "vars": {"sample": "80"},
            },
            {
                "title": "出块异常",
                "prompt": "检查 Chain287 最近 120 个块的验证者出块异常",
                "skill": "chain287-validator-health",
                "action": "validator_block_stats",
                "vars": {"sample": "120"},
            },
            {
                "title": "Jail 状态",
                "prompt": "检查 Chain287 是否有验证者 jailed 或未入集",
                "skill": "chain287-validator-health",
                "action": "validator_jailed_status",
                "vars": {},
            },
            {
                "title": "窗口统计",
                "prompt": "统计 Chain287 最近 10 分钟验证者出块、tx 和余额变化",
                "skill": "chain287-validator-health",
                "action": "validator_window_stats",
                "vars": {"window_sec": "600"},
            },
            {
                "title": "收益快照",
                "prompt": "查看 Chain287 验证者 StakeCredit Pool 和累计奖励快照",
                "skill": "chain287-validator-health",
                "action": "validator_rewards",
                "vars": {},
            },
        ],
    },
]

print(json.dumps({
    "version": "1.0",
    "status": "ok",
    "message": "Chain287 常用只读巡检命令目录已生成",
    "data": {
        "readonlyOnly": True,
        "catalog": catalog,
        "maintenanceNote": "新增 skill action 后，请同步更新此目录和前端 promptTemplates。",
    },
    "display": {"format": "list", "title": "Chain287 常用命令目录"},
    "metadata": {
        "source": "curated command catalog",
        "timestamp": subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip(),
    },
}, ensure_ascii=False, separators=(",", ":")))
PY
  exit 0
fi

require_rpc

python3 - "$rpc_url" "$action" "$arg1" <<'PY'
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

for proxy_var in ("http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
    os.environ.pop(proxy_var, None)
os.environ["NO_PROXY"] = "*"
os.environ["no_proxy"] = "*"

rpc_url, action, arg1 = sys.argv[1:4]

BSC_VALIDATOR_SET = "0x0000000000000000000000000000000000001000"
STAKE_HUB = "0x0000000000000000000000000000000000002002"
SEL_GET_VALIDATORS = "0xb7ab4db5"
SEL_TRANSFER_GAS_LIMIT = "0xe8f67c3b"

ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")


def timestamp():
    return subprocess.check_output(["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()


def emit(status, message, data=None, source=None, error=None, display=None):
    payload = {
        "version": "1.0",
        "status": status,
        "message": message,
        "metadata": {"source": source or action, "timestamp": timestamp()},
    }
    if data is not None:
        payload["data"] = data
    if error is not None:
        payload["error"] = error
    if display is not None:
        payload["display"] = display
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
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    return int(str(value), 16) if str(value).startswith("0x") else int(value)


def netx(wei):
    return round(int(wei) / 10**18, 9)


def gwei(wei):
    return round(int(wei) / 10**9, 3)


def pad_addr(addr):
    return addr.lower().replace("0x", "").zfill(64)


def decode_address_array(raw):
    if not raw or raw == "0x":
        return []
    data = raw[2:] if raw.startswith("0x") else raw
    if len(data) < 128:
        return []
    offset = int(data[:64], 16) * 2
    if len(data) < offset + 64:
        return []
    count = int(data[offset:offset + 64], 16)
    out = []
    base = offset + 64
    for i in range(count):
        word = data[base + i * 64:base + (i + 1) * 64]
        if len(word) == 64:
            out.append("0x" + word[-40:].lower())
    return out


def latest_block_with_age():
    latest_hex = rpc("eth_blockNumber")
    latest = hex_int(latest_hex)
    block = rpc("eth_getBlockByNumber", [hex(latest), False])
    block_ts = hex_int(block.get("timestamp"))
    return latest, block, max(0, int(time.time()) - block_ts)


def chain_mode_data():
    transfer_raw = eth_call(STAKE_HUB, SEL_TRANSFER_GAS_LIMIT)
    transfer_gas_limit = hex_int(transfer_raw)
    active_raw = eth_call(BSC_VALIDATOR_SET, SEL_GET_VALIDATORS)
    active = decode_address_array(active_raw)
    return {
        "mode": "validator_set" if transfer_gas_limit > 0 else "genesis",
        "transferGasLimit": transfer_gas_limit,
        "activeValidatorCount": len(active),
        "activeValidators": active,
    }


try:
    if action == "rpc_snapshot":
        started = time.time()
        chain_id = hex_int(rpc("eth_chainId"))
        latest, latest_block, block_age = latest_block_with_age()
        peer_count = hex_int(rpc("net_peerCount"))
        gas_price = hex_int(rpc("eth_gasPrice"))
        syncing = rpc("eth_syncing")
        genesis = rpc("eth_getBlockByNumber", ["0x0", False])
        mode = chain_mode_data()
        latency_ms = int((time.time() - started) * 1000)

        status = "ok"
        warnings = []
        if chain_id != 287:
            status = "error"
            warnings.append(f"chainId={chain_id}，期望 287")
        if block_age > 180:
            status = "error"
            warnings.append(f"最新块已落后 {block_age}s")
        elif block_age > 60 and status == "ok":
            status = "partial"
            warnings.append(f"最新块已落后 {block_age}s")
        if peer_count == 0:
            status = "error"
            warnings.append("peerCount=0")
        if syncing is not False and status == "ok":
            status = "partial"
            warnings.append("RPC 节点正在同步")

        data = {
            "chainId": chain_id,
            "latestBlock": latest,
            "latestHash": latest_block.get("hash"),
            "latestMiner": (latest_block.get("miner") or "").lower(),
            "latestTxCount": len(latest_block.get("transactions") or []),
            "blockAgeSeconds": block_age,
            "peerCount": peer_count,
            "syncing": syncing,
            "gasPriceWei": str(gas_price),
            "gasPriceGwei": gwei(gas_price),
            "genesisHash": genesis.get("hash"),
            "latencyMs": latency_ms,
            "chainMode": mode,
            "warnings": warnings,
        }
        message = "Chain287 RPC 快照正常" if not warnings else "Chain287 RPC 快照发现风险：" + "；".join(warnings)
        emit(status, message, data, "json-rpc rpc_snapshot", display={"format": "status", "title": "RPC 快照"})

    elif action == "sync_status":
        latest, block, block_age = latest_block_with_age()
        syncing = rpc("eth_syncing")
        if syncing is False:
            status = "ok" if block_age <= 60 else "partial"
            message = f"Chain287 RPC 未处于同步状态，最新块 #{latest}，块龄 {block_age}s"
        else:
            status = "partial"
            message = "Chain287 RPC 正在同步"
        data = {
            "syncing": syncing,
            "latestBlock": latest,
            "latestHash": block.get("hash"),
            "blockAgeSeconds": block_age,
        }
        emit(status, message, data, "json-rpc eth_syncing", display={"format": "status", "title": "同步状态"})

    elif action == "chain_mode":
        data = chain_mode_data()
        message = (
            f"Chain287 当前为 ValidatorSet 模式，活跃验证者 {data['activeValidatorCount']} 个"
            if data["mode"] == "validator_set"
            else "Chain287 当前为 Genesis 模式，StakeHub 尚未激活"
        )
        emit("ok", message, data, "eth_call StakeHub.transferGasLimit + BSCValidatorSet.getValidators", display={"format": "table", "title": "链上模式"})

    elif action == "address_balance":
        address = arg1.strip()
        if not ADDRESS_RE.fullmatch(address):
            emit("error", "address 参数必须是 20 字节 EVM 地址", error={"code": "INVALID_ADDRESS", "detail": address}, source="address_balance")
            sys.exit(0)
        address = address.lower()
        balance = hex_int(rpc("eth_getBalance", [address, "latest"]))
        nonce = hex_int(rpc("eth_getTransactionCount", [address, "latest"]))
        data = {
            "address": address,
            "balanceWei": str(balance),
            "balanceNetx": netx(balance),
            "nonce": nonce,
        }
        emit("ok", f"{address} 余额为 {data['balanceNetx']} NETX，nonce={nonce}", data, "json-rpc eth_getBalance/eth_getTransactionCount", display={"format": "metric", "title": "地址余额", "unit": "NETX"})

    elif action == "transaction_lookup":
        tx_hash = arg1.strip()
        if not HASH_RE.fullmatch(tx_hash):
            emit("error", "tx_hash 参数必须是 32 字节交易 hash", error={"code": "INVALID_TX_HASH", "detail": tx_hash}, source="transaction_lookup")
            sys.exit(0)
        tx = rpc("eth_getTransactionByHash", [tx_hash])
        if tx is None:
            emit("error", f"未找到交易 {tx_hash}", error={"code": "TX_NOT_FOUND", "detail": tx_hash}, source="json-rpc eth_getTransactionByHash")
            sys.exit(0)
        block_number = hex_int(tx.get("blockNumber")) if tx.get("blockNumber") else None
        latest = hex_int(rpc("eth_blockNumber"))
        value = hex_int(tx.get("value"))
        gas_price = hex_int(tx.get("gasPrice"))
        data = {
            "hash": tx.get("hash"),
            "from": (tx.get("from") or "").lower(),
            "to": (tx.get("to") or "").lower() if tx.get("to") else None,
            "nonce": hex_int(tx.get("nonce")),
            "blockNumber": block_number,
            "confirmations": latest - block_number + 1 if block_number is not None else 0,
            "transactionIndex": hex_int(tx.get("transactionIndex")) if tx.get("transactionIndex") else None,
            "valueWei": str(value),
            "valueNetx": netx(value),
            "gas": hex_int(tx.get("gas")),
            "gasPriceWei": str(gas_price),
            "gasPriceGwei": gwei(gas_price),
            "inputBytes": max(0, (len(tx.get("input", "0x")) - 2) // 2),
            "raw": tx,
        }
        emit("ok", f"交易 {tx_hash} 已找到，确认数 {data['confirmations']}", data, "json-rpc eth_getTransactionByHash", display={"format": "json", "title": "交易详情"})

    elif action == "transaction_receipt":
        tx_hash = arg1.strip()
        if not HASH_RE.fullmatch(tx_hash):
            emit("error", "tx_hash 参数必须是 32 字节交易 hash", error={"code": "INVALID_TX_HASH", "detail": tx_hash}, source="transaction_receipt")
            sys.exit(0)
        receipt = rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt is None:
            emit("error", f"未找到交易回执 {tx_hash}", error={"code": "RECEIPT_NOT_FOUND", "detail": tx_hash}, source="json-rpc eth_getTransactionReceipt")
            sys.exit(0)
        latest = hex_int(rpc("eth_blockNumber"))
        block_number = hex_int(receipt.get("blockNumber"))
        gas_used = hex_int(receipt.get("gasUsed"))
        effective_gas_price = hex_int(receipt.get("effectiveGasPrice"))
        success = hex_int(receipt.get("status")) == 1 if receipt.get("status") is not None else None
        data = {
            "hash": receipt.get("transactionHash"),
            "status": "success" if success else "failed" if success is False else "unknown",
            "blockNumber": block_number,
            "confirmations": latest - block_number + 1,
            "from": (receipt.get("from") or "").lower(),
            "to": (receipt.get("to") or "").lower() if receipt.get("to") else None,
            "contractAddress": (receipt.get("contractAddress") or "").lower() if receipt.get("contractAddress") else None,
            "gasUsed": gas_used,
            "effectiveGasPriceWei": str(effective_gas_price),
            "feeWei": str(gas_used * effective_gas_price),
            "feeNetx": netx(gas_used * effective_gas_price),
            "logsCount": len(receipt.get("logs") or []),
            "raw": receipt,
        }
        status = "ok" if success else "error" if success is False else "partial"
        message = f"交易回执状态：{data['status']}，确认数 {data['confirmations']}，手续费 {data['feeNetx']} NETX"
        error = {"code": "TX_FAILED", "detail": tx_hash} if success is False else None
        emit(status, message, data, "json-rpc eth_getTransactionReceipt", error=error, display={"format": "json", "title": "交易回执"})

    elif action == "block_lookup":
        block_ref = arg1.strip() or "latest"
        if block_ref in ("latest", "earliest", "pending"):
            rpc_ref = block_ref
        else:
            try:
                n = int(block_ref, 0)
                if n < 0:
                    raise ValueError
                rpc_ref = hex(n)
            except ValueError:
                emit("error", "block 参数必须是 latest/earliest/pending 或非负整数", error={"code": "INVALID_BLOCK", "detail": block_ref}, source="block_lookup")
                sys.exit(0)
        block = rpc("eth_getBlockByNumber", [rpc_ref, False])
        if block is None:
            emit("error", f"未找到区块 {block_ref}", error={"code": "BLOCK_NOT_FOUND", "detail": block_ref}, source="json-rpc eth_getBlockByNumber")
            sys.exit(0)
        number = hex_int(block.get("number"))
        latest = hex_int(rpc("eth_blockNumber"))
        gas_used = hex_int(block.get("gasUsed"))
        gas_limit = hex_int(block.get("gasLimit"))
        data = {
            "number": number,
            "hash": block.get("hash"),
            "parentHash": block.get("parentHash"),
            "miner": (block.get("miner") or "").lower(),
            "timestamp": hex_int(block.get("timestamp")),
            "confirmations": latest - number + 1 if number is not None else 0,
            "gasUsed": gas_used,
            "gasLimit": gas_limit,
            "gasUsedPercent": round(gas_used / gas_limit * 100, 3) if gas_limit else 0,
            "txCount": len(block.get("transactions") or []),
            "transactions": block.get("transactions") or [],
        }
        emit("ok", f"区块 #{number}：tx={data['txCount']}，miner={data['miner']}", data, "json-rpc eth_getBlockByNumber", display={"format": "json", "title": "区块详情"})

    else:
        emit("error", f"unsupported chain-rpc action: {action}", error={"code": "UNSUPPORTED_ACTION", "detail": action}, source="chain-rpc")

except Exception as exc:
    emit("error", f"Chain287 RPC 查询失败: {exc}", error={"code": "RPC_QUERY_FAILED", "detail": str(exc)}, source=action)
PY
