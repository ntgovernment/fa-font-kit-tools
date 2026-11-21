#Fontawesom kit tools

Font Awesome kit loader with local kit accurate fallback.

## What is this for?

Fontawesome provides a cdn loader for your font kits.
Which you typically place in a script tag in te head.

We have a requirement that we have a local fallback if that happens to fail to load.

This has led to multiple solutions some of which are working fine some of which don't.

**What's new?**

This new set of tools will provide a single place to call the kit and setup a fallback which points to the same kit files sourced from the kits own custom npm package.

## What work is required to implement on a site

### Setup a gitbridge to this repo

Ideally this would be at a top level that multiple sites can use.

At site you would use the `faKit.client.js` in head or file loaded in head.

```html
<head>
  <script src="path-to-the-gitbridge-asset/dist/faKit.client.js"></script>
  <script>
    faKit('%global_site_metadata_faKitID%', 'path-to-the-gitbridge-asset/dist/');
  </script>
</head>
```

That will add a script tag per the normal fontawesome directions.

Then it will use the browsers fonts api to detect if the font has loaded or not. When fonts are ready and if the fontawesom font doesnt work it will then
add a link to the fallback css.

The fallback will be the same kit icons.

### Kit setup

For the fallback to work the kit needs to have the package feature enabled in its settings.

### Repo kit updates

When a kit is create or updated we need to run a github action in the repo.

This will install the kit and move the required files to dist.

It will then commit and send a pull rewuest to the gitbridge via webhook.
