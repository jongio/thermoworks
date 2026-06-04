# Security Policy

## Supported Versions

Only the latest version is supported.

## Reporting a Vulnerability

Please open a GitHub issue to report security concerns, but do not include
sensitive data, credentials, tokens, or other secrets in the report.

## Credential Handling

- **OS Keychain (preferred):** Credentials are stored in the operating system
  keychain via `@github/keytar` (macOS Keychain, Windows Credential Vault,
  libsecret on Linux). Never stored in repository files.

- **Environment variables (CI only):** `THERMOWORKS_EMAIL` and
  `THERMOWORKS_PASSWORD` are supported for CI/automation use cases.
  Environment variables may be visible to other processes on the same
  system (e.g., via `/proc/PID/environ` on Linux). Use the OS keychain
  for interactive use.

## Firebase API Key

This project includes a Firebase web API key. Firebase web API keys are
[designed to be public](https://firebase.google.com/docs/projects/api-keys)
and are embedded in all Firebase web applications (including the official
ThermoWorks Cloud web app). The key alone does not grant access to any
data -- valid user credentials are always required.

## Logout Behavior

Running `thermoworks auth logout` removes credentials from the local OS
keychain. Firebase does not provide a client-side API to revoke refresh
tokens. To fully revoke all sessions, change your password at
[cloud.thermoworks.com](https://cloud.thermoworks.com/).

## Disclaimer

This tool uses an undocumented API and is provided without warranty.
