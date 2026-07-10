---
name: chain287-chain-query
description: NetX Chain287 on-chain read-only queries. Covers command suggestions, chain basics, RPC/node status, chain analytics, transactions, balances, blocks, validator set, and node peer status. Use for common command discovery, block height, chain ID, RPC health, genesis hash, chain mode, sync status, transaction lookup, address balance, recent block analysis, chain health aggregation, active validators, or peer count.
---

# Chain287 Chain Query

Use this skill for read-only Chain287 on-chain queries.

## Rules

1. Prefer declared actions from `tools.yaml`; do not invent shell commands.
2. Only perform read-only actions in this skill. Do not send transactions, import private keys, unlock accounts, or call `cast send`.
3. Use `CHAIN287_RPC_URL` first, then `ETH_RPC_URL`.
4. Return concise Chinese answers for users, with the raw action result preserved in records.
5. If RPC or `cast` is unavailable, report the missing dependency clearly.
6. For "能做什么", "常用命令", "新手怎么问" and similar onboarding requests, call `command_catalog` first.
7. Read `references/chain287.md` when adding or changing Chain287 RPC actions.

## Available Actions

### Command discovery (`scripts/chain-rpc.sh`)

- `command_catalog`: return a curated read-only command catalog grouped by SRE workflow. Use this to guide blockchain/SRE newcomers.

### Chain basics (`scripts/chain-basic.sh`)

- `block_height`: latest block number.
- `latest_block`: alias for `block_height`.
- `chain_id`: Chain287 chain ID.
- `rpc_alive`: RPC reachability and latency.
- `genesis_hash`: genesis block hash.

### RPC, node, block, account, and transaction (`scripts/chain-rpc.sh`)

- `rpc_snapshot`: formatted node snapshot: chain ID, latest block age, peer count, gas price, sync status, genesis hash, chain mode, and active validator count.
- `sync_status`: check `eth_syncing` and latest block age.
- `chain_mode`: detect genesis mode vs StakeHub / ValidatorSet mode using `StakeHub.transferGasLimit()` and list active validators.
- `address_balance`: read native NETX balance and nonce. Requires `address`.
- `transaction_lookup`: read transaction details by hash. Requires `tx_hash`.
- `transaction_receipt`: read transaction receipt, execution status, fee, logs count, and confirmations. Requires `tx_hash`.
- `block_lookup`: read a block by number or tag. Accepts `block` (`latest` by default).

### Chain analytics (`scripts/chain-analytics.sh`)

- `recent_blocks`: analyze the most recent N blocks (miner distribution, average/max interval, gas, tx count). Accepts `count` variable (default 10, max 200).
- `chain_health`: aggregate health check combining RPC, block age, block interval, peer count, and active validator count. Accepts `sample` variable for interval calculation (default 10).

### Validator & node (`scripts/validator-node.sh`)

- `active_validators`: read current active validator set from `BSCValidatorSet` (`0x000...1000`).
- `peer_count`: RPC node peer count.

## Output format

All actions return a JSON envelope with this structure:

```json
{
  "version": "1.0",
  "status": "ok" | "error" | "partial",
  "message": "Human-readable summary in Chinese or English",
  "data": {
    // action-specific structured data
  },
  "error": {
    "code": "ERROR_CODE",
    "detail": "Detailed error description"
  },
  "metadata": {
    "source": "cast ...",
    "timestamp": "2026-07-06T10:00:00Z"
  }
}
```

For `block_height`, `data` contains `blockNumber`:

```json
{
  "data": {
    "blockNumber": 311554
  }
}
```

For `active_validators`, `data` contains `validators` and `count`:

```json
{
  "data": {
    "count": 3,
    "validators": [
      "0xab68956eb7b2aab888bd087380247249eab462d7",
      "0x72364961968ba8a297fa622ddd77ed8bc00bb70e",
      "0xd31dc89c90fb9c3c6dcd8708d980f4862d892ee6"
    ]
  }
}
```

## Script layout

This skill is organized by business layer:

- `scripts/chain-rpc.sh`: command catalog, RPC/node snapshot, block, account, and transaction queries.
- `scripts/chain-basic.sh`: single-call chain state queries.
- `scripts/chain-analytics.sh`: multi-block analysis and health aggregation.
- `scripts/validator-node.sh`: validator set and node/network queries.
- `scripts/lib.sh`: shared envelope helpers.

AWS/SSM-level operations belong in a separate skill, not here.
