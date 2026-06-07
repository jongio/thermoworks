---
name: thermoworks-dev
description: >-
  Contribute to the thermoworks monorepo. Add CLI commands, VS Code extension
  features, SDK methods, or new packages. Build, test, lint, and release.
  TRIGGERS: thermoworks dev, add command, add feature, extend cli, extend
  extension, thermoworks monorepo, thermoworks build, thermoworks test,
  new package, contributing.
author: Jon Gallant
version: 1.0.0
license: MIT
---

# ThermoWorks Development

Guide for building features in the thermoworks monorepo. Covers adding
commands, extension features, SDK methods, and new packages.

## When to activate

- User wants to add a feature to any thermoworks package
- User is setting up the dev environment or running builds/tests
- User asks about project structure, conventions, or release process
- User wants to add a new package to the monorepo

## Project layout

```
packages/
  sdk/      thermoworks-sdk    Node.js client (foundation - no workspace deps)
  cli/      thermoworks        CLI tool (depends on sdk)
  vscode/   thermoworks        VS Code extension (depends on sdk as devDep)
  web/                         Static marketing site (standalone)
```

SDK is the foundation. CLI and VS Code both consume it via `"thermoworks-sdk": "workspace:^"`.

## Build, test, lint

```bash
pnpm install          # install all deps
pnpm build            # build all packages (tsup for sdk/cli, esbuild for vscode)
pnpm test             # run all tests (vitest)
pnpm typecheck        # type-check all packages (tsc --noEmit)
pnpm lint             # lint with Biome
pnpm format           # auto-format with Biome
```

Package manager is **pnpm** (v10.12.1). Never use npm or yarn.

## Add a CLI command

1. Create `packages/cli/src/commands/<name>.ts`:
   ```ts
   import { ThermoworksCloud } from "thermoworks-sdk";
   import { getCredentials } from "../credentials.js";

   export async function myCommand(): Promise<void> {
     const creds = await getCredentials();
     const client = new ThermoworksCloud(creds);
     try {
       // implementation
     } finally {
       client.close();
     }
   }
   ```

2. Wire it in `packages/cli/src/index.ts` - add a case to the switch:
   ```ts
   case "mycommand":
     await myCommand();
     break;
   ```

3. Add help text to `printUsage()`

4. Add tests in `packages/cli/tests/<name>.test.ts`

## Add a VS Code extension feature

**New command:**
1. Add to `packages/vscode/package.json` under `contributes.commands`
2. Register in `packages/vscode/src/extension.ts`:
   ```ts
   context.subscriptions.push(
     vscode.commands.registerCommand("thermoworks.myCmd", async () => {
       // implementation
     })
   );
   ```
3. Add menu entries under `contributes.menus` if needed

**New tree item:**
1. Create a class extending `vscode.TreeItem` in `tree/tree-items.ts`
2. Add to `getChildren()` in `thermoworks-tree-provider.ts`
3. Set `contextValue` for menu filtering

**Key architecture:**
- `StatusBarProvider` - temperature display, alarm indicators, polling
- `ThermoworksTreeProvider` - sidebar device tree with lazy-loading
- `ClientManager` - shared SDK client singleton

## Add an SDK method

1. Add the method to `packages/sdk/src/client.ts` on `ThermoworksCloud`
2. Add any new types to `packages/sdk/src/types.ts` (use `readonly` fields)
3. Export from `packages/sdk/src/index.ts`
4. Add tests in `packages/sdk/tests/`

## Add a new package

1. Create `packages/<name>/` with:
   - `package.json` (set `"type": "module"`, add build/test/typecheck scripts)
   - `tsconfig.json` (extend `../../tsconfig.base.json`)
   - `src/index.ts`
2. Use `"thermoworks-sdk": "workspace:^"` if you need the SDK
3. Run `pnpm install` from root
4. If published: add `publishConfig`, `files`, `exports` fields

## Conventions

- **ESM everywhere** (`"type": "module"`, `.js` extensions in imports)
- **Biome** for linting/formatting (tabs, double quotes, semicolons)
- **vitest** for tests with `vi.doMock()` + `vi.resetModules()` for mocking
- **Never mix `vi.mock()` with `vi.doMock()`** for the same module
- **Readonly interfaces** for API response types
- **Credentials** via `@github/keytar` (service: `thermoworks`)
- **Strong typing** - no `any`, strict null checks

See [references/conventions.md](references/conventions.md) for more detail.
