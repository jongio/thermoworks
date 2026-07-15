# thermoworks-mcp

MCP (Model Context Protocol) server for ThermoWorks Cloud. Gives AI assistants like GitHub Copilot, Claude, and ChatGPT read access to device temperatures, events, archives, and firmware status, plus safe write actions for alarms and cooking sessions.

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
| `get_live_cook_snapshot` | Get one JSON snapshot with devices, channels, alarms, battery, firmware, and active session info |
| `get_alarm_targets` | List armed high/low alarm thresholds with current readings and alarming state |
| `get_events` | Get device events (alarms, status changes) |
| `get_archives` | Get historical session archives |
| `search_archives` | Search archives across all devices by label, date range, or text query |
| `get_archive_detail` | Get full detail for a specific session archive, including channel readings and duration |
| `get_temperature_history` | Get long-term time-series temperature readings for a device (for trend and time-to-done analysis) |
| `get_calibration` | Get NIST-traceable calibration records for a device (per-channel adjustments, deviations, pass/fail) |
| `get_data_usage` | Get account data storage usage (account total, or per-device with by_device) |
| `get_temperature_guide` | Get cooking temperature reference |
| `set_alarm` | Set or clear high/low alarm thresholds on a device channel |
| `get_fan_state` | Get the fan controller state for a device (connection, target temp, channel, level) |
| `set_fan_target` | Set the fan controller target temperature for a device |
| `set_fan_enabled` | Enable or disable the fan controller connection for a device |
| `start_session` | Start a new monitoring session on a device |
| `end_session` | End the active monitoring session on a device |
| `get_firmware_status` | Check firmware update status for all devices |
| `get_eta` | Predict when a probe will reach its target temperature from the current rate of change |
| `get_device_health_summary` | Get a prioritized health summary across all devices: alarms, offline/stale status, low battery, firmware updates. Supports `only_issues` to filter to devices needing attention |

## Guided Prompts

Prompts are user-initiated templates the assistant can run to get a starting point for common questions. They return a step-by-step plan that chains the tools above, so they add guidance without adding any tools.

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `diagnose_cook` | `serial` (optional) | Walk the live cook and report whether temps are climbing, stalled, or need attention, with next steps |
| `when_to_wrap` | `serial` (optional), `channel` (optional) | Evaluate wrap timing against the stall and call whether to wrap now, wait, or that the stall already broke |
| `food_safety_check` | `serial` (optional) | Confirm the cook cleared the danger zone in time and reached a safe internal temperature for the cut |

Leave `serial` empty and the prompt picks the device with an active cook.

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
