# GitHub Action

[Docs index](README.md) · [Building kits](building-kits.md) · [Development](development.md)

[`.github/workflows/buildKits.yaml`](../.github/workflows/buildKits.yaml) is the **Build kits** workflow. It compiles the project, runs `node dist/buildKits.js`, and pushes any kit changes back to the branch that ran the job.

## When it runs

| Trigger | Flags |
| --- | --- |
| `workflow_dispatch` | Optional `force`, `update`, and `retry` inputs, mapped to `--force`, `--update`, and `--retry` |
| `schedule`: `0 0 * * 1` | Every Monday at 00:00 UTC. Inputs are not set, so the job passes no flags |

A scheduled run copies kits already listed in `package.json`, installs kits that are neither packaged nor previously failed, and skips `not_installed` entries. Pass **force** or **retry** from the Actions tab to attempt failures again. Pass **update** to reinstall packaged kits at `@latest`. Flag combinations match [Building kits](building-kits.md).

`retry` is a comma-separated list of kit tokens or kit names.

One build per ref runs at a time (`build-kits-${{ github.ref }}`). A new run does not cancel the one already in progress.

## Job steps

The job runs on `ubuntu-latest` with Node.js 22 and the npm cache.

1. `npm ci`, with `FONTAWESOME_PACKAGE_TOKEN` set from the `FA_PKG_TOKEN` secret so the existing `@awesome.me/kit-*` dependencies install.
2. `npm run build`.
3. `node dist/buildKits.js` with `FA_API_TOKEN`, `FA_PKG_TOKEN`, and `FONTAWESOME_PACKAGE_TOKEN`.
4. If `package.json`, `package-lock.json`, or `dist/` changed, commit as `github-actions[bot]` and `git push`.

The commit message is `Build Font Awesome kits`, plus the flags that were set, for example `Build Font Awesome kits (--update)`. An empty diff skips the commit.

The workflow does not open a pull request. It pushes to the ref that was checked out. Sites that serve `dist/` from this repository pick up that commit.

Repository permission on the job is `contents: write`, which is what the push needs.

## Secrets

| Secret | Required for |
| --- | --- |
| `FA_API_TOKEN` | Listing kits. The build exits if this is empty |
| `FA_PKG_TOKEN` | `npm ci` and `npm install` of `@awesome.me/kit-*` packages |

Both secrets are the same values documented in [Overview](overview.md). Store them as Actions secrets, not in the repo.

## Next

- [Building kits](building-kits.md)
- [Output layout](output-layout.md)
- [Development](development.md)
