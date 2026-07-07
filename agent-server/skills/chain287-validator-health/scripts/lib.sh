#!/bin/sh
# Chain287 Validator Health Skill — 公共辅助函数
# 所有脚本通过 source 本文件使用统一输出信封和验证者配置读取。

export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

# 输出 JSON 字符串转义
json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# 当前 UTC 时间戳
timestamp_utc() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# 检查 RPC URL
require_rpc() {
  if [ -z "${rpc_url:-}" ]; then
    print_error "MISSING_RPC_URL" "CHAIN287_RPC_URL 或 ETH_RPC_URL 必须设置"
    exit 2
  fi
}

# 检查 cast 命令
check_cast() {
  if ! command -v cast >/dev/null 2>&1; then
    print_error "CAST_NOT_FOUND" "找不到 cast 命令，请安装 Foundry"
    exit 127
  fi
}

# 成功信封
print_output() {
  _status="$1"
  _message="$2"
  _data="${3:-{}}"
  _source="${4:-validator-health}"
  _checked_at="$(timestamp_utc)"
  cat <<EOF
{"version":"1.0","status":"${_status}","message":"$(json_escape "$_message")","data":${_data},"metadata":{"source":"$(json_escape "$_source")","timestamp":"${_checked_at}"}}
EOF
}

# 错误信封
print_error() {
  _code="$1"
  _detail="$2"
  _source="${3:-validator-health}"
  _escaped_detail="$(json_escape "$_detail")"
  cat <<EOF
{"version":"1.0","status":"error","message":"${_escaped_detail}","error":{"code":"${_code}","detail":"${_escaped_detail}"},"metadata":{"source":"$(json_escape "$_source")","timestamp":"$(timestamp_utc)"}}
EOF
}

# 验证者配置文件路径
validator_config_path() {
  printf '%s/../references/validators.json' "$(dirname "$0")"
}
