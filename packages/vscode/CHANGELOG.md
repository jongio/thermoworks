# Changelog

## 0.1.0 (2026-06-05)

### Features

- Display real-time ThermoWorks device temperatures in the VS Code status bar
- Auto-refresh on configurable interval (default 60s, minimum 15s)
- Shared credentials with the `thermoworks` CLI via OS keychain
- Commands: Login, Logout, Refresh Temperatures
- Rich Markdown tooltips with per-device/channel breakdown
- Exponential backoff on network failures
- VS Code SecretStorage + keytar dual-store for credential resilience
