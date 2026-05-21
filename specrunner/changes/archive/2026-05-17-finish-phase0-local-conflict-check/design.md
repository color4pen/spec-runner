# Design: finish-phase0-local-conflict-check

## Problem

`specrunner finish` の Phase 0 は GitHub `mergeStateStatus` API のみで conflict を判定する。この API は非同期で UNKNOWN を返し続ける場合があり、フォールバックで Phase 1 に進行してしまう。Phase 1 は archive commit を feature branch に作成し Phase 2 で push するが、実際には base branch と conflict がある場合、Phase 3 で merge 不可 → 半状態（archive 済 + push 済 + merge 不可）が残る。ユーザーは手動 `git reset --hard` + rebase + force push が必要になる。

## Solution

Phase 0 (preflight 後) に **ローカル git 操作** で conflict を deterministic に検出する step を挿入し、conflict があれば Phase 1 に進ませない。

## Key Design Decisions

### 1. 判定手法: `git merge-tree --write-tree`

`git merge-tree --write-tree HEAD origin/<base>` (git 2.38+) を使用。

- exit code 非 0 → conflict あり
- stdout に conflict 情報 (path 一覧) が含まれる
- deterministic: retry 不要、ネットワーク遅延なし
- `git rebase --dry-run` は古い git で non-existent、`git merge --no-commit` は worktree を汚す

### 2. 挿入位置

```
runPreflight() → [OK] → runPhase0LocalConflictCheck() → [OK] → runPhase1Archive()
```

- preflight (GitHub API check) の**直後**
- Phase 1 archive commit の**前**
- preflight が fail した場合はそもそも到達しない

### 3. mergeStateStatus との関係

既存 mergeStateStatus check を**削除しない**。両者を直列に実行し、いずれかが fail で Phase 1 阻止。mergeStateStatus は ahead/behind / draft 検出にも使われるため補助として維持。

### 4. State 変更なし

conflict 検出時は `{ exitCode: 1, escalation }` を return するのみ。job state は変更しない（= 既存 Phase 0 escalation と同等パターン）。これにより `assertJobFinishable` が次回 finish を block しないため、rebase 後の再実行が可能。

### 5. Fetch 失敗 = escalation

`git fetch origin <base>` が失敗した場合、silent skip せず escalation。ネットワーク不可でローカル判定できない = 安全側に倒す。

### 6. `git merge-tree` の出力パース

git 2.38+ の `git merge-tree --write-tree` は:
- 成功 (no conflict): exit 0, stdout に tree hash のみ
- conflict あり: exit 1, stdout に conflict 情報 (informational messages containing file paths)

conflict path 抽出は stdout の各行から `CONFLICT` prefix を含む行をパースして path を取得する。

## Spec Authority

該当 capability: `specrunner/specs/cli-finish-command/spec.md`

既存 Requirement「`specrunner finish` は Phase 0 pre-flight を irreversible op の前に全実行する」を MODIFIED で更新し、Phase 0 にローカル conflict check (check #8) が含まれることを追記する。

## Module Structure

```
src/core/finish/local-conflict-check.ts   (NEW)
src/core/finish/orchestrator.ts            (MODIFIED: 挿入)
tests/unit/core/finish/local-conflict-check.test.ts  (NEW)
tests/finish-orchestrator.test.ts          (MODIFIED: TC 追加)
specrunner/specs/cli-finish-command/spec.md (MODIFIED via delta)
```

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| git 2.38 未満の環境 | 既存 codebase が git 2.38+ 前提 (branch-checkout.ts 等)。doctor で version check 可能 |
| `git merge-tree` の出力フォーマット変更 | exit code を primary 判定に使い、path 抽出は best-effort (空配列でも `ok: false` は返す) |
| fetch が slow で finish 体感遅延 | 既存 Phase 0 で `gh pr view` の retry (最大 9 秒) があるため、fetch 1 回の追加は許容範囲 |
