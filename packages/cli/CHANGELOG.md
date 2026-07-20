# thermoworks

## 0.6.0 (2026-07-09)

### Features

- New commands: `safe` (pasteurization tracker), `carryover` (pull-early predictor), `cooldown` (FDA two-stage cooling), `season` (rub/brine scaling), `wrap` (wrap advisor), `timeline`, `stall`, `eta`, `doneness`, `plan`, `replay`, `convert`, `open`, and `doctor` (auth/API diagnostics), plus `alarm suggest` (#134, #138, #163, #228-247, and related).
- `watch` gains an `--alert-before` pre-alarm heads-up and temperature recording (`--record`); `export` gains InfluxDB line-protocol output and `--downsample`; `journal` gains cook-cost tracking and archive import (#237, #245, #246, #247, #280).

### Fixes

- Harden `export`/`watch` output escaping against control characters (#258).

## 0.5.1 (2026-06-28)

### Patch Changes

- Documentation corrections across packages (#152).

## 0.5.0 (2026-06-28)

### Features

- New commands: `data-usage` (#103), `search` (#104), `device rename`/`reset-minmax` (#105), `history` (#107), and `fan` controller (#109).
- `mcp start` resolves keychain credentials in the documented order (env vars, then keychain).

## 0.4.0 (2026-06-09)

### Features

- MCP server integration: `thermoworks mcp start` launches an MCP server for AI assistants (#49).
- Swarm feature drop across CLI, VS Code, web, and MCP.

### Fixes

- Null guard for `getFirmwareInfo` in the `firmware` command.

## 0.3.0 (2026-06-06)

### Features

- Alarm styling and demo mode for status displays (`--demo`).

### Changes

- Extract shared credential, alarm, config, and time code into the SDK; parallelize per-device channel fetches.

### Fixes

- Fix a channel-mapping bug, make credential writes atomic, fix a prompt hang, and add JSON.parse error handling in credential stores.

## 0.2.2

### Patch Changes

- [`e0a1041`](https://github.com/jongio/thermoworks/commit/e0a104154f8899c1dd7da238b5c56e7c77ddd06d) Thanks [@jongio](https://github.com/jongio)! - Fix NaN token expiry loop, improve error handling and cache validation, migrate to @github/keytar, remove misleading refresh rate prompt from copilot setup

- Updated dependencies [[`e0a1041`](https://github.com/jongio/thermoworks/commit/e0a104154f8899c1dd7da238b5c56e7c77ddd06d)]:
  - thermoworks-sdk@0.2.2

## 0.2.1

### Patch Changes

- [`06a542b`](https://github.com/jongio/thermoworks/commit/06a542b22be7acfbf46c9105e7f4b6ff8560c324) Thanks [@jongio](https://github.com/jongio)! - Add fire emoji favicon to GitHub Pages site. Clarify statusline refresh behavior in docs.

- Updated dependencies [[`06a542b`](https://github.com/jongio/thermoworks/commit/06a542b22be7acfbf46c9105e7f4b6ff8560c324)]:
  - thermoworks-sdk@0.2.1

## 0.2.0

### Minor Changes

- [`3f9e94f`](https://github.com/jongio/thermoworks/commit/3f9e94f32f6dbf4e43f14c14322239e8728caf41) Thanks [@jongio](https://github.com/jongio)! - Initial public release — ThermoWorks Cloud CLI and SDK.

### Patch Changes

- Updated dependencies [[`3f9e94f`](https://github.com/jongio/thermoworks/commit/3f9e94f32f6dbf4e43f14c14322239e8728caf41)]:
  - thermoworks-sdk@0.2.0
