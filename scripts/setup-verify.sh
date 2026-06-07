#!/usr/bin/env bash
# setup-verify.sh — Verify that all dependencies are installed and the project builds/tests correctly.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0
warn=0

check() {
  local name="$1" cmd="$2" min_version="${3:-}"
  if command -v "$cmd" &>/dev/null; then
    local version
    version=$("$cmd" --version 2>/dev/null | head -1)
    echo -e "  ${GREEN}✓${NC} $name: $version"
    ((pass++))
  else
    echo -e "  ${RED}✗${NC} $name: NOT FOUND"
    ((fail++))
  fi
}

echo ""
echo "========================================="
echo " ThermoWorks — Setup Verification"
echo "========================================="
echo ""

# --- Required tools ---
echo "Required tools:"
check "Node.js (>=18)" "node"
check "pnpm" "pnpm"
check "Git" "git"
echo ""

# --- Platform-specific: libsecret (Linux only) ---
echo "Platform dependencies:"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  if pkg-config --exists libsecret-1 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} libsecret-1: installed (required for keychain access)"
    ((pass++))
  else
    echo -e "  ${RED}✗${NC} libsecret-1-dev: NOT FOUND — install with: sudo apt-get install libsecret-1-dev"
    ((fail++))
  fi
  if command -v gcc &>/dev/null || command -v cc &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} C compiler: available (for native modules)"
    ((pass++))
  else
    echo -e "  ${RED}✗${NC} C compiler: NOT FOUND — install with: sudo apt-get install build-essential"
    ((fail++))
  fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
  if xcode-select -p &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Xcode CLI Tools: installed"
    ((pass++))
  else
    echo -e "  ${YELLOW}⚠${NC} Xcode CLI Tools: not detected — run: xcode-select --install"
    ((warn++))
  fi
else
  echo -e "  ${GREEN}✓${NC} Windows: no additional platform deps needed"
  ((pass++))
fi
echo ""

# --- Node version check ---
echo "Version checks:"
node_version=$(node -v 2>/dev/null | sed 's/v//')
node_major=$(echo "$node_version" | cut -d. -f1)
if [ "$node_major" -ge 18 ] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} Node.js $node_version >= 18"
  ((pass++))
else
  echo -e "  ${RED}✗${NC} Node.js $node_version < 18 — please upgrade"
  ((fail++))
fi
echo ""

# --- Install + Build + Test ---
echo "Project verification:"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "  Installing dependencies..."
if pnpm install --frozen-lockfile 2>&1 | tail -1; then
  echo -e "  ${GREEN}✓${NC} pnpm install succeeded"
  ((pass++))
else
  echo -e "  ${RED}✗${NC} pnpm install failed"
  ((fail++))
fi

echo "  Building all packages..."
if pnpm build 2>&1 | tail -3; then
  echo -e "  ${GREEN}✓${NC} pnpm build succeeded"
  ((pass++))
else
  echo -e "  ${RED}✗${NC} pnpm build failed"
  ((fail++))
fi

echo "  Running tests..."
if pnpm test 2>&1 | tail -5; then
  echo -e "  ${GREEN}✓${NC} pnpm test succeeded"
  ((pass++))
else
  echo -e "  ${RED}✗${NC} pnpm test failed"
  ((fail++))
fi

echo "  Type-checking..."
if pnpm typecheck 2>&1 | tail -3; then
  echo -e "  ${GREEN}✓${NC} pnpm typecheck succeeded"
  ((pass++))
else
  echo -e "  ${RED}✗${NC} pnpm typecheck failed"
  ((fail++))
fi

echo ""
echo "========================================="
echo " Results: ${pass} passed, ${fail} failed, ${warn} warnings"
echo "========================================="
echo ""

if [ "$fail" -gt 0 ]; then
  echo -e "${RED}Some checks failed. Please fix the issues above.${NC}"
  exit 1
else
  echo -e "${GREEN}All checks passed! You're ready to develop.${NC}"
  exit 0
fi
