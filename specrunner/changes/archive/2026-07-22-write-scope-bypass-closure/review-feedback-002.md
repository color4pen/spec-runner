# Review Feedback — write-scope-bypass-closure (Iteration 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（src 2 files / tests 4 files / change folder docs）
- `design.md` D1–D7 / `tasks.md` T-01–T-11 / `spec.md` / `test-cases.md` (TC-001–TC-030) を通読
- `src/core/step/commit-push.ts` 全体（316 行差分）: D3 pathspec commit / D2 自己 commit 検査 / D4 残余 halt / D6 quarantine range / D7 tail context
- `src/core/step/write-scope.ts` 全体: `findScopedCommitViolations` (T-01 / D5) leaf 制約
- `tests/unit/step/write-scope-bypass-closure.test.ts` (1641 行): TC-001–TC-022、quarantine 関連
- `tests/unit/step/write-scope-bypass-closure-integration.test.ts` (472 行): TC-023–TC-025 実 git
- `tests/unit/step/write-scope-bypass-closure-write-scope.test.ts` (171 行): TC-014–TC-017
- `tests/unit/step/commit-push-write-scope.test.ts` (T-08 更新部): TC-023 群 / quarantine-03
- `tests/unit/architecture/write-scope-invariants.test.ts`: TC-010 / TC-028 leaf + 単一ソース
- `bun run typecheck` → exit 0
- `bun run test` → 593 test files, 8689 passed (1 skipped)
- 個別確認: `write-scope-bypass-closure.test.ts` 31 passed / integration + invariants 16 passed

## 検証できなかった項目

None

## Findings 詳細

### F-001 · LOW · docs

**`commitFinalState` docstring のメカニズム記述が operator fix（cdc60bfc3）後に不正確**

**Location**: `src/core/step/commit-push.ts` — `commitFinalState` JSDoc (~line 527–531) および T-06 コードコメント (~line 438–440)

`commitFinalState` docstring:
> "When T-06 throws, those staged declared outputs remain in the index."

しかし operator fix が追加した T-06 コードは throw 前に `git reset HEAD -- stagePaths` を実行する:

```typescript
// T-06: unstage the already-staged declared outputs before the halt.
// The step result was produced alongside a canon violation — leaving it staged
// would let the checkpoint commit record it as if the step completed normally.
await gitExecResult(infra.spawnFn, cwd, ["reset", "HEAD", "--", ...stagePaths]);
throw writeScopeViolationError(...);
```

`git reset HEAD -- stagePaths` により declared outputs は index から除外される（unstaged になる）。docstring の "remain in the index" は事実と異なる。

ただし **net 挙動は同一**: `commitFinalState` の `git add -A` が worktree から再 stage するため、declared outputs はどちらのケースでもチェックポイント commit に含まれる。docstring の結論「This is accepted」は正しい。

T-06 コードコメントも誤誘導がある：「leaving it staged would let the checkpoint commit record it」は unstage がチェックポイント記録を防ぐかのように読めるが、防がない（`git add -A` で再 stage される）。

**推奨**: `commitFinalState` docstring を修正し "those staged declared outputs remain in the index" → "those declared outputs are unstaged by git reset HEAD before the throw, then re-staged from the worktree by git add -A here" に変更する。T-06 コードコメントも整合させる。

---

### F-002 · LOW · coverage

**T-06 residual halt 内の `git reset HEAD -- stagePaths` が未テスト・behavioral effect ゼロ**

**Location**: `src/core/step/commit-push.ts` ~line 440 / `tests/unit/step/write-scope-bypass-closure.test.ts` TC-008 他

TC-008、TC-023（commit-push-write-scope.test.ts）、quarantine-03 のいずれも `git reset` の呼び出し自体を assert していない。既存の mock は `reset` subcommand に応答を定義していないが default exit 0 で素通りするため、`reset` 行を削除しても全テストが green のまま。

behavioral effect がゼロである理由（F-001 に記述のとおり）: unstage 後に `git add -A` が worktree から再 stage するため、declared outputs のチェックポイント記録有無は `reset` の有無に関わらず同一。

operator が「halt 後 `git diff --cached` が clean であること」を operator 診断のために保証したいなら、その意図をテストで固定すべき（`reset` が呼ばれることを assert するか、`git diff --cached` 結果を integration テストで検証する）。

**推奨**: operator fix の意図（halt 後 index を clean にすること）をテストで明示する。または `git reset` を削除し、コメントを `commitFinalState` docstring の "This is accepted" と整合させる。

---

## 受け入れ基準チェック

| 基準 | 対応 TC | 状態 |
|------|---------|------|
| scoped 事前 stage 許可外ファイルが commit に含まれない | TC-001, TC-023 (intg) | ✅ |
| scoped/guarded 自己 commit 違反 → push せず halt | TC-004, TC-005, TC-024 (intg) | ✅ |
| 違反なし自己 commit → push される（挙動保存） | TC-006 | ✅ |
| scoped 残余違反 → halt（続行しない） | TC-008, TC-009, TC-025 (intg) | ✅ |
| 3 経路の違反で quarantine + halt メッセージに退避先 | TC-010, TC-011, TC-019, quarantine-03 | ✅ |
| 破壊確認（revert → fail）がコメントで記録 | TC-023/024/025 DESTROY コメント | ✅ |
| 既存テスト無改変 green（意図変更を除く） | 8689 tests passed | ✅ |
| typecheck && test green | typecheck exit 0, 593 files passed | ✅ |

## Architecture Invariants

- write-scope.ts leaf 制約（src/util/paths.ts のみ import）: ✅ TC-010 / TC-028
- findScopedCommitViolations が write-scope 単一ソースに追加: ✅ TC-028
- commit-push.ts が findScopedCommitViolations を write-scope 経由で呼ぶ: ✅ TC-028
- stagingModeFor / findWriteScopeViolations が単一ソース経由: ✅ TC-022 (write-scope-invariants.test.ts)
