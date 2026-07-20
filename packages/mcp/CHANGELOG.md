# Changelog

> As of the 0.6.0 release, the MCP server is an **internal library bundled into
> the `thermoworks` CLI** and is no longer published as a standalone npm package.
> Run it with `thermoworks mcp start`. Further changes are tracked in the CLI
> CHANGELOG (`packages/cli/CHANGELOG.md`).

## 0.1.0 (2026-06-07)

### Features

- Initial release
- MCP server exposing ThermoWorks Cloud device data to AI assistants
- 7 tools: `get_devices`, `get_device`, `get_device_channels`, `get_average_temperature`, `get_events`, `get_archives`, `get_temperature_guide`
- Authentication via environment variables or OS keychain
- Stdio transport for MCP client integration
