"""Build the Chain287 inspection HTML document from validated check results."""

import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def h(value):
    return html.escape("" if value is None else str(value), quote=True)


def read_template():
    return Path(__file__).resolve().parents[1].joinpath("assets", "report-template.html").read_text(encoding="utf-8")


def unwrap_output(item):
    if not isinstance(item, dict):
        return {"status": "unknown", "message": str(item), "data": {}}
    output = item.get("output")
    if isinstance(output, dict):
        merged = dict(output)
        merged.setdefault("skill", item.get("skill"))
        merged.setdefault("action", item.get("action"))
        return merged
    result = item.get("result")
    if isinstance(result, dict):
        return unwrap_output(result)
    if {"version", "status", "message"} & set(item.keys()):
        return dict(item)
    return {"status": "unknown", "message": "未识别的巡检结果", "data": item}


def collect_checks(payload):
    checks = []
    if isinstance(payload, list):
        for item in payload:
            checks.append(unwrap_output(item))
    elif isinstance(payload, dict):
        for key in ("checks", "results", "items"):
            if isinstance(payload.get(key), list):
                return collect_checks(payload[key])
        if "output" in payload or "status" in payload:
            checks.append(unwrap_output(payload))
        else:
            for key, value in payload.items():
                if isinstance(value, (dict, list)):
                    for check in collect_checks(value):
                        check.setdefault("action", key)
                        checks.append(check)
                else:
                    checks.append({"status": "unknown", "message": f"{key}: {value}", "data": {key: value}, "action": key})
    else:
        checks.append({"status": "unknown", "message": str(payload), "data": {}})
    return checks


def find_numbers(data, names):
    out = []
    if isinstance(data, dict):
        for key, value in data.items():
            if key in names and isinstance(value, (int, float)):
                out.append((key, value))
            out.extend(find_numbers(value, names))
    elif isinstance(data, list):
        for item in data:
            out.extend(find_numbers(item, names))
    return out


def has_nonempty_dict(data, names):
    if isinstance(data, dict):
        for key, value in data.items():
            if key in names and isinstance(value, dict) and value:
                return True
            if has_nonempty_dict(value, names):
                return True
    elif isinstance(data, list):
        return any(has_nonempty_dict(item, names) for item in data)
    return False


def has_validator_status(data, statuses):
    if isinstance(data, dict):
        status = str(data.get("status", "")).lower()
        if status in statuses:
            return True
        return any(has_validator_status(value, statuses) for value in data.values())
    if isinstance(data, list):
        return any(has_validator_status(item, statuses) for item in data)
    return False


def severity(check):
    status = str(check.get("status", "unknown")).lower()
    data = check.get("data") or {}
    if status == "error":
        return "critical"
    if has_validator_status(data, {"missing", "jailed", "not_working", "missing_blocks"}):
        return "critical"
    for key, value in find_numbers(data, {"jailedCount", "missingBlockValidators"}):
        if value > 0:
            return "critical"
    for key, value in find_numbers(data, {"blockAgeSeconds", "latestBlockAgeSeconds"}):
        if value > 120:
            return "critical"
    if status == "partial":
        return "warning"
    if has_validator_status(data, {"low", "not_in_set", "low_blocks", "not_active"}):
        return "warning"
    if has_nonempty_dict(data, {"unknownMiners"}):
        return "warning"
    for key, value in find_numbers(data, {"blockAnomalyCount", "lowBlockValidators"}):
        if value > 0:
            return "warning"
    for key, value in find_numbers(data, {"blockAgeSeconds", "latestBlockAgeSeconds"}):
        if value > 30:
            return "warning"
    if status == "ok":
        return "ok"
    return "unknown"


def label_for(level):
    return {
        "critical": "Critical",
        "warning": "Warning",
        "ok": "OK",
        "unknown": "Unknown",
    }.get(level, "Unknown")


def status_label(status):
    mapping = {
        "active": "活跃",
        "low": "出块偏低",
        "low_blocks": "出块偏低",
        "missing": "未出块",
        "missing_blocks": "未出块",
        "jailed": "已 jail",
        "not_in_set": "未入集",
        "not_working": "异常",
        "not_active": "未活跃",
        "ok": "正常",
    }
    return mapping.get(str(status).lower(), status or "unknown")


