# ThermoWorks for VS Code

Display real-time temperatures from your ThermoWorks connected devices (Smoke, Signals, Node, etc.) directly in the VS Code status bar.

## Features

- 🔥 **Status Bar Temperature** — See live readings at a glance
- 🔄 **Auto-Refresh** — Configurable interval (default 30s, minimum 15s)
- 🔗 **Shared Credentials** — Works with the same login as the `thermoworks` CLI
- 📊 **Detailed Tooltips** — Hover for per-device/channel breakdown

## Setup

### 1. Login

You can authenticate in two ways:

**Option A: VS Code Command**
1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **ThermoWorks: Login**
3. Enter your ThermoWorks Cloud email and password

**Option B: CLI (shared credentials)**
```bash
npm install -g thermoworks
thermoworks auth login
```

### 2. Configure Devices

Run the CLI setup to select which devices/channels to display:

```bash
thermoworks copilot setup
```

This saves your selection to `~/.thermoworks/config.json`, which the extension reads.

## Commands

| Command | Description |
|---------|-------------|
| `ThermoWorks: Login` | Enter your ThermoWorks Cloud credentials |
| `ThermoWorks: Logout` | Clear stored credentials |
| `ThermoWorks: Refresh Temperatures` | Force an immediate temperature refresh |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `thermoworks.refreshInterval` | `30` | Refresh interval in seconds (minimum 15) |

## Status Bar

The extension shows temperatures in the format:

```
🔥 Smoker:225°F · Meat:145°F
```

Hover for a detailed tooltip with all device and channel information.

## Requirements

- A ThermoWorks Cloud account
- At least one connected ThermoWorks device (Smoke, Signals, Node, etc.)

## Publishing to VS Code Marketplace

This extension is published under publisher `jongio`. To publish a new version:

```bash
cd packages/vscode
pnpm build
pnpm package   # creates .vsix file
pnpm publish   # publishes to marketplace (requires PAT)
```

### First-Time Setup

1. Register as a publisher at https://marketplace.visualstudio.com/manage
2. Create an Azure DevOps Personal Access Token (PAT) with **Marketplace (Publish)** scope
3. Run `npx vsce login jongio` and paste your PAT

## License

MIT
