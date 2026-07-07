---
name: chain287-validator-health
description: NetX Chain287 验证者健康巡检 Skill。通过读取 BSCValidatorSet 和 StakeHub 合约，检查验证者出块情况、收益累积、jail / 未入集状态。适用于验证者掉线、收益异常、被惩罚等场景。
---

# Chain287 验证者健康巡检

## 使用规则

1. 只能执行只读操作，禁止发送交易、导入私钥或解锁账户。
2. 优先使用 `CHAIN287_RPC_URL`，回退到 `ETH_RPC_URL`。
3. 验证者列表从链上 `StakeHub` 合约实时获取，不依赖本地 bundle 文件。
4. 所有 action 返回标准 `SkillOutput` 信封。
5. 返回中文总结给用户，原始数据保留在 `data` 字段中。

## 可用 Action

### `validator_block_stats` — 出块统计

统计最近 N 个块中每个活跃验证者的出块数量。

- **参数**：`sample` — 采样块数，默认 100，最大 500
- **核心逻辑**：
  1. 调用 `BSCValidatorSet.getValidators()` 获取当前活跃验证者 consensus 地址
  2. 遍历最近 N 个块，统计每个 `miner`
  3. 计算每个验证者理论应出块数，标记 `ok` / `low` / `missing`
  4. 发现不在活跃集中的异常出块地址

**示例返回**：

```json
{
  "data": {
    "latestBlock": 346300,
    "sampledBlocks": 100,
    "validatorCount": 8,
    "expectedPerValidator": 12.5,
    "validators": [
      {"consensus": "0x...", "operator": "0x...", "blocks": 13, "sharePercent": 13.0, "status": "ok"},
      {"consensus": "0x...", "operator": "0x...", "blocks": 0, "sharePercent": 0.0, "status": "missing"}
    ],
    "unknownMiners": {}
  }
}
```

### `validator_rewards` — 收益快照

读取每个已注册验证者的 StakeCredit Pool 总额，计算累计奖励。

- **核心逻辑**：
  1. 调用 `StakeHub.getValidators(0, 100)` 获取所有 operator + credit contract
  2. 对每个 credit contract 调用 `totalPooledBNB()`
  3. 奖励 = Pool 总额 - 2000 NETX（初始自质押）

**示例返回**：

```json
{
  "data": {
    "validatorCount": 8,
    "totalRewards": 1234.56,
    "validators": [
      {"operator": "0x...", "consensus": "0x...", "creditContract": "0x...", "poolTotal": 2150.0, "rewards": 150.0}
    ]
  }
}
```

### `validator_jailed_status` — 验证者状态

检查每个已注册验证者是否处于活跃、被 jail 或未入集状态。

- **核心逻辑**：
  1. 调用 `StakeHub.getValidators()` 获取所有 operator
  2. 通过 `StakeHub.getValidatorConsensusAddress()` 获取 consensus
  3. 通过 `BSCValidatorSet.isCurrentValidator()` 判断是否活跃
  4. 不活跃时通过 `currentValidatorSetMap` + `currentValidatorSet()` 判断是否被 jail

**状态说明**：

| 状态 | 含义 |
|---|---|
| `active` | 活跃验证者，正常参与出块 |
| `jailed` | 在验证者集合中但被 jail |
| `not_in_set` | 已在 StakeHub 注册，但未进入当前验证者集合 |
| `not_working` | 在集合中但未正常工作（可能处于维护模式） |

## 脚本结构

```
scripts/
├── lib.sh                        # 公共信封与 RPC 检查
├── validator-block-stats.sh      # 出块统计
├── validator-rewards.sh          # 收益快照
└── validator-jailed-status.sh    # 状态检查
```

## 依赖

- `cast`（Foundry CLI）
- `python3`
- 可访问 Chain287 RPC 的环境变量 `CHAIN287_RPC_URL`
