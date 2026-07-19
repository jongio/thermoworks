# CLI Reference

This file is generated from `packages/cli/src/command-registry.ts`.

## Commands

### `thermoworks auth <login|logout|status>`

Manage ThermoWorks Cloud credentials

**Usage**

```bash
npx thermoworks auth <login|logout|status>
```

**Options**

- `--json` - Output machine-readable JSON.

**Subcommands**

- `login` - Authenticate with ThermoWorks Cloud
- `logout` - Remove saved credentials
- `status` - Show current authentication status

### `thermoworks auth login`

Authenticate with ThermoWorks Cloud

**Usage**

```bash
npx thermoworks auth login
```

**Options**

None.

### `thermoworks auth logout`

Remove saved credentials

**Usage**

```bash
npx thermoworks auth logout
```

**Options**

None.

### `thermoworks auth status`

Show current authentication status

**Usage**

```bash
npx thermoworks auth status
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks alarm <set|clear|list|suggest>`

Manage alarm thresholds

**Usage**

```bash
npx thermoworks alarm <set|clear|list|suggest>
```

**Options**

- `--json` - Output machine-readable JSON.

**Subcommands**

- `set` - Set alarm thresholds on a device channel
- `clear` - Clear alarm thresholds on a device channel
- `list` - List configured alarm thresholds
- `suggest` - Suggest pit and meat-probe alarm thresholds for a cut of meat

### `thermoworks alarm set <SERIAL> --channel <1-9> [--high <temp>] [--low <temp>]`

Set alarm thresholds on a device channel

**Usage**

```bash
npx thermoworks alarm set <SERIAL> --channel <1-9> [--high <temp>] [--low <temp>]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--channel <1-9>` (required) - Channel number to set the alarm on.
- `--high <temp>` - High alarm threshold temperature.
- `--low <temp>` - Low alarm threshold temperature.
- `--json` - Output machine-readable JSON.

### `thermoworks alarm clear <SERIAL> --channel <1-9>`

Clear alarm thresholds on a device channel

**Usage**

```bash
npx thermoworks alarm clear <SERIAL> --channel <1-9>
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--channel <1-9>` (required) - Channel number to clear alarms on.
- `--json` - Output machine-readable JSON.

### `thermoworks alarm list [SERIAL]`

List configured alarm thresholds

**Usage**

```bash
npx thermoworks alarm list [SERIAL]
```

**Arguments**

- `SERIAL` - Optional device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks alarm suggest <MEAT> [--pit-band <deg>] [--serial <SN>] [--meat-channel <1-9>] [--pit-channel <1-9>]`

Suggest pit and meat-probe alarm thresholds for a cut of meat

**Usage**

```bash
npx thermoworks alarm suggest <MEAT> [--pit-band <deg>] [--serial <SN>] [--meat-channel <1-9>] [--pit-channel <1-9>]
```

**Arguments**

- `MEAT` (required) - Meat name or alias.

**Options**

- `--pit-band <deg>` - Half-width of the pit alarm band.
- `--serial <SN>` - Serial number for suggested commands.
- `--meat-channel <1-9>` - Meat-probe channel.
- `--pit-channel <1-9>` - Pit-probe channel.
- `--json` - Output machine-readable JSON.

### `thermoworks alerts [SERIAL] [--json]`

Scan current alarm state and exit non-zero if any channel is alarming

**Usage**

```bash
npx thermoworks alerts [SERIAL] [--json]
```

**Arguments**

- `SERIAL` - Optional device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks calibration <SERIAL> [--interval-months N] [--json]`

Show NIST-traceable calibration data for a device

**Usage**

```bash
npx thermoworks calibration <SERIAL> [--interval-months N] [--json]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--interval-months N` - Recalibration interval for the due-date check.
- `--json` - Output machine-readable JSON.

### `thermoworks copilot <setup|status|remove>`

Configure and render the Copilot CLI statusline

**Usage**

```bash
npx thermoworks copilot <setup|status|remove>
```

**Options**

None.

**Subcommands**

- `setup` - Configure Copilot CLI statusline (wizard)
- `status` - Show configured temperature reading
- `remove` - Remove statusline configuration

### `thermoworks copilot setup [--dev] [--demo]`

Configure Copilot CLI statusline (wizard)

**Usage**

```bash
npx thermoworks copilot setup [--dev] [--demo]
```

**Options**

- `--dev` - Use a local development command.
- `--demo` - Configure fake cycling demo data.

### `thermoworks copilot status [--demo]`

Show configured temperature reading

