# Changelog

## Unreleased

### Features (#125-#130)

- **Inline alarms** (#125): set and clear alarms directly from channel nodes in the tree
- **Events panel** (#125): dedicated `thermoworksEvents` view with per-device filtering, severity icons, and configurable limit
- **Device control** (#126): set fan target/enable on Signals devices, rename devices, reset min/max readings
- **Session management** (#127): clear session data with modal confirmation; active session timer displayed on device nodes
- **Temperature Guide** (#129): browsable reference for safe cooking temperatures via QuickPick
- **Average Temperature** (#129): shown as a detail node under each device
- **Data Usage** (#129): total and per-device usage under the Account node
- **Calibration** (#129): calibration records folder under each device
- **Account enrichment** (#129): account type and creation date from `getAccount()`
- **Getting Started walkthrough** (#130): four-step onboarding (sign in, find devices, set alarm, open chart)
- **`thermoworks.defaultDevice`** (#130): preferred device for status bar in single mode (by serial or label)
- **`thermoworks.streaming`** (#130): toggle live WebSocket streaming on/off; interval polling still works when disabled
- **`thermoworks.units`** (#130): display temperatures in auto (native), Fahrenheit, or Celsius with a pure `convertTemp` helper

### Changed

- Retired the `@thermoworks` chat participant (#128). AI access now lives in the MCP server; use `thermoworks mcp start` and `thermoworks copilot setup`

## 0.2.0

### Minor Changes

- [`50329e0`](https://github.com/jongio/thermoworks/commit/50329e0f2e0e4db0a214ec0e9db393cbafc35667) Thanks [@jongio](https://github.com/jongio)! - Parallelize per-device channel fetches in copilot status for faster output. Use shared alarm, credential, and config utilities from SDK. Fix static imports for --version flag and flaky time-dependent test.

## 0.1.0 (2026-06-05)

### Features

- Display real-time ThermoWorks device temperatures in the VS Code status bar
- Auto-refresh on configurable interval (default 60s, minimum 15s)
- Shared credentials with the `thermoworks` CLI via OS keychain
- Commands: Login, Logout, Refresh Temperatures
- Rich Markdown tooltips with per-device/channel breakdown
- Exponential backoff on network failures
- VS Code SecretStorage + keytar dual-store for credential resilience
