# CLI Reference

## `thermoworks auth login`

Authenticate with ThermoWorks Cloud. Prompts for your email and password, verifies the credentials against the cloud API, then saves them to your OS keychain.

**Usage**

```bash
npx thermoworks auth login
```

**Options**

None.

**Examples**

```bash
npx thermoworks auth login
```

**Notes**

- Prints `ThermoWorks Cloud Login` before prompting.
- Exits with an error if either prompt is left blank.
- Stores credentials in the system keychain after successful verification.

## `thermoworks auth logout`

Remove saved ThermoWorks credentials from the OS keychain.

**Usage**

```bash
npx thermoworks auth logout
```

**Options**

None.

**Examples**

```bash
npx thermoworks auth logout
```

**Notes**

- Prints `Credentials removed from system keychain.` when credentials were deleted.
- Prints `No credentials found in system keychain.` when nothing was stored.

## `thermoworks auth status`

Show the current authentication state.

**Usage**

```bash
npx thermoworks auth status
```

**Options**

None.

**Examples**

```bash
npx thermoworks auth status
```

**Notes**

- When both `THERMOWORKS_EMAIL` and `THERMOWORKS_PASSWORD` are set, runtime commands resolve credentials from those environment variables before checking the keychain.
- Possible output includes:
  - `Logged in as you@example.com`
  - `Stored email: you@example.com (password missing)`
  - `Not logged in. Run: thermoworks auth login`

## `thermoworks copilot setup [--dev] [--demo]`

Interactive wizard to configure the GitHub Copilot CLI statusline.

**Usage**

```bash
npx thermoworks copilot setup
npx thermoworks copilot setup --dev
npx thermoworks copilot setup --demo
```

**Options**

- `--dev` - Use a local `node <repo>\dist\index.js copilot status` command instead of the default production command selection.
- `--demo` - Skip credentials and device selection entirely; configure the statusline to show fake data that cycles through alarm states (normal → high → low) on each Copilot refresh. Useful for testing and screenshots.

**Examples**

```bash
npx thermoworks copilot setup
```

