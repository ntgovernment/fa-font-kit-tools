# Font Awesome API

[Docs index](README.md) · [Building kits](building-kits.md)

[`src/GQLClient.client.ts`](../src/GQLClient.client.ts) wraps the Font Awesome token endpoint and GraphQL API. The kit build uses `getKits()` only. `getKitFamilyStyles()` and `discoverSchema()` are available for inspection and are covered by tests.

```ts
import { GQLClient } from "./GQLClient.client.js";

const client = new GQLClient(process.env.FA_API_TOKEN!);
const kits = await client.getKits();
```

## Authentication

`getAccessToken` POSTs to `https://api.fontawesome.com/token` with `Authorization: Bearer {apiToken}`.

The client caches `access_token` until `Date.now()` passes `now + expires_in`. It adds that number directly and does not multiply by 1000. `Date.now()` is milliseconds, so if the API sends `expires_in` in seconds, a value of `3600` expires the cache after 3.6 seconds.

GraphQL calls POST to `https://api.fontawesome.com` with `Content-Type: application/json` and `Authorization: Bearer {accessToken}`. The JSON body is `{ query, variables }`. A non-OK HTTP status throws `GraphQL request failed: {status} {statusText}`. A body that contains `errors` throws `GraphQL errors:` plus the JSON. A failed token request throws `Token request failed: {status} {statusText}` and does not call GraphQL.

## getKits

```graphql
query {
  me {
    kits {
      name
      token
      version
      status
      licenseSelected
    }
  }
}
```

Each kit is returned as `FAKitExtended`:

| Field | Source |
| --- | --- |
| `name`, `token`, `version`, `licenseSelected` | API fields kept on the returned object |
| `major` | `latest` → `5`, otherwise `parseInt` of the text before the first `.` |

The query also selects `status`. `FAKit` does not declare that field, and `kit-results.json` does not store it. The mapper spreads the kit, so a `status` property returned by the API stays on the object from `getKits()`. A non-numeric version makes `major` `NaN`, which `JSON.stringify` writes as `null`. The version map in the kit build uses a different rule and records that case as `"0"`. See [Version keys](output-layout.md#version-keys).

A missing `me` or `kits` field becomes an empty array.

The build installs `@awesome.me/kit-{token}@latest` and uses `version` for asset directories. `licenseSelected` is recorded in `kit-results.json` and is not read by the browser loader.

## getKitFamilyStyles

Loads every kit's subset and icon families. The query is paged with `familyStylesPaginated(page, pageSize: 50)`. The client requests page 1, reads `totalPageCount`, then requests later pages up to the largest page count on that first response.

Kits that reported a smaller `totalPageCount` ignore later pages. A kit that only appears after page 1 is not added.

Each `FAKitStyles` value contains:

| Field | Meaning |
| --- | --- |
| `subsetType` | `AUTO`, `CUSTOM`, or `FULL` |
| `familyStyles[]` | `family`, `style`, `prefix`, `shorthand`, `label` |
| `selectedIconCount` | `null` when the whole style is included. A number when a custom subset selects individual icons (`only.totalIconVariantCount`) |

`version: "latest"` still becomes `major: 5`.

## discoverSchema

Runs a standard `__schema` introspection query (`queryType`, `mutationType`, `subscriptionType`, types, fields including deprecated ones, arguments, input fields, interfaces, enum values, and possible types). The query does not select `me` or `kits`.

If `data.__schema` is missing, it throws `GraphQL schema discovery returned no schema; introspection may be disabled.` GraphQL and HTTP errors from the shared query helper propagate instead.

## Live checks

`tests/GQLClient.test.ts` includes a `GQLClient live` suite that calls the real API. Vitest skips that suite when `FA_API_TOKEN` is unset. With the token set, the suite expects `getKits()` to return an array, introspection to expose `me.kits` with `name`, `token`, `version`, and `licenseSelected`, and `getKitFamilyStyles()` to return kits whose `subsetType` is `AUTO`, `CUSTOM`, or `FULL`.

## Next

- [Building kits](building-kits.md)
- [Development](development.md)