**Usage**

```bash
npx thermoworks copilot status [--demo]
```

**Options**

- `--demo` - Output fake demo data instead of real readings.

### `thermoworks copilot remove`

Remove statusline configuration

**Usage**

```bash
npx thermoworks copilot remove
```

**Options**

None.

### `thermoworks data-usage [--by-device] [--json]`

Show account data storage usage

**Usage**

```bash
npx thermoworks data-usage [--by-device] [--json]
```

**Options**

- `--by-device` - Show per-device breakdown.
- `--json` - Output machine-readable JSON.

### `thermoworks notifications [--enable FIELD | --disable FIELD] [--json]`

Show account notification settings

**Usage**

```bash
npx thermoworks notifications [--enable FIELD | --disable FIELD] [--json]
```

**Options**

- `--enable FIELD` - Enable a setting.
- `--disable FIELD` - Disable a setting.
- `--json` - Output machine-readable JSON.

### `thermoworks account [--json]`

Show account details and billing plan

**Usage**

```bash
npx thermoworks account [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks devices [--type T] [--status S] [--label L] [--serial SN] [--active-within N] [--sort health] [--critical] [--no-channels] [--json]`

List connected devices and channel readings

**Usage**

```bash
npx thermoworks devices [--type T] [--status S] [--label L] [--serial SN] [--active-within N] [--sort health] [--critical] [--no-channels] [--json]
```

**Options**

- `--active-within N` - Only devices seen within N minutes.
- `--sort health` - Sort devices by attention needed.
- `--critical` - Only show devices needing attention.
- `--no-channels` - Hide channel readings.
- `--json` - Output machine-readable JSON.

### `thermoworks temp <SERIAL> [--channel N] [--unit auto|f|c] [--json]`

Print a single temperature value for scripting

**Usage**

```bash
npx thermoworks temp <SERIAL> [--channel N] [--unit auto|f|c] [--json]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--channel N` - Read a specific channel.
- `--unit auto|f|c` - Convert the output value.
- `--json` - Output machine-readable JSON.

### `thermoworks eta <SERIAL> [--channel N] [--target N] [--json]`

Estimate time-to-target for a probe channel

**Usage**

```bash
npx thermoworks eta <SERIAL> [--channel N] [--target N] [--json]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks stall <SERIAL> [--threshold N] [--duration N] [--json]`

Check whether a cook has stalled

**Usage**

```bash
npx thermoworks stall <SERIAL> [--threshold N] [--duration N] [--json]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks device <rename|reset-minmax>`

Manage devices

**Usage**

```bash
npx thermoworks device <rename|reset-minmax>
```

**Options**

- `--json` - Output machine-readable JSON.

**Subcommands**

- `rename` - rename subcommand
- `reset-minmax` - reset-minmax subcommand

### `thermoworks device rename`

rename subcommand

**Usage**

```bash
npx thermoworks device rename
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks device reset-minmax`

reset-minmax subcommand

**Usage**

```bash
npx thermoworks device reset-minmax
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks label <set|get|list|clear>`

Manage custom display labels for device channels

**Usage**

```bash
npx thermoworks label <set|get|list|clear>
```

**Options**

- `--json` - Output machine-readable JSON.

**Subcommands**

- `set` - set subcommand
- `get` - get subcommand
- `list` - list subcommand
- `clear` - clear subcommand

### `thermoworks label set`

set subcommand

**Usage**

```bash
npx thermoworks label set
```

**Options**

None.

### `thermoworks label get`

get subcommand

**Usage**

```bash
npx thermoworks label get
```

**Options**

None.

### `thermoworks label list`

list subcommand

**Usage**

```bash
npx thermoworks label list
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks label clear`

clear subcommand

**Usage**

```bash
npx thermoworks label clear
```

**Options**

None.

### `thermoworks mcp start`

Start MCP server for AI assistants

**Usage**

```bash
npx thermoworks mcp start
```

**Options**

None.

**Subcommands**

- `start` - Start MCP server for AI assistants

### `thermoworks mcp start`

Start MCP server for AI assistants

**Usage**

```bash
npx thermoworks mcp start
```

**Options**

None.

### `thermoworks watch [--device SN] [--interval N] [--alert-before N] [--bell] [--until-alarm] [--timeout N] [--json]`

Continuously monitor temperatures

**Usage**

```bash
npx thermoworks watch [--device SN] [--interval N] [--alert-before N] [--bell] [--until-alarm] [--timeout N] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks metrics [--host HOST] [--port N] [--device SN] [--interval N]`

