# ThermoWorks VS Code TreeView Panel

## Status

BUILDING

## Summary

Add a native VS Code TreeView sidebar panel with a fire emoji icon in the Activity Bar. The panel shows account details, all devices with real-time temperature/channel data, alarm state coloring, and links to cloud.thermoworks.com. Authentication is handled via welcome view pattern.

## Scope

P1 - User-facing new feature

## Acceptance Criteria

- AC-1: Fire icon appears in Activity Bar, opens ThermoWorks panel
- AC-2: When not authenticated, panel shows welcome view with "Sign In" button
- AC-3: Sign In command collects email/password and authenticates via SDK
- AC-4: Sign Out command clears credentials and returns to welcome view
- AC-5: Account section shows user profile (email, display name, units, timezone)
- AC-6: Devices section shows ALL devices from the account (no config file needed)
- AC-7: Each device is expandable, showing all channels with current temperature values
- AC-8: Channels in HIGH alarm state show red warning decoration
- AC-9: Channels in LOW alarm state show blue warning decoration
- AC-10: Device metadata shows battery %, last seen time, status
- AC-11: Manual refresh button in panel toolbar refreshes all data
- AC-12: Auto-refresh polls channel data at configured interval
- AC-13: Device list is cached (5-min TTL) to avoid unnecessary API calls
- AC-14: "Open in ThermoWorks Cloud" action links to https://cloud.thermoworks.com
- AC-15: Panel coexists with existing status bar (no regressions)

## Architecture

### File Structure

```
packages/vscode/src/
├── tree/
│   ├── thermoworks-tree-provider.ts  (TreeDataProvider + caching)
│   ├── tree-items.ts                  (TreeItem node classes)
│   └── tree-commands.ts               (command handlers)
├── images/
│   └── fire.svg                       (activity bar icon, uses currentColor)
```

### Key Decisions

- Two-tier cache: device list (5-min TTL), channel data (refreshInterval TTL)
- Shared CredentialStore with existing status bar
- Context key `thermoworks.isAuthenticated` drives welcome view visibility
- All devices auto-discovered from account (no config.json dependency for panel)
- ThemeIcon for tree item icons, custom SVG for activity bar
