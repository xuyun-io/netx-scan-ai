---
name: chain287-chain-query
description: Read-only Chain287 RPC and on-chain queries for chain status, blocks, transactions, balances, peers, validators, health checks, and SRE inspection data collection.
---

# Chain287 Chain Query

Use declared actions only. All operations are read-only. Prefer `CHAIN287_RPC_URL`, then `ETH_RPC_URL`. Never send transactions, import keys, unlock accounts, or invent shell commands. Return concise Chinese summaries; preserve structured tool results in records.

## Full report requirement

For `chain287-sre-inspection-report`, this stage is complete only after all four actions run in the same invocation:

1. `rpc_snapshot`
2. `chain_health`
3. `recent_blocks`
4. `active_validators`

Never describe a three-action subset as complete. Independent actions may be called in parallel.

## Actions

- `command_catalog`: read-only command discovery for onboarding questions.
- `block_height` / `latest_block`: latest block number.
- `chain_id`: Chain287 chain ID.
- `rpc_alive`: RPC reachability and latency.
- `genesis_hash`: genesis block hash.
- `rpc_snapshot`: chain ID, latest block age, peers, gas price, sync status, genesis, chain mode, and validator count.
- `sync_status`: syncing state and latest block age.
- `chain_mode`: genesis or validator-set mode and active validators.
- `recent_blocks`: recent miner distribution, block interval, gas, and transaction statistics; optional `count` (default 10, max 200).
- `chain_health`: aggregate RPC, block age/interval, peer, and validator health; optional `sample` (default 10).
- `active_validators`: current consensus validator set.
- `peer_count`: RPC peer count.
- `address_balance`: native balance and nonce; requires `address`.
- `transaction_lookup`: transaction details; requires `tx_hash`.
- `transaction_receipt`: receipt, status, fee, logs, and confirmations; requires `tx_hash`.
- `block_lookup`: block details; optional `block` (default `latest`).

Use `references/chain287.md` only when implementation-level RPC or contract detail is needed.
