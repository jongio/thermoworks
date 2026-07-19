# Contributing

Thanks for your interest in contributing to this unofficial ThermoWorks CLI/SDK.

## Prerequisites

The following tools must be installed on your machine to build and run the full project:

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| **Node.js** | ≥ 18.0.0 | JavaScript runtime | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| **pnpm** | 11.14.0+ | Package manager (monorepo workspaces) | `corepack enable && corepack prepare pnpm@latest --activate` |
| **Git** | Any recent | Source control | [git-scm.com](https://git-scm.com) |

### Platform-Specific Dependencies

The CLI and VS Code extension use [`@github/keytar`](https://github.com/atom/node-keytar) for secure credential storage in the OS keychain. This requires native compilation support:

#### Windows

No extra steps — Windows Credential Vault is used automatically. Ensure you have the **Visual Studio Build Tools** (C++ workload) or **windows-build-tools** installed for native module compilation:

```powershell
# Option A: Install via npm (requires admin)
npm install -g windows-build-tools

# Option B: Install Visual Studio Build Tools with C++ workload
# Download from https://visualstudio.microsoft.com/visual-cpp-build-tools/
```

#### macOS

No extra steps — macOS Keychain is used automatically. Xcode Command Line Tools provide the necessary compiler:

```bash
xcode-select --install
```

#### Linux (Ubuntu/Debian)

Install `libsecret-1-dev` for keychain access and build essentials for native compilation:

```bash
sudo apt-get update
sudo apt-get install -y libsecret-1-dev build-essential python3
```

#### Linux (Fedora/RHEL)

```bash
sudo dnf install -y libsecret-devel gcc-c++ make python3
```

## Quick Setup

After cloning, run the contributor environment check to verify your setup matches CI:

```bash
pnpm dev:doctor
```

This cross-platform command checks Node/pnpm versions, platform dependencies for native modules, then runs install, build, test, typecheck, lint, and eval:lint. It reports each step as PASS/FAIL/WARN with actionable fix instructions.

You can also run the platform scripts directly:

```bash
# PowerShell (Windows)
pwsh ./scripts/setup-verify.ps1

# Bash (macOS/Linux)
./scripts/setup-verify.sh
```

Or run the steps manually:

```bash
git clone https://github.com/jongio/thermoworks.git
cd thermoworks
pnpm install
pnpm build
pnpm test
```

## Running the App

```bash
# CLI — run any command
pnpm --filter thermoworks exec thermoworks auth status

# SDK — run tests in watch mode
pnpm --filter thermoworks-sdk test:watch

# VS Code Extension — open in VS Code Extension Development Host
cd packages/vscode && code .
# Then press F5 to launch
```

## Development Commands

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Type-check all packages
pnpm typecheck

# Lint (Biome)
pnpm lint

# Format code
pnpm format
```

## Repository Structure

| Path | Package | Description |
|------|---------|-------------|
| `packages/sdk` | `thermoworks-sdk` | Node.js client library for ThermoWorks Cloud API |
| `packages/cli` | `thermoworks` | CLI for auth, device listing, Copilot statusline setup |
| `packages/mcp` | `thermoworks-mcp` | MCP server exposing device data to AI assistants |
| `packages/vscode` | VS Code extension | Status bar + device panel extension |
| `packages/web` | `thermoworks-web` | React 19 dashboard with real-time temperatures, charts, alarm UI, and public share viewer |

## Environment Variables

For headless/CI environments where the OS keychain is unavailable, credentials can be provided via environment variables:

| Variable | Description |
|----------|-------------|
| `THERMOWORKS_EMAIL` | ThermoWorks Cloud account email |
| `THERMOWORKS_PASSWORD` | ThermoWorks Cloud account password |

## Pull Requests

1. Fork the repository.
2. Create a branch for your change.
3. Run `pnpm dev:doctor` to verify your environment matches CI.
4. Open a pull request with a clear description.

## Agent Skills and Evaluation

The project includes GitHub Copilot agent skills in `.github/skills/` and [Vally](https://aka.ms/vally) evaluation suites in `evals/`.

```bash
# Validate skill format and eval specs
pnpm eval:lint

# Run smoke eval suite (agent-based, needs GITHUB_TOKEN)
pnpm eval:smoke

# Run full eval suite
pnpm eval:full
```

When adding a new skill, create a `SKILL.md` in `.github/skills/<name>/` with YAML frontmatter (`name` must match directory name) and add a corresponding eval spec in `evals/<name>/eval.yaml`. Run `pnpm eval:lint` to validate before pushing.

## Notes

This project interacts with an undocumented API. Be especially careful with changes to authentication and Firestore-related code.

## Code of Conduct

By participating in this project, you agree to abide by the guidelines in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
