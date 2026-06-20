# X-Ray Report: thermoworks

Generated: 2026-06-10
Target: E:\code\thermoworks
Commit: daff2dfa6e50cd708c30bf445358a8653125d74f

## Executive Summary

ThermoWorks Tools is a pnpm monorepo providing multi-platform access to ThermoWorks Cloud temperature device data. It includes a Node.js SDK, CLI with Copilot statusline, React web dashboard, VS Code extension, and MCP server for AI assistants. The project communicates with ThermoWorks Cloud via Firebase Auth + Firestore REST + Cloud Functions.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | ^6.0.3 |
| Runtime | Node.js | >=18.0.0 |
| Package Manager | pnpm | 11.5.2 |
| Web Framework | React | ^19.2.7 |
| Web Bundler | Vite | ^8.0.16 |
| CSS | Tailwind CSS | ^4.3.0 |
| Charting | Recharts | ^3.8.1 |
| Test Runner | Vitest | ^4.1.8 |
| Linter/Formatter | Biome | ^2.4.16 |
| Build (lib) | tsup | ^8.5.1 |
| Credential Storage | @github/keytar | ^7.10.6 |
| MCP Framework | @modelcontextprotocol/sdk | ^1.29.0 |

## Architecture

### Package Dependency Graph

```
┌─────────────────────────────────────────────────────┐
│                    thermoworks-sdk                    │
│  (core: auth, client, types, token-cache)           │
└────────┬──────────┬──────────┬──────────┬───────────┘
         │          │          │          │
    ┌────▼───┐ ┌───▼────┐ ┌──▼───┐ ┌───▼──────┐
    │  cli   │ │  web   │ │ mcp  │ │  vscode  │
    │(cmds)  │ │(React) │ │(stdio)│ │(extension)│
    └────┬───┘ └────────┘ └──────┘ └──────────┘
         │
    ┌────▼───┐
    │  mcp   │ (cli hosts mcp via `thermoworks mcp start`)
    └────────┘
```

### Module Sizes

| Package | Source Files | LOC (approx) | Complexity Hotspots |
|---------|-------------|------|---------------------|
| sdk | 12 | 2,781 | client.ts (1330), auth.ts (463), types.ts (429) |
| cli | 18 | 2,224 | commands/copilot.ts (391) |
| web | 92 | 11,847 | lib/api.ts (1464), TemperatureChart.tsx (464), ExportScheduler.tsx (460) |
| vscode | 13 | 2,946 | tree-provider.ts (446), demo-data.ts (423), status-bar.ts (416) |
| mcp | 2 | 160 | — |
| **Total** | **137** | **~19,958** | |

### Web App Layer Structure

```
main.tsx (routes + lazy loading)
  └── App.tsx (auth state + multi-account)
       └── AppLayout (sidebar + outlet)
            ├── pages/ (Dashboard, Devices, DeviceDetail, Events, Settings, ...)
            │    └── components/ (DeviceCard, TemperatureChart, Sidebar, ...)
            │         └── hooks/ (useDevices, useHistory, useAccounts, ...)
            │              └── lib/ (api.ts, offline-store.ts, utils.ts, ...)
            └── context/ (TemperatureUnitContext, OfflineCacheContext)
```

## Design Patterns

| Pattern | Where | Notes |
|---------|-------|-------|
| Constructor injection | SDK `ThermoworksCloud(config)` | Config object with defaults |
| Factory | `createAuthSession()` in SDK auth | Produces session with token management |
| React Hooks | web `useDevices`, `useHistory`, `useAccounts` | Primary state pattern |
| React Context | `TemperatureUnitContext`, `OfflineCacheContext` | App-wide preferences |
| Retry + exponential backoff | SDK auth/HTTP layer | Jitter included |
| Subscription/polling | SDK `subscribe()`, web polling hooks | Alarm notifications |
| Lazy code-splitting | web `main.tsx` route-level splits | `React.lazy()` for pages |
| Service Worker | web `public/sw.js` | Network-first with cache fallback |

