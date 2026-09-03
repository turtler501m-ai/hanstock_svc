$previousCodexHome = $env:CODEX_HOME
try {
    $env:CODEX_HOME = Join-Path $env:USERPROFILE ".codex-a"
    & codex --dangerously-bypass-approvals-and-sandbox -C $PSScriptRoot @args
    exit $LASTEXITCODE
}
finally {
    $env:CODEX_HOME = $previousCodexHome
}
