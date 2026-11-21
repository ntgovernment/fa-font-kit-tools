# Font Awesome kit tools

Documentation for the loader, the kit build, and the files sites consume from `dist/`.

The package name is `ntg-font-kit`. Sites do not import an `index` module. The browser entry is [`dist/faKit.client.js`](../dist/faKit.client.js), and the kit build is [`dist/buildKits.js`](../dist/buildKits.js).

## Pages

| Page | What it covers |
| --- | --- |
| [Overview](overview.md) | Why the repo exists and how the loader and build fit together |
| [Using the loader](using-the-loader.md) | Embedding `faKit` on a site and the runtime fallback check |
| [Building kits](building-kits.md) | `buildKits` flags, install rules, and required tokens |
| [Output layout](output-layout.md) | `dist/` files, shared webfonts, and rewritten stylesheet paths |
| [Font Awesome API](font-awesome-api.md) | `GQLClient`: kits, family styles, and schema discovery |
| [GitHub Action](github-action.md) | The weekly and manual **Build kits** workflow |
| [Development](development.md) | Scripts, TypeScript, tests, and local runs |

## Typical path

1. Enable the kit package feature in Font Awesome so `@awesome.me/kit-{token}` can be installed.
2. Run the [kit build](building-kits.md) (locally or via the [GitHub Action](github-action.md)).
3. Publish `dist/` where sites can request it.
4. Call [`faKit`](using-the-loader.md) with the kit token and that `dist/` URL.
