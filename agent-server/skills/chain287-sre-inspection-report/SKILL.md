---
name: chain287-sre-inspection-report
description: Chain287 blockchain SRE daily inspection report generator. Use after running other read-only skills such as chain287-chain-query or chain287-validator-health to transform their structured SkillOutput JSON results into a professional, newbie-friendly HTML巡检报告 artifact. Also use sample_report to debug Task and Artifact pipelines without querying the chain.
---

# Chain287 SRE Inspection Report

Use this skill to turn collected Chain287 inspection results into a professional HTML report for **daily SRE review**. The report is designed to be useful for both experienced blockchain operators and newcomers who are not yet familiar with on-chain business concepts.

**Important:** This skill is a read-only transformer. It does **not** query the chain by itself. You must collect data from upstream skills first.

## When to use

- Morning stand-up or daily handover: quickly understand whether Chain287 is healthy.
- After an incident: aggregate multiple read-only checks into one artifact for post-mortem.
- Onboarding: let junior SREs learn what each metric means and what to do next.

## Actions

### `sample_report`

Generate a realistic sample HTML report. Use this to test Task execution, artifact ingestion, and the Artifacts page.

### `render_report`

Render an HTML report from collected skill outputs. See the runbook below for the exact upstream actions and input schema.

---

## Execution Runbook

To produce a complete daily inspection report, run the upstream read-only skills in the order below and pass every `SkillOutput` into `render_report` as a single JSON array.

Each upstream action is **independent**; run them in parallel where possible.

### Step 1 — Chain basics & RPC health

**Skill:** `chain287-chain-query`

| Action | Why we need it | Where the data goes in the report |
|--------|----------------|-----------------------------------|
| `rpc_snapshot` | Chain ID, latest block, block age, peer count, gas price, sync status, chain mode | **关键信号 / RPC Node** card, **执行摘要** |
| `chain_health` | Aggregated RPC/block age/interval/peer/active-validator check | **执行摘要**, **风险计数**, **建议操作** |
| `recent_blocks` | Recent block interval, miner distribution, tx/gas stats | **关键信号 / Block Production** card, **巡检项明细** |
| `active_validators` | Current active validator consensus addresses | **关键信号 / Validator Set** card |

### Step 2 — Validator health

**Skill:** `chain287-validator-health`

| Action | Why we need it | Where the data goes in the report |
|--------|----------------|-----------------------------------|
| `validator_overview` | Registered/active/jailed counts, moniker, operator/consensus, balances, recent blocks, pool totals | **验证者健康明细** table, **风险计数**, **建议操作** |
| `validator_block_stats` | Exact blocks mined per validator in a sample window, share percent, ok/low/missing status | **验证者健康明细** table (share bar), **建议操作** |
| `validator_rewards` | Per-validator StakeCredit pool total and accumulated rewards | **验证者健康明细** table (rewards), **关键信号 / Rewards** card |
| `validator_jailed_status` | Active / jailed / not_in_set / not_working status per validator | **验证者健康明细** table (status), **风险计数**, **建议操作** |
| `validator_window_stats` | Time-window stats: blocks, txs, gas, operator balance delta | **关键信号 / Window Stats** card, **验证者健康明细** |

### Step 3 — Assemble and render

Collect every upstream `SkillOutput` into an array and pass it to `render_report` as `report_json`:

```json
[
  {"skill": "chain287-chain-query",      "action": "rpc_snapshot",          "output": {...}},
  {"skill": "chain287-chain-query",      "action": "chain_health",          "output": {...}},
  {"skill": "chain287-chain-query",      "action": "recent_blocks",         "output": {...}},
  {"skill": "chain287-chain-query",      "action": "active_validators",     "output": {...}},
  {"skill": "chain287-validator-health", "action": "validator_overview",    "output": {...}},
  {"skill": "chain287-validator-health", "action": "validator_block_stats", "output": {...}},
  {"skill": "chain287-validator-health", "action": "validator_rewards",     "output": {...}},
  {"skill": "chain287-validator-health", "action": "validator_jailed_status", "output": {...}},
  {"skill": "chain287-validator-health", "action": "validator_window_stats",  "output": {...}}
]
```

