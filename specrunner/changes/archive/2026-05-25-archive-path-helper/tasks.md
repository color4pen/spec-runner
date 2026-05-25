# Tasks: archive-path-helper

## Task 1: `util/paths.ts` に helper 追加 [x]

- `archivedChangesDirRel()` を export — `${CHANGES_DIR}/archive` を返す
- `archivedChangeFolderPath(datedSlug: string)` を export — `${CHANGES_DIR}/archive/${datedSlug}` を返す
- 配置場所: `changesDirRel()` の直後（L71-73 付近）が自然

## Task 2: リテラル直書き 4 箇所を置換 [x]

### 2-1: `src/context/request-patterns.ts:31`

```diff
+import { archivedChangesDirRel } from "../util/paths.js";
 ...
-  const archiveDir = path.join(cwd, "specrunner", "changes", "archive");
+  const archiveDir = path.join(cwd, archivedChangesDirRel());
```

### 2-2: `src/core/doctor/checks/repo/workflow-structure.ts:25`

```diff
+import { changesDirRel } from "../../../util/paths.js";
 ...
-    const changesDirPath = path.join(ctx.cwd, "specrunner", "changes");
+    const changesDirPath = path.join(ctx.cwd, changesDirRel());
```

### 2-3: `src/core/request/store.ts:10`

```diff
-import { parseArchiveDirName } from "../../util/paths.js";
+import { parseArchiveDirName, archivedChangesDirRel } from "../../util/paths.js";
 ...
-const ARCHIVE_SUBDIR = path.join("specrunner", "changes", "archive");
+const ARCHIVE_SUBDIR = archivedChangesDirRel();
```

注: `path.join(cwd, ARCHIVE_SUBDIR)` の利用箇所はそのまま動作する（値が同一文字列）。

### 2-4: `src/core/finish/archive-change-folder.ts:48`

```diff
-import { changeFolderPath, changesDirRel } from "../../util/paths.js";
+import { changeFolderPath, changesDirRel, archivedChangeFolderPath } from "../../util/paths.js";
 ...
-  const archivePath = `${changesDirRel()}/archive/${dateStr}-${slug}`;
+  const archivePath = archivedChangeFolderPath(`${dateStr}-${slug}`);
```

## Task 3: unit test 追加 [x]

`tests/unit/util/paths.test.ts` に以下を追加:

```ts
import { archivedChangesDirRel, archivedChangeFolderPath } from "../../../src/util/paths.js";

describe("archivedChangesDirRel()", () => {
  it("returns specrunner/changes/archive", () => {
    expect(archivedChangesDirRel()).toBe("specrunner/changes/archive");
  });
});

describe("archivedChangeFolderPath()", () => {
  it("returns specrunner/changes/archive/<datedSlug>", () => {
    expect(archivedChangeFolderPath("2026-05-20-my-change")).toBe(
      "specrunner/changes/archive/2026-05-20-my-change",
    );
  });
});
```

## Task 4: 検証

- `bun run typecheck` green
- `bun run test` green（既存テスト + 新規テスト）

## 完了条件

- 4 箇所すべてが helper 経由に置換されている
- `util/paths.ts` に TC-034 違反（他 src/ からの import）がない
- 新規 helper の unit test が pass
