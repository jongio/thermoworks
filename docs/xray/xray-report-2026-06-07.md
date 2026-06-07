# X-Ray Report: ThermoWorks Tools

Generated: 2026-06-07  
Target: jongio/thermoworks  
Commit: 9d9752a

## Executive Summary

ThermoWorks Tools is a pnpm monorepo providing unofficial community tools for ThermoWorks Cloud IoT thermometers. It delivers 5 packages: a Node.js SDK (client library), CLI (14 commands), VS Code extension (16 commands + tree view + status bar), MCP server (7 AI assistant tools), and a React web dashboard (real-time + public share viewer). The codebase is TypeScript-only, targets Node ≥18, and uses Firebase/Firestore REST APIs as its backend.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 6.0.3 |
| Runtime | Node.js | ≥18.0.0 |
| Package manager | pnpm | 10.12.1 |
| Monorepo | pnpm workspaces | `packages/*` |
| Linter/formatter | Biome | 2.4.16 |
| Test runner | Vitest | 4.x |
| Build (SDK/CLI/MCP) | tsup (esbuild) | latest |
| Build (VS Code) | esbuild direct | 0.25.x |
| Build (Web) | Vite | 6.x |
| Web framework | React | 19.1.0 |
| CSS | Tailwind CSS | v4 |
| Charts | Recharts | 3.8.x |
| HTTP client (SDK) | undici | latest |
| Credential storage | @github/keytar | OS keychain |
| MCP protocol | @modelcontextprotocol/sdk | 1.x |
| Schema validation | Zod | 3.x |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    thermoworks-monorepo                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   CLI    │  │  VS Code │  │   MCP    │  │   Web    │   │
│  │ 14 cmds  │  │ 16 cmds  │  │ 7 tools  │  │ 3 routes │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │          │
│       └──────────────┼──────────────┘              │          │
│                      │                             │          │
│               ┌──────▼──────┐              ┌──────▼──────┐  │
│               │     SDK     │              │  Web Client  │  │
│               │ (Node.js)   │              │ (browser)    │  │
│               └──────┬──────┘              └──────┬──────┘  │
│                      │                            │          │
└──────────────────────┼────────────────────────────┼──────────┘
                       │                            │
              ┌────────▼────────────────────────────▼────┐
              │        Firebase / Firestore REST APIs     │
              │   (Auth, Devices, Channels, Archives)     │
              └──────────────────────────────────────────┘
