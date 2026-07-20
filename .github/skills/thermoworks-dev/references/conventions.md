# Conventions and Patterns

## Testing

All packages use vitest ^4.1.10.

**Mocking `@github/keytar`** (CLI and VS Code packages):

```ts
vi.doMock("@github/keytar", () => ({
  getPassword: vi.fn().mockResolvedValue(null),
  setPassword: vi.fn().mockResolvedValue(undefined),
  deletePassword: vi.fn().mockResolvedValue(true),
}));
```

Use `vi.doMock()` + `vi.resetModules()` for module isolation. The hoisted
`vi.mock()` form conflicts with dynamic imports used in the credential code.

**Mocking `vscode`** (VS Code extension tests):

```ts
vi.doMock("vscode", () => ({
  window: { createStatusBarItem: vi.fn() },
  StatusBarAlignment: { Left: 1 },
  ThemeColor: class { constructor(public id: string) {} },
  TreeItem: class {},
  // add what your test needs
}));
```

## TypeScript

- Extend `../../tsconfig.base.json` in each package
- Target: ES2022, module: NodeNext
- Strict mode enabled
- Type-check with `tsc --noEmit` (compilation via tsup/esbuild)

## Code style (Biome)

- Indent: tabs
- Quotes: double
- Semicolons: always
- Trailing commas: all
- Run `pnpm format` to auto-fix

## Error handling

- Custom error classes in `packages/sdk/src/types.ts`
- `AuthError(message, reason)` - credential/auth failures
- `NotFoundError(message)` - missing resources
- `NetworkError(message, statusCode?)` - HTTP failures
- Always throw typed errors, never raw `Error`

## Package builds

| Package | Bundler | Format | Entry |
|---------|---------|--------|-------|
| SDK | tsup | ESM + CJS dual | `src/index.ts` |
| CLI | tsup | ESM | `src/index.ts` |
| VS Code | esbuild | CJS | `src/extension.ts` |

VS Code uses CJS + esbuild because VS Code's extension host requires
CommonJS. The `vscode` and `@github/keytar` modules are externalized.

## Release

Release workflows are run manually (`workflow_dispatch`) from the Actions tab.
`release-all` bumps, publishes, and tags all packages; per-package workflows
(`release-sdk`, `release-cli`, `release-vscode`) do one package each. Each run
bumps the version, publishes (npm for sdk/cli, VS Code Marketplace for vscode),
then commits and pushes tags:
- `sdk-v x.y.z` - thermoworks-sdk (npm)
- `cli-v x.y.z` - thermoworks (npm)
- `vscode-v x.y.z` - jongio.thermoworks (VS Code Marketplace)

The web dashboard deploys to GitHub Pages via `pages.yml`, not npm.
