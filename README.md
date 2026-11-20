Font Awesome kit loader and GraphQL client.

```bash
npm test
npm run build
```

`npm run build` compiles `src/` to `dist/` and writes declaration files. `npm test` typechecks the project, then runs the Vitest suite.

Set `FA_API_TOKEN` to include the live Font Awesome API check:

```bash
npx dotenv run -- npm test
```