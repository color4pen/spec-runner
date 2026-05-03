# cli-commands Delta Spec (specrunner-dir-rename)

This delta spec modifies the `cli-commands` specification for the `specrunner-dir-rename` change.

## Modified Requirements

### Requirement: `specrunner doctor` は 7 カテゴリの環境前提条件を診断する

The `repo` category check requirements are updated as follows:

| Category | 検証対象 |
|----------|---------|
| `repo` | cwd が git repository、`origin` remote が GitHub、`openspec/project.md` 存在、`specrunner/requests/{active,merged}/` 構造存在（warn） |

The workflow structure check SHALL verify that the following directories exist:

- `specrunner/requests/active/`
- `specrunner/requests/merged/`

The check SHALL be implemented in `src/core/doctor/checks/repo/workflow-structure.ts` with:

```typescript
const REQUIRED_DIRS = ["active", "merged"] as const;
```

Path construction SHALL use `specrunner/requests/` as the base directory:

```typescript
const fullPath = path.join(ctx.cwd, "specrunner", "requests", dir);
```

The check SHALL return:
- `pass` status with message `"specrunner/requests/ structure is complete"` when all directories exist
- `warn` status with message `"specrunner/requests/ is missing dirs: ${missing.join(", ")}"` when directories are missing
- hint: `"Create the missing directories manually."`

Note: The previous requirement for `openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` is superseded by this delta spec.
