# ThermoWorks for VS Code

Display real-time temperatures from your ThermoWorks connected devices (Smoke, Signals, Node, etc.) directly in the VS Code status bar and side panel.

![ThermoWorks panel in VS Code](../../docs/images/vscode-panel-demo.png)

## Features

- 🔥 **Status Bar Temperature** — See live readings at a glance
- 📋 **Device Panel** — Full tree view with all devices, channels, battery, and firmware info
- 🚨 **Alarm Indicators** — Red/blue color-coded alerts with blinking status bar
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
| `ThermoWorks: Demo (Simulate Alarm)` | Show fake data with selectable alarm state (for testing/screenshots) |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `thermoworks.refreshInterval` | `30` | Refresh interval in seconds (minimum 15) |

## Device Panel

The extension adds a **ThermoWorks: Devices** panel to the VS Code sidebar showing:

- **Account info** — email, display name, preferred units, timezone
- **All devices** — with type, online/offline status, and alarm badges
- **Channel readings** — color-coded (green = normal, red = high alarm, blue = low alarm)
- **Device metadata** — battery %, last seen, firmware version
- **Firmware alerts** — orange warning when a device has outdated firmware
- **Badge count** — activity bar icon shows number of devices with active alarms

The panel auto-refreshes on the same interval as the status bar. Device list is cached for 5 minutes (devices rarely change), while channel data refreshes at the configured interval.

### Firmware Update Detection

The extension compares each device's current firmware version against the latest available version from ThermoWorks Cloud. If a device is outdated, an orange **"Firmware update available"** warning is visible at every level of the tree:

- **Devices folder** — shows "1 update available" in the description with an orange alert icon
- **Device node** — shows "⬆️ Update" next to the device type, with an orange alert icon
- **Device children** — shows "Firmware update available" with the current version

Firmware info is cached for 1 hour (releases are infrequent).

![Firmware update alert](../../docs/images/vscode-firmware-update.png)

## Status Bar

The extension shows temperatures in the format:

```
🔥 Smoker:225°F · Meat:145°F
```

Hover for a detailed tooltip with all device and channel information.

### Alarm Indicators

When a device channel's alarm triggers, the status bar changes appearance:

- **High alarm** — Red background (error styling) + blinking text
- **Low alarm** — Blue text + blinking text

![VS Code high alarm](../../docs/images/vscode-alarm-high.png)

![VS Code low alarm](../../docs/images/vscode-alarm-low.png)

Alarms are detected automatically from the `alarmHigh.alarming` and `alarmLow.alarming` fields on each channel. The highest severity alarm across all displayed channels determines the style (high takes priority over low).

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
