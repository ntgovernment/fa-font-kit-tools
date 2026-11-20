Font Awesome kit loader and GraphQL client.

**WORK IN PROGRESS**

```bash
npm test
npm run build
```

`npm run build` compiles `src/` to `dist/` and writes declaration files. `npm test` typechecks the project, then runs the Vitest suite.

Set `FA_API_TOKEN` to include the live Font Awesome API check:

```bash
npx dotenv run -- npm test
```

## Discover the GraphQL API

Use the GraphQL client from server-side code only; keep your API and access tokens
out of browser bundles and logs.

```ts
import { FontawesomeGraphQL } from './src/FontawesomeGraphQL.client.js';

const apiToken = process.env.FA_API_TOKEN;
if (!apiToken) throw new Error('FA_API_TOKEN is required');

const client = new FontawesomeGraphQL(apiToken);
const schema = await client.discoverSchema();

console.dir({
  queryType: schema.queryType,
  kitTypes: schema.types.filter((type) => /kit/i.test(type.name)),
}, { depth: null });
```

`discoverSchema()` uses authenticated GraphQL introspection and returns the query,
mutation, and subscription root names plus the available types. Types include
field descriptions, arguments and defaults, nested type references, enum values,
interfaces, possible types, and deprecated fields/enum values with their reasons.
Follow `type.ofType` through `NON_NULL` and `LIST` wrappers to find a field's named
type. Inspect the query root and the types behind `me` and `kits` to find additional
kit metadata and any required arguments; the example's name filter is just a
starting point.

Discovery does not fetch kit values or change `getKits()`'s existing selection.
Once you identify useful fields, use the exported `queryGraphQL()` helper with
`await client.accessToken()` to query them explicitly. Schema availability does
not guarantee your token has permission to read every field.

HTTP/GraphQL errors (including rejected introspection) are propagated. A missing
schema also throws rather than returning an empty discovery result. The live
tests include schema discovery when `FA_API_TOKEN` is configured.