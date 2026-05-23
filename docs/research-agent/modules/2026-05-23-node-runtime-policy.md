# Node Runtime Policy

## Goal

Clarify which Node runtime is authoritative for CI and releases, and how to interpret local runtime warnings.

## Current Policy

- Canonical CI runtime: Node 20, declared by `.nvmrc` and `.node-version`.
- Package engine: `>=20 <23`, declared in `package.json`.
- GitHub Actions uses `actions/setup-node@v4` with `node-version-file: .nvmrc`.
- Local machine may currently run a newer Node such as v24; if so, pnpm can print an `Unsupported engine` warning while commands still pass.

## Decision

Do not broaden `package.json` engines only to silence a local warning.

Reason: the runtime constraint should describe the supported release baseline, not the developer machine's accidental current Node version. CI and production automation should stay pinned to Node 20 until there is a deliberate runtime upgrade.

## How To Verify

Use these checks:

```powershell
node -v
Get-Content .nvmrc
Get-Content .node-version
npm run release:check
```

Interpretation:

- If `release:check` passes locally with a newer Node, local compatibility is acceptable for development.
- If GitHub Actions passes, the canonical Node 20 release path is verified.
- If Node-version warnings become noisy enough to hide real failures, switch the local shell to Node 20 instead of weakening the release engine constraint.

## Future Upgrade Rule

Only widen `engines.node` after:

- CI explicitly tests the new major version.
- `npm run release:check` passes on that version.
- The runtime policy and workflow docs are updated together.

