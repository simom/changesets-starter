# Releasing (Changesets)

This repo uses [Changesets](https://github.com/changesets/changesets) for semver and `CHANGELOG.md`.

## When to add a changeset

Every meaningful change should include a file under `.changeset/*.md`, or update an existing open changeset for the same feature.

Skip only when versioning is explicitly not needed (for example typo-only comment edits).

### Bump level

| Level | When |
| --- | --- |
| `patch` | Fixes, refactors, docs, tooling |
| `minor` | Additive features or settings |
| `major` | Breaking changes for consumers |

### File format

Create `.changeset/short-description.md`:

```md
---
"PACKAGE_NAME": minor
---

Short summary for the CHANGELOG.
```

Replace `PACKAGE_NAME` with the `"name"` field from root `package.json`.

Check pending bumps:

```bash
npx changeset status
```

Commit the changeset **with** the feature work.

## Release (local)

1. Clean tree and committed pending changesets.
2. Apply versions:

   ```bash
   npm run release
   ```

   Runs `changeset version` (bumps `package.json`, updates `CHANGELOG.md`, consumes `.changeset/*.md`), then any configured version sync, then refreshes the lockfile.

3. Review `package.json` and `CHANGELOG.md`.
4. Commit the release (Changesets does not commit: `"commit": false` in `.changeset/config.json`).
5. Optional tag: `git tag vX.Y.Z`
6. Push when ready: `git push` and `git push --tags`

## Private packages

If the package is `"private": true`, Changesets skips versioning unless `.changeset/config.json` includes:

```json
"privatePackages": {
  "version": true,
  "tag": false
}
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `package.json` unchanged after `npm run release` | Missing `privatePackages.version` or no pending changesets |
| `.changeset/*.md` still present | Nothing was consumed |
