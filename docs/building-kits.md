# Building kits

[Docs index](README.md) · [Output layout](output-layout.md) · [GitHub Action](github-action.md) · [Font Awesome API](font-awesome-api.md)

[`src/buildKits.ts`](../src/buildKits.ts) lists every kit on the Font Awesome account, installs the ones that can be installed, and copies icon assets into `dist/`. Run the compiled file:

```sh
npm run build
node dist/buildKits.js
```

`npm run build` only compiles TypeScript into `dist/`. It does not download kits. `tsc` also does not delete kit files already sitting in `dist/`.

The process exits with status 1 if `FA_API_TOKEN` or `FA_PKG_TOKEN` is missing. Tokens already in the environment are kept. Otherwise `dotenv` loads a gitignored `.env` file. See [Development](development.md).

## Flags

| Flag | Effect |
| --- | --- |
| `--update` | Reinstall kits that are already dependencies in `package.json` |
| `--force` | Install kits that `dist/kit-results.json` recorded as `not_installed` |
| `--retry <id>` | Same as `--force`, limited to the given kit tokens or kit names. Comma-separated. `--retry=id` is also accepted |

Unknown arguments exit 1. `--retry` with no value exits 1.

The same flags are inputs on the [Build kits](github-action.md) workflow.

## How each kit is handled

Kits come from `GQLClient.getKits()`. For every kit the build applies these rules in order:

1. **Already packaged, and `--update` was not passed.** The token is a dependency named `@awesome.me/kit-{token}` in `package.json`. The build copies `node_modules/@awesome.me/kit-{token}/icons` and does not run `npm install`. A copy error is recorded as a new failure.

2. **Previous failure, and neither `--force` nor `--retry` names this kit.** The token is in `not_installed` from the last `dist/kit-results.json`. The build keeps that reason and does not try again.

3. **Otherwise install, then copy.** Install runs:

   ```sh
   FONTAWESOME_PACKAGE_TOKEN=$FA_PKG_TOKEN npm install --save @awesome.me/kit-{token}@latest
   ```

   The package spec is always `@latest`. The version string returned by the API (`6.x`, `7.x`, `7.3.1`, `latest`, …) is stored for asset paths and `kit-versions.json`; it is not passed to npm.

`--update` does not by itself retry a kit that is still listed under `not_installed`. Those kits stay skipped until `--force` or `--retry` includes them. `--force` does not reinstall a kit that is already in `package.json`; rule 1 still copies it in place unless `--update` is also set.

## Copy step

`copyInstalledKit` reads `node_modules/@awesome.me/kit-{token}/icons` and:

- Merges `icons/webfonts` into `dist/fa-versions/{versionKey}/webfonts`.
- Merges `icons/css` into `dist/fa-versions/{versionKey}/css`, skipping file names that start with `all`. Names that start with `fontawesome` are still copied into that shared directory.
- Rewrites every `icons/css` file whose name starts with `all` or `fontawesome`, replacing `../webfonts/` with `../fa-versions/{versionKey}/webfonts/`, and writes those files to `dist/kit-{token}/`. The kit directory is removed and recreated on each copy.
- Records the token under its major version in `dist/kit-versions.json`.

Directories that are missing in the package are skipped. Other copy errors fail that kit. Shared files are copied over when names collide, so kits that share a version key overwrite the same webfont and CSS names.

Version keys are described in [Output layout](output-layout.md#version-keys).

## Result file

After every kit has been visited, the build writes `dist/kit-results.json`:

```json
{
  "installed": [
    {
      "name": "ntg-standard-icons-2027",
      "token": "00b1b3bcf8",
      "version": "7.x",
      "major": 7,
      "licenseSelected": "pro",
      "dist": "dist/kit-00b1b3bcf8"
    }
  ],
  "not_installed": [
    {
      "name": "Example kit",
      "token": "abcdef1234",
      "version": "latest",
      "major": 5,
      "licenseSelected": "pro",
      "reason": "npm error …"
    }
  ]
}
```

`kit-versions.json` is updated as each kit is copied. `kit-results.json` is written once at the end. A run that stops mid-loop can leave the version map ahead of the results file.

Skipped failures are copied forward with their previous `reason`. Install failures keep the last line of npm's `stderr` when that text is present; otherwise they keep the error message.

A version of `latest` is treated as major 5, matching the loader's font family probe.

## Next

- [Output layout](output-layout.md)
- [GitHub Action](github-action.md)
- [Development](development.md)
