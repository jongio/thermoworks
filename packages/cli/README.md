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

### `thermoworks alarm list`

List configured (armed) alarm thresholds. Without a serial it scans every device on
the account; pass a serial to scope to one device. Read-only, so it never changes any
settings. Handy for auditing what alarms are set before a cook.

```bash
npx thermoworks alarm list           # all devices
npx thermoworks alarm list <serial>  # one device
npx thermoworks alarm list --json    # machine-readable
```

Only channels with a high or low alarm armed are shown. With `--json`, prints an array
of `{ serial, deviceLabel, channel, channelLabel, alarmHigh, alarmLow }`.


### `thermoworks calibration <serial>`

Show NIST-traceable calibration data for a device, plus a recalibration due-date check based on a configurable interval (default 12 months).

```bash
npx thermoworks calibration M100009168
npx thermoworks calibration M100009168 --interval-months 6
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

Filter the list from the command line:

```bash
npx thermoworks devices --status online
npx thermoworks devices --type signals
npx thermoworks devices --type node,smoke        # match any (comma-separated)
npx thermoworks devices --label "Smoker"
npx thermoworks devices --serial ABC123
npx thermoworks devices --active-within 30        # seen in the last 30 minutes
```

Filter options:
- `--type T` — device type (e.g. `node`, `smoke`, `signals`). Comma-separated for match-any.
- `--status S` — status (e.g. `online`, `offline`). Comma-separated for match-any.
- `--label L` — exact device label. Comma-separated for match-any.
- `--serial SN` — serial number. Comma-separated for match-any.
- `--active-within N` — only devices seen within N minutes.

Filters combine (all must match) and work with `--json` and `--no-channels`. Type,
status, label, and serial values are matched exactly.

### `thermoworks temp <serial>`

Print a single temperature value to stdout, for shell scripts and automation. Without
`--channel` it prints the device average temperature; with `--channel N` it prints that
channel's current reading. Human output is a bare number so you can capture or pipe it
directly.

```bash
npx thermoworks temp M100009168                # average, e.g. 203.5
npx thermoworks temp M100009168 --channel 2    # one channel
npx thermoworks temp M100009168 --json         # { serial, channel, value, units }

# use it in a shell conditional
if (( $(npx thermoworks temp M100009168) > 200 )); then echo "pull it"; fi
```

Exits non-zero if no reading is available.

### `thermoworks watch`

Continuously monitor temperatures with live refresh.

```bash
npx thermoworks watch
npx thermoworks watch --device M100009168 --interval 5
npx thermoworks watch --alert-before 5
npx thermoworks watch --bell
npx thermoworks watch --json | jq .
npx thermoworks watch --device M100009168 --record cook.csv
```

Options:
- `--device SN` — Watch a specific device by serial number
- `--interval N` — Refresh interval in seconds (default: 10)
- `--alert-before N` — Show a heads-up next to any channel that is within `N` degrees of its high alarm, before it actually alarms. Pair with `--bell` to also ring the bell while a channel is approaching
- `--bell` — Ring the terminal bell each refresh while any channel is alarming, or approaching its alarm when `--alert-before` is set (off by default)
- `--json` — Emit one NDJSON object per refresh (timestamp plus devices and channels with alarm state) instead of the live display, for piping into other tools
- `--record FILE` — Append each refresh to `FILE` while the display keeps running, building a time-series log of the cook
- `--record-format csv|json` — Record file format (default `csv`). CSV writes one row per channel with a header; JSON writes one NDJSON frame per refresh

### `thermoworks metrics`

Serve live temperatures as [Prometheus](https://prometheus.io/) metrics. Starts a small HTTP server that polls your devices on an interval and exposes the latest readings at `/metrics` in the Prometheus text exposition format.

```bash
npx thermoworks metrics
npx thermoworks metrics --host 0.0.0.0 --port 9464 --interval 15
npx thermoworks metrics --device M100009168
```

Options:
- `--host HOST` — Bind address (default: `127.0.0.1`)
- `--port N` — Listen port (default: `9464`)
- `--device SN` — Export a specific device by serial number
- `--interval N` — Poll interval in seconds (default: 10)

Exposed metrics:
- `thermoworks_channel_temperature` — current channel reading, labeled by `serial`, `device`, `channel`, `label`, and `unit`
- `thermoworks_channel_minimum` / `thermoworks_channel_maximum` — session min/max per channel
- `thermoworks_channel_alarm_high` / `thermoworks_channel_alarm_low` — alarm state (1 alarming, 0 clear), present only when the alarm is enabled
- `thermoworks_device_battery_percent` — device battery level
- `thermoworks_up` — 1 when the last poll succeeded, 0 otherwise
- `thermoworks_scrape_errors_total` — count of failed polls since start

Example Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: thermoworks
    static_configs:
      - targets: ["localhost:9464"]
```