For larger payloads, pass `ENV_REPORT_JSON` or `ENV_REPORT_JSON_B64` in `vars`; keys prefixed with `ENV_` are injected as environment variables by the runner.

### Recommended `vars` for `render_report`

```json
{
  "report_title": "Chain287 每日健康巡检报告",
  "report_scope": "Chain287 / RPC / Validator",
  "report_notes": "本报告由 Task 自动生成，用于日常 SRE 巡检。",
  "report_json": "<the JSON array from the runbook above>"
}
```

---

## Input Schema (`report_json`)

`report_json` must be a JSON array. Each element is an object with:

```json
{
  "skill": "chain287-chain-query | chain287-validator-health",
  "action": "<action name>",
  "output": {
    "version": "1.0",
    "status": "ok | partial | error | unknown",
    "message": "Human-readable summary",
    "data": { ... },
    "metadata": { "source": "...", "timestamp": "..." }
  }
}
```

The renderer normalizes all upstream outputs into internal check records, so minor field-name differences are tolerated. The fields it specifically looks for are:

- Chain state: `latestBlock`, `blockAgeSeconds`, `peerCount`, `activeValidatorCount`, `chainId`
- Block production: `sampledBlocks`, `averageInterval`, `averageBlockIntervalSeconds`, `maxInterval`, `blockAnomalyCount`, `minerDistribution`, `unknownMiners`
- Validator set: `registeredCount`, `activeCount`, `jailedCount`, `notInSetCount`, `validatorCount`
- Per-validator: `moniker`, `operator`, `consensus`, `status`, `recentBlocks`, `blocks`, `sharePercent`, `totalPoolNetx`, `operatorBalanceNetx`, `rewards`, `txsInMinedBlocks`, `operatorBalanceDeltaNetx`, `jailedStatus`

### Severity rules

The renderer derives severity from each upstream output:

- `status: error` → **Critical**
- `jailed`, `missing`, `not_working` validator status → **Critical**
- `blockAgeSeconds > 120` → **Critical**
- `jailedCount > 0` or `missingBlockValidators > 0` → **Critical**
- `status: partial` → **Warning**
- `low`, `not_in_set` validator status → **Warning**
- non-empty `unknownMiners` → **Warning**
- `blockAnomalyCount > 0` or `blockAgeSeconds > 30` → **Warning**
- `status: ok` → **OK**
- everything else → **Unknown**

---

## Report Design

The report is optimized for **daily blockchain SRE review** and **newbie onboarding**:

- **今日巡检速览（新人导读）**: a plain-language summary of today's health state with a "what does this mean" tip.
- **执行摘要**: health score, overall status, and a short interpretation.
- **风险计数**: counts by severity.
- **建议操作（SRE Checklist）**: concrete, actionable next steps derived from the data, not just raw numbers.
- **信号卡片**: RPC/Node, Block Production, Validator Set, Rewards, Window Stats, Operations.
- **验证者健康明细**: merged validator rows from all upstream checks, with status, recent blocks, balance, rewards, and share bar.
- **巡检项明细**: raw check rows with severity.
- **指标解释（新人手册）**: an explanation of every key metric.
- **原始巡检 JSON**: collapsed raw input for traceability.

### Implementation notes

- The HTML report is a self-contained artifact powered by **Preact** and **Tailwind CSS Play CDN**.
- The Python renderer injects all report data as a **single JSON schema** into the page, so the template logic and the data pipeline are decoupled and easy to maintain.

---

## Rules

1. Do not query the chain directly in this skill.
2. Do not mutate files outside the runner-managed report artifact staging path.
3. Keep the final user answer concise and refer to the generated artifact.
4. If the report input is missing, use `sample_report` for debugging or run upstream inspection skills first.
