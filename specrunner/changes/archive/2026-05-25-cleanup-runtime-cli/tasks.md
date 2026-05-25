# Tasks: cleanup-runtime-cli

## Task 1: `resolveRepoRoot` 共通 util の新設 [x]

**File**: `src/util/repo-root.ts` (新規)

```typescript
import { spawnCommand } from "./spawn.js";

/**
 * Resolve the git repository root from cwd.
 * Returns null if not in a git repo or git command fails.
 * Use this for read-only CLI commands that can degrade gracefully.
 */
export async function resolveRepoRoot(): Promise<string | null> {
  try {
    const result = await spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the git repository root from cwd, or throw on failure.
 * Use this for state-modifying CLI commands that require a valid git repo.
 */
export async function resolveRepoRootOrFail(): Promise<string> {
  const root = await resolveRepoRoot();
  if (root === null) {
    throw new Error("Failed to resolve git repo root. Ensure you are inside a git repository.");
  }
  return root;
}
```

## Task 2: CLI entry を共通 util 経由に書き換え [x]

### 2a: `src/cli/cancel.ts`

- inline の `spawnCommand("git", ...)` ブロック (L46-58) を削除
- `resolveRepoRootOrFail()` を import して使用
- try/catch で `process.stderr.write(err.message)` + `return 1` を維持
- コメント追加: `// State-modifying command — require valid git repo (fail-fast)`

### 2b: `src/cli/job-show.ts`

- private `resolveRepoRoot()` 関数 (L20-32) を削除
- `import { resolveRepoRoot } from "../util/repo-root.js"` に置換
- 呼び出し箇所を `resolveRepoRoot() ?? process.cwd()` に変更 (返り値が string → string|null に変わるため)
- コメント追加: `// Read-only command — fallback to cwd if git unavailable`

### 2c: `src/cli/ps.ts`

- private `resolveRepoRoot()` 関数 (L117-127) を削除
- `import { resolveRepoRoot } from "../util/repo-root.js"` に置換
- 呼び出し箇所はそのまま (既に null を返す型)
- コメント追加: `// Read-only command — fallback to cwd if git unavailable`

## Task 3: drafts 空 dir 残置の修正 [x]

### 3a: `src/core/runtime/local.ts`

L242-249 の既存 draft 削除ロジックを以下に置き換え:

```typescript
// Delete main worktree draft file (move semantics: draft consumed on run)
try {
  if (opts.requestFilePath.endsWith("/request.md")) {
    // Directory-format draft: remove entire slug directory
    await fs.rm(path.dirname(opts.requestFilePath), { recursive: true, force: true });
  } else {
    // Legacy flat-file format: remove file only
    await fs.rm(opts.requestFilePath);
  }
} catch {
  process.stderr.write(
    `Warning: failed to delete draft file ${opts.requestFilePath} from main worktree. Remove it manually.\n`,
  );
}
```

`path` import が未使用なら追加 (`import * as path from "node:path"` — 既に存在する可能性あり、要確認)。

### 3b: `src/core/runtime/managed.ts`

L132-139 に同じ変更を適用。

## Task 4: Unit test 追加 [x]

### 4a: `src/util/repo-root.test.ts` (新規)

- `resolveRepoRoot()`: git 成功時に repo root 文字列を返す
- `resolveRepoRoot()`: git 失敗時に null を返す
- `resolveRepoRootOrFail()`: git 成功時に repo root 文字列を返す
- `resolveRepoRootOrFail()`: git 失敗時に throw する

`spawnCommand` を mock するか、実際の git 環境で動かす (テストは git repo 内で走るため成功ケースは自然に通る)。

### 4b: drafts 空 dir 削除のテスト

既存の runtime テストファイル (`src/core/runtime/local.test.ts` があれば) に追加、なければ新規作成:

- directory-format draft (`<slug>/request.md`) で run 後、親 dir が削除されている
- legacy flat-file format (`<slug>.md`) で run 後、`specrunner/drafts/` ディレクトリ自体は残っている

## Task 5: 型チェック・テスト確認 [x]

- `bun run typecheck` green
- `bun run test` green

## Dependency Order

```
Task 1 → Task 2 (util が先)
Task 1 → Task 3 (独立だが同時可)
Task 3 → Task 4b
Task 1 → Task 4a
Task 4 → Task 5
```
