# thermoworks-sdk

## 0.6.0 (2026-07-09)

### Features

- Cook analytics and BBQ helpers: done-time prediction (`predictDoneTime`), stall and rapid-change detection (`detectStall`, `detectRapidChange`), FDA two-stage cooling (`assessCooling`), wrap advisor (`assessWrap`), annotated cook timeline (`buildCookTimeline`), device health diagnostics (`assessDeviceHealth`, `isChannelStale`), backwards cook planning (`planCook`), rub/brine scaling (`calculateSeasoning`), cook replay helpers, and pasteurization/carryover food-safety assessments (#134, #138, #150, and related).

## 0.5.1 (2026-06-28)

### Patch Changes

- Documentation corrections across packages (#152).

## 0.5.0 (2026-06-28)

### Changes

- Maintenance and dependency updates; released in lockstep with the VS Code live-charting and device-control work.

## 0.4.0 (2026-06-09)

### Features

- MCP server package added to the monorepo, consuming the SDK (#49).

### Fixes

- `getFirmwareInfo` returns `null` on a 404 instead of throwing.

## 0.3.0

### Minor Changes

- [`50329e0`](https://github.com/jongio/thermoworks/commit/50329e0f2e0e4db0a214ec0e9db393cbafc35667) Thanks [@jongio](https://github.com/jongio)! - Add shared alarm utilities (getChannelAlarmState, getChannelsAlarmState, escalateAlarm), shared config types and validation (StatuslineConfig, DeviceEntry, isValidDeviceEntry), shared credential contract (parseCredentialBlob, serializeCredentials, resolveEnvCredentials), formatTimeAgo utility, retry with exponential backoff for transient HTTP failures, parallel channel fetches via Promise.allSettled, 9 new API methods (getAccount, getEvents, getArchives, getArchive, getCalibration, getFirmwareInfo, getTemperatureGuide, search, getDeviceEvents), and hardened isValidDeviceEntry to reject empty channels.

## 0.2.2

### Patch Changes

- [`e0a1041`](https://github.com/jongio/thermoworks/commit/e0a104154f8899c1dd7da238b5c56e7c77ddd06d) Thanks [@jongio](https://github.com/jongio)! - Fix NaN token expiry loop, improve error handling and cache validation, migrate to @github/keytar, remove misleading refresh rate prompt from copilot setup

## 0.2.1

### Patch Changes

- [`06a542b`](https://github.com/jongio/thermoworks/commit/06a542b22be7acfbf46c9105e7f4b6ff8560c324) Thanks [@jongio](https://github.com/jongio)! - Add fire emoji favicon to GitHub Pages site. Clarify statusline refresh behavior in docs.

## 0.2.0

### Minor Changes

- [`3f9e94f`](https://github.com/jongio/thermoworks/commit/3f9e94f32f6dbf4e43f14c14322239e8728caf41) Thanks [@jongio](https://github.com/jongio)! - Initial public release — ThermoWorks Cloud CLI and SDK.
