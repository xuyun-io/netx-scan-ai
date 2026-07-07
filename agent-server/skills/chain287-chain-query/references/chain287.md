# Chain287 Cast Query Reference

Use this reference when adding or changing Chain287 read-only actions.

## Runtime

- Execute inside the Linux agent container.
- Require `cast` in `PATH` and `python3` for analytics actions.
- Prefer `CHAIN287_RPC_URL`; fall back to `ETH_RPC_URL`.
- Keep every action read-only. Do not use `cast send`, private keys, keystores, or unlocked accounts.
- Return one JSON object on stdout. Put human-readable failures on stderr and exit non-zero.

## Action Shape

Declare each action in `tools.yaml` with:

- `readonly: true`
- `approval: false`
- `timeoutSeconds`
- `command: scripts/<layer>.sh`
- action-specific `args`

The Go host reads `tools.yaml` at execution time, so action changes are hot-loadable when the `skills/` directory is mounted into the container.

## Script layers

| Script | Purpose |
|---|---|
| `scripts/chain-basic.sh` | Single-call chain state: block height, chain ID, RPC alive, genesis hash |
| `scripts/chain-analytics.sh` | Multi-block analysis: recent_blocks, chain_health |
| `scripts/validator-node.sh` | Validator set and node peer queries |
| `scripts/lib.sh` | Shared SkillOutput envelope helpers |

## Common cast commands

```sh
# Block height
cast block-number --rpc-url "$CHAIN287_RPC_URL"

# Chain ID
cast chain-id --rpc-url "$CHAIN287_RPC_URL"

# Genesis hash
cast block 0 --field hash --rpc-url "$CHAIN287_RPC_URL"

# Peer count (hex result)
cast rpc net_peerCount --rpc-url "$CHAIN287_RPC_URL"

# Active validator set
cast call 0x0000000000000000000000000000000000001000 \
  "getValidators()(address[])" \
  --rpc-url "$CHAIN287_RPC_URL"
```

## Output envelope

All scripts must emit the standardized `SkillOutput` envelope:

```json
{
  "version": "1.0",
  "status": "ok",
  "message": "...",
  "data": {},
  "metadata": {
    "source": "cast ...",
    "timestamp": "2026-07-06T10:00:00Z"
  }
}
```

Use `scripts/lib.sh` (`print_output`, `print_error`) to keep the envelope consistent.
