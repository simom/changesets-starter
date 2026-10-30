# Releasing (Changesets, workspaces)

This monorepo uses [Changesets](https://github.com/changesets/changesets) for semver and per-package changelogs.

## When to add a changeset

Every meaningful change should include a file under `.changeset/*.md`, or update an existing open changeset for the same feature.

Skip only when versioning is explicitly not needed.

### Map changed paths to packages

List every affected package in the changeset frontmatter. Use one changeset with multiple packages when a single change spans areas.

PACKAGE_MAP_TABLE

### Bump level

- `major` — breaking for consumers or public API
- `minor` — new feature or additive API
- `patch` — fixes, refactors, docs, tooling

### File format

Create `.changeset/short-description.md`:

```md
---
"@scope/core": major
"@scope/ui": minor
---

Short summary for the package CHANGELOG.
```

Use `major` / `minor` / `patch` per package. Confirm pending bumps:

```bash
npx changeset status
```

Commit the changeset **with** the feature work.

## Release (local)

1. Clean / green tree as appropriate for your project.
2. Commit application changes including pending `.changeset/*.md` files.
3. Apply versions:

   ```bash
   npm run release
   ```

   This runs:

   - `changeset version` — bumps versions, updates package `CHANGELOG.md` files, deletes consumed changesets
   - optional version sync (see `release-kit.config.json`)
   - `npm install --package-lock-only`

   To bump only: `npx changeset version`.

4. Review versions and changelogs.
5. Commit the release (`"commit": false` in `.changeset/config.json`).
6. Optional tag and push.

To also build after versioning, extend the `release` script, for example:

```json
"release": "changeset version && node ./scripts/sync-version.mjs && npm install --package-lock-only && npm run build"
```

## Private packages

Workspace packages that are `"private": true` are skipped unless `.changeset/config.json` includes:

```json
"privatePackages": {
  "version": true,
  "tag": false
}
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Only lockfile changed after `npm run release` | `privatePackages.version` missing or false |
| `.changeset/*.md` still present | Nothing was consumed |
| Root version out of date | Run `node ./scripts/sync-version.mjs` (when `max-semver` sync is configured) |