def severity_class_for_validator(v):
    statuses = [
        str(v.get("status", "")).lower(),
        str(v.get("blockStatus", "")).lower(),
        str(v.get("jailedStatus", "")).lower(),
        str(v.get("windowStatus", "")).lower(),
    ]
    if any(s in {"jailed", "missing", "not_working", "missing_blocks"} for s in statuses):
        return "critical"
    if any(s in {"low", "not_in_set", "low_blocks", "not_active"} for s in statuses):
        return "warning"
    return "ok"


def collect_validators(checks):
    """Merge validator rows from all upstream checks keyed by operator address."""
    validators = {}

    def key_of(v):
        return v.get("operator") or v.get("consensus") or v.get("moniker") or "unknown"

    def merge(src, status_field=None):
        for v in src:
            k = key_of(v)
            entry = validators.setdefault(k, {})
            for field in ("moniker", "operator", "consensus", "recentBlocks",
                          "totalPoolNetx", "operatorBalanceNetx", "blocks", "sharePercent",
                          "creditContract", "poolTotal", "rewards",
                          "txsInMinedBlocks", "operatorBalanceDeltaNetx"):
                if field in v and v[field] is not None:
                    entry[field] = v[field]
            # Map each upstream status to a dedicated field so they do not overwrite each other.
            if status_field and "status" in v and v["status"] is not None:
                entry[status_field] = v["status"]
            # Also keep a canonical "status" from the most authoritative source (overview).
            if "status" in v and v["status"] is not None and ("status" not in entry or status_field == "status"):
                entry["status"] = v["status"]

    for check in checks:
        action = str(check.get("action", "")).lower()
        data = check.get("data") or {}
        validators_src = data.get("validators") if isinstance(data, dict) else None
        if not isinstance(validators_src, list):
            continue
        if action == "validator_overview":
            merge(validators_src, status_field="status")
        elif action == "validator_jailed_status":
            merge(validators_src, status_field="jailedStatus")
        elif action == "validator_block_stats":
            for v in validators_src:
                v_copy = dict(v)
                v_copy["blockStatus"] = v.get("status")
                merge([v_copy], status_field="blockStatus")
        elif action == "validator_rewards":
            for v in validators_src:
                v_copy = dict(v)
                v_copy["rewards"] = v.get("rewards")
                v_copy["totalPoolNetx"] = v.get("poolTotal")
                merge([v_copy])
        elif action == "validator_window_stats":
            merge(validators_src, status_field="windowStatus")

    return validators


def build_newbie_summary(overall, score, counts, checks):
    parts = []
    if overall == "critical":
        parts.append(f"今天链上状态不理想，健康分 {score} 分，发现 {counts['critical']} 个 Critical 问题。")
        parts.append("建议先处理 Critical 项，再查看验证者明细。")
    elif overall == "warning":
        parts.append(f"今天链上基本可用，健康分 {score} 分，但有 {counts['warning']} 个 Warning 需要跟进。")
        parts.append("重点关注出块偏低或未入集的验证者。")
    elif overall == "ok":
        parts.append(f"今天链上状态良好，健康分 {score} 分，核心指标都在正常范围。")
        parts.append("可以安心继续日常监控。")
    else:
        parts.append("本次巡检输入数据不完整，无法给出明确结论。")
        parts.append("建议先运行上游的 chain287-chain-query 和 chain287-validator-health skill。")

    # Add a one-liner about the chain
    latest_block = None
    for check in checks:
        action = str(check.get("action", "")).lower()
        if action in {"chain_health", "rpc_snapshot", "recent_blocks"}:
            data = check.get("data") or {}
            if "latestBlock" in data:
                latest_block = data["latestBlock"]
                break
    if latest_block is not None:
        parts.append(f"当前最新区块高度约为 {latest_block}。")

    return " ".join(parts)


def summarize_data(data):
    if not isinstance(data, dict):
        return h(json.dumps(data, ensure_ascii=False)[:600])
    interesting = []
    keys = [
        "latestBlock", "blockNumber", "blockAgeSeconds", "peerCount", "activeValidatorCount",
        "registeredCount", "activeCount", "jailedCount", "blockAnomalyCount", "validatorCount",
        "sampledBlocks", "averageBlockIntervalSeconds", "totalRewards", "totalTxs",
        "missingBlockValidators", "unknownMiners",
    ]
    for key in keys:
        if key in data:
            interesting.append(f"{key}={data[key]}")
    summary = ", ".join(interesting)
    if not summary:
        summary = json.dumps(data, ensure_ascii=False)[:500]
    return h(summary)


