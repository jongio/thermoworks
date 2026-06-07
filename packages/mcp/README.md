# thermoworks-mcp

MCP (Model Context Protocol) server for ThermoWorks Cloud. Exposes temperature device data to AI assistants like GitHub Copilot, Claude, and ChatGPT.

## Quick Start

```bash
# Install
npm install -g thermoworks

# Login (stores credentials in OS keychain)
thermoworks auth login

# Start MCP server
thermoworks mcp start
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_devices` | List all devices with status, battery, last seen |
| `get_device` | Get detailed info for a specific device |
| `get_device_channels` | Get temperature/sensor readings for a device |
| `get_average_temperature` | Get average temperature across device channels |
| `get_events` | Get device events (alarms, status changes) |
| `get_archives` | Get historical session archives |
| `get_temperature_guide` | Get cooking temperature reference |

## Authentication

Credentials are resolved in order:
1. Environment variables: `THERMOWORKS_EMAIL` and `THERMOWORKS_PASSWORD`
2. OS keychain (via `thermoworks auth login`)

## Configuration

Add to your MCP client config (e.g., `~/.copilot/settings.json`):

```json
{
  "mcpServers": {
    "thermoworks": {
      "command": "thermoworks",
      "args": ["mcp", "start"]
    }
  }
}
```

## License

MIT
