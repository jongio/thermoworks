# ThermoWorks

[![CI](https://github.com/jongio/thermoworks/actions/workflows/ci.yml/badge.svg)](https://github.com/jongio/thermoworks/actions/workflows/ci.yml)
[![npm: thermoworks](https://img.shields.io/npm/v/thermoworks?label=thermoworks&color=cb3837)](https://www.npmjs.com/package/thermoworks)
[![npm: thermoworks-sdk](https://img.shields.io/npm/v/thermoworks-sdk?label=thermoworks-sdk&color=cb3837)](https://www.npmjs.com/package/thermoworks-sdk)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/jongio.thermoworks?label=VS%20Code&color=007acc)](https://marketplace.visualstudio.com/items?itemName=jongio.thermoworks)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> **Disclaimer:** This project is not affiliated with, endorsed by, or connected to [ThermoWorks](https://www.thermoworks.com/) in any way. It is an unofficial, community-built tool created by ThermoWorks customers for personal use.

See live temperatures from your ThermoWorks Cloud devices in the terminal, GitHub Copilot CLI statusline, or VS Code status bar.

![ThermoWorks statusline in GitHub Copilot CLI](docs/images/statusline.png)

![ThermoWorks statusline with per-channel display](docs/images/statusline-channels.png)

## Quick Start

```bash
# Sign in to ThermoWorks Cloud
npx thermoworks auth login

# Run the Copilot statusline setup wizard
npx thermoworks copilot setup
```

Done — your selected devices can now appear in the GitHub Copilot CLI statusline and VS Code status bar. For command details, see the [CLI reference](docs/cli-reference.md).

## VS Code Extension

Install the **ThermoWorks** extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jongio.thermoworks) to see live temperatures in the VS Code status bar and device panel.

![ThermoWorks device panel in VS Code](docs/images/vscode-panel-demo.png)

The extension shares credentials and device configuration with the CLI — sign in once and both tools see your devices.

See the [extension README](packages/vscode/README.md) for details.

## Features

- Log in with your ThermoWorks Cloud account and store credentials in your OS keychain
- Configure a GitHub Copilot CLI statusline that shows live device or channel temperatures (updates on each Copilot interaction)
- See live temperatures in the VS Code status bar with auto-refresh
- **Alarm indicators** — visual alerts when temperatures exceed thresholds (red for high, blue for low)
- Choose device averages or specific channels for multi-channel probes
- List devices connected to your ThermoWorks Cloud account
- Use the SDK for scripts, automations, and custom integrations

### Alarm Alerts

![VS Code high alarm — red background](docs/images/vscode-alarm-high.png)

![VS Code low alarm — blue text](docs/images/vscode-alarm-low.png)

![CLI low alarm — blue ANSI text](docs/images/cli-alarm-low.png)

![CLI high alarm — red ANSI text](docs/images/cli-alarm-high.png)

## Packages

| Package | Description |
|---------|-------------|
| [`thermoworks`](packages/cli) | End-user CLI for authentication, Copilot statusline setup, and device listing |
| [`thermoworks-sdk`](packages/sdk) | Node.js SDK for programmatic access to ThermoWorks Cloud |
| [ThermoWorks VS Code Extension](packages/vscode) | VS Code extension displaying temperatures in the status bar |

## Development

This repository uses `pnpm` workspaces.

```bash
# Install dependencies
pnpm install

# Lint the monorepo
pnpm lint

# Run tests
pnpm test

# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck
```

## License

MIT
