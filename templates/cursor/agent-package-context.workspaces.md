### Map paths to packages

List every affected package in the changeset frontmatter. One changeset may list multiple packages when a single change spans areas.

PACKAGE_MAP_TABLE

Create `.changeset/short-description.md`:

```md
---
"@scope/core": major
"@scope/ui": minor
---

Short summary for the package CHANGELOG(s).
```

Package names must match each `"name"` in the workspace `package.json` files.
