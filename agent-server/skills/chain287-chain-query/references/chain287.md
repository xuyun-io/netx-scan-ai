# Chain287 Cast Query Reference

Use this reference when adding or changing Chain287 read-only actions.

## Runtime

- Execute inside the Linux agent container.
- Require `cast` in `PATH`.
- Prefer `CHAIN287_RPC_URL`; fall back to `ETH_RPC_URL`.
- Keep every action read-only. Do not use `cast send`, private keys, keystores, or unlocked accounts.
- Return one JSON object on stdout. Put human-readable failures on stderr and exit non-zero.

## Action Shape

Declare each action in `tools.yaml` with:

- `readonly: true`
- `approval: false`
- `timeoutSeconds`
- `command: scripts/cast-query.sh`
- action-specific `args`

The Go host reads `tools.yaml` at execution time, so action changes are hot-loadable when the `skills/` directory is mounted into the container.

## First Action

`latest_block` calls:

```sh
cast block-number --rpc-url "$CHAIN287_RPC_URL"
```

The script emits:

```json
{"status":"ok","network":"chain287","action":"latest_block","blockNumber":123,"checkedAt":"2026-07-03T00:00:00Z","source":"cast block-number"}
```
