# Tasks: finish-phase1-commit-restore

## [x] Task 1: `commitArchive` 関数の新規作成

**file**: `src/core/finish/commit-archive.ts`

以下の export を追加:

```typescript
export type CommitArchiveResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

export async function commitArchive(params: {
  slug: string;
  cwd: string;
  spawn: SpawnFn;
}): Promise<CommitArchiveResult>
```

実装ロジック:

1. `git diff --cached --quiet` を実行
   - exit 0 → `{ ok: true, skipped: true, message: "No staged changes — commit skipped." }`
   - exit 1 → staging あり、step 2 に進む
   - その他 → `formatEscalation` で escalation 返却
2. `git commit -m "chore: archive <slug>"` を実行
   - exit 0 → `{ ok: true, skipped: false, message: "Committed archive for <slug>." }`
   - exit 非 0 → `formatEscalation` で escalation 返却

import は `SpawnFn` (`../../util/spawn.js`) と `formatEscalation` (`./escalation.js`) のみ。

## [x] Task 2: `commitArchive` の unit test 追加

**file**: `tests/finish-commit-archive.test.ts`

テストケース:

- **staging あり → commit 成功**: spawn が `git diff --cached --quiet` で exit 1、`git commit` で exit 0 を返す → `{ ok: true, skipped: false }` を assert。commit の引数に `"chore: archive test-slug"` が含まれることを verify。
- **staging なし → commit skip**: spawn が `git diff --cached --quiet` で exit 0 を返す → `{ ok: true, skipped: true }` を assert。`git commit` が呼ばれないことを verify。
- **commit 失敗 → escalation**: spawn が `git diff --cached --quiet` で exit 1、`git commit` で exit 1 を返す → `{ ok: false }` で escalation 文字列に `"commit-archive"` を含むことを assert。
- **git diff 異常 exit code → escalation**: spawn が `git diff --cached --quiet` で exit 128 を返す → `{ ok: false }` を assert。

mock パターンは既存の `finish-archive-change-folder.test.ts` の `makeSpawn` / `makeSpawnSequence` に従う。

## [x] Task 3: `orchestrator.ts:runPhase1Archive` に呼び出し追加

**file**: `src/core/finish/orchestrator.ts`

`runPhase1Archive` 関数内、`archiveChangeFolder` の結果処理後 (現 L267)、`return { ok: true }` (現 L269) の前に以下を追加:

```typescript
import { commitArchive } from "./commit-archive.js";

// commit staged changes (spec-merge + archive) as a single commit
const commitResult = await commitArchive({ slug: target.slug, cwd: archiveCwd, spawn });
if (!commitResult.ok) return { ok: false, escalation: commitResult.escalation, exitCode: 1 };
if (!commitResult.skipped) stdoutWrite(commitResult.message);
```

既存の `mergeResult` / `archiveResult` と完全に同一のパターン。

## [x] Task 4: orchestrator integration test の更新

**file**: `tests/finish-orchestrator.test.ts`

既存の TC-123 テストに以下の assert を追加:

- Phase 1 通過後、spawn の呼び出しに `["git", ["diff", "--cached", "--quiet"]]` と `["git", ["commit", "-m", "chore: archive test-slug"]]` が含まれることを verify
- `git commit` の呼び出しが `git mv` / `git add` よりも後であることを verify（呼び出し順序）

TC-103 (archive folder absent) にも assert 追加:
- spec-merge skip + archive skip の場合でも `git diff --cached --quiet` が呼ばれることを verify
- staging なし (exit 0) で `git commit` が呼ばれないことを verify

注意: `makeHappyPathSpawn` は既に `git diff --cached --quiet` (exit 1) と `git commit` (exit 0) のハンドリングを含んでいるため、spawn mock の変更は不要。

## [x] Task 5: delta spec 作成

**file**: `specrunner/changes/finish-phase1-commit-restore/specs/cli-finish-command/delta.md`

`cli-finish-command` capability に Phase 1 末尾 commit step の Requirement を新規追加する delta spec を作成。

本タスクファイルと同時に生成済（下記参照）。

## [x] Task 6: typecheck + test green 確認

`bun run typecheck && bun run test` を実行し green を確認する。