When `--device` or `--interval` are omitted, `watch` falls back to the `device` and `watchInterval` defaults set with `thermoworks config` (see below).

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
npx thermoworks archives M100009168 --from 2026-01-01 --to 2026-01-31
```

Options:
- `--id ID` - Show one archive in detail
- `--limit N` - Maximum archives to fetch before filtering
- `--from DATE` - Only list archives starting on or after DATE
- `--to DATE` - Only list archives starting on or before DATE
- `--json` - Emit the list or detail as JSON

### `thermoworks stats <serial>`

Summarize a device's archived cook sessions: session count, total, average, and median cook time, longest and shortest cooks, total readings, and the overall date range. Archives without a recorded start and end are counted but left out of the duration figures.

```bash
npx thermoworks stats M100009168
npx thermoworks stats M100009168 --limit 50
npx thermoworks stats M100009168 --json
```

Options:
- `--limit N` — Summarize only the N most recent archives
- `--json` — Emit the stats as JSON (durations in seconds, dates as ISO strings)

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

### `thermoworks notifications`

Show account notification settings, and enable or disable individual alert channels.

```bash
npx thermoworks notifications
# Notification settings
#   Notifications enabled  on
#   Continuous alerts      off
#   Email alerts           on
#   SMS alerts             off
#   Device (app) alerts    on

npx thermoworks notifications --enable sms
npx thermoworks notifications --disable email
npx thermoworks notifications --json
```

Options:
- `--enable FIELD` — Turn a setting on
- `--disable FIELD` — Turn a setting off

Fields: `all` (master toggle), `continuous`, `email`, `sms`, `device`.

### `thermoworks account`

Show account details and the current billing plan.

```bash
npx thermoworks account
# Account
#   Name:       Jane's Kitchen
#   Account ID: acct-abc123
#   Type:       standard
#   Created:    March 15, 2024
#
# Billing plan
#   Plan:       Cloud Basic
#   Price:      Free
#   Devices:    3

