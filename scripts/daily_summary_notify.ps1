# 每日总结等企业微信推送：可由 npm 统一启动 — 仓库根目录执行 `npm run daily:notify`（见 scripts/run-daily-notify.mjs）。
# 用法：在任务计划中「程序」填 powershell.exe，「参数」示例：
#   -NoProfile -ExecutionPolicy Bypass -File "D:\workspace\01-products\stock-community-summary\scripts\daily_summary_notify.ps1"
# 仅自检、不发 HTTP：在参数前加环境变量，例如先设 NOTIFY_DRY_RUN=1（需在系统中对该任务配置，或在脚本里临时 $env:NOTIFY_DRY_RUN='1'）。
#
# 创建每日任务示例（npm，起始于仓库根目录）：
# schtasks /Create /TN "StockCommunityDailySummary" /TR "cmd.exe /c cd /d \"D:\workspace\01-products\stock-community-summary\" ^&^& npm run daily:notify" /SC DAILY /ST 08:30 /RL LIMITED
#
# 创建每日任务示例（管理员 CMD）：
# schtasks /Create /TN "StockCommunityDailySummary" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"D:\workspace\01-products\stock-community-summary\scripts\daily_summary_notify.ps1\"" /SC DAILY /ST 08:30 /RL LIMITED

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$logDir = Join-Path $RepoRoot "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir ("daily_notify_{0:yyyyMMdd}.log" -f (Get-Date))

# 优先使用仓库旁虚拟环境 Python
$venvPy = Join-Path $RepoRoot ".venv\Scripts\python.exe"
if (Test-Path $venvPy) {
    $py = $venvPy
} else {
    $py = "python"
}

# Python 仍可能向 stderr 写警告；Continue 避免 WinPS 在管道里因 stderr 提前终止。
$ErrorActionPreference = "Continue"
& $py (Join-Path $RepoRoot "daily_summary_notify.py") *>&1 | Tee-Object -FilePath $logFile -Append
exit $LASTEXITCODE
