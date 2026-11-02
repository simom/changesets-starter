# Changesets for agents

When you change application code, libraries, or anything that should appear in a changelog, add or update a file under `.changeset/*.md` in the **same task** as the code change.

Skip a changeset only for changes that clearly need no version bump (for example typo-only comment edits).

## Workflow

1. Prefer **updating** an existing open changeset for the same feature instead of creating many new files.
2. **Write** the changeset file directly. Do not run interactive `npx changeset`.
3. Run `npx changeset status` before finishing the task when you added or changed changesets.
4. Commit the changeset **with** the feature work (same PR/commit series).

PACKAGE_CONTEXT

### Bump level

| Level | When |
| --- | --- |
| `patch` | Fixes, refactors, docs, tooling |
| `minor` | Additive features or settings |
| `major` | Breaking changes for consumers |

Release flow and troubleshooting: [`docs/release.md`](docs/release.md).
