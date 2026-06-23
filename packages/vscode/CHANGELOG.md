# Changelog

## Unreleased

- Retired the `@thermoworks` chat participant. AI access to ThermoWorks data now lives in the MCP server; use `thermoworks mcp start` (and `thermoworks copilot setup`) so Copilot and agents can call the ThermoWorks MCP tools.

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
