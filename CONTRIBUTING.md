# Contributing

Thanks for your interest in contributing to this unofficial ThermoWorks CLI/SDK.

## Prerequisites

- Node.js 18+
- pnpm

## Setup

```sh
pnpm install && pnpm -r build
```

## Testing

```sh
pnpm -r test
```

## Linting

```sh
pnpm lint
```

## Repository structure

- `packages/sdk`
- `packages/cli`
- `packages/web`

## Pull requests

1. Fork the repository.
2. Create a branch for your change.
3. Run the relevant build, lint, and test commands.
4. Open a pull request with a clear description.

## Notes

This project interacts with an undocumented API. Be especially careful with changes to authentication and Firestore-related code.

## Code of Conduct

By participating in this project, you agree to abide by the guidelines in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