def _deep_find(data, key):
    """Recursively find the first occurrence of key in a nested dict/list structure."""
    if isinstance(data, dict):
        if key in data:
            return data[key]
        for value in data.values():
            result = _deep_find(value, key)
            if result is not None:
                return result
    elif isinstance(data, list):
        for item in data:
            result = _deep_find(item, key)
            if result is not None:
                return result
    return None


SIGNAL_KEY_LABELS = {
    "chainId": "链 ID",
    "latestBlock": "最新区块",
    "blockAgeSeconds": "区块年龄",
    "peerCount": "Peer 数",
    "gasPriceGwei": "Gas 价格",
    "sampledBlocks": "采样区块",
    "averageInterval": "平均间隔",
    "maxInterval": "最大间隔",
    "totalTxs": "总交易数",
    "totalGasUsed": "总 Gas 消耗",
    "registeredCount": "注册数",
    "activeCount": "活跃数",
    "jailedCount": "Jailed 数",
    "notInSetCount": "未入集数",
    "count": "活跃数量",
    "validatorCount": "验证者数",
    "totalRewards": "总收益",
    "missingBlockValidators": "未出块验证者",
    "lowBlockValidators": "低出块验证者",
}


def _format_signal_value(key, value):
    label = SIGNAL_KEY_LABELS.get(key, key)
    if key == "latestBlock" and isinstance(value, dict):
        return {"label": label, "value": value.get("blockNumber", value)}
    if key in {"averageInterval", "maxInterval", "averageBlockIntervalSeconds"} and isinstance(value, (int, float)):
        return {"label": label, "value": f"{value}s"}
    return {"label": label, "value": value}


def signal_value(checks, action_names, keys, fallback="未提供数据"):
    for check in checks:
        action = str(check.get("action", "")).lower()
        if action not in action_names:
            continue
        data = check.get("data") or {}
        values = []
        for key in keys:
            value = _deep_find(data, key)
            if value is not None:
                values.append(_format_signal_value(key, value))
        if values:
            return {"items": values}
        message = str(check.get("message", fallback))
        return {"value": message}
    return {"value": fallback}


def build_validator_model(validators):
    rows = []
    for k, v in sorted(validators.items(), key=lambda x: x[1].get("moniker", x[0])):
        level = severity_class_for_validator(v)
        moniker = v.get("moniker") or "未知验证者"
        operator = v.get("operator") or k
        recent = " / ".join(filter(None, [
            f"overview {v.get('recentBlocks', '-')}"
            if v.get("recentBlocks") is not None else None,
            f"window {v.get('blocks', '-')}"
            if v.get("blocks") is not None else None,
        ])) or "-"
        balance = v.get("operatorBalanceNetx")
        balance_str = f"{balance:.4f}" if isinstance(balance, (int, float)) else "-"
        rewards = v.get("rewards")
        rewards_str = f"{rewards:.4f}" if isinstance(rewards, (int, float)) else "-"
        share = v.get("sharePercent")
        share_str = f"{share:.1f}%" if isinstance(share, (int, float)) else None
        status_parts = []
        for src in (v.get("status"), v.get("blockStatus"), v.get("jailedStatus"), v.get("windowStatus")):
            label = status_label(src) if src else None
            if label and label not in status_parts and label != "正常":
                status_parts.append(label)
        note = " / ".join(status_parts) if status_parts else status_label(v.get("status"))
        rows.append({
            "level": level,
            "moniker": moniker,
            "operator": operator,
            "recent": recent,
            "balance": balance_str,
            "rewards": rewards_str,
            "share": share_str,
            "sharePercent": share if isinstance(share, (int, float)) else 0,
            "note": note,
        })
    return rows


