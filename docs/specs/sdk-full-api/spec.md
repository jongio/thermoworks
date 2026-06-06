# SDK Full API Expansion + VS Code Extension Architecture

## Status

PLANNING

## Overview

Expand thermoworks-sdk to cover the full discovered API surface (events, archives, calibration, firmware, accounts, callable functions), then build a fully-featured VS Code extension with React webview dashboard on top.

## Scope

**P1** — New features, API changes, user-facing behavior. >3 modules affected.

## Deliverables

### PR 1: SDK Full API Expansion
- Events API (device alerts, alarms, status changes)
- Archives API (historical sessions with readings, paginated)
- Calibration API (factory calibration records)
- Firmware API (version info)
- Account API (account metadata)
- Content API (temperature guide)
- Expanded Device/Channel types (all discovered fields)
- Callable functions (experimental, behind `.actions` namespace)
- Search API (Typesense)
- Full test coverage

### PR 2+: VS Code Extension Dashboard (architecture planned here, built separately)
- React + Vite webview
- Dashboard with live device readings
- Device detail with temperature charts
- Session history browser
- Events timeline
- Built iteratively in slices

## Architecture Decisions

### SDK Design

**Namespace approach** (per rubber-duck feedback):
```typescript
// Read-only Firestore APIs - main class
client.getUser()
client.getDevices()
client.getDevice(serial)
client.getDeviceChannel(serial, channel)
client.getEvents(filter?)
client.getArchives(serial, options?)
client.getCalibration(serial)
client.getFirmwareInfo(deviceType)
client.getAccount()
client.getTemperatureGuide()
client.search(query, collection, options?)

// Mutating callable functions - under .actions (experimental)
client.actions.startSession(serial, label?)
client.actions.endSession(serial)
client.actions.clearSession(serial)
client.actions.resetMinMax(serial, channel)
client.actions.shareDevicePublicly(serial)
client.actions.clearEvents(serial)
```

**Pagination for archives**:
```typescript
interface PaginationOptions {
  limit?: number;       // default 20
  startAfter?: string;  // cursor (document ID)
}

interface ArchiveListOptions extends PaginationOptions {
  from?: Date;
  to?: Date;
}
```

**Field confidence tiers**:
- High-confidence fields → typed properties on Device/Channel
- Low-confidence/internal fields → `raw?: Record<string, unknown>` escape hatch

### VS Code Extension Architecture

**Technology Stack:**
- React 19 + TypeScript
- Vite for webview bundling
- Recharts for temperature charts (acceptable bundle size, proven with React)
- CSS Variables bridge for VS Code theming (no deprecated @vscode/webview-ui-toolkit)
- Typed postMessage protocol with request IDs and error envelopes

**Key architecture constraints:**
1. Single data service in extension host — status bar and webview share one polling/cache layer
2. Webview is treated as untrusted — no credentials ever sent to React
3. Strict CSP with nonces
4. Lazy-load chart/history routes
5. Nested in packages/vscode/webview/ (not a separate package)

**Message Protocol:**
```typescript
// Request from webview → extension
{ id: string; type: "devices:list" | "device:get" | "events:list" | ... ; params?: unknown }

// Response from extension → webview
{ id: string; type: "success"; data: unknown }
{ id: string; type: "error"; error: { code: string; message: string } }

// Push from extension → webview (unsolicited updates)
{ type: "data:updated"; collection: string; data: unknown }
```

**Delivery slices:**
1. Dashboard + device cards (live readings)
2. Device detail with temperature charts
3. Events timeline
4. Session history with archive graphs
5. Temperature guide
6. Account info

## Acceptance Criteria (SDK PR)

- AC-1: `getEvents()` returns typed DeviceEvent[] filtered by account, supports limit/ordering
- AC-2: `getDeviceEvents(serial)` returns events for a specific device
- AC-3: `getArchives(serial, options?)` returns paginated Archive[] with cursor support
- AC-4: `getArchive(serial, archiveId)` returns full archive with channel readings
- AC-5: `getCalibration(serial)` returns CalibrationRecord[]
- AC-6: `getFirmwareInfo(deviceType)` returns FirmwareInfo
- AC-7: `getAccount()` returns Account with full metadata
- AC-8: `getTemperatureGuide()` returns structured guide data
- AC-9: Device type expanded with all high-confidence fields (20+ new fields)
- AC-10: DeviceChannel type expanded with new fields (estimatedAlarmStatus, color, enabled, etc.)
- AC-11: `client.actions.startSession()` calls callable function
- AC-12: `client.actions.endSession()` calls callable function
- AC-13: `client.actions.resetMinMax()` calls callable function
- AC-14: `search(query, collection, options)` calls Typesense search
- AC-15: All new methods have unit tests with mocked responses
- AC-16: All new types exported from package index
- AC-17: Existing tests continue to pass (no regressions)
- AC-18: TypeScript strict mode clean, lint clean

## Test Plan

| AC | Test File | Description |
|----|-----------|-------------|
| AC-1 | events.test.ts | Query events by account, verify type mapping |
| AC-2 | events.test.ts | Query events by device serial |
| AC-3 | archives.test.ts | Paginated archive list, cursor handling |
| AC-4 | archives.test.ts | Full archive with readings parsed |
| AC-5 | calibration.test.ts | Calibration record parsing |
| AC-6 | firmware.test.ts | Firmware info fetch |
| AC-7 | account.test.ts | Account metadata parsing |
| AC-8 | content.test.ts | Temperature guide parsing |
| AC-9 | client.test.ts | Extended device fields parsed |
| AC-10 | client.test.ts | Extended channel fields parsed |
| AC-11 | actions.test.ts | Session start callable |
| AC-12 | actions.test.ts | Session end callable |
| AC-13 | actions.test.ts | Reset min/max callable |
| AC-14 | search.test.ts | Typesense search |
| AC-15 | (all above) | Coverage gate |
| AC-16 | index.test.ts | Export verification |
| AC-17 | (existing) | Regression check |
| AC-18 | (build) | tsc + lint |

## Open Questions

None — all resolved through API exploration and gut-check.

## Gate Evidence

### Phase 1
```
GATE EVIDENCE:
  phase: 1
  gate: scope_and_plan
  scope: P1
  research: Full API exploration of cloud.thermoworks.com Firebase (see docs/api-reference.md)
  gut_check: rubber-duck agent invoked, key feedback incorporated:
    - Callable functions behind .actions namespace (experimental)
    - Pagination for archives
    - Field confidence tiers
    - Single data service for extension (no duplicate polling)
    - Ship VS Code extension in slices
  acceptance_criteria: 18
  test_plan: 14 test files mapped
```
