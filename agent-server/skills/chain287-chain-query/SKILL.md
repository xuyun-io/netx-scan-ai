---
name: chain287-chain-query
description: Query NetX Chain287 on-chain read-only state with Foundry cast. Use for latest block height, block number, chain id, native balance, ERC20 balance, contract view calls, validator set reads, RPC health checks, or questions mentioning Chain287, block height, 块高, 余额, 合约查询, cast, or RPC.
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

## Available Action

- `latest_block`: query the latest Chain287 block number with `cast block-number`.
