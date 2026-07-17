# setup-verify.ps1 — Verify that all dependencies are installed and the project builds/tests correctly.
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$pass = 0
$fail = 0
$warn = 0

function Check-Command {
    param([string]$Name, [string]$Command)
    try {
        $result = & $Command --version 2>&1 | Select-Object -First 1
        Write-Host "  [PASS] $Name`: $result" -ForegroundColor Green
        $script:pass++
    } catch {
        Write-Host "  [FAIL] $Name`: NOT FOUND" -ForegroundColor Red
        $script:fail++
    }
}

function Check-CommandExists {
    param([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

Write-Host ""
Write-Host "========================================="
Write-Host " ThermoWorks - Setup Verification"
Write-Host "========================================="
Write-Host ""

# --- Required tools ---
Write-Host "Required tools:"
Check-Command "Node.js (>=18)" "node"
Check-Command "pnpm" "pnpm"
Check-Command "Git" "git"
Write-Host ""

# --- Platform dependencies ---
Write-Host "Platform dependencies:"
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    # Check for C++ build tools (needed for native modules like @github/keytar)
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsInstall = & $vsWhere -latest -property installationPath 2>$null
        if ($vsInstall) {
            Write-Host "  [PASS] Visual Studio Build Tools: $vsInstall" -ForegroundColor Green
            $pass++
        } else {
            Write-Host "  [WARN] Visual Studio Build Tools: not detected (may be needed for native modules)" -ForegroundColor Yellow
            $warn++
        }
    } else {
        # Try checking for cl.exe in PATH
        if (Check-CommandExists "cl") {
            Write-Host "  [PASS] C++ compiler (cl.exe): available" -ForegroundColor Green
            $pass++
        } else {
            Write-Host "  [WARN] C++ Build Tools: not detected (needed for @github/keytar native compilation)" -ForegroundColor Yellow
            Write-Host "         Install: Visual Studio Build Tools with C++ workload" -ForegroundColor Yellow
            $warn++
        }
    }
} elseif ($IsMacOS) {
    if (Check-CommandExists "xcode-select") {
        $xcPath = xcode-select -p 2>$null
        if ($xcPath) {
            Write-Host "  [PASS] Xcode CLI Tools: $xcPath" -ForegroundColor Green
            $pass++
        } else {
            Write-Host "  [WARN] Xcode CLI Tools: not detected - run: xcode-select --install" -ForegroundColor Yellow
            $warn++
        }
    }
} else {
    # Linux
    if (Check-CommandExists "pkg-config") {
        $libsecret = pkg-config --exists libsecret-1 2>$null; $lsResult = $LASTEXITCODE
        if ($lsResult -eq 0) {
            Write-Host "  [PASS] libsecret-1: installed" -ForegroundColor Green
            $pass++
        } else {
            Write-Host "  [FAIL] libsecret-1-dev: NOT FOUND - install with: sudo apt-get install libsecret-1-dev" -ForegroundColor Red
            $fail++
        }
    }
    if (Check-CommandExists "gcc") {
        Write-Host "  [PASS] C compiler: available" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [FAIL] C compiler: NOT FOUND - install with: sudo apt-get install build-essential" -ForegroundColor Red
        $fail++
    }
}
Write-Host ""

# --- Node version check ---
Write-Host "Version checks:"
try {
    $nodeVer = (node -v) -replace '^v', ''
    $nodeMajor = [int]($nodeVer -split '\.')[0]
    if ($nodeMajor -ge 22) {
        Write-Host "  [PASS] Node.js $nodeVer >= 22 (matches CI)" -ForegroundColor Green
        $pass++
    } elseif ($nodeMajor -ge 18) {
        Write-Host "  [WARN] Node.js $nodeVer >= 18 but CI uses 22 - consider upgrading" -ForegroundColor Yellow
        $warn++
    } else {
        Write-Host "  [FAIL] Node.js $nodeVer < 18 - please upgrade to 22+" -ForegroundColor Red
        $fail++
    }
} catch {
    Write-Host "  [FAIL] Could not determine Node.js version" -ForegroundColor Red
    $fail++
}

# --- pnpm version check ---
try {
    $pnpmVer = (pnpm -v) -replace '\s+', ''
    $pnpmMajor = [int]($pnpmVer -split '\.')[0]
    if ($pnpmMajor -ge 11) {
        Write-Host "  [PASS] pnpm $pnpmVer >= 11 (matches CI)" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "  [WARN] pnpm $pnpmVer < 11 - CI uses pnpm 11. Run: corepack prepare pnpm@latest --activate" -ForegroundColor Yellow
        $warn++
    }
} catch {
    Write-Host "  [FAIL] Could not determine pnpm version" -ForegroundColor Red
    $fail++
}
Write-Host ""

# --- Install + Build + Test ---
Write-Host "Project verification:"
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

Write-Host "  Installing dependencies..."
$installResult = pnpm install --frozen-lockfile 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [PASS] pnpm install succeeded" -ForegroundColor Green
    $pass++
} else {
    Write-Host "  [FAIL] pnpm install failed" -ForegroundColor Red
    $installResult | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" }
    $fail++
}

Write-Host "  Building all packages..."
$buildResult = pnpm build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [PASS] pnpm build succeeded" -ForegroundColor Green
    $pass++
} else {
    Write-Host "  [FAIL] pnpm build failed" -ForegroundColor Red
    $buildResult | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" }
    $fail++
}

Write-Host "  Running tests..."
$testResult = pnpm test 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [PASS] pnpm test succeeded" -ForegroundColor Green
    $pass++
} else {
    Write-Host "  [FAIL] pnpm test failed" -ForegroundColor Red
    $testResult | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" }
    $fail++
}

Write-Host "  Type-checking..."
$tcResult = pnpm typecheck 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [PASS] pnpm typecheck succeeded" -ForegroundColor Green
    $pass++
} else {
    Write-Host "  [FAIL] pnpm typecheck failed" -ForegroundColor Red
    $tcResult | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" }
    $fail++
}

Write-Host "  Linting..."
$lintResult = pnpm lint 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [PASS] pnpm lint succeeded" -ForegroundColor Green
    $pass++
} else {
    Write-Host "  [FAIL] pnpm lint failed" -ForegroundColor Red
    $lintResult | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" }
    Write-Host "         Fix: pnpm format && pnpm lint" -ForegroundColor Yellow
    $fail++
}

Write-Host "  Validating eval specs..."
$evalResult = pnpm eval:lint 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [PASS] pnpm eval:lint succeeded" -ForegroundColor Green
    $pass++
} else {
    Write-Host "  [FAIL] pnpm eval:lint failed" -ForegroundColor Red
    $evalResult | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" }
    $fail++
}

Pop-Location

Write-Host ""
Write-Host "========================================="
Write-Host " Results: $pass passed, $fail failed, $warn warnings"
Write-Host "========================================="
Write-Host ""

if ($fail -gt 0) {
    Write-Host "Some checks failed. Please fix the issues above." -ForegroundColor Red
    exit 1
} else {
    Write-Host "All checks passed! You're ready to develop." -ForegroundColor Green
    exit 0
}
