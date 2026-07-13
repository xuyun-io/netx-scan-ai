---
name: chain287-sre-inspection-report
description: Generate a professional Chain287 HTML SRE inspection report exclusively from real chain-query and validator-health results collected in the current invocation.
---

# Chain287 SRE Inspection Report

This skill renders persisted real inspection results. It does not query the chain and never uses sample, fixture, placeholder, reconstructed, or model-authored data.

## Required runbook

Collect all nine actions in the same invocation. Independent actions may run in parallel.

`chain287-chain-query`:

1. `rpc_snapshot`
2. `chain_health`
3. `recent_blocks`
4. `active_validators`

`chain287-validator-health`:

5. `validator_overview`
6. `validator_block_stats`
7. `validator_rewards`
8. `validator_jailed_status`
9. `validator_window_stats`

Then call `render_report` with the short `traceRef` returned by any upstream action:

```json
{
  "report_ref": "<traceRef from this invocation>",
  "report_title": "Chain287 每日健康巡检报告",
  "report_scope": "Chain287 / RPC / Validator",
  "report_notes": "本报告由 Task 自动生成，用于日常 SRE 巡检。"
}
```

## Hard rules

1. `report_ref` is mandatory; never copy raw results into tool arguments.
2. The renderer rejects incomplete input and lists missing actions. Execute those actions in the same invocation, then retry.
3. Never present a partial report as complete.
4. Do not ask whether to use a quick or sample inspection when the user requests a Chain287 inspection report.
5. Keep the final answer concise and refer to the generated HTML artifact.
6. Do not mutate files outside the runner-managed artifact staging directory.