Serve live temperatures as Prometheus metrics

**Usage**

```bash
npx thermoworks metrics [--host HOST] [--port N] [--device SN] [--interval N]
```

**Options**

None.

### `thermoworks events [--device SERIAL] [--type TYPE] [--limit N] [--json]`

Show device event history

**Usage**

```bash
npx thermoworks events [--device SERIAL] [--type TYPE] [--limit N] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks archives <serial> [--id ID] [--limit N] [--from DATE] [--to DATE] [--json]`

List archived sessions for a device

**Usage**

```bash
npx thermoworks archives <serial> [--id ID] [--limit N] [--from DATE] [--to DATE] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks stats <serial> [--limit N] [--json]`

Show cross-session cook analytics for a device

**Usage**

```bash
npx thermoworks stats <serial> [--limit N] [--json]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks firmware [--device SERIAL] [--json]`

Show firmware versions and available updates

**Usage**

```bash
npx thermoworks firmware [--device SERIAL] [--json]
```

**Options**

- `--device SERIAL` - Check firmware for a specific device.
- `--json` - Output machine-readable JSON.

### `thermoworks fan [set|enable|disable] <SERIAL>`

Show or control fan controller state

**Usage**

```bash
npx thermoworks fan [set|enable|disable] <SERIAL>
```

**Options**

- `--json` - Output machine-readable JSON.

**Subcommands**

- `set` - set subcommand
- `enable` - enable subcommand
- `disable` - disable subcommand

### `thermoworks fan set`

set subcommand

**Usage**

```bash
npx thermoworks fan set
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks fan enable`

enable subcommand

**Usage**

```bash
npx thermoworks fan enable
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks fan disable`

disable subcommand

**Usage**

```bash
npx thermoworks fan disable
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks search <query> [--collection C] [--limit N] [--json]`

Full-text search across devices

**Usage**

```bash
npx thermoworks search <query> [--collection C] [--limit N] [--json]
```

**Arguments**

- `query` (required) - Search query.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks session <start|end|status|clear>`

Manage monitoring sessions

**Usage**

```bash
npx thermoworks session <start|end|status|clear>
```

**Options**

- `--json` - Output machine-readable JSON.

**Subcommands**

- `start` - start subcommand
- `end` - end subcommand
- `status` - status subcommand
- `clear` - clear subcommand

### `thermoworks session start`

start subcommand

**Usage**

```bash
npx thermoworks session start
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks session end`

end subcommand

**Usage**

```bash
npx thermoworks session end
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks session status`

status subcommand

**Usage**

```bash
npx thermoworks session status
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks session clear`

clear subcommand

**Usage**

```bash
npx thermoworks session clear
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks export SERIAL [--archive ID] [--format FMT] [--output PATH]`

Export archive readings to CSV, JSON, or InfluxDB

**Usage**

```bash
npx thermoworks export SERIAL [--archive ID] [--format FMT] [--output PATH]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks backup [SERIAL] [--output DIR] [--format FMT] [--limit N] [--json]`

Bulk-export archived sessions to a directory

**Usage**

```bash
npx thermoworks backup [SERIAL] [--output DIR] [--format FMT] [--limit N] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks history <SERIAL> [--limit N] [--format FMT] [--output PATH]`

Export historical time-series readings

**Usage**

```bash
npx thermoworks history <SERIAL> [--limit N] [--format FMT] [--output PATH]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks graph <SERIAL> [--archive ID] [--channel N] [--width N] [--height N]`

Draw a temperature chart in the terminal

**Usage**

```bash
npx thermoworks graph <SERIAL> [--archive ID] [--channel N] [--width N] [--height N]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

None.

### `thermoworks guide [category] [--json]`

Show temperature guide

**Usage**

```bash
npx thermoworks guide [category] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks doneness [meat] [--json]`

Show recommended internal pull temperatures

**Usage**

```bash
npx thermoworks doneness [meat] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks safe <SERIAL> [--channel N] [--temp T] [--protein P] [--held N] [--json]`

Show food-safety pasteurization progress

**Usage**

```bash
npx thermoworks safe <SERIAL> [--channel N] [--temp T] [--protein P] [--held N] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks carryover <SERIAL> --target F [--channel N] [--rise DEG] [--size SIZE] [--json]`

Predict when to pull so carryover lands on the target

**Usage**