```

### Package Dependency Graph

```
cli ──→ sdk (runtime)
cli ──→ mcp (bin spawning)
vscode ──→ sdk (devDependency)
mcp ──→ sdk (runtime)
web ──→ sdk (types only — reimplements client for browser)
```

### Module Map

| Package | Source Files | Entry Point | Key Classes/Exports |
|---------|------------:|-------------|-------------------|
| sdk | 12 | `src/index.ts` | `ThermoworksCloud`, 38 types, 3 error classes, helpers |
| cli | 14 | `src/index.ts` | 14 command functions, `parseGlobalFlags`, `outputJson` |
| vscode | 12 | `src/extension.ts` | `TemperatureStatusBar`, `ThermoworksTreeProvider`, `ChartPanel`, `AlarmNotifier`, `registerChatParticipant` |
| mcp | 2 | `src/server.ts` | `createServer`, `startServer`, `handleTool`, `resetClient` |
| web | 14 | `src/main.tsx` | `App`, `ThermoworksWebClient`, `DeviceCard`, `TemperatureChart`, share pages |

## Design Patterns

| Pattern | Usage | Location |
|---------|-------|----------|
| Command | CLI commands as exported async functions | `cli/src/commands/*.ts` |
| Singleton | MCP cached client | `mcp/src/server.ts` |
| Observer | VS Code tree data change events | `vscode/src/tree/thermoworks-tree-provider.ts` |
| Strategy | Output mode (JSON vs TTY) via `OutputOptions` | `cli/src/output.ts` |
| Factory | `createAuthSession`, `createSubscription` | `sdk/src/auth.ts`, `sdk/src/subscribe.ts` |
| Adapter | Web client adapts Firestore REST for browser | `web/src/lib/api.ts` |
| Lazy loading | React.lazy for TemperatureChart | `web/src/components/DeviceCard.tsx` |

### Conventions

| Convention | Standard |
|-----------|----------|
| Indentation | Tabs (biome enforced) |
| Line width | 100 characters |
| Module system | ESM with `.js` extensions |
| File naming | kebab-case |
| Function naming | camelCase |
| Class naming | PascalCase |
| Test location | `packages/*/tests/*.test.ts` |
| Error strategy | Custom error classes (AuthError, NetworkError, NotFoundError) |

## Data Flow

### Authentication
```
Credentials (env vars or OS keychain)
  → createAuthSession(email, password)
    → Firebase signInWithPassword
      → idToken + refreshToken
        → Token cache (~/.thermoworks/.token-cache.json, 0o600)
          → Bearer token on Firestore requests
            → Auto-refresh 60s before expiry
```

### Device Data
```
Firestore REST API → SDK parsers → Typed domain objects → Consumers
                                                           ├── CLI (TTY/JSON)
                                                           ├── VS Code (tree/bar)
                                                           ├── MCP (JSON tools)
                                                           └── Web (React state)
```

## API Surface

| Surface | Count | Examples |
|---------|------:|---------|
| CLI commands | 14 | `auth`, `devices`, `watch`, `events`, `archives`, `export`, `alarm`, `guide` |
| SDK methods | 30+ | `getDevices`, `setAlarm`, `getArchives`, `startSession`, `getFirmwareInfo` |
| MCP tools | 7 | `get_devices`, `get_device_channels`, `get_events`, `get_temperature_guide` |
| VS Code commands | 16 | `login`, `configureAlarm`, `showTemperatureChart`, `startSession` |
| Web routes | 3 | `/` (dashboard), `/share/device/:serial`, `/share/archive/:serial/:archiveId` |

## Testing

| Package | Tests | Coverage | Framework |
|---------|------:|----------|-----------|
| SDK | 301 | ~85% | Vitest + v8 |
| CLI | 285 | ~72% | Vitest + v8 |
| VS Code | 232 | ~76% | Vitest + v8 |
| Web | 20 | ~15% | Vitest + jsdom + Testing Library |
| MCP | 10 | ~95% | Vitest + v8 |
| **Total** | **848** | — | — |

## Security

| Control | Implementation |
|---------|---------------|
| Credentials | OS keychain (@github/keytar) + env vars fallback |
| Token cache | File-based, 0o600 perms, symlink check, 60s pre-expiry refresh |
| Input validation | Serial regex, channel bounds (1-9), label sanitization (ANSI strip) |
| API keys | Firebase public web config (not secret by design) |
| Dependencies | 0 CVEs, pnpm audit clean, SHA-pinned CI actions |
| Publishing | npm provenance, frozen lockfile, allowlisted native builds |

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to main | Build + test + typecheck |
| `release-all.yml` | manual dispatch | Batch release all packages |
| `pages.yml` | push to main (web changes) | Deploy web to GitHub Pages |
| `eval.yml` | schedule (weekdays 6am UTC) | Vally skill evaluations |

## Documentation

| Document | Status |
|----------|--------|
| Root README | ✅ Comprehensive with badges, screenshots, quick start |
| CLI Reference | ✅ `docs/cli-reference.md` |
| API Reference | ✅ `docs/api-reference.md` |
| SDK Examples | ✅ `docs/sdk-examples.md` (7 recipes) |
| Contributing | ✅ `CONTRIBUTING.md` |
| Package READMEs | ✅ sdk, cli, vscode, mcp — ❌ web missing |
| Agent Skills | ✅ 2 Copilot skills (thermoworks, thermoworks-dev) |

---

## Gap Analysis

### [XRAY-001] Web package missing README

- **Category**: Missing docs
- **Severity**: Medium
- **Location**: `packages/web/`
- **Evidence**: No README.md exists
- **Impact**: Contributors can't discover how to develop/deploy the web dashboard
- **Fix**: Create README with dev setup, architecture overview, deployment instructions
- **Effort**: S

### [XRAY-002] Web client duplicates SDK Firestore parsing logic

- **Category**: Architecture (DRY violation)
- **Severity**: Medium
- **Location**: `packages/web/src/lib/api.ts` (598 lines)
- **Evidence**: Reimplements `getString`, `getNumber`, `getTimestamp`, device/channel/archive parsers that exist in SDK
- **Impact**: Bug fixes in SDK parsers must be manually ported; divergence risk
- **Fix**: Extract isomorphic parser layer or make SDK parsers browser-compatible
- **Effort**: L

### [XRAY-003] No graceful shutdown in MCP server

- **Category**: Operational gap
- **Severity**: Medium
- **Location**: `packages/mcp/src/server.ts`
- **Evidence**: No SIGINT/SIGTERM handler to close cached client
- **Impact**: Leaked connections on termination
- **Fix**: Add signal handlers with `resetClient()` + `process.exit(0)`
- **Effort**: S

### [XRAY-004] CLI reference docs don't cover new commands

- **Category**: Stale documentation
- **Severity**: Medium
- **Location**: `docs/cli-reference.md`
- **Evidence**: 12 new commands (events, archives, session, watch, firmware, calibration, guide, export, alarm, mcp) not documented
- **Impact**: Users can't discover features from docs
- **Fix**: Update with all 14 commands, flags, and examples
- **Effort**: M

### [XRAY-005] No React Error Boundary in web app

- **Category**: Missing error handling
- **Severity**: Medium
- **Location**: `packages/web/src/App.tsx`
- **Evidence**: No Error Boundary — unhandled render errors crash entire UI
- **Impact**: Single bad API response crashes the dashboard
- **Fix**: Add root `<ErrorBoundary>` with graceful fallback
- **Effort**: S

### [XRAY-006] Web test coverage at 15%

- **Category**: Missing tests
- **Severity**: Medium
- **Location**: `packages/web/tests/`
- **Evidence**: 14 source files, only 3 test files (api, LoginForm, useDevices)
- **Impact**: UI regressions go undetected
- **Fix**: Add component tests for DeviceCard, share pages, App routing
- **Effort**: M

### [XRAY-007] VS Code extension lacks activationEvents

- **Category**: Performance
- **Severity**: Low
- **Location**: `packages/vscode/package.json`
- **Evidence**: No `activationEvents` — extension activates on every VS Code start
- **Impact**: Slightly slower startup for non-ThermoWorks users
- **Fix**: Add `"activationEvents": ["onView:thermoworksPanel", "onCommand:thermoworks.*"]`
- **Effort**: S

### [XRAY-008] Unused SDK exports (public API surface)

- **Category**: Over-abstraction
- **Severity**: Low
- **Location**: `packages/sdk/src/index.ts`
- **Evidence**: 15+ exports not consumed by any monorepo package
- **Impact**: Larger API surface; acceptable if intended for external consumers
- **Fix**: Mark secondary exports with `@beta` JSDoc tag
- **Effort**: S

### [XRAY-009] No integration tests

- **Category**: Missing tests
- **Severity**: Low
- **Location**: Repository-wide
- **Evidence**: All 848 tests are unit tests with mocked SDK
- **Impact**: Integration regressions only caught at runtime
- **Fix**: Add integration test suite with recorded API fixtures
- **Effort**: L

### [XRAY-010] Web bundle size (662KB)

- **Category**: Performance
- **Severity**: Low
- **Location**: `packages/web/` build output
- **Evidence**: Vite warns >500KB. Recharts ~250KB already lazy-loaded
- **Impact**: Slow initial load on mobile
- **Fix**: Manual chunks in vite.config.ts; consider lighter chart alternative
- **Effort**: M

---

## Summary

```
X-Ray complete: ThermoWorks Tools
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tech: TypeScript / React+Node / pnpm monorepo
Packages: 5 (sdk, cli, vscode, mcp, web)
Source files: 259 | Tests: 848
Gaps found: 0 critical, 0 high, 7 medium, 3 low
Report: docs/xray/xray-report-2026-06-07.md
```
