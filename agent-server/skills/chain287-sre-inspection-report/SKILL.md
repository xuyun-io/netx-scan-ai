---
name: chain287-sre-inspection-report
description: 对 Chain287 执行完整的只读巡检，并根据真实的链查询和验证者健康数据生成专业的 HTML SRE 巡检报告。
---

# Chain287 SRE 巡检报告

本技能负责统一编排真实的只读巡检，并将巡检结果渲染为 HTML 报告。禁止使用测试数据、占位数据、重构数据或模型编造的数据。

## 必须执行的流程

对于任何完整的 Chain287 巡检请求，只能调用以下单一编排 action：

```json
{
  "skill": "chain287-sre-inspection-report",
  "action": "run_inspection"
}
```

`run_inspection` 负责完整的巡检流程：执行所有必需的只读链检查和验证者检查，验证每项检查均已成功执行，然后生成 HTML 报告产物。

## 强制规则

1. 执行本巡检流程时，禁止单独调用底层的 chain-query 或 validator-health action。
2. 只有当 `run_inspection` 返回真实的 HTML artifact 时，才能告知用户巡检成功。
3. 如果 `run_inspection` 返回错误，必须说明失败的检查项，禁止声称巡检已经完成。
4. 用户要求完整巡检时，不得询问是否改用快速巡检或样例巡检。
5. 最终回复应保持简洁，并明确引用生成的 HTML 报告产物。
6. 禁止修改 Runner 管理的 artifact staging 目录以外的文件。
