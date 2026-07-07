---
name: chain287-chain-query
description: NetX Chain287 on-chain read-only queries using Foundry cast. Covers chain basics, chain analytics, validator set, and node peer status. Use for block height, chain ID, RPC health, genesis hash, recent block analysis, chain health aggregation, active validators, or peer count.
---

# Chain287 Chain Query

Use this skill for read-only Chain287 on-chain queries.

## Rules

1. Prefer declared actions from `tools.yaml`; do not invent shell commands.
2. Only perform read-only actions in this skill. Do not send transactions, import private keys, unlock accounts, or call `cast send`.
3. Use `CHAIN287_RPC_URL` first, then `ETH_RPC_URL`.
4. Return concise Chinese answers for users, with the raw action result preserved in records.
5. If RPC or `cast` is unavailable, report the missing dependency clearly.
6. Read `references/chain287.md` when adding or changing Chain287 RPC actions.

## Available Actions

### Chain basics (`scripts/chain-basic.sh`)

- `block_height`: latest block number.
- `latest_block`: alias for `block_height`.
- `chain_id`: Chain287 chain ID.
- `rpc_alive`: RPC reachability and latency.
- `genesis_hash`: genesis block hash.

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

- `scripts/chain-basic.sh`: single-call chain state queries.
- `scripts/chain-analytics.sh`: multi-block analysis and health aggregation.
- `scripts/validator-node.sh`: validator set and node/network queries.
- `scripts/lib.sh`: shared envelope helpers.

AWS/SSM-level operations belong in a separate skill, not here.
