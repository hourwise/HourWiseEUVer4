$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Running tachograph local tests..." -ForegroundColor Cyan
node --test .\scripts\tachograph-local.test.cjs
