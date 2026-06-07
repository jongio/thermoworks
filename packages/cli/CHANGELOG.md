# thermoworks

## 0.3.0

### Minor Changes

- Parallelize per-device channel fetches in `copilot status` for faster output
- Use shared alarm utilities from SDK (removes duplicated logic)
- Use shared credential contract from SDK for consistent keychain access
- Use shared config types from SDK for validation

### Patch Changes

- Fix static imports for `--version` flag
- Fix flaky time-dependent test
- Updated dependencies: thermoworks-sdk@0.3.0

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