def build_action_model(checks, validators):
    items = []

    # RPC / block age issues
    for check in checks:
        action = str(check.get("action", "")).lower()
        data = check.get("data") or {}
        for key, value in find_numbers(data, {"blockAgeSeconds", "latestBlockAgeSeconds"}):
            if value > 120:
                items.append({"level": "critical",
                    "title": "区块已停滞超过 2 分钟",
                    "description": f"最新区块距离现在已经 {value}s，请立即检查 RPC 节点与验证者网络是否存活。"})
            elif value > 30:
                items.append({"level": "warning",
                    "title": "区块间隔偏大",
                    "description": f"最新区块距离现在 {value}s，超过正常 3s 间隔，需要关注是否有验证者掉线。"})
        if action in {"rpc_snapshot", "chain_health", "rpc_alive"}:
            peer = data.get("peerCount")
            if isinstance(peer, (int, float)) and peer < 3:
                items.append({"level": "warning",
                    "title": "节点 peer 数偏低",
                    "description": f"当前 peer 数 {peer}，建议检查网络连接与 bootnode 配置。"})

    # Validator issues
    for k, v in validators.items():
        moniker = v.get("moniker") or k
        status = str(v.get("status", "")).lower()
        block_status = str(v.get("blockStatus", "")).lower()
        jailed_status = str(v.get("jailedStatus", "")).lower()
        window_status = str(v.get("windowStatus", "")).lower()
        statuses = {status, block_status, jailed_status, window_status}
        if "jailed" in statuses:
            items.append({"level": "critical",
                "title": f"验证者 {moniker} 已被 jail",
                "description": "该验证者因作恶或长时间不出块被系统惩罚，需确认是否恢复或重新部署。"})
        elif {"missing", "missing_blocks"} & statuses:
            items.append({"level": "critical",
                "title": f"验证者 {moniker} 近期未出块",
                "description": "请检查该节点的运行状态、网络连通性和共识私钥是否正确。"})
        elif {"low", "low_blocks"} & statuses:
            items.append({"level": "warning",
                "title": f"验证者 {moniker} 出块偏低",
                "description": "出块份额低于预期，可能是节点性能或网络抖动，建议查看节点日志。"})
        elif {"not_in_set", "not_active"} & statuses:
            items.append({"level": "warning",
                "title": f"验证者 {moniker} 未进入活跃集合",
                "description": "已注册但未在当期验证者集合中，需确认质押排名是否足够。"})

    if not items:
        items.append({"level": "ok",
            "title": "暂无明确需要人工介入的事项",
            "description": "核心指标正常，建议按日常节奏继续观察。"})

    return items


def build_check_model(checks, levels):
    rows = []
    for check, level in zip(checks, levels):
        source = " / ".join(filter(None, [str(check.get("skill", "")), str(check.get("action", ""))])) or str(check.get("metadata", {}).get("source", "unknown"))
        message = check.get("message") or check.get("error", {}).get("detail") or "无摘要"
        rows.append({
            "level": level,
            "source": source,
            "message": message,
            "data": summarize_data(check.get("data")),
        })
    return rows


def build_explanation_model():
    return [
        {"title": "健康分", "description": "综合所有检查项得出的 0-100 分。100 表示没有风险，分数越低说明需要关注的事项越多。"},
        {"title": "区块高度 (latestBlock)", "description": "链上已经确认的区块总数。数字持续增长代表链在正常出块。"},
        {"title": "区块间隔 (blockAgeSeconds)", "description": "最新区块距离现在多少秒。Chain287 通常 3 秒一个块，超过 30 秒需要关注。"},
        {"title": "Peer 数", "description": "当前 RPC 节点连接的其他节点数量。太少可能导致同步或广播问题。"},
        {"title": "验证者 (Validator)", "description": "负责打包区块、维护共识的节点。活跃验证者集合决定链的出块权利。"},
        {"title": "Jailed", "description": "验证者因长期不出块或作恶被系统惩罚，暂时失去出块资格。"},
        {"title": "Operator 余额", "description": "验证者运营地址的 NETX 余额，用于支付链上操作的 gas。余额过低会影响日常维护。"},
        {"title": "StakeCredit / 收益", "description": "验证者质押池累计的收益。收益增长代表该验证者在正常参与共识。"},
    ]


EXPECTED_ACTIONS = {
    ("chain287-chain-query", "rpc_snapshot"),
    ("chain287-chain-query", "chain_health"),
    ("chain287-chain-query", "recent_blocks"),
    ("chain287-chain-query", "active_validators"),
    ("chain287-validator-health", "validator_overview"),
    ("chain287-validator-health", "validator_block_stats"),
    ("chain287-validator-health", "validator_rewards"),
    ("chain287-validator-health", "validator_jailed_status"),
    ("chain287-validator-health", "validator_window_stats"),
}


def missing_actions(payload):
    """Return the set of expected upstream actions that are absent from the payload."""
    present = set()
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                present.add((item.get("skill"), item.get("action")))
    elif isinstance(payload, dict):
        present.add((payload.get("skill"), payload.get("action")))
    return EXPECTED_ACTIONS - present


