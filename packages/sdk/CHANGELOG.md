# thermoworks-sdk

## 0.3.0

### Minor Changes

- Add shared alarm utilities (`getChannelAlarmState`, `getChannelsAlarmState`, `escalateAlarm`)
- Add shared config types and validation (`StatuslineConfig`, `DeviceEntry`, `isValidDeviceEntry`)
- Add shared credential contract (`parseCredentialBlob`, `serializeCredentials`, `resolveEnvCredentials`)
- Add `formatTimeAgo` utility for human-readable relative timestamps
- Add retry with exponential backoff for transient HTTP failures (5xx, network errors)
- Parallelize channel fetches with `Promise.allSettled` in `getAllDeviceChannels`
- Add `getAccount`, `getEvents`, `getDeviceEvents`, `getArchives`, `getArchive`, `getCalibration`, `getFirmwareInfo`, `getTemperatureGuide`, `search` methods
- Harden `isValidDeviceEntry` to reject empty channels array

## 0.2.2

### Patch Changes

- [`e0a1041`](https://github.com/jongio/thermoworks/commit/e0a104154f8899c1dd7da238b5c56e7c77ddd06d) Thanks [@jongio](https://github.com/jongio)! - Fix NaN token expiry loop, improve error handling and cache validation, migrate to @github/keytar, remove misleading refresh rate prompt from copilot setup

## 0.2.1

### Patch Changes

- [`06a542b`](https://github.com/jongio/thermoworks/commit/06a542b22be7acfbf46c9105e7f4b6ff8560c324) Thanks [@jongio](https://github.com/jongio)! - Add fire emoji favicon to GitHub Pages site. Clarify statusline refresh behavior in docs.

## 0.2.0

### Minor Changes

- [`3f9e94f`](https://github.com/jongio/thermoworks/commit/3f9e94f32f6dbf4e43f14c14322239e8728caf41) Thanks [@jongio](https://github.com/jongio)! - Initial public release — ThermoWorks Cloud CLI and SDK.
