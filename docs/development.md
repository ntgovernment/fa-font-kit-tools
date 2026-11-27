# Development

[Docs index](README.md) · [Building kits](building-kits.md) · [GitHub Action](github-action.md)

## Scripts

From [`package.json`](../package.json):

| Script | Command | What it does |
| --- | --- | --- |
| `npm run build` | `tsc -p tsconfig.build.json` | Emits JavaScript, declarations, and source maps for files in `src/` under `dist/lib/` |
| `npm run typecheck` | `tsc --noEmit` | Typechecks `src/` and `tests/` |
| `npm test` | `tsc --noEmit && vitest run` | Typecheck, then one Vitest run |
| `npm run test:watch` | `vitest` | Vitest watch mode |
| `npm run fa-usage -- [--json] [--config <config.json>] <file...>` | Build and scan files for Font Awesome usage |

Vitest is configured in [`vitest.config.ts`](../vitest.config.ts) with the Node environment and `tests/**/*.test.ts`.

## Usage detector exclusions

To skip WARC records for specific resources, create a JSON config file:

```json
{
  "ignoreWarcTargetUris": [
    "https://example.com/assets/all.min.css"
  ]
}
```

```sh
npm run build
node dist/lib/faUsageDetector/faUsageDetector.cli.js --json --config detector-config.json tests/fixtures/archive.txt.gz > usage-results.json
```

Entries can be exact URIs or glob patterns. Exact entries match the whole URI, including any query string. Patterns with no `/`, such as `*.css`, match the final URL path segment at any depth; patterns containing `/`, such as `https://example.com/assets/**/*.css`, match the whole URI path. `*` matches within a path segment and `**` matches across segments; bracket and brace patterns are also supported. Glob matching is case-sensitive. Glob patterns without `?` ignore the URI's query and fragment, so `*.css` also matches `file.css?v=1`. For patterns containing `?`, the full URI is matched; a URL entry with a query string and no `*`, `[` or `{` is treated as an exact URI for backward compatibility.

The results list the distinct skipped target URIs. Standard WARC records use their byte `Content-Length` to delimit bodies. Flattened text exports that have lost blank lines use the next recognizable WARC header instead; a WARC header embedded in the body can therefore be mistaken for a record boundary. Unlisted resources, including custom CSS, are still scanned. Line numbers refer to the original input. Ignoring `*.css` also excludes custom stylesheets and their legitimate usage.

Class and escape results from WARC records include `warcTargetUri`. Matches are grouped by value and URI, so counts and line numbers belong to that resource; repeated records for the same URI are combined. Records without a target URI and matches outside records omit the field. Plain files retain the original result shape.

Class-prefix matches inside font or image filenames ending in `.eot`, `.woff`, `.woff2`, `.ttf`, `.otf` or `.svg` are ignored, including filenames in URLs and request lines. SVG filenames are included because SVG can contain webfonts. Other content in those records is still scanned.

Programmatic callers can pass `{ ignoreWarcTargetUris: [...] }` as the third argument to `faUsageDetector(content, source, options)` or the second argument to `faUsageDetectorFile(path, options)`.

## TypeScript

[`tsconfig.json`](../tsconfig.json) typechecks `src`, `tests`, and `vitest.config.ts`. It targets ES2022, uses `NodeNext` modules, includes the DOM lib (the loader touches `document` and `document.fonts`), and does not emit.

[`tsconfig.build.json`](../tsconfig.build.json) emits `src/` to `dist/lib/` with declarations, declaration maps, and source maps. Tests are excluded. Kit JSON, `kit-*` directories, and `fa-versions/` remain in `dist/` and are not compiler output.

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
node dist/lib/buildKits.js
```

`FA_PKG_TOKEN` and `FONTAWESOME_PACKAGE_TOKEN` are the same package token. The build sets `FONTAWESOME_PACKAGE_TOKEN` from `FA_PKG_TOKEN` for each kit install. `npm ci` does not, so export both for a clean install.

A `.env` file is loaded only when one of `FA_API_TOKEN` or `FA_PKG_TOKEN` is missing from the environment. `.env` is listed in [`.gitignore`](../.gitignore) along with `node_modules`, `coverage`, and `.DS_Store`. `dist/` is not ignored; the GitHub Action commits it.

Optional flags are the same as in CI:

```sh
node dist/lib/buildKits.js --update
node dist/lib/buildKits.js --force
node dist/lib/buildKits.js --retry 00b1b3bcf8,nt-dev.nt.gov.au
```

Read `dist/kit-results.json` after a run. `not_installed` entries are skipped on the next run until you pass `--force` or `--retry`.

## Next

- [Building kits](building-kits.md)
- [Output layout](output-layout.md)
- [GitHub Action](github-action.md)
