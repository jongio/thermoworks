# thermoworks

> **Disclaimer:** This project is not affiliated with, endorsed by, or connected to [ThermoWorks](https://www.thermoworks.com/) in any way. It is an unofficial, community-built tool created by ThermoWorks customers for personal use.

CLI for [ThermoWorks Cloud](https://cloud.thermoworks.com/) — authenticate, inspect your devices, and show live temperatures in the GitHub Copilot CLI statusline.

![ThermoWorks statusline in GitHub Copilot CLI](https://raw.githubusercontent.com/jongio/thermoworks/main/docs/images/statusline.png)

![ThermoWorks statusline with per-channel display](https://raw.githubusercontent.com/jongio/thermoworks/main/docs/images/statusline-channels.png)

## Usage

Run via `npx` — no global install needed:

```bash
npx thermoworks --help
```

Or install globally if you prefer:

```bash
npm install -g thermoworks
```

## Getting Started

### 1. Sign in

```bash
npx thermoworks auth login
```

The CLI prompts for your ThermoWorks Cloud email and password, verifies them, then stores them in your OS keychain.

```bash
npx thermoworks auth status
```

Runtime commands also accept `THERMOWORKS_EMAIL` and `THERMOWORKS_PASSWORD`; when both are set, they take precedence over keychain credentials.

### 2. Run the Copilot setup wizard

```bash
npx thermoworks copilot setup
```

The wizard walks through the full Copilot statusline setup flow:

1. **Fetch devices and channels** from your ThermoWorks Cloud account.
2. **Pick devices** with an interactive checkbox list that shows each device label, serial number, and current average temperature.
   - Controls: `↑`/`↓` to move, `Space` to toggle, `A` to select all, `Enter` to continue.
3. **Choose channels for multi-channel devices**.
   - Single-channel devices are stored as `"avg"` automatically.
   - Multi-channel devices show another checkbox list with `Average (...)` plus one entry per channel, including the live reading.
   - If you select `Average`, the saved config uses `"avg"`. Otherwise it stores the selected channel numbers.
4. **Save the ThermoWorks config** to `~/.thermoworks/config.json`.
5. **Optionally update GitHub Copilot CLI** by writing a managed `statusLine` command into `~/.copilot/settings.json`.
   - If another statusline already exists and it was not created by `thermoworks`, the CLI asks before overwriting it.
   - If you skip this step, you can still run `thermoworks copilot status` manually.

### 3. Done

Once configured, GitHub Copilot CLI can call:

```bash
npx thermoworks copilot status
```

Example output:

```text
🔥 Name:temp · Name:temp
🔥 RFX Gateway:189°F · Brisket:203°F · Ambient:271°F
```

The CLI caches readings for 30 seconds so the statusline does not re-fetch on every repaint.

## Configuration

The setup wizard writes config to `~/.thermoworks/config.json`.

### Schema

```json
{
  "devices": [
    {
      "serial": "M100009168",
      "label": "RFX Gateway",
      "channels": "avg"
    },
    {
      "serial": "M100005982",
      "label": "Signals",
      "channels": [1, 3]
    }
  ],
  "refreshSeconds": 30
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `devices` | `Array<{ serial: string; label: string; channels: number[] \| "avg" }>` | Devices to show in the Copilot statusline |
| `devices[].serial` | `string` | ThermoWorks device serial number |
| `devices[].label` | `string` | Label used in output and setup summaries |
| `devices[].channels` | `number[] \| "avg"` | Specific 1-based channel numbers to show, or `"avg"` to display the average temperature across temperature channels |
| `refreshSeconds` | `number` | API cache duration in seconds (default: 30) |

If the file is missing, the CLI falls back to an empty device list with a 30-second cache until you run setup.

## Commands

### `thermoworks auth login`

Prompt for ThermoWorks Cloud credentials, verify them, and save them to the system keychain.

```bash
npx thermoworks auth login
```

### `thermoworks auth logout`

Remove saved credentials from the system keychain.

```bash
npx thermoworks auth logout
```

### `thermoworks auth status`

Show the current authentication state.

```bash
npx thermoworks auth status
```

Possible output includes:

- `Logged in as you@example.com`
- `Stored email: you@example.com (password missing)`
- `Not logged in. Run: thermoworks auth login`

### `thermoworks alarm set`

Set alarm thresholds on a device channel. At least one of `--high` or `--low` is required.

```bash
npx thermoworks alarm set <serial> --channel <1-9> --high <temp> --low <temp>
```

### `thermoworks alarm clear`

Clear alarm thresholds on a device channel.

```bash
npx thermoworks alarm clear <serial> --channel <1-9>
```

### `thermoworks calibration <serial>`

Show NIST-traceable calibration data for a device.

```bash
npx thermoworks calibration M100009168
```

### `thermoworks copilot setup [--dev]`

Run the interactive setup wizard.

```bash
npx thermoworks copilot setup
```

Use `--dev` to write a local `node ...\dist\index.js copilot status` command instead of the default production command selection.

```bash
npx thermoworks copilot setup --dev
```

### `thermoworks copilot status`

Print the configured statusline output.

```bash
npx thermoworks copilot status
```

Notes:
- If no credentials are available, it exits quietly.
- If no devices are configured, it prints nothing.
- It prefixes output with `🔥` and joins readings with ` · `.

### `thermoworks copilot remove`

Remove the managed `statusLine` entry from `~/.copilot/settings.json`.

```bash
npx thermoworks copilot remove
```

Notes:
- If no settings file exists, it reports that nothing needs to be removed.
- If the existing statusline was not created by `thermoworks`, it leaves it untouched.

### `thermoworks devices`

List all devices visible in your ThermoWorks Cloud account.

```bash
npx thermoworks devices
```

Example output:

```text
Found 2 devices:

  RFX Gateway  (rfx)  [online]  🔋 92%  last seen just now
  Signals  (signals)  [offline]  last seen 12m ago
```

### `thermoworks watch`

Continuously monitor temperatures with live refresh.

```bash
npx thermoworks watch
npx thermoworks watch --device M100009168 --interval 5
```

Options:
- `--device SN` — Watch a specific device by serial number
- `--interval N` — Refresh interval in seconds (default: 10)

### `thermoworks events`

Show device event history (alarms, status changes).

```bash
npx thermoworks events
npx thermoworks events --device M100009168 --limit 50
npx thermoworks events --type alarm --json
```

Options:
- `--device SN` - Filter to a specific device by serial number
- `--type TYPE` - Filter by event type (e.g., `alarm`, `status`, `connection`)
- `--limit N` - Maximum number of events to return

### `thermoworks archives <serial>`

List archived sessions for a device.

```bash
npx thermoworks archives M100009168
npx thermoworks archives M100009168 --id <archive-id> --limit 10
```

### `thermoworks firmware`

Show firmware versions and available updates for all devices.

```bash
npx thermoworks firmware
npx thermoworks firmware --device M100009168
```

### `thermoworks data-usage`

Show account data storage usage. Use `--by-device` for a per-device breakdown sorted by size.

```bash
npx thermoworks data-usage
# Account data usage: 12.4 MB

npx thermoworks data-usage --by-device
# DEV-C  48.8 KB
# DEV-B   9.8 KB
# DEV-A   1.0 KB

npx thermoworks data-usage --json
npx thermoworks data-usage --by-device --json
```

Options:
- `--by-device` — Show per-device breakdown (device id + formatted size), sorted by size descending

### `thermoworks fan <serial>`

Show, configure, and toggle the Billows fan/blower controller on Signals devices.

```bash
npx thermoworks fan M100009168
# Fan controller for M100009168:
#   Connected:   yes
#   Connection:  enabled
#   Target temp: 225
#   Channel:     1
#   State:       1

npx thermoworks fan set M100009168 --target 225
# Fan target temperature set to 225 for M100009168.

npx thermoworks fan enable M100009168
# Fan controller enabled for M100009168.

npx thermoworks fan disable M100009168
# Fan controller disabled for M100009168.
```

### `thermoworks search <query>`

Full-text search across devices, accounts, or users.

```bash
npx thermoworks search "brisket"
#   AB1234  Pit Boss Smoker  (score: 0.95)
#   CD5678  Brisket Probe    (score: 0.82)

npx thermoworks search "brisket" --collection accounts --limit 5
npx thermoworks search "brisket" --json
```

Options:
- `--collection C` — Search collection: `device`, `accounts`, or `users` (default: `device`)
- `--limit N` — Max results to return (default: 20, max: 100)

### `thermoworks device rename <SERIAL> --name <TEXT>`

Rename a device.

```bash
npx thermoworks device rename M100009168 --name "Pit Boss Smoker"
# Renamed M100009168 to "Pit Boss Smoker".

npx thermoworks device rename M100009168 --name "Pit Boss Smoker" --json
```

### `thermoworks device reset-minmax <SERIAL> --channel <N>`

Reset the min/max readings for a specific channel (1 through 9).

```bash
npx thermoworks device reset-minmax M100009168 --channel 1
# Min/max reset for M100009168 channel 1.

npx thermoworks device reset-minmax M100009168 --channel 3 --json
```

### `thermoworks session start|end|clear`

Manage monitoring sessions on a device.

```bash
npx thermoworks session start <serial> --label "Brisket cook"
npx thermoworks session end <serial>
npx thermoworks session clear <serial> --yes
```

### `thermoworks export <serial>`

Export archive readings to CSV or JSON.

```bash
npx thermoworks export M100009168
npx thermoworks export M100009168 --archive <id> --format csv --output readings.csv
```

Options:
- `--archive ID` — Export a specific archive (default: latest)
- `--format FMT` — Output format: `csv` or `json` (default: `json`)
- `--output PATH` — Write to file (default: stdout)

### `thermoworks history <serial>`

Export historical time-series readings from BigQuery for post-cook analysis or data pipelines. Unlike `export` (which reads from a single archive session), `history` retrieves the full BigQuery time-series for a device.

```bash
npx thermoworks history M100009168
npx thermoworks history M100009168 --limit 100 --format csv --output readings.csv
npx thermoworks history M100009168 --format json
```

Options:
- `--limit N` — Show the N most recent readings
- `--format FMT` — Output format: `table`, `csv`, or `json` (default: `table`)
- `--output PATH` — Write to file (default: stdout)

### `thermoworks guide [category]`

Show the temperature guide (safe cooking temperatures).

```bash
npx thermoworks guide
npx thermoworks guide beef
```

### `thermoworks journal <add|list|show|rm>`

Keep a local logbook of finished cooks: what the cut was, its weight, how it turned out, and notes for next time. Entries are stored in `~/.thermoworks/journal.json`. No credentials required.

```bash
npx thermoworks journal add --title "Sunday brisket" --meat brisket --weight 12 --rating 4 --notes "Wrapped at 165"
npx thermoworks journal list
npx thermoworks journal show 9029it
npx thermoworks journal rm 9029it
```

Options:
- `add` flags: `--title` (required), `--meat`, `--weight` (pounds), `--rating` (1 to 5), `--notes`, `--device SN`, `--archive ID`.
- `--json` — On `list` and `show`, output entries as JSON.

Each entry gets a short id and a created timestamp. A missing or corrupt journal file is ignored rather than crashing.

### `thermoworks mcp start`

Start the MCP (Model Context Protocol) server for AI assistants. Runs over stdio.

```bash
npx thermoworks mcp start
```

Notes:
- Launched by an MCP client (not used interactively).
- Credentials resolved from env vars or OS keychain.
- Exposes 12 tools: `get_devices`, `get_device`, `get_device_channels`, `get_average_temperature`, `get_events`, `get_archives`, `get_temperature_guide`, `set_alarm`, `start_session`, `end_session`, `get_firmware_status`, `get_archive_detail`.
- See [MCP server README](../mcp/README.md) for client configuration.

### `thermoworks demo <high|low|normal>`

Show demo output with alarm styling. No credentials required.

```bash
npx thermoworks demo high    # red text
npx thermoworks demo low     # blue text
npx thermoworks demo normal  # no color
```

### Global options

| Flag | Description |
|------|-------------|
| `--json` | Output machine-readable JSON (for scripting) |
| `--no-channels` | Hide channel readings in `devices` output |
| `--help`, `-h` | Show the help message |
| `--version`, `-v` | Show the version number |

For detailed option docs, see the [full CLI reference](../../docs/cli-reference.md).

## Requirements

- Node.js `>= 18`
- A [ThermoWorks Cloud](https://cloud.thermoworks.com/) account with one or more connected devices
- [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli) if you want statusline integration
- OS keychain access for `auth login`, or `THERMOWORKS_EMAIL` + `THERMOWORKS_PASSWORD` for headless environments

## Reference

- [Full CLI reference](../../docs/cli-reference.md)
- [SDK package](../sdk)

## License

MIT
