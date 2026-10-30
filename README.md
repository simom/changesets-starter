# changesets-starter

One-shot scaffold for [Changesets](https://github.com/changesets/changesets) in Node projects: single package or npm workspaces, with optional post-version sync hooks.

## Quick start

From any project that already has a `package.json`:

```bash
npx degit simom/changesets-starter /tmp/changesets-starter
node /tmp/changesets-starter/bin/init.mjs --cwd .
```

Or clone this repo and run:

```bash
node /path/to/changesets-starter/bin/init.mjs --cwd /path/to/your-project
```

What `init` does:

1. Writes `.changeset/config.json` (including `privatePackages.version` so private packages bump)
2. Adds `changeset` and `release` scripts to `package.json`
3. Installs `@changesets/cli` as a devDependency when missing
4. Writes `docs/release.md` and `release-kit.config.json`
5. Optionally copies `scripts/sync-version.mjs` when a sync strategy is selected

## Profiles

| Profile | When |
| --- | --- |
| `single` | One package at the repo root (default if no `workspaces`) |
| `workspaces` | npm/yarn/pnpm workspaces monorepo (auto-detected from `package.json`) |

```bash
# single package
node bin/init.mjs --cwd ../my-app --profile single

# monorepo
node bin/init.mjs --cwd ../my-monorepo --profile workspaces
```

## Version sync strategies

After `changeset version`, the `release` script can run `scripts/sync-version.mjs`.

### `none` (default)

Only Changesets + lockfile refresh.

```bash
node bin/init.mjs --cwd ../my-app --sync none
```

### `json-field`

Copy the root `package.json` `version` into a string field in another JSON file (formatting preserved via line regex).

```bash
node bin/init.mjs --cwd ../my-app --profile single --sync json-field \
  --json-file config/settings.json --json-field app_version
```

### `max-semver`

Set the root `package.json` `version` to the highest semver among selected workspace packages.

```bash
node bin/init.mjs --cwd ../my-monorepo --profile workspaces --sync max-semver \
  --root-from packages/core,packages/ui,packages/utils
```

`--root-from` accepts package directories or paths ending in `package.json`.

Check alignment without writing:

```bash
node ./scripts/sync-version.mjs --check
```

See [`examples/`](examples/) for sample `release-kit.config.json` files.

## CLI flags

| Flag | Role |
| --- | --- |
| `--cwd <path>` | Target project root (default: current directory) |
| `--profile single\|workspaces` | Override auto-detect |
| `--sync none\|json-field\|max-semver` | Post-version sync |
| `--json-file` / `--json-field` | Required for `json-field` |
| `--root-from a,b,c` | Required for `max-semver` |
| `--base-branch` | Changesets `baseBranch` (default: `main`) |
| `--merge` | Do not overwrite existing config/docs; only fill gaps |
| `--agents` | Append a short release note to existing `AGENTS.md` |
| `--dry-run` | Print actions without writing or installing |
| `--help` | Show help |

## Day-to-day usage

1. For each change, add `.changeset/short-description.md` (or update an open one for the same feature).
2. Frontmatter package names must match each package’s `"name"` in `package.json`.
3. When ready to cut a release:

   ```bash
   npm run release
   ```

4. Commit the version bump and changelogs. Changesets does not create the commit (`"commit": false`).
5. Optionally tag: `git tag vX.Y.Z`.

Details live in the generated `docs/release.md`.

### Extending `release`

The default script does not run a build. Append steps as needed:

```json
"release": "changeset version && node ./scripts/sync-version.mjs && npm install --package-lock-only && npm run build"
```

## Private packages

Private packages are skipped by Changesets unless `.changeset/config.json` includes:

```json
"privatePackages": {
  "version": true,
  "tag": false
}
```

This starter enables that by default.

## License

MIT
