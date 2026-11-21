# Development

[Docs index](README.md) · [Building kits](building-kits.md) · [GitHub Action](github-action.md)

## Scripts

From [`package.json`](../package.json):

| Script | Command | What it does |
| --- | --- | --- |
| `npm run build` | `tsc -p tsconfig.build.json` | Emits `dist/*.js`, declarations, and source maps for files in `src/` |
| `npm run typecheck` | `tsc --noEmit` | Typechecks `src/` and `tests/` |
| `npm test` | `tsc --noEmit && vitest run` | Typecheck, then one Vitest run |
| `npm run test:watch` | `vitest` | Vitest watch mode |

Vitest is configured in [`vitest.config.ts`](../vitest.config.ts) with the Node environment and `tests/**/*.test.ts`.

## TypeScript

[`tsconfig.json`](../tsconfig.json) typechecks `src`, `tests`, and `vitest.config.ts`. It targets ES2022, uses `NodeNext` modules, includes the DOM lib (the loader touches `document` and `document.fonts`), and does not emit.

[`tsconfig.build.json`](../tsconfig.build.json) emits `src/` to `dist/` with declarations, declaration maps, and source maps. Tests are excluded. Kit JSON, `kit-*` directories, and `fa-versions/` are not compiler output; a build leaves them in place.

Source files:

| File | Role |
| --- | --- |
| [`src/faKit.client.ts`](../src/faKit.client.ts) | Browser loader. See [Using the loader](using-the-loader.md) |
| [`src/buildKits.ts`](../src/buildKits.ts) | Kit install and asset copy. Runs `main()` only when it is the Node entry script |
| [`src/GQLClient.client.ts`](../src/GQLClient.client.ts) | Font Awesome HTTP and GraphQL client. See [Font Awesome API](font-awesome-api.md) |

`buildKits.ts` exports `copyInstalledKit`, `placeKitVersion`, and `KitVersionRecord` for tests and other callers. The CLI behavior stays inside `main()`.

## Tests

| File | Covers |
| --- | --- |
| [`tests/faKit.test.ts`](../tests/faKit.test.ts) | Script injection, version lookup, CDN success log, stylesheet fallback |
| [`tests/buildKits.test.ts`](../tests/buildKits.test.ts) | `placeKitVersion` records, moves, and `latest` → major `5` |
| [`tests/GQLClient.test.ts`](../tests/GQLClient.test.ts) | Token exchange, GraphQL errors, kit paging, schema discovery |

The live `GQLClient` tests at the bottom of `tests/GQLClient.test.ts` run only when `FA_API_TOKEN` is set.

## Local kit build

Private packages need the Font Awesome registry token before `npm ci` or `npm install`. [`.npmrc`](../.npmrc) reads `FONTAWESOME_PACKAGE_TOKEN`.

```sh
export FONTAWESOME_PACKAGE_TOKEN="…"
export FA_API_TOKEN="…"
export FA_PKG_TOKEN="$FONTAWESOME_PACKAGE_TOKEN"

npm ci
npm test
npm run build
node dist/buildKits.js
```

`FA_PKG_TOKEN` and `FONTAWESOME_PACKAGE_TOKEN` are the same package token. The build sets `FONTAWESOME_PACKAGE_TOKEN` from `FA_PKG_TOKEN` for each kit install. `npm ci` does not, so export both for a clean install.

A `.env` file is loaded only when one of `FA_API_TOKEN` or `FA_PKG_TOKEN` is missing from the environment. `.env` is listed in [`.gitignore`](../.gitignore) along with `node_modules`, `coverage`, and `.DS_Store`. `dist/` is not ignored; the GitHub Action commits it.

Optional flags are the same as in CI:

```sh
node dist/buildKits.js --update
node dist/buildKits.js --force
node dist/buildKits.js --retry 00b1b3bcf8,nt-dev.nt.gov.au
```

Read `dist/kit-results.json` after a run. `not_installed` entries are skipped on the next run until you pass `--force` or `--retry`.

## Next

- [Building kits](building-kits.md)
- [Output layout](output-layout.md)
- [GitHub Action](github-action.md)