def build_report(payload, title, scope, notes):
    checks = collect_checks(payload)
    levels = [severity(check) for check in checks]
    counts = {level: levels.count(level) for level in ("critical", "warning", "ok", "unknown")}
    absent = missing_actions(payload)
    has_data_gap = bool(absent)
    score = max(0, 100 - counts["critical"] * 25 - counts["warning"] * 10 - counts["unknown"] * 5 - (5 if has_data_gap else 0))
    if counts["critical"]:
        overall = "critical"
    elif counts["warning"] or has_data_gap:
        overall = "warning"
    elif counts["ok"]:
        overall = "ok"
    else:
        overall = "unknown"
    generated_at = utc_now()
    summary = {
        "critical": "存在需要立即处理的链或验证者风险，请优先查看 Critical 项。",
        "warning": "整体可运行，但存在需要跟进的风险信号或数据不完整项。",
        "ok": "核心链路巡检结果正常，未发现明确风险信号。",
        "unknown": "输入数据不足，无法形成完整巡检结论。",
    }[overall]

    validators = collect_validators(checks)

    signals = [
        {"name": "RPC / 节点", **signal_value(checks, {"rpc_snapshot", "chain_health", "rpc_alive"}, ["chainId", "latestBlock", "blockAgeSeconds", "peerCount", "gasPriceGwei"])},
        {"name": "区块生产", **signal_value(checks, {"recent_blocks", "validator_block_stats", "validator_window_stats"}, ["sampledBlocks", "averageInterval", "maxInterval", "totalTxs", "totalGasUsed"])},
        {"name": "验证者集合", **signal_value(checks, {"active_validators", "validator_overview", "validator_jailed_status"}, ["registeredCount", "activeCount", "jailedCount", "notInSetCount", "count"])},
        {"name": "收益", **signal_value(checks, {"validator_rewards"}, ["validatorCount", "totalRewards"])},
        {"name": "窗口统计", **signal_value(checks, {"validator_window_stats"}, ["sampledBlocks", "totalTxs", "missingBlockValidators", "lowBlockValidators"])},
        {"name": "操作说明", "items": [{"label": "执行方式", "value": "仅使用只读 skill 输出"}, {"label": "写操作", "value": "未执行链上写操作"}]},
    ]

    action_items = build_action_model(checks, validators)
    if has_data_gap:
        missing_names = sorted(f"{skill}/{action}" for skill, action in absent)
        action_items.insert(0, {
            "level": "warning",
            "title": "巡检数据不完整",
            "description": f"以下巡检数据缺失，无法形成完整报告：{', '.join(missing_names)}。请重新执行 run_inspection。",
        })

    report_data = {
        "title": title,
        "generatedAt": generated_at,
        "scope": scope,
        "notes": notes,
        "checkCount": len(checks),
        "score": score,
        "overall": overall,
        "summary": summary,
        "newbieSummary": build_newbie_summary(overall, score, counts, checks),
        "counts": counts,
        "signals": signals,
        "actionItems": action_items,
        "validators": build_validator_model(validators),
        "checks": build_check_model(checks, levels),
        "explanations": build_explanation_model(),
        "rawJson": json.dumps(payload, ensure_ascii=False, indent=2),
    }

    template = read_template()
    # json.dumps with ensure_ascii=False will still escape </script> as \u003c/script\u003e,
    # making it safe to embed directly inside a <script type="application/json"> block.
    report_json = json.dumps(report_data, ensure_ascii=False, separators=(",", ":"))
    html_doc = template
    html_doc = html_doc.replace("{{TITLE}}", h(title))
    html_doc = html_doc.replace("{{GENERATED_AT}}", h(generated_at))
    html_doc = html_doc.replace("{{SCOPE}}", h(scope))
    html_doc = html_doc.replace("{{REPORT_DATA}}", report_json)

    return html_doc, {
        "generatedAt": generated_at,
        "overallStatus": overall,
        "healthScore": score,
        "checkCount": len(checks),
        "criticalCount": counts["critical"],
        "warningCount": counts["warning"],
        "okCount": counts["ok"],
        "unknownCount": counts["unknown"],
        "dataGap": has_data_gap,
    }


def safe_filename(title):
    base = re.sub(r"[^a-zA-Z0-9._-]+", "-", title.strip().lower()).strip("-")
    if not base:
        base = "chain287-sre-inspection-report"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{base}-{stamp}.html"
