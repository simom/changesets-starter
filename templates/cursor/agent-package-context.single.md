### Package

Use the root package `"name"` from `package.json` in the changeset frontmatter.

Create `.changeset/short-description.md`:

```md
---
"PACKAGE_NAME": minor
---

Short summary for the CHANGELOG.
```

The quoted name in frontmatter must match the root `package.json` `"name"` field (**`PACKAGE_NAME`**).
