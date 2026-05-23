# Code Review Feedback: executor-pipeline-cleanup — iter 1

- **verdict**: approved

---

## Summary

振る舞い不変のリファクタとして正しく実装されている。commit/push 抽出・pipeline stdout 共通化ともに設計意図どおり。全 must テストケースを通過確認。

---

## Findings

### INFO-1: design.md の振る舞い保持チェックリストが未チェック

- **Severity**: info
- **File**: `specrunner/changes/executor-pipeline-cleanup/design.md` L117-121
- **Detail**: tasks.md のタスクはすべて `[x]` になっているが、design.md 内の振る舞い保持チェックリスト（5 項目）が `[ ]` のまま。実装は正しいのでブロッカーではないが、設計ドキュメントとして不整合が残る。
- **Action**: 任意。次 iteration での追跡は不要。

### INFO-2: verification の test-coverage フェーズが 0/0

- **Severity**: info
- **File**: `specrunner/changes/executor-pipeline-cleanup/verification-result.md` L14
- **Detail**: `test-coverage: 0/0 must TCs covered (no must TCs defined)` — 自動カバレッジチェッカーが test-cases.md の must TC を拾っていないが、2687 テスト全通過で振る舞い回帰は実質カバーされている。リファクタリングとして許容範囲。
- **Action**: なし（refactoring 型で新規動作追加なし）。

---

## Test Case Coverage (must)

| TC | 内容 | 結果 |
|----|------|------|
| TC-STRUCT-001 | commit-push.ts のエクスポート確認 | ✅ `findAuthoritySpecViolations` / `commitAndPush` / `pushOnly` / `CommitPushInfra` すべて export 済み |
| TC-STRUCT-002 | executor.ts から定義が消えている | ✅ 該当 private method・定数なし、`import { commitAndPush, CommitPushInfra }` と `commitPushInfra` フィールド存在 |
| TC-STRUCT-003 | pipeline.ts に `printPipelineFinished` が 1 箇所のみ | ✅ L362-369 に定義、`Pipeline finished:` リテラルは L367 の 1 箇所のみ、3 call site 確認済み |
| TC-STRUCT-004 | executor.ts の不要 import 削除 | ✅ `noCommitDetectedError` / `pushFailedError` / `authoritySpecEditViolationError` は executor.ts から削除。`stderrWrite` は `finalizeStep` L343 で引き続き使用され正しく残存 |
| TC-BEHAV-001〜006 | commit/push 振る舞い回帰 | ✅ 2687 テスト全通過（verification-result.md） |
| TC-PIPELINE-001〜005 | pipeline stdout 回帰 | ✅ 同上 |
| TC-BUILD-001〜004 | typecheck / test | ✅ typecheck 0 error、テスト全通過 |

---

## Acceptance Criteria Check

| 受け入れ基準 | 確認 |
|------------|------|
| commit/push 関連関数が executor.ts から別ファイルに抽出 | ✅ `src/core/step/commit-push.ts` に移動 |
| executor.ts は commit/push の本体ロジックを持たない | ✅ `commitAndPush` の呼び出しのみ（L228） |
| pipeline.ts の stdout 3 箇所が共通 helper 経由 | ✅ L262 / L313 / L332 がすべて `this.printPipelineFinished(state)` |
| 既存 spec scenario が green | ✅ 全テスト通過、振る舞い回帰なし |
| stdout 出力が文言含め従来どおり | ✅ helper 内でフォーマット完全一致 |
| `bun run typecheck && bun run test` が green | ✅ verification-result.md にて確認 |
