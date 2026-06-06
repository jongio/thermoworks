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
  - **High alarm** — bright red + blink (`\x1b[5;91m`)
  - **Low alarm** — bright blue + blink (`\x1b[5;94m`)
  - Terminals that do not support ANSI blink will display the color without blinking.

  ![CLI low alarm](images/cli-alarm-low.png)
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
# 🔥 Smoker:Pit:285°F · Smoker:Meat:205°F · Fridge:Internal:38°F  (red + blink)

npx thermoworks demo low
# 🔥 Smoker:Pit:180°F · Smoker:Meat:120°F · Fridge:Internal:28°F  (blue + blink)

npx thermoworks demo normal
# 🔥 Smoker:Pit:225°F · Smoker:Meat:165°F · Fridge:Internal:38°F  (no color)
```

**Notes**

- Useful for testing alarm styling, taking screenshots, or verifying terminal ANSI support.
- High mode uses bright red + blink ANSI codes; low mode uses bright blue + blink.
- Normal mode outputs plain text with no ANSI escape codes.

## Global Options

```text
--help, -h     Show help
--version, -v  Show version
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
