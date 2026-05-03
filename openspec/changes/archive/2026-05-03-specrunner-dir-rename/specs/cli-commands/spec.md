# cli-commands Delta Spec (specrunner-dir-rename)

This delta spec modifies the `cli-commands` specification for the `specrunner-dir-rename` change.

## Modified Requirements

### Requirement: `specrunner doctor` は 7 カテゴリの環境前提条件を診断する

`specrunner doctor` の `repo` カテゴリチェックは MUST 以下を検証する:

- cwd が git repository であること
- `origin` remote が GitHub を指していること
- `openspec/project.md` が存在すること
- `specrunner/requests/{active,merged}/` の 2 ディレクトリが存在すること（warn レベル、不在時も pass を妨げない）

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

#### Scenario: 全ての要求 dir が存在する

- **WHEN** `specrunner/requests/active/` と `specrunner/requests/merged/` がともに存在する
- **THEN** doctor の workflow-structure check は `pass` を返し、message は `"specrunner/requests/ structure is complete"`

#### Scenario: 一部 dir が不在

- **WHEN** `specrunner/requests/merged/` が不在
- **THEN** doctor の workflow-structure check は `warn` を返し、message は `"specrunner/requests/ is missing dirs: merged"`、hint は `"Create the missing directories manually."`

Note: The previous requirement for `openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` is superseded by this delta spec.