```bash
npx thermoworks copilot setup --dev
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Fetches all devices and channel readings before prompting.
- Device selection uses a checkbox list with current average temperatures.
- Multi-channel devices show a second checkbox list with `Average (...)` plus each channel label and live reading.
- Saves CLI config to `~/.thermoworks/config.json`.
- API responses are cached for 30 seconds to avoid excessive requests.
- The Copilot CLI statusline updates each time Copilot re-renders (on new prompts, responses, and state changes). Temperatures are not polled on a background timer.
- Optionally writes a managed `statusLine` entry to `~/.copilot/settings.json`.
- If `~/.copilot/settings.json` contains invalid JSON, setup stops and asks you to fix it manually.
- If an existing statusline is present and it was not created by `thermoworks`, the command prompts before overwriting it.

## `thermoworks copilot status [--demo]`

Output the configured temperature reading string for the Copilot statusline.

**Usage**

```bash
npx thermoworks copilot status
npx thermoworks copilot status --demo
```

**Options**

- `--demo` - Output fake demo data instead of real readings. Cycles through alarm states (normal → high → low) on each invocation. No credentials required.

**Examples**

```bash
npx thermoworks copilot status
```

**Notes**

- Reads `~/.thermoworks/config.json` and silently exits when no devices are configured.
- Uses a cache file in `~/.thermoworks/.cache/readings.json`. API responses are cached for 30 seconds to avoid excessive requests.
- The statusline updates each time Copilot CLI re-renders (on prompts, responses, and state changes), not on a background timer.
- Output format is:

```text
🔥 Name:temp · Name:temp
```

- When a channel's alarm is active, the reading is styled with ANSI escape codes:
  - **High alarm** — bright red (`\x1b[91m`)
  - **Low alarm** — bright blue (`\x1b[94m`)

  ![CLI low alarm](images/cli-alarm-low.png)

  ![CLI high alarm](images/cli-alarm-high.png)
- For entries configured as `"avg"`, the CLI averages temperature channels and excludes humidity channels.
- For channel-specific entries, labels come from the ThermoWorks channel label or fall back to `<device label> Ch<channel>`.
- On API failures it stays silent so the Copilot statusline does not spam errors.

## `thermoworks copilot remove`

Remove the `thermoworks`-managed statusline configuration from GitHub Copilot CLI settings.

**Usage**

```bash
npx thermoworks copilot remove
```

**Options**

None.

**Examples**

```bash
npx thermoworks copilot remove
```

**Notes**

- Only removes `statusLine` entries tagged with `_managedBy: "thermoworks"` or `"thermoworks-demo"`.
- Prints `Statusline is not managed by thermoworks. Not removing.` when the existing statusline belongs to something else.
- Prints `No settings file found. Nothing to remove.` when `~/.copilot/settings.json` does not exist.

## `thermoworks devices`

List all connected devices visible in your ThermoWorks Cloud account.

**Usage**

```bash
npx thermoworks devices
```

**Options**

None.

**Examples**

```bash
npx thermoworks devices
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Prints `No devices found.` when the account has no devices.
- Otherwise prints one line per device with the label or serial number, and includes any available type, status, battery percentage, and `last seen` age.

## `thermoworks demo <high|low|normal>`

Output demo temperature data with alarm styling. No credentials or device configuration required.

**Usage**

```bash
npx thermoworks demo high
npx thermoworks demo low
npx thermoworks demo normal
```

**Options**

None. The mode argument is required.

**Examples**

```bash
npx thermoworks demo high
# 🔥 Smoker:Pit:285°F · Smoker:Meat:205°F · Fridge:Internal:38°F  (red)

npx thermoworks demo low
# 🔥 Smoker:Pit:180°F · Smoker:Meat:120°F · Fridge:Internal:28°F  (blue)

npx thermoworks demo normal
# 🔥 Smoker:Pit:225°F · Smoker:Meat:165°F · Fridge:Internal:38°F  (no color)
```

**Notes**

- Useful for testing alarm styling, taking screenshots, or verifying terminal ANSI support.
- High mode uses bright red ANSI color; low mode uses bright blue.
- Normal mode outputs plain text with no ANSI escape codes.

## `thermoworks mcp start`

Start the MCP (Model Context Protocol) server over stdio. This exposes ThermoWorks device data to AI assistants like GitHub Copilot, Claude, and ChatGPT.

**Usage**

```bash
npx thermoworks mcp start
```

**Options**

None.

**Examples**

```bash
npx thermoworks mcp start
```

**Notes**

- The server runs over stdio — it is designed to be launched by an MCP client, not used interactively.
- Credentials are resolved from environment variables (`THERMOWORKS_EMAIL` + `THERMOWORKS_PASSWORD`) first, then from the OS keychain.
- If no credentials are available, the server exits with an error.
- Exposes 16 tools: `get_devices`, `get_device`, `get_device_channels`, `get_average_temperature`, `get_live_cook_snapshot`, `get_events`, `get_archives`, `get_archive_detail`, `get_temperature_guide`, `set_alarm`, `get_fan_state`, `set_fan_target`, `set_fan_enabled`, `start_session`, `end_session`, `get_firmware_status`.
- Errors from the ThermoWorks SDK are sanitized before being returned to the client.
- Add to your MCP client config (e.g., `~/.copilot/settings.json`):

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

## `thermoworks alarm set`

Set alarm thresholds on a device channel. At least one of `--high` or `--low` must be specified.

**Usage**

```bash
npx thermoworks alarm set <SERIAL> --channel <1-9> --high <temp> --low <temp>
```

**Options**

- `--channel <1-9>` - (Required) Channel number to set the alarm on.
- `--high <temp>` - High alarm threshold temperature.
- `--low <temp>` - Low alarm threshold temperature.
- `--json` - Output the updated alarm state as JSON.

**Examples**

```bash
npx thermoworks alarm set ABC123 --channel 1 --high 275 --low 200
# Alarm set on ABC123:
#   Channel 1  high=275°F  low=200°F

npx thermoworks alarm set ABC123 --channel 2 --high 165
# Alarm set on ABC123:
#   Channel 2  high=165°F
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- At least one of `--high` or `--low` must be provided; you can set both in a single call.
- Channel must be an integer from 1 to 9.
- After setting the alarm, the command reads back and displays the confirmed alarm state.

## `thermoworks alarm clear`

Clear alarm thresholds on a device channel, disabling both high and low alarms.

**Usage**

```bash
npx thermoworks alarm clear <SERIAL> --channel <1-9>
```

**Options**

- `--channel <1-9>` - (Required) Channel number to clear alarms on.
- `--json` - Output the updated alarm state as JSON.

**Examples**

```bash
npx thermoworks alarm clear ABC123 --channel 1
# Alarms cleared on ABC123:
#   Channel 1  alarms disabled
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Disables both high and low alarms on the specified channel.
- After clearing, the command reads back and displays the confirmed alarm state.

## `thermoworks archives`

List or inspect archived cooking sessions for a device.

**Usage**

```bash
npx thermoworks archives <SERIAL> [--id ID] [--limit N]
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--id ID` - Show detailed view of a specific archive by ID.
- `--limit N` - Maximum number of archives to list.
- `--json` - Output as JSON.

**Examples**

```bash
npx thermoworks archives ABC123
# Found 3 archives:
#
#   Weekend Brisket
#     Start: 6/1/2026, 8:00:00 AM  Duration: 12h 30m  Readings: 750
#     ID: arch-001
#
#   Pork Shoulder
#     Start: 5/28/2026, 7:15:00 AM  Duration: 9h 45m  Readings: 585
#     ID: arch-002

npx thermoworks archives ABC123 --id arch-001
# Archive: Weekend Brisket
#   ID:       arch-001
#   Start:    6/1/2026, 8:00:00 AM
#   End:      6/1/2026, 8:30:00 PM
#   Duration: 12h 30m
#   Readings: 750
#
#   Channels:
#     Pit: min=215°F max=285°F last=250°F
#     Meat: min=38°F max=205°F last=205°F

npx thermoworks archives ABC123 --limit 5 --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Without `--id`: lists archives showing label, start time, duration, and reading count.
- With `--id`: shows detailed view including per-channel min/max/last values.
- Prints `No archives found.` when the device has no archived sessions.

## `thermoworks stats`

Summarize a device's archived cook sessions into aggregate metrics.

**Usage**

```bash
npx thermoworks stats <SERIAL> [--limit N] [--json]
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--limit N` - Summarize only the N most recent archives.
- `--json` - Output as JSON. Durations are reported in seconds and dates as ISO strings.

**Examples**

```bash
npx thermoworks stats ABC123
# Cook statistics for ABC123
#
#   Archived sessions:   3
#   Sessions with times: 2
#   Total cook time:     22h 15m
#   Average cook time:   11h 7m
#   Median cook time:    11h 7m
#   Total readings:      1335
#   Longest cook:        12h 30m  (Weekend Brisket)
#   Shortest cook:       9h 45m  (Pork Shoulder)
#   First session start: 5/28/2026, 7:15:00 AM
#   Last session end:    6/1/2026, 8:30:00 PM

npx thermoworks stats ABC123 --limit 50 --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Archives without a recorded start and end are counted in the session total but left out of the duration figures.
- The median averages the two middle values when the duration count is even.
- Prints `No archives found.` when the device has no archived sessions.

## `thermoworks calibration`

Show NIST-traceable calibration data for a device, including low-point adjustments and high-point reference measurements.

**Usage**

```bash
npx thermoworks calibration <SERIAL>
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--json` - Output as JSON.

**Examples**

```bash
npx thermoworks calibration ABC123
# Calibration: CAL-2026-001
#   Date:        January 15, 2026
#   Technician:  J. Smith
#   Reference:   NIST-traceable reference thermometer
#   Accuracy:    ±0.05°F
#   Result:      PASS
#
#   Low-Point Adjustments
#   Ch  Value       Reference   Deviation   Trim      Result
#   ----------------------------------------------------------
#   1   32.1°F      32.0°F      +0.1°F      -0.1      PASS
#   2   32.0°F      32.0°F      +0.0°F      -         PASS
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Displays calibration records with date, technician, manager, reference instrument, and stated accuracy.
- Measurement points are displayed in a table showing channel, measured value, reference value, deviation, trim adjustment, and pass/fail result.
- Results are color-coded: green for PASS, red for FAIL.
- Prints `No calibration records found for <serial>.` when no records exist.

## `thermoworks events`

Show device event history including alarms, status changes, and connectivity events.

**Usage**

```bash
npx thermoworks events [--device SERIAL] [--type TYPE] [--limit N]
```

**Options**

- `--device SERIAL` - Filter events to a specific device by serial number.
- `--type TYPE` - Filter by event type (e.g., `alarm`, `status`, `connection`).
- `--limit N` - Maximum number of events to return.
- `--json` - Output as JSON.

**Examples**

```bash
npx thermoworks events
# Found 5 events:
#
#   [CRITICAL] alarm  ABC123  2 minutes ago  250 → 285
#   [WARNING] alarm  ABC123  15 minutes ago  200 → 180
#   [INFO] connection  DEF456  1 hour ago

npx thermoworks events --device ABC123 --limit 10

npx thermoworks events --type alarm --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Events are displayed with a severity badge: `[CRITICAL]` (red), `[WARNING]` (yellow), or `[INFO]`.
- Each event shows: severity, event type, device serial, relative time, and value change (if applicable).
- Prints `No events found.` when no events match the filters.

## `thermoworks export`

Export archive readings to CSV or JSON format. Outputs to stdout by default, or writes to a file with `--output`.

**Usage**

```bash
npx thermoworks export <SERIAL> [--archive ID] [--format csv|json] [--output PATH]
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--archive ID` - Export a specific archive by ID. Defaults to the latest archive.
- `--format csv|json` - Output format. Defaults to `json`.
- `--output PATH` - Write to a file instead of stdout.

**Examples**

```bash
npx thermoworks export ABC123
# [
#   { "timestamp": "2026-06-01T08:00:00.000Z", "channel": "Pit", "value": 225, "units": "F" },
#   { "timestamp": "2026-06-01T08:00:00.000Z", "channel": "Meat", "value": 38, "units": "F" },
#   ...
# ]

npx thermoworks export ABC123 --format csv
# timestamp,channel,value,units
# 2026-06-01T08:00:00.000Z,Pit,225,F
# 2026-06-01T08:00:00.000Z,Meat,38,F

npx thermoworks export ABC123 --archive arch-001 --format csv --output brisket.csv
# Exported 750 readings to brisket.csv
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Without `--archive`, exports the most recent archive for the device.
- Readings are flattened into rows with timestamp, channel label, value, and units.
- Rows are sorted by timestamp ascending.
- CSV fields containing commas, quotes, or newlines are properly escaped.
- When writing to a file, a summary line is printed to stderr (not stdout) so piping works correctly.
- Exits with an error if no archives are found for the device.

## `thermoworks history`

Export historical time-series readings from BigQuery for post-cook analysis or data pipelines. Unlike `export` (which reads from a single archive session), `history` retrieves the full BigQuery time-series for a device.

**Usage**

```bash
npx thermoworks history <SERIAL> [--limit N] [--format table|csv|json] [--output PATH]
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--limit N` - Show the N most recent readings.
- `--format table|csv|json` - Output format. Defaults to `table`. When the global `--json` flag is active and no explicit `--format` is given, defaults to `json`.
- `--output PATH` - Write to a file instead of stdout.

**Examples**

```bash
npx thermoworks history ABC123
# Timestamp                  Value  Units  Trend
# 2026-06-01T08:00:00.000Z  225    F      ▁
# 2026-06-01T08:01:00.000Z  226    F      ▁█

npx thermoworks history ABC123 --limit 100 --format csv
# timestamp,value,units
# 2026-06-01T08:00:00.000Z,225,F
# 2026-06-01T08:01:00.000Z,226,F

npx thermoworks history ABC123 --format json
# {
#   "deviceId": "ABC123",
#   "readings": [
#     {
#       "timestamp": "2026-06-01T08:00:00.000Z",
#       "value": 225,
#       "units": "F"
#     }
#   ]
# }

npx thermoworks history ABC123 --limit 50 --format csv --output brisket.csv
# Wrote 50 readings to brisket.csv.
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Readings are a flat list of `{ timestamp, value, units }` from the BigQuery time-series API.
- `--limit N` takes the N most recent readings from the end of the chronological list.
- Table output includes a compact sparkline per row so trend shape is visible in the terminal.
- When the output format is `table` and no readings exist, prints `No history available for <SERIAL>.`
- When writing to a file, a summary line is printed to stderr (not stdout) so piping works correctly.

## `thermoworks firmware`

Show firmware versions for all devices and indicate whether updates are available.

**Usage**

```bash
npx thermoworks firmware [--device SERIAL]
```

**Options**

- `--device SERIAL` - Check firmware for a specific device only.
- `--json` - Output as JSON.

**Examples**

```bash
npx thermoworks firmware
# Smoker (Signals)    firmware: 2.1.0  latest: 2.2.0  ⚠️  UPDATE AVAILABLE
# Fridge (TempLog)    firmware: 1.5.3  latest: 1.5.3  ✓  UP TO DATE

npx thermoworks firmware --device ABC123 --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Only checks devices that report both a device type and firmware version.
- Fetches the latest available firmware per device type in parallel.
- Update available status is shown in yellow; up-to-date status in green.
- Prints `No devices with firmware information found.` when no devices have firmware data.

## `thermoworks data-usage`

Show total account data storage usage.

**Usage**

```bash
npx thermoworks data-usage [--by-device]
```

**Options**

- `--by-device` - Show per-device breakdown (device id + formatted size) sorted by size descending.
- `--json` - Output as JSON. Returns `DataUsage` for total view, `DeviceDataUsage[]` for `--by-device`.

**Examples**

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

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Prints `No device data usage.` when no devices have data (with `--by-device`).
- Zero bytes total is displayed as `0 B`.

## `thermoworks fan <SERIAL>`

Show the current fan/blower controller state for a Signals device.

**Usage**

```bash
npx thermoworks fan <SERIAL>
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--json` - Output as JSON (the raw `FanSettings` object, or `null` if no fan).

**Examples**

```bash
npx thermoworks fan ABC123
# Fan controller for ABC123:
#   Connected:   yes
#   Connection:  enabled
#   Target temp: 225
#   Channel:     1
#   State:       1

npx thermoworks fan ABC123 --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Prints `No fan controller found for device <SERIAL>.` when the device has no fan.
- With `--json`, outputs the `FanSettings` object or `null`.

## `thermoworks fan set <SERIAL> --target <temp>`

Set the fan controller target temperature.

**Usage**

```bash
npx thermoworks fan set <SERIAL> --target <temp>
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--target <temp>` - (Required) Target temperature. Must be a finite number.
- `--json` - Output as JSON (the `ActionResult` object).

**Examples**

```bash
npx thermoworks fan set ABC123 --target 225
# Fan target temperature set to 225 for ABC123.

npx thermoworks fan set ABC123 --target 225 --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Exits with an error if `--target` is missing or the value is not a finite number.
- Exits with an error if the operation fails (e.g., device offline).

## `thermoworks fan enable <SERIAL>`

Enable the fan controller connection on a device.

**Usage**

```bash
npx thermoworks fan enable <SERIAL>
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--json` - Output as JSON (the `ActionResult` object).

**Examples**

```bash
npx thermoworks fan enable ABC123
# Fan controller enabled for ABC123.
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Exits with an error if the operation fails.

## `thermoworks fan disable <SERIAL>`

Disable the fan controller connection on a device.

**Usage**

```bash
npx thermoworks fan disable <SERIAL>
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--json` - Output as JSON (the `ActionResult` object).

**Examples**

```bash
npx thermoworks fan disable ABC123
# Fan controller disabled for ABC123.
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Exits with an error if the operation fails.

## `thermoworks search <query>`

Full-text search across devices, accounts, or users.

**Usage**

```bash
npx thermoworks search <query> [--collection device|accounts|users] [--limit N]
```

**Options**

- `<query>` - (Required) Search query. Multiple words are joined automatically.
- `--collection <value>` - Search collection: `device`, `accounts`, or `users` (default: `device`).
- `--limit <N>` - Max results per page (default: 20, max: 100). Must be an integer from 1 to 100.
- `--json` - Output the full `SearchResult` object as JSON.

**Examples**

```bash
npx thermoworks search "brisket"
#   AB1234  Pit Boss Smoker  (score: 0.95)
#   CD5678  Brisket Probe    (score: 0.82)

npx thermoworks search pit boss --collection device --limit 5

npx thermoworks search "chef" --collection users --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Searches the `device` collection by default.
- Displays one line per hit: id, a display label (from `label`, `name`, `serial`, or `email`), and the relevance score.
- Prints `No results found for "<query>".` when there are no hits.
- Exits with an error if `--collection` is not one of `device`, `accounts`, `users`.
- Exits with an error if `--limit` is not a valid integer between 1 and 100.

## `thermoworks guide`

Show the ThermoWorks temperature guide with safe cooking temperatures, organized by category.

**Usage**

```bash
npx thermoworks guide [category]
```

**Options**

- `[category]` - (Optional) Filter categories by name (case-insensitive substring match).
- `--json` - Output as JSON.

**Examples**

```bash
npx thermoworks guide
# 🥩  Beef & Lamb
#    ⚠ Pull: Remove 5°F before target
# 🐔  Poultry
#    ⚠ All poultry must reach 165°F internal
# 🐖  Pork
# 🐟  Seafood

npx thermoworks guide beef
# 🥩  Beef & Lamb
#    ⚠ Pull: Remove 5°F before target

npx thermoworks guide --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Categories include icons, labels, and optional warnings (pull temperature offsets, safety notices).
- The category filter is a case-insensitive substring match against category labels.
- Prints `No categories matching "<filter>".` when the filter has no matches.
- Prints `No temperature guide categories found.` when the guide data is empty.

## `thermoworks device rename <SERIAL> --name <TEXT>`

Rename a device label.

**Usage**

```bash
npx thermoworks device rename <SERIAL> --name <TEXT>
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--name <TEXT>` - (Required) New display name for the device.
- `--json` - Output as JSON (the `ActionResult` object).

**Examples**

```bash
npx thermoworks device rename ABC123 --name "Pit Boss Smoker"
# Renamed ABC123 to "Pit Boss Smoker".

npx thermoworks device rename ABC123 --name "Brisket Probe" --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Exits with an error if `--name` is missing.
- Exits with an error if the operation fails (e.g., device offline).

## `thermoworks device reset-minmax <SERIAL> --channel <N>`

Reset the min/max readings for a specific device channel.

**Usage**

```bash
npx thermoworks device reset-minmax <SERIAL> --channel <N>
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--channel <N>` - (Required) Channel number (1 through 9).
- `--json` - Output as JSON (the `ActionResult` object).

**Examples**

```bash
npx thermoworks device reset-minmax ABC123 --channel 1
# Min/max reset for ABC123 channel 1.

npx thermoworks device reset-minmax ABC123 --channel 3 --json
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Exits with an error if `--channel` is missing or outside the valid range (1 through 9).
- Exits with an error if the operation fails.

## `thermoworks session start`

Start a monitoring session on a device. Sessions group readings for later review as archives.

**Usage**

```bash
npx thermoworks session start <SERIAL> [--label TEXT]
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--label TEXT` or `-l TEXT` - Optional label for the session (e.g., "Weekend Brisket").
- `--json` - Output as JSON.

**Examples**

```bash
npx thermoworks session start ABC123 --label "Weekend Brisket"
# Session started for ABC123 ("Weekend Brisket").

npx thermoworks session start ABC123
# Session started for ABC123.
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- The label is optional but recommended for identifying sessions later in archives.
- Exits with an error if the session fails to start (e.g., device offline, session already active).

## `thermoworks session end`

End an active monitoring session on a device.

**Usage**

```bash
npx thermoworks session end <SERIAL>
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--json` - Output as JSON.

**Examples**

```bash
npx thermoworks session end ABC123
# Session ended for ABC123.
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Exits with an error if no active session exists for the device.

## `thermoworks session clear`

Clear all session data for a device. This action cannot be undone.

**Usage**

```bash
npx thermoworks session clear <SERIAL> [--yes]
```

**Options**

- `<SERIAL>` - (Required) Device serial number.
- `--yes` or `-y` - Skip the confirmation prompt.
- `--json` - Output as JSON (also skips confirmation prompt).

**Examples**

```bash
npx thermoworks session clear ABC123
# Clear all session data for ABC123? This cannot be undone. [y/N] y
# Session data cleared for ABC123.

npx thermoworks session clear ABC123 --yes
# Session data cleared for ABC123.
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Without `--yes`, prompts for confirmation before clearing.
- When `--json` is active, the confirmation prompt is skipped.
- Exits with an error if clearing fails.

## `thermoworks watch`

Continuously monitor device temperatures with a live-refreshing display. Clears the terminal and redraws on each refresh cycle.

**Usage**

```bash
npx thermoworks watch [--device SERIAL] [--interval N] [--json]
```

**Options**

- `--device SERIAL` - Watch a specific device by serial number. Without this flag, all devices are shown.
- `--interval N` - Refresh interval in seconds. Must be >= 1. Defaults to `10`.
- `--json` - Emit one newline-delimited JSON (NDJSON) object per refresh instead of the live display. Each frame has an ISO `timestamp` and a `devices` array; every device carries `serial`, `label`, `type`, `status`, `battery`, and a `channels` array with `number`, `label`, `value`, `units`, and `alarm` (`high`, `low`, or `normal`). The screen is not cleared, so output can be piped or appended to a file.

**Examples**

```bash
npx thermoworks watch
# ThermoWorks Watch  [7:30:00 PM]
# Refreshing every 10s  (Ctrl+C to exit)
#
#   Smoker  (Signals)  [online]
#     Pit       225°F
#     Meat      165°F
#   Fridge  (TempLog)  [online]
#     Internal  38°F

npx thermoworks watch --device ABC123 --interval 5

npx thermoworks watch --json --interval 5 | jq .
# {"timestamp":"2025-06-07T19:30:00.000Z","devices":[{"serial":"ABC123","label":"Smoker","type":"signals","status":"online","battery":87,"channels":[{"number":"1","label":"Pit","value":225,"units":"F","alarm":"normal"}]}]}
```

**Notes**

- Requires valid credentials from environment variables or the OS keychain.
- Clears the screen before each refresh and displays a timestamp header (human-readable mode only; `--json` does not clear the screen).
- Shows device label (or serial), type, status, and all enabled channels with current readings.
- Shows a compact sparkline beside channels when recent samples are available.
- Exits immediately with an error if `--device` is specified and no matching device is found.
- Press `Ctrl+C` to exit (handled by the global SIGINT handler).
- The `--interval` must be a positive number >= 1; values below 1 produce an error.

## Global Options

```text
--json           Output machine-readable JSON (for scripting)
--no-channels    Hide channel readings in devices output
--help, -h       Show help
--version, -v    Show version
```

### `--json`

Output machine-readable JSON instead of human-formatted text. Supported by most commands that display data (`devices`, `events`, `archives`, `stats`, `firmware`, `data-usage`, `fan`, `calibration`, `guide`, `history`, `search`, `alarm set`, `alarm clear`, `device rename`, `device reset-minmax`, `session start`, `session end`, `session clear`, `auth status`).

When active, commands write a single JSON value (object or array) to stdout with 2-space indentation. This is useful for scripting, piping to `jq`, or integrating with other tools.

```bash
npx thermoworks devices --json | jq '.[].serial'
npx thermoworks events --json --limit 5
npx thermoworks firmware --json
```

### `--no-channels`

Hide individual channel readings in `thermoworks devices` output. Only shows device-level information (label, type, status, battery, last seen) without listing each channel's temperature.

```bash
npx thermoworks devices --no-channels
```

## Shared Configuration

The CLI and VS Code extension share credentials and device configuration:

| File | Purpose |
|------|---------|
| OS Keychain (service: `thermoworks`) | Email and password — shared between CLI and VS Code extension |
| `~/.thermoworks/config.json` | Device/channel selections — used by both CLI statusline and VS Code status bar |

Sign in with either tool and both will see your credentials. Run `thermoworks copilot setup` to select devices — the VS Code extension reads the same config file.

### `thermoworks --help`

Show the top-level usage text.

**Usage**

```bash
npx thermoworks --help
npx thermoworks -h
thermoworks
```

**Examples**

```bash
npx thermoworks --help
```

**Notes**

- Running `thermoworks` with no arguments also prints the usage summary.
- Help is only implemented at the top level; subcommands do not provide dedicated `--help` handling.

### `thermoworks --version`

Print the CLI package version.

**Usage**

```bash
npx thermoworks --version
npx thermoworks -v
```

**Examples**

```bash
npx thermoworks --version
```

**Notes**

- Reads the version from the CLI package's `package.json`.