```bash
npx thermoworks carryover <SERIAL> --target F [--channel N] [--rise DEG] [--size SIZE] [--json]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks cooldown <SERIAL> [--readings LIST] [--stage1-limit H] [--stage2-limit H] [--json]`

Check cooling against the FDA two-stage rule

**Usage**

```bash
npx thermoworks cooldown <SERIAL> [--readings LIST] [--stage1-limit H] [--stage2-limit H] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks season --weight LB [--recipe NAME] [--brine] [--dry-brine] [--list] [--json]`

Scale a rub or brine to the weight of a cut

**Usage**

```bash
npx thermoworks season --weight LB [--recipe NAME] [--brine] [--dry-brine] [--list] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks fuel --temp F --hours H [--fuel pellet|charcoal|wood] [--hopper LB] [--list] [--json]`

Estimate how much fuel a cook will burn

**Usage**

```bash
npx thermoworks fuel --temp F --hours H [--fuel pellet|charcoal|wood] [--hopper LB] [--list] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks wrap <SERIAL> --target F [--wrap-at F] [--limit N] [--json]`

Advise whether to wrap the cook now

**Usage**

```bash
npx thermoworks wrap <SERIAL> --target F [--wrap-at F] [--limit N] [--json]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks open [target] [--json]`

Open a ThermoWorks site in your browser

**Usage**

```bash
npx thermoworks open [target] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks convert VALUE [--to c|f] [--json]`

Convert between Celsius and Fahrenheit

**Usage**

```bash
npx thermoworks convert VALUE [--to c|f] [--json]
```

**Arguments**

- `VALUE` (required) - Temperature value to convert.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks journal <add|list|show|cost|import|export|rm>`

Keep a local logbook of finished cooks

**Usage**

```bash
npx thermoworks journal <add|list|show|cost|import|export|rm>
```

**Options**

- `--json` - Output machine-readable JSON.

**Subcommands**

- `add` - add subcommand
- `list` - list subcommand
- `show` - show subcommand
- `cost` - cost subcommand
- `import` - import subcommand
- `export` - export subcommand
- `rm` - rm subcommand

### `thermoworks journal add`

add subcommand

**Usage**

```bash
npx thermoworks journal add
```

**Options**

None.

### `thermoworks journal list`

list subcommand

**Usage**

```bash
npx thermoworks journal list
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks journal show`

show subcommand

**Usage**

```bash
npx thermoworks journal show
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks journal cost`

cost subcommand

**Usage**

```bash
npx thermoworks journal cost
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks journal import`

import subcommand

**Usage**

```bash
npx thermoworks journal import
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks journal export`

export subcommand

**Usage**

```bash
npx thermoworks journal export
```

**Options**

None.

### `thermoworks journal rm`

rm subcommand

**Usage**

```bash
npx thermoworks journal rm
```

**Options**

None.

### `thermoworks plan --ready TIME --item SPEC [--list-meats] [--json]`

Back-calculate cook start times

**Usage**

```bash
npx thermoworks plan --ready TIME --item SPEC [--list-meats] [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks completion <bash|zsh|fish|powershell>`

Print a shell completion script

**Usage**

```bash
npx thermoworks completion <bash|zsh|fish|powershell>
```

**Options**

None.

### `thermoworks config <set|get|list|unset|path>`

Store local default preferences

**Usage**

```bash
npx thermoworks config <set|get|list|unset|path>
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks doctor [--json]`

Diagnose auth, network, and API issues

**Usage**

```bash
npx thermoworks doctor [--json]
```

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks replay <SERIAL> [--archive ID] [--channel N] [--speed N] [--loop]`

Play back a past cook as a live stream

**Usage**

```bash
npx thermoworks replay <SERIAL> [--archive ID] [--channel N] [--speed N] [--loop]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

None.

### `thermoworks timeline <SERIAL> [--archive ID] [--channel N] [--target F] [--json]`

Annotate a saved cook with its key milestones

**Usage**

```bash
npx thermoworks timeline <SERIAL> [--archive ID] [--channel N] [--target F] [--json]
```

**Arguments**

- `SERIAL` (required) - Device serial number.

**Options**

- `--json` - Output machine-readable JSON.

### `thermoworks demo <high|low|normal>`

Show demo output

**Usage**

```bash
npx thermoworks demo <high|low|normal>
```

**Options**

None.

## Global Options

- `--json` - Output machine-readable JSON.
- `--redact` - Mask serials, account and user IDs, email, and tokens in output
- `--no-channels` - Hide channel readings in devices output
- `--help, -h` - Show this help message
- `--version, -v` - Show version