### Naming Conventions

- Files: `useX.ts` (hooks), `XContext.tsx` (context), `X.tsx` (components), `x.ts` (lib)
- Functions: camelCase verb-first (`getDevices`, `parseArchive`)
- Components/Classes: PascalCase (`ThermoworksCloud`, `DeviceCard`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_API_KEY`, `TOKEN_STORAGE_KEY`)

### Error Handling

- Custom error classes: `AuthError`, `NetworkError`, `NotFoundError` (SDK)
- Web client duplicates `AuthError` locally
- Strategy: throw upward, catch at UI boundary
- Silent fallback for storage operations (localStorage, IndexedDB, keychain)

## Data Flow

### Authentication

```
User email/password
  → Firebase signInWithPassword (identitytoolkit.googleapis.com)
    → idToken + refreshToken + userId + expiresIn
      → Stored: keychain (CLI/VS Code), sessionStorage (web), localStorage (multi-account)
        → All API calls use Bearer idToken
          → Auto-refresh ~60s before expiry via securetoken.googleapis.com
```

### Device Data Pipeline

```
ThermoWorks Cloud (Firestore)
  → GET /documents/devices/{serial}                    [device metadata]
  → GET /documents/devices/{serial}/channels/{n}       [channel readings]
  → GET /documents/devices/{serial}/archive?...        [session archives]
  → POST Cloud Functions (requestRetrieveInstrumentHistory) [BigQuery history - currently 500]
    → Parse Firestore field format (stringValue/doubleValue/timestampValue/mapValue)
      → Typed models (Device, DeviceChannel, Archive, ArchiveChannel)
        → UI components / CLI output
```

### External Services

| Service | URL | Purpose |
|---------|-----|---------|
| Firebase Identity | identitytoolkit.googleapis.com | Login |
| Secure Token | securetoken.googleapis.com | Token refresh |
| Firestore REST | firestore.googleapis.com | Device/channel/archive data |
| Cloud Functions | us-central1-thermoworks-cloud-production.cloudfunctions.net | History, search, sharing |

### State Management (Web)

| Layer | Storage | Lifetime |
|-------|---------|----------|
| Auth session | sessionStorage | Tab lifetime |
| Multi-account tokens | localStorage | Persistent |
| Temperature unit | localStorage + Context | Persistent |
| Device order (DnD) | localStorage | Persistent |
| Export schedules | localStorage | Persistent |
| Offline device cache | IndexedDB (24h TTL) | Persistent |
| App shell | Service Worker cache | Until version change |

## API Surface

### SDK Public API (thermoworks-sdk)

Main class `ThermoworksCloud` with methods for: devices, channels, archives, events, alarms, sessions, calibration, firmware, history, user management, groups, notifications, temperature guide, search, sharing.

### CLI Commands (14)

`auth login/logout/status` · `devices` · `watch` · `events` · `archives` · `export` · `firmware` · `session start/end/clear` · `alarm set/clear` · `calibration` · `guide` · `copilot setup/status/remove` · `mcp start` · `demo`

### MCP Tools (7)

`get_devices` · `get_device` · `get_device_channels` · `get_average_temperature` · `get_events` · `get_archives` · `get_temperature_guide`

### VS Code Extension (15 commands)

Login/logout, refresh, start/stop sessions, configure alarms, open panel, set units, and more.

### Web Routes (10)

`/` · `/devices` · `/device/:serial` · `/events` · `/usage` · `/guide` · `/settings` · `/exports` · `/share/device/:serial` · `/share/archive/:serial/:archiveId`

## Testing

| Package | Test Files | Tests | Framework | Types |
|---------|-----------|-------|-----------|-------|
| sdk | 21 | 302 | vitest | Unit |
| cli | 14 | ~100 | vitest | Unit |
| web | 60 | 749 | vitest + jsdom + RTL | Unit + Component |
| vscode | 13 | ~80 | vitest | Unit |
| mcp | 1 | ~10 | vitest | Integration |
| **Total** | **109** | **~1,241** | | |

**CI Pipeline** (`ci.yml`): `pnpm install` → `pnpm -r build` → `pnpm -r test` → `pnpm -r typecheck`

**No coverage gate** enforced in CI.

## Security & Operations

### Security Posture

| Area | Status | Notes |
|------|--------|-------|
| Credential storage | ✅ Good | OS keychain via @github/keytar |
| Token refresh | ✅ Good | Auto-refresh before expiry |
| Input validation | ✅ Good | Serial regex, channel bounds, label sanitization |
| API key exposure | ⚠️ Acceptable | Firebase web API key is public by design |
| Token file fallback | ⚠️ Caution | Plaintext ~/.thermoworks/.token-cache.json when keytar unavailable |
| CSP/security headers | ❌ Missing | No Content-Security-Policy configured |
| HTTPS enforcement | N/A | GitHub Pages handles TLS |

### Deployment Model

- **Web**: GitHub Pages via `pages.yml` workflow
- **SDK/CLI**: npm publish with provenance via `release-*.yml` workflows
- **VS Code**: Marketplace publish via `vsce` with PAT
- **MCP**: npm publish alongside CLI

### Documentation

| Document | Status |
|----------|--------|
| Root README | ✅ Comprehensive (badges, products, dev guide) |
| Package READMEs | ✅ Present for all 5 packages |
| CONTRIBUTING.md | ✅ Present |
| SECURITY.md | ✅ Present |
| Architecture specs | ✅ 6 spec docs in docs/specs/ |
| Changelogs | ⚠️ SDK only |
| OpenAPI spec | ❌ None |
| ADRs | ❌ None |

---

## Gap Analysis

### [XRAY-001] Duplicated API client between SDK and Web

- **Category**: Missing abstractions
- **Severity**: Medium
- **Location**: `packages/web/src/lib/api.ts` (1464 lines) vs `packages/sdk/src/client.ts` (1330 lines)
- **Evidence**: Web client reimplements Firestore parsing, auth, device fetching independently from the SDK. Both have `parseArchive`, `parseArchiveChannel`, `getArchives`, etc.
- **Impact**: Bugs fixed in one must be manually ported to the other (e.g., the v/ts/u field name fix needed in both). Double maintenance cost.
- **Fix**: Refactor web to use SDK directly (via browser-compatible build) or extract shared Firestore parsing into a shared package.
- **Effort**: L

### [XRAY-002] TemperatureChart.tsx is complex and fragile

- **Category**: Architecture violations
- **Severity**: Medium
- **Location**: `packages/web/src/components/TemperatureChart.tsx` (464 lines)
- **Evidence**: Single component handles: data transformation, zoom state, brush state, overlay management, threshold lines, downsampling, export, tooltip formatting. Multiple recent bugs (invisible lines, broken export).
- **Impact**: Every chart bug requires understanding 500 lines of tightly coupled state.
- **Fix**: Extract into sub-components: `ChartToolbar`, `ChartCanvas`, `useChartData` hook, `useChartZoom` hook.
- **Effort**: M

### [XRAY-003] No end-to-end or integration tests

- **Category**: Missing tests
- **Severity**: Medium
- **Location**: All packages
- **Evidence**: No Playwright, Cypress, or browser automation. MCP has only 1 test file. No contract tests against the real API shape.
- **Impact**: Runtime bugs (like the recentReadings parsing, chart color issues) only found by manual testing.
- **Fix**: Add Playwright E2E for critical web flows; add API contract snapshot tests for Firestore response parsing.
- **Effort**: L

### [XRAY-004] No coverage gate in CI

- **Category**: Missing tests
- **Severity**: Low
- **Location**: `.github/workflows/ci.yml`
- **Evidence**: CI runs tests but doesn't enforce minimum coverage. Coverage configs exist in packages but aren't uploaded or gated.
- **Impact**: Coverage can silently regress.
- **Fix**: Add coverage reporting step and minimum threshold (e.g., 70%).
- **Effort**: S

### [XRAY-005] Cloud Function history (requestRetrieveInstrumentHistory) returns 500

- **Category**: Operational gaps
- **Severity**: High
- **Location**: `packages/web/src/lib/api.ts:1401-1425`, ThermoWorks Cloud backend
- **Evidence**: Tested all 12 devices - all return HTTP 500 INTERNAL from the Cloud Function. BigQuery data exists but is inaccessible.
- **Impact**: No device temperature history chart beyond the ~10 archive readings. Users see "No history data" on the device detail page.
- **Fix**: External - ThermoWorks Cloud backend issue. Locally: improve fallback messaging, potentially cache/aggregate archive readings across sessions for a richer history view.
- **Effort**: S (local workaround) / External (root fix)

### [XRAY-006] Archive recentReadings limited to ~10 data points

- **Category**: Scalability ceilings
- **Severity**: Medium
- **Location**: Firestore archive documents
- **Evidence**: Each archive stores only the last ~10 readings in `channels[].recentReadings`. Full history is in BigQuery (inaccessible due to XRAY-005).
- **Impact**: Session charts show only ~30 seconds of data, making them nearly useless for monitoring multi-hour cooking sessions.
- **Fix**: When Cloud Function works, prefer it. Meanwhile, aggregate readings across multiple archives for a fuller picture, or query the Firestore history subcollection if it has data for other device types.
- **Effort**: M

### [XRAY-007] No Content-Security-Policy headers

- **Category**: Security gaps
- **Severity**: Low
- **Location**: `packages/web/vite.config.ts`
- **Evidence**: No CSP configuration. The web app makes requests to 5 different Google/Firebase domains.
- **Impact**: XSS risk is low (no user-generated HTML), but CSP is a defense-in-depth measure.
- **Fix**: Add CSP meta tag or headers config allowing only the known Firebase domains.
- **Effort**: S

### [XRAY-008] Debug console.log statements left in production code

- **Category**: Stale code
- **Severity**: Low
- **Location**: `packages/web/src/lib/api.ts` (lines with `if (isDev) console.log(...)`)
- **Evidence**: Debug logging for `[getHistory]` and `[getArchives]` added during diagnosis was committed.
- **Impact**: Console noise in dev mode; minor but unprofessional.
- **Fix**: Remove the diagnostic `console.log`/`console.warn` statements or gate behind a `DEBUG` flag.
- **Effort**: S

### [XRAY-009] web/lib/api.ts is a 1464-line god file

- **Category**: Architecture violations
- **Severity**: Medium
- **Location**: `packages/web/src/lib/api.ts`
- **Evidence**: Contains: auth logic, token management, Firestore field parsing utilities, ALL API methods (devices, channels, archives, events, alarms, sessions, calibration, firmware, groups, notifications, usage, sharing, history), plus type definitions.
- **Impact**: Hard to navigate, test in isolation, or modify without risk. Every web feature change touches this file.
- **Fix**: Split into: `auth.ts`, `firestore-helpers.ts`, `devices-api.ts`, `archives-api.ts`, `events-api.ts`, etc.
- **Effort**: M

### [XRAY-010] Channel color "none" not handled in DeviceCard history (dashboard)

- **Category**: Missing validation
- **Severity**: Low
- **Location**: `packages/web/src/components/DeviceCard.tsx` uses archive channels
- **Evidence**: The TemperatureChart now handles "none" color, but any future component using channel colors directly could hit the same issue.
- **Impact**: Low - current chart is fixed, but pattern could recur.
- **Fix**: Normalize color at parse time in `parseArchiveChannel` / `parseChannel` - convert "none"/"transparent"/"" to null.
- **Effort**: S

---

## Summary

```
X-Ray complete: thermoworks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tech: TypeScript / React+Vite / Node.js >=18
Modules: 5 packages, ~19,958 lines
Tests: ~1,241 tests (no coverage gate)
Gaps found: 0 critical, 1 high, 5 medium, 4 low

Report: docs/xray/xray-report-2026-06-10.md
```
