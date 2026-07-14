#!/usr/bin/env python3
"""Run the complete read-only Chain287 inspection and render one HTML report."""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


# Loading the sibling renderer must not create __pycache__ inside the read-only skill.
sys.dont_write_bytecode = True


SKILL = "chain287-sre-inspection-report"
SCRIPT_DIR = Path(__file__).resolve().parent
SKILLS_DIR = SCRIPT_DIR.parents[1]


def normalize(value, default=""):
    value = (value or "").strip()
    return default if not value or "${" in value else value


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def fail(code, detail, failures=None):
    data = {"failedChecks": failures or []}
    emit({
        "version": "1.0",
        "status": "error",
        "message": detail,
        "data": data,
        "error": {"code": code, "detail": detail},
        "metadata": {"source": SKILL, "timestamp": utc_now()},
    })


def load_renderer():
    path = SCRIPT_DIR / "render-html.py"
    spec = importlib.util.spec_from_file_location("chain287_report_renderer", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_specs(sample, count, window_sec):
    query = SKILLS_DIR / "chain287-chain-query" / "scripts"
    validators = SKILLS_DIR / "chain287-validator-health" / "scripts"
    return [
        ("chain287-chain-query", "rpc_snapshot", query / "chain-rpc.sh", ["rpc_snapshot"], 40),
        ("chain287-chain-query", "chain_health", query / "chain-analytics.sh", ["chain_health", sample], 70),
        ("chain287-chain-query", "recent_blocks", query / "chain-analytics.sh", ["recent_blocks", count], 70),
        ("chain287-chain-query", "active_validators", query / "validator-node.sh", ["active_validators"], 30),
        ("chain287-validator-health", "validator_overview", validators / "validator-overview.sh", ["validator_overview", sample], 100),
        ("chain287-validator-health", "validator_block_stats", validators / "validator-block-stats.sh", ["validator_block_stats", sample], 100),
        ("chain287-validator-health", "validator_rewards", validators / "validator-rewards.sh", ["validator_rewards"], 70),
        ("chain287-validator-health", "validator_jailed_status", validators / "validator-jailed-status.sh", ["validator_jailed_status"], 70),
        ("chain287-validator-health", "validator_window_stats", validators / "validator-window-stats.sh", ["validator_window_stats", window_sec], 135),
    ]


def run_check(spec):
    skill, action, script, args, timeout = spec
    command = ["sh", str(script), *args]
    try:
        completed = subprocess.run(
            command,
            cwd=str(script.parent),
            env=os.environ.copy(),
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return skill, action, None, f"执行超时（{timeout}s）"
    except Exception as exc:
        return skill, action, None, f"无法启动检查：{exc}"

    stdout = completed.stdout.strip()
    try:
        output = json.loads(stdout)
    except Exception:
        detail = completed.stderr.strip() or stdout or f"exit code {completed.returncode}"
        return skill, action, None, f"输出不是有效 SkillOutput JSON：{detail[:500]}"

    if completed.returncode != 0:
        detail = completed.stderr.strip() or output.get("message") or f"exit code {completed.returncode}"
        return skill, action, output, detail[:500]
    if not isinstance(output, dict) or output.get("status") == "error":
        detail = output.get("message", "检查返回 error") if isinstance(output, dict) else "检查输出格式无效"
        return skill, action, output, detail
    return skill, action, output, None


def main():
    sample = normalize(sys.argv[1] if len(sys.argv) > 1 else "", "20")
    count = normalize(sys.argv[2] if len(sys.argv) > 2 else "", "20")
    window_sec = normalize(sys.argv[3] if len(sys.argv) > 3 else "", "300")
    title = normalize(sys.argv[4] if len(sys.argv) > 4 else "", "Chain287 每日健康巡检报告")
    scope = normalize(sys.argv[5] if len(sys.argv) > 5 else "", "Chain287 / RPC / Validator")
    notes = normalize(sys.argv[6] if len(sys.argv) > 6 else "", "本报告由 Task 自动生成，用于日常 SRE 巡检。")

    specs = check_specs(sample, count, window_sec)
    ordered = {}
    failures = []
    with ThreadPoolExecutor(max_workers=len(specs)) as executor:
        futures = {executor.submit(run_check, spec): (spec[0], spec[1]) for spec in specs}
        for future in as_completed(futures):
            skill, action, output, error = future.result()
            if error:
                failures.append({"skill": skill, "action": action, "detail": error})
            else:
                ordered[(skill, action)] = {"skill": skill, "action": action, "output": output}

    if failures:
        failures.sort(key=lambda item: (item["skill"], item["action"]))
        names = ", ".join(f'{item["skill"]}/{item["action"]}' for item in failures)
        fail("INSPECTION_CHECK_FAILED", f"巡检未完成，以下检查失败：{names}", failures)
        return

    payload = [ordered[(spec[0], spec[1])] for spec in specs]
    renderer = load_renderer()
    html_doc, data = renderer.build_report(payload, title, scope, notes)
    if data.get("dataGap"):
        fail("INCOMPLETE_INSPECTION", "巡检结果不完整，禁止生成报告")
        return

    staging = normalize(os.getenv("NETX_ARTIFACT_DIR", ""))
    out_dir = Path(staging) if staging else Path(tempfile.mkdtemp(prefix="chain287-sre-report-"))
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = renderer.safe_filename(title)
    report_path = out_dir / filename
    report_path.write_text(html_doc, encoding="utf-8")
    size = report_path.stat().st_size
    data.update({"reportFile": filename, "reportBytes": size})

    status = "ok" if data["criticalCount"] == 0 and data["warningCount"] == 0 else "partial"
    emit({
        "version": "1.0",
        "status": status,
        "message": f"已完成全部 9 项检查并生成 Chain287 SRE HTML 巡检报告：{filename}",
        "data": data,
        "display": {"format": "html", "title": title},
        "artifacts": [{
            "ref": filename,
            "name": filename,
            "mimeType": "text/html",
            "size": size,
            "description": "Chain287 区块链 SRE HTML 巡检报告",
        }],
        "metadata": {"source": SKILL, "timestamp": data["generatedAt"], "checksExecuted": 9},
    })


if __name__ == "__main__":
    main()
