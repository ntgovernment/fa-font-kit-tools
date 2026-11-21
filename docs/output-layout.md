# Output layout

[Docs index](README.md) · [Building kits](building-kits.md) · [Using the loader](using-the-loader.md)

`dist/` holds compiled JavaScript and the kit fallback assets. Publish the asset directories together. Stylesheets in `kit-{token}` load fonts from `fa-versions`.

```text
dist/
  faKit.client.js          browser loader
  buildKits.js             kit build
  GQLClient.client.js      API client
  *.d.ts / *.map           declarations and source maps from tsc
  kit-versions.json        major version → kit tokens
  kit-results.json         last build's installed and failed kits
  kit-{token}/
    all.css
    all.min.css
    fontawesome.css
    fontawesome.min.css
  fa-versions/{versionKey}/
    webfonts/              woff2 and ttf from the kit package
    css/                   kit CSS except files named all*
```

There is no `dist/index.js`. [`package.json`](../package.json) `main` and `exports` point at that path, and the TypeScript sources do not emit it. Sites load `faKit.client.js` directly, as described in [Using the loader](using-the-loader.md).

## Kit stylesheets

For each copied kit, CSS files whose names start with `all` or `fontawesome` are written to `dist/kit-{token}/`. In the current packages those are `all.css`, `all.min.css`, `fontawesome.css`, and `fontawesome.min.css`. The loader links whichever of those names is passed as `fileName`.

`../webfonts/` in the kit copies is rewritten to `../fa-versions/{versionKey}/webfonts/`. From a page that loaded `dist/kit-41b791824a/all.min.css`, a font URL resolves to `dist/fa-versions/6/webfonts/…`.

Per-style CSS (`solid.css`, `light.css`, and the rest) stays under `fa-versions/{versionKey}/css/`. The shared copy skips names starting with `all` and still includes `fontawesome*`, with the package's original `../webfonts/` paths. The loader does not link the shared stylesheets.

## Version keys

Two functions map the API version string, and they differ when the version is a full `major.minor.patch`.

| API `version` | Key in `kit-versions.json` | `fa-versions` directory | Font family the loader probes |
| --- | --- | --- | --- |
| `latest` | `5` | `fa-versions/5` | `Font Awesome 5 Pro` |
| `5.x` | `5` | `fa-versions/5` | `Font Awesome 5 Pro` |
| `6.x` | `6` | `fa-versions/6` | `Font Awesome 6 Pro` |
| `7.x` | `7` | `fa-versions/7` | `Font Awesome 7 Pro` |
| `7.3.1` | `7` | `fa-versions/7.3.1` | `Font Awesome 7 Pro` |
| anything else | `0` | `fa-versions/0` | `Font Awesome 0 Pro` |

`kit-versions.json` stores majors only. A full semver still gets its own asset directory, and the rewritten CSS points at that directory. Current kits use `6.x` and `7.x`, so the version map and the asset directory use the same number.

The `major` field from `getKits()` is `parseInt` of that same first segment (`latest` still becomes `5`). For `6.x`, `7.x`, and `latest` it matches the table. A non-numeric version is key `"0"` in this map, while `parseInt` yields `NaN` on the kit object.

`placeKitVersion` moves a token when its major changes and drops a major key that no longer has tokens. Tokens under each major are sorted. Major keys are sorted numerically.

`major` on each kit object is the same number: `latest` becomes `5`, and otherwise the integer before the first dot.

## Version map

`dist/kit-versions.json` is the file the browser fetches. Example from a build that copied the two packaged kits:

```json
{
  "6": ["41b791824a"],
  "7": ["00b1b3bcf8"]
}
```

The loader ignores tokens that are absent from this file, including kits left in `not_installed`.

## Results map

`dist/kit-results.json` is a build log, not a browser input. `installed` entries include a `dist` path such as `dist/kit-00b1b3bcf8`. `not_installed` entries include a `reason` and no `dist`. The next build reads `not_installed` to decide what to skip. See [Building kits](building-kits.md).

## Next

- [Using the loader](using-the-loader.md)
- [GitHub Action](github-action.md)
