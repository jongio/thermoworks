# Changelog

## 0.2.0 (2026-06-07)

### Features

- Shared `ClientManager` between status bar and tree provider (single SDK instance)
- Parallelize per-device channel and firmware fetches in tree provider
- Parallelize per-device channel fetches in status bar refresh
- Firmware update detection with orange warning at every tree level
- Activity bar badge count for devices with active alarms
- Demo mode with full panel simulation (fake devices, alarms, firmware alerts)

### Fixes

- Eliminate stale client references (use-after-close when status bar closes shared client)
- Fix config listener leak (recursive re-registration on config change)
- Require both email AND password match for client reuse (prevent stale sessions)

### Dependencies

- thermoworks-sdk@0.3.0 (shared alarm, config, credentials, format utilities)

## 0.1.0 (2026-06-05)

### Features

- Display real-time ThermoWorks device temperatures in the VS Code status bar
- Auto-refresh on configurable interval (default 60s, minimum 15s)
- Shared credentials with the `thermoworks` CLI via OS keychain
- Commands: Login, Logout, Refresh Temperatures
- Rich Markdown tooltips with per-device/channel breakdown
- Exponential backoff on network failures
- VS Code SecretStorage + keytar dual-store for credential resilience
