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

## `thermoworks copilot setup [--dev]`

Interactive wizard to configure the GitHub Copilot CLI statusline.

**Usage**

```bash
npx thermoworks copilot setup
npx thermoworks copilot setup --dev
```

**Options**

- `--dev` - Use a local `node <repo>\dist\index.js copilot status` command instead of the default production command selection.

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
- Refresh interval uses a radio selector with `30`, `60`, `120`, and `300` second options. The default selection is `30 seconds`.
- Saves CLI config to `~/.thermoworks/config.json`.
- Optionally writes a managed `statusLine` entry to `~/.copilot/settings.json`.
- If `~/.copilot/settings.json` contains invalid JSON, setup stops and asks you to fix it manually.
- If an existing statusline is present and it was not created by `thermoworks`, the command prompts before overwriting it.

## `thermoworks copilot status`

Output the configured temperature reading string for the Copilot statusline.

**Usage**

```bash
npx thermoworks copilot status
```

**Options**

None.

**Examples**

```bash
npx thermoworks copilot status
```

**Notes**

- Reads `~/.thermoworks/config.json` and silently exits when no devices are configured.
- Uses a cache file in `~/.thermoworks/.cache/readings.json` for the configured refresh window.
- Output format is:

```text
🔥 Name:temp · Name:temp
```

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

- Only removes `statusLine` entries tagged with `_managedBy: "thermoworks"`.
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

## Global Options

```text
--help, -h     Show help
--version, -v  Show version
```

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
