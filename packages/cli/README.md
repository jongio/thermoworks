# thermoworks

> **Disclaimer:** This project is not affiliated with, endorsed by, or connected to [ThermoWorks](https://www.thermoworks.com/) in any way. It is an unofficial, community-built tool created by ThermoWorks customers for personal use.

CLI for [ThermoWorks Cloud](https://cloud.thermoworks.com/) — authenticate, inspect your devices, and show live temperatures in the GitHub Copilot CLI statusline.

![ThermoWorks statusline in GitHub Copilot CLI](../../docs/images/statusline.png)

![ThermoWorks statusline with per-channel display](../../docs/images/statusline-channels.png)

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
4. **Choose a refresh interval** with a radio selector.
   - Options: `30`, `60`, `120`, or `300` seconds.
   - Default selection: `30 seconds`.
5. **Save the ThermoWorks config** to `~/.thermoworks/config.json`.
6. **Optionally update GitHub Copilot CLI** by writing a managed `statusLine` command into `~/.copilot/settings.json`.
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

The CLI caches the rendered status output for the configured refresh interval so the statusline does not re-fetch on every repaint.

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
| `refreshSeconds` | `number` | Cache and refresh interval in seconds |

If the file is missing, the CLI falls back to an empty device list with a default refresh interval of `60` seconds until you run setup.

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

### Global options

```bash
npx thermoworks --help
npx thermoworks --version
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
