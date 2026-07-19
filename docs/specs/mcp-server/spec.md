# ThermoWorks MCP Server

## Status: shipped

Shipped in PR #49 (initial package) and PR #291 (guided cook prompts). The
server now exposes 24 tools + 3 prompts (a superset of the AC-2 list), launched
via `thermoworks mcp start`, with mocked-SDK handler tests. All acceptance
criteria below are satisfied.

## Overview

Add a Model Context Protocol (MCP) server as `packages/mcp` that exposes ThermoWorks Cloud device data to AI assistants. Launchable from the CLI via `thermoworks mcp start`.

## Scope: P1

New user-facing feature, new package + CLI integration.

## Architecture

- `packages/mcp` — standalone MCP server package (`thermoworks-mcp`)
  - Depends on `thermoworks-sdk` for data access
  - Depends on `@modelcontextprotocol/sdk` for MCP protocol
  - Stdio transport (standard for CLI-launched servers)
  - Reuses SDK credential resolution (env vars + keytar)
- `packages/cli` — adds `thermoworks mcp start` command
  - Imports and launches the MCP server from `thermoworks-mcp`

## Acceptance Criteria

- AC-1: `packages/mcp` package exists with proper build/test/typecheck scripts
- AC-2: MCP server exposes tools: get_devices, get_device, get_device_channels, get_average_temperature, get_events, get_archives, get_temperature_guide
- AC-3: Tools correctly call SDK client methods and return structured results
- AC-4: Auth uses SDK credential resolution (env vars → keytar); missing creds returns helpful error
- AC-5: CLI `thermoworks mcp start` command launches the MCP server on stdio
- AC-6: All existing tests continue to pass
- AC-7: typecheck and lint pass across the monorepo
- AC-8: Tests cover tool handler logic with mocked SDK client

## Test Plan

- Unit tests for each MCP tool handler (mocked SDK client)
- Integration test: server creation and tool listing
- CLI command parsing test
