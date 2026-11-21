# Using the loader

[Docs index](README.md) · [Overview](overview.md) · [Output layout](output-layout.md)

`faKit` is exported from [`src/faKit.client.ts`](../src/faKit.client.ts) and compiled to [`dist/faKit.client.js`](../dist/faKit.client.js). The file is an ES module. Import it; a classic script tag does not create a global `faKit`.

```html
<script type="module">
  import { faKit } from "/assets/fa-font-kit/dist/faKit.client.js";

  faKit("00b1b3bcf8", "/assets/fa-font-kit/dist", "all.min.css");
</script>
```

`baseFallbackPath` is the URL of the published `dist/` directory. The loader joins that path with a single slash, so omit a trailing slash.

The third argument is the file name inside `dist/kit-{token}/`. The build writes the kit's `all*` and `fontawesome*` stylesheets there, including `all.css`, `all.min.css`, `fontawesome.css`, and `fontawesome.min.css` when the package contains them. Pass one of those names. The function default is `all.min.js`, and that file is not part of the kit output.

## Arguments

```ts
faKit(kitID: string, baseFallbackPath: string, fileName = "all.min.js", debug = false): void
```

| Argument | Role |
| --- | --- |
| `kitID` | Font Awesome kit token, for example `41b791824a` |
| `baseFallbackPath` | URL prefix for `kit-versions.json` and `kit-{token}/` |
| `fileName` | Stylesheet file to add when the CDN font does not load. Use `all.min.css`, `all.css`, `fontawesome.min.css`, or `fontawesome.css` |
| `debug` | When `true`, writes loader progress to `console.log` |

`debug` logs:

- `Fontawesome fallback kit version not found` when `kit-versions.json` cannot be read or does not list the token
- `Fontawesome cdn loaded` when `document.fonts.load` fulfills
- `Load Fontawesome fallback` when that call rejects, before the stylesheet is inserted
- `Fontawesome fallback loaded` from the stylesheet `onload` handler

## What the call does

1. Appends this script to `document.head`:

   `https://kit.fontawesome.com/{kitID}.js` with `crossorigin="anonymous"`.

2. Starts the font check once the HTML has been parsed. While `document.readyState` is `"loading"`, that work waits for `DOMContentLoaded`. When `readyState` is already `"interactive"` or `"complete"`, including a module script and any call made after `DOMContentLoaded`, it starts immediately.

3. Waits for `document.fonts.ready`. That promise stays pending while the document is still loading, stylesheets are pending, or layout might still request a font. Chrome does not fulfill it until the window `load` event has finished.

4. Fetches `{baseFallbackPath}/kit-versions.json`. The body is a map of major version to kit tokens:

   ```json
   {
     "6": ["41b791824a"],
     "7": ["00b1b3bcf8"]
   }
   ```

5. Uses the first major key whose array includes `kitID`. Fetches that fail, non-OK responses, and a token that is not listed all stop the fallback. The CDN script tag from step 1 stays in the page.

6. Calls `document.fonts.load` with `1px "Font Awesome {major} Pro"`. The family name always uses the Pro suffix. A fulfilled promise is treated as a successful CDN load, and no stylesheet is added. A rejected promise adds:

   ```html
   <link rel="stylesheet" href="{baseFallbackPath}/kit-{kitID}/{fileName}">
   ```

The loader does not listen for the kit script's own `load` or `error` events. `fonts.load` is what decides between the CDN face and the local stylesheet.

A kit version of `latest` is stored as major `5`, so the probe string is `Font Awesome 5 Pro`. See [version keys](output-layout.md#version-keys).

## Fallback files the stylesheet needs

The `all*` and `fontawesome*` files in `dist/kit-{token}/` reference webfonts at `../fa-versions/{version}/webfonts/`. Publish the whole `dist/` tree, not only the `kit-{token}` folder. The URL shape is described in [Output layout](output-layout.md).

## Next

- [Building kits](building-kits.md)
- [GitHub Action](github-action.md)
