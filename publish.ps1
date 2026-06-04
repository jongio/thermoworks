#!/usr/bin/env pwsh
# publish.ps1 — First-time publish to npm
# Run: pwsh publish.ps1
#
# Prerequisites:
#   1. Run `npm login` and authenticate with your npm account
#   2. Verify with `npm whoami`

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n=== Step 1: Verify npm login ===" -ForegroundColor Cyan
$user = npm whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Not logged in to npm. Run 'npm login' first." -ForegroundColor Red
    exit 1
}
Write-Host "Logged in as: $user" -ForegroundColor Green

Write-Host "`n=== Step 2: Check package name availability ===" -ForegroundColor Cyan
$sdkCheck = npm view thermoworks-sdk version 2>&1
$cliCheck = npm view thermoworks version 2>&1
if ($sdkCheck -notlike "*E404*" -and $sdkCheck -notlike "*error*") {
    Write-Host "thermoworks-sdk@$sdkCheck already exists on npm" -ForegroundColor Yellow
}
if ($cliCheck -notlike "*E404*" -and $cliCheck -notlike "*error*") {
    Write-Host "thermoworks@$cliCheck already exists on npm" -ForegroundColor Yellow
}

Write-Host "`n=== Step 3: Install dependencies ===" -ForegroundColor Cyan
pnpm install

Write-Host "`n=== Step 4: Build all packages ===" -ForegroundColor Cyan
pnpm -r build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Step 5: Run tests ===" -ForegroundColor Cyan
pnpm -r test
if ($LASTEXITCODE -ne 0) { Write-Host "Tests failed" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Step 6: Publish SDK (thermoworks-sdk) ===" -ForegroundColor Cyan
Set-Location packages/sdk
pnpm publish --access public --no-git-checks
if ($LASTEXITCODE -ne 0) { Write-Host "SDK publish failed" -ForegroundColor Red; exit 1 }
Write-Host "thermoworks-sdk published!" -ForegroundColor Green

Write-Host "`n=== Step 7: Publish CLI (thermoworks) ===" -ForegroundColor Cyan
Set-Location ../cli
pnpm publish --access public --no-git-checks
if ($LASTEXITCODE -ne 0) { Write-Host "CLI publish failed" -ForegroundColor Red; exit 1 }
Write-Host "thermoworks published!" -ForegroundColor Green

Set-Location $PSScriptRoot

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Packages published:"
Write-Host "  https://www.npmjs.com/package/thermoworks-sdk"
Write-Host "  https://www.npmjs.com/package/thermoworks"
Write-Host ""
Write-Host "Next steps for automated releases:" -ForegroundColor Cyan
Write-Host "  1. Create an npm granular access token at:"
Write-Host "     https://www.npmjs.com/settings/$user/tokens"
Write-Host "  2. Create a 'npm-publish' environment in GitHub repo settings:"
Write-Host "     https://github.com/jongio/thermoworks/settings/environments"
Write-Host "  3. Add the token as NPM_TOKEN secret in that environment"
Write-Host "  4. Future releases: run 'pnpm changeset', commit, push, merge the PR"