npx thermoworks account --json
```

Prints `No billing plan on file.` when the account has no plan.

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

### `thermoworks session status [serial]`

Show which devices currently have an active monitoring session, with the session label
and how long it has been running. Read-only. Without a serial it scans every device; pass
a serial to scope to one.

```bash
npx thermoworks session status           # all devices
npx thermoworks session status <serial>  # one device
npx thermoworks session status --json    # machine-readable
```

With `--json`, prints an array of
`{ serial, deviceLabel, sessionLabel, sessionStart, elapsedSeconds }`. Prints
`No active sessions.` (or the scoped variant) when nothing is running.


### `thermoworks export <serial>`

Export archive readings to CSV, JSON, or InfluxDB line protocol.

```bash
npx thermoworks export M100009168
npx thermoworks export M100009168 --archive <id> --format csv --output readings.csv
npx thermoworks export M100009168 --format influx | curl --data-binary @- "http://localhost:8086/api/v2/write?bucket=bbq&precision=ns"
```

Options:
- `--archive ID` — Export a specific archive (default: latest)
- `--format FMT` — Output format: `csv`, `json`, or `influx` (default: `json`)
- `--output PATH` — Write to file (default: stdout)

The `influx` format emits one InfluxDB line protocol record per reading, measurement `thermoworks_temperature`, tagged with `serial`, `channel`, and `units`, a `value` field, and a nanosecond timestamp. It pipes straight into Telegraf, the Influx write API, or a file for a Grafana InfluxDB source. Tag values are escaped per the line protocol spec, and `--redact` masks the serial tag.

### `thermoworks backup [serial]`

Bulk-export archived sessions to a directory, one file per archive. Without a serial it
backs up every device on the account; pass a serial to scope to one. Reuses the same
flattening as `export`, so each file has the same shape.

```bash
npx thermoworks backup                              # all devices -> ./thermoworks-backup
npx thermoworks backup M100009168 --output ./cooks  # one device, custom dir
npx thermoworks backup --format csv --limit 50      # up to 50 archives each, as CSV
```

Options:
- `--output DIR` — Directory to write files into (default: `thermoworks-backup`)
- `--format FMT` — Output format: `csv` or `json` (default: `json`)
- `--limit N` — Max archives to export per device (default: 20)

Files are named `<serial>-<archiveId>.<ext>`. With `--json`, prints a manifest array of
`{ serial, archiveId, label, file, readings }` instead of the per-file listing.

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

### `thermoworks graph <serial>`

Draw a temperature chart in the terminal from a device's recent history or a saved archive. Useful for seeing the shape of a whole cook without exporting to another tool.

```bash
npx thermoworks graph M100009168
npx thermoworks graph M100009168 --width 80 --height 16
npx thermoworks graph M100009168 --archive abc123 --channel 1
```

Options:
- `--archive ID` — Chart a saved archive instead of recent history.
- `--channel N` — Which archive channel to chart (default: first channel with readings).
- `--width N` — Chart width in columns (default: 60, minimum 10).
- `--height N` — Chart height in rows (default: 12, minimum 3).

### `thermoworks guide [category]`

Show the temperature guide (safe cooking temperatures).

```bash
npx thermoworks guide
npx thermoworks guide beef
```

### `thermoworks doneness [meat]`

Show recommended internal pull temperatures for common cuts. Reads the built-in meat profiles, so it needs no network access or login.

```bash
npx thermoworks doneness
npx thermoworks doneness brisket
npx thermoworks doneness --json
```

### `thermoworks safe <serial>`

Show food-safety pasteurization progress for a probe. Reads the current channel temperature and, using USDA time-at-temperature data (7.0-log10 Salmonella for poultry, 6.5-log10 for beef and pork), reports whether the food is safe now or how long it must hold at this temperature. Pulling poultry, beef, or pork at a lower temperature is safe when the core holds long enough, and this tells you when that point is reached. Estimates only, not a replacement for official food-safety guidance.

```bash
npx thermoworks safe ABC123 --channel 1
npx thermoworks safe ABC123 --channel 1 --protein poultry --held 4
npx thermoworks safe ABC123 --json
```

Options:
- `--channel N` — Read a specific channel (1-9) instead of the device average
- `--protein P` — Table to use: `poultry` (default), `beef`, or `pork`
- `--held N` — Minutes the core has already held at or above the current temperature
- `--json` — Print the full assessment as JSON

### `thermoworks carryover <serial>`

Predict when to pull food off the heat so carryover cooking lands it on the target temperature after resting. Meat keeps rising after it comes off the heat, so pulling at the target overshoots. This reads the current probe temperature and reports the lower pull temperature and how far the current reading is from it.

```bash
npx thermoworks carryover ABC123 --target 203 --channel 1 --rise 10
npx thermoworks carryover ABC123 --target 135 --size medium
npx thermoworks carryover ABC123 --target 203 --json
```

Options:
- `--target N` — Desired final temperature in Fahrenheit after resting (required)
- `--channel N` — Read a specific channel (1-9) instead of the device average
- `--rise N` — Expected carryover rise in Fahrenheit
- `--size S` — Preset rise instead of `--rise`: `small` (3), `medium` (6, default), or `large` (10)
- `--json` — Print the full assessment as JSON

### `thermoworks open [target]`

Open a ThermoWorks site in your browser. Prints the URL first, so it also works over SSH.

```bash
npx thermoworks open        # ThermoWorks Cloud web app (default)
npx thermoworks open web    # This project's web dashboard
```

Options:
- `[target]` — `cloud` (default) or `web`
- `--json` — Print the resolved `{ target, name, url }` instead of the status line

### `thermoworks convert <value>`

Convert a temperature between Celsius and Fahrenheit. Offline, no login.

```bash
npx thermoworks convert 225f      # 107.2°C
npx thermoworks convert 107c      # 224.6°F
npx thermoworks convert 225 --to c
```

Options:
- `<value>` — Suffix with `c` or `f` to set the source unit, or pass a bare number with `--to`
- `--to c|f` — Target unit for a bare number (ignored when the value has a suffix)
- `--json` — Print `{ input, value, unit }`

### `thermoworks journal <add|list|show|cost|import|rm>`

Keep a local logbook of finished cooks: what the cut was, its weight, how it turned out, what it cost, and notes for next time. Entries are stored in `~/.thermoworks/journal.json`. No credentials required.

```bash
npx thermoworks journal add --title "Sunday brisket" --meat brisket --weight 12 --rating 4 --cost-meat 42 --cost-fuel 8 --notes "Wrapped at 165"
npx thermoworks journal list
npx thermoworks journal show 9029it
npx thermoworks journal cost
npx thermoworks journal import SMOKE123 --limit 10 --dry-run
npx thermoworks journal rm 9029it
```

Options:
- `add` flags: `--title` (required), `--meat`, `--weight` (pounds), `--rating` (1 to 5), `--cost-meat` (meat cost), `--cost-fuel` (fuel cost), `--notes`, `--device SN`, `--archive ID`.
- `cost` — Summarize meat, fuel, and total spend across the logbook, plus average cost per pound over cooks that have both a cost and a weight. Add `--json` for machine-readable output.
- `import` flags: `[SERIAL]` (defaults to the configured device), `--limit N` (default 20), `--dry-run`, `--json`. Requires credentials.
- `--json` — On `list`, `show`, `cost`, and `import`, output as JSON.

Costs are currency-agnostic (enter whatever currency you use). When an entry records both a cost and a weight, `show` and `cost` also report the per-pound figure. Each entry gets a short id and a created timestamp. A missing or corrupt journal file is ignored rather than crashing. `import` pulls finished cooks from a device's cloud archives and deduplicates on the archive id, so re-running only adds new cooks.

### `thermoworks plan --ready <time> --item <spec>`

Work out when to start each item so everything finishes at the same serve time. Back-calculates a start time from the target time, cook duration, and rest. No credentials required.

```bash
npx thermoworks plan --ready "6:00 PM" --item "brisket=12" --item ribs
npx thermoworks plan --ready 18:00 --item "pork butt=8" --item "chicken=5h" --json
npx thermoworks plan --ready "6:00 PM" --item "brisket=12" --ics cook.ics
npx thermoworks plan --list-meats
```

Options:
- `--ready TIME` — Target serve time. Accepts a time of day (`"6:00 PM"`, `6pm`, `18:00`) or a full date-time. Time-of-day values roll to tomorrow if already past.
- `--item SPEC` — Add an item. Repeatable. Forms: `NAME` (fixed-time cut), `NAME=WEIGHT` (pounds), or `NAME=Nh` (explicit cook hours).
- `--list-meats` — Show the built-in meat profiles (cook time, rest, pit temperature).
- `--ics [PATH]` — Export the plan as an iCalendar (`.ics`) file for import into any calendar app. Writes to `PATH`, or stdout when no path is given. Each item becomes a timed event with a 15-minute start reminder, plus a serve event at the ready time.

### `thermoworks config`

Store local default preferences so common options do not have to be passed on every command. Preferences are saved to `~/.thermoworks/preferences.json`, separate from the statusline config.

```bash
npx thermoworks config set unit C
npx thermoworks config set device M100009168
npx thermoworks config set watchInterval 20
npx thermoworks config get unit
npx thermoworks config list
npx thermoworks config unset device
npx thermoworks config path
```

Subcommands:
- `set <key> <value>` — Set a preference (validated on write)
- `get <key>` — Show a single preference value
- `list` — Show all preferences
- `unset <key>` — Remove a preference
- `path` — Print the preferences file path

Keys:
- `unit` — Default temperature unit, `F` or `C`
- `device` — Default device serial
- `watchInterval` — Default `watch` refresh interval in seconds (>= 1)

The `watch` command reads `device` and `watchInterval` when the matching flags are not passed. Unknown keys and invalid values are rejected with a non-zero exit code.

### `thermoworks replay <serial>`

Play back a past cook as if it were streaming live. Reads recent history (or a saved archive) and prints each reading in order, waiting between readings based on the original time gaps. Useful for reviewing how a cook progressed, demoing, or testing dashboards without a live device.

```bash
npx thermoworks replay M100009168
npx thermoworks replay M100009168 --archive abc123 --channel 2
npx thermoworks replay M100009168 --speed 120
npx thermoworks replay M100009168 --loop
```

Options:
- `--archive ID` — Replay a saved archive instead of recent history
- `--channel N` — Archive channel number to replay (default: first channel with readings)
- `--speed N` — Time compression factor. `60` plays a minute of cook per second (default: `60`)
- `--loop` — Restart from the beginning when the replay ends (Ctrl+C to stop)

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

### `thermoworks completion <bash|zsh|fish|powershell>`

Print a tab-completion script for your shell. No credentials required.

```bash
# bash
thermoworks completion bash > /etc/bash_completion.d/thermoworks

# zsh
thermoworks completion zsh > "${fpath[1]}/_thermoworks"

# fish
thermoworks completion fish > ~/.config/fish/completions/thermoworks.fish

# PowerShell (add to your $PROFILE)
thermoworks completion powershell | Out-String | Invoke-Expression
```

Completion covers the top-level commands and the subcommands for `auth`, `alarm`, `fan`, `session`, `copilot`, and `mcp`.

### Global options

| Flag | Description |
|------|-------------|
| `--json` | Output machine-readable JSON (for scripting) |
| `--no-channels` | Hide channel readings in `devices` output |
| `--help`, `-h` | Show the help message |
| `--version`, `-v` | Show the version number |

For detailed option docs, see the [full CLI reference](../../docs/cli-reference.md).

## Global flags

These work with any command:

- `--json` — machine-readable JSON output where supported.
- `--redact` — mask account and device identifiers in JSON and file output before you share it. Serials become `SERIAL_1`, account and user IDs become `ACCOUNT_1` and `USER_1`, email is masked, and share tokens and public links are dropped. Temperatures and timestamps are left as-is.

```bash
npx thermoworks devices --json --redact
```

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
