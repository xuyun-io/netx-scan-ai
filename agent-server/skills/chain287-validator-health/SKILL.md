---
name: chain287-validator-health
description: Read-only Chain287 validator health inspection for validator overview, block production, rewards, jail status, and time-window statistics.
---

# Chain287 Validator Health

Use declared actions only. Prefer `CHAIN287_RPC_URL`, then `ETH_RPC_URL`. Validator data must come from live Chain287 contracts. Never send transactions, import keys, unlock accounts, or substitute fixture data.

## Full report requirement

For `chain287-sre-inspection-report`, execute all five actions in the same invocation:

1. `validator_overview`
2. `validator_block_stats`
3. `validator_rewards`
4. `validator_jailed_status`
5. `validator_window_stats`

`validator_overview` alone is not a complete validator inspection. Independent actions may be called in parallel.

## Actions

- `validator_overview`: registered/active/jailed validators, moniker, operator/consensus addresses, pool and balances, recent blocks; optional `sample` (default 80, max 500).
- `validator_block_stats`: exact per-validator block count, expected share, low/missing status, and unknown miners; optional `sample` (default 100, max 500).
- `validator_rewards`: StakeCredit pool totals and accumulated rewards for every registered validator.
- `validator_jailed_status`: `active`, `jailed`, `not_in_set`, or `not_working` status for every registered validator.
- `validator_window_stats`: block, transaction, gas, and operator balance delta over `window_sec` (default 300, max 86400), or explicit `from_block` plus `to_block`.

All actions return the standard `SkillOutput` envelope. Use `references/validator-contracts.md` only when contract or field-level implementation detail is needed.
