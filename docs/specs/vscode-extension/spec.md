# ThermoWorks VS Code Extension

## Status
BUILDING

## Scope
P2 — Internal tooling / developer workflow improvement

## Summary
VS Code extension that displays real-time ThermoWorks device temperatures in the status bar, matching the Copilot CLI statusline functionality.

## Acceptance Criteria
- AC-1: Extension activates and shows a status bar item with temperature readings
- AC-2: Credentials shared with CLI via OS keychain (keytar) with VS Code SecretStorage as primary
- AC-3: Reads device config from `~/.thermoworks/config.json`
- AC-4: Auto-refreshes on configurable interval (default 30s)
- AC-5: Provides login/logout/refresh commands
- AC-6: Handles offline/error states gracefully (no crashes, shows fallback text)
- AC-7: Extension packagable as .vsix for VS Code Marketplace
- AC-8: Tooltip shows detailed device info when hovering status bar

## Architecture
- packages/vscode/ in the pnpm monorepo
- Bundles thermoworks-sdk via esbuild (no workspace: protocol in VSIX)
- Output: CommonJS (no "type": "module")
- extensionKind: ["ui"] (runs on local machine for keychain access)
- Persistent ThermoworksCloud client with session reuse and backoff

## Publishing
- Publisher: jongio
- Extension name: thermoworks
- Tool: @vscode/vsce
- Requires: Azure DevOps PAT with Marketplace (Publish) scope
