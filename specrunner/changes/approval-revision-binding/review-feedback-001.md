# Code Review Feedback — approval-revision-binding — iteration 1

## 検証した項目

### 実装ファイル

- `src/core/pipeline/reverification.ts`: `conformanceApprovedForVerifiedRevision` の pure function 実装、4 条件 fail-closed、旧 `conformanceApprovedLatest` の `@deprecated` 保持
- `src/core/pipeline/types.ts`: STANDARD / FAST 両プロファイルの `when` 参照が新関数名に更新済み
- `src/core/step/executor.ts`: `runCliStep` の entry-HEAD 打刻（`captureHeadSha` 呼び出し位置が `step.run()` の**前**）
- `src/core/pipeline/reviewer-status.ts`: `selectPendingMembers` の 3 引数化、revision 照合ロジック、fail-closed ブランチ
- `src/core/pipeline/parallel-review-round.ts`: coordinator ループでの `baselineCommit` 取得、re-anchor 条件（`result.kind === "success" && invalidated.status === "approved"`）、`selectPendingMembers` への渡し
- `src/state/schema/types.ts`: `commitOid` の CLI/agent 非対称の field doc

### テストファイル

- `tests/unit/core/pipeline/conformance-revision-binding.test.ts`: TC-001〜TC-004（guard 単体、must/should）
- `tests/unit/core/step/executor-cli-entry-oid.test.ts`: TC-005〜TC-006（entry-HEAD 打刻、stateful captureHeadSha spy）
- `tests/unit/core/pipeline/select-pending-revision-binding.test.ts`: TC-007〜TC-010、TC-015（selectPendingMembers revision 照合）
- `tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts`: TC-013、TC-017（coordinator e2e、収束確認）
- `tests/unit/core/pipeline/pipeline.reverification.test.ts`: TC-001/TC-002 の commitOid 付与更新
- `tests/unit/pipeline/transition-when.test.ts`: TC-016/TC-017（guard 行の存在・順序・function 性）

### 仕様

- `specrunner/changes/approval-revision-binding/design.md`（D1〜D6、risks、既存テスト更新一覧）
- `specrunner/changes/approval-revision-binding/tasks.md`（T-01〜T-07 チェック済み）
- `specrunner/changes/approval-revision-binding/test-cases.md`（TC-001〜TC-019）

### verification-result.md 確認

- build / typecheck / test / lint / changed-line-coverage 全フェーズ passed
- テスト総数 8569 passed, 1 skipped（import 時間含む 28s）

## 検証できなかった項目

### coordinator 統合テスト（TC-011 / TC-012）

`design.md` の「既存テストの更新」では `parallel-review-round-invalidation.test.ts` / `parallel-review-round-resume.test.ts` でコーディネーターの re-anchor と evidence 不能時 fail-closed を固定すると指定しているが、これらのファイルは本 diff に含まれない。

coordinator ループ内の re-anchor チェーン（`computeInvalidations` → `approvedAtCommit = baselineCommit` → `selectPendingMembers` での skip）が end-to-end で正しく機能することは、既存の `parallel-review-round` に対する統合テストが存在しないため機械的に検証できなかった。

ロジック自体はコードリーディングで確認済み（fail-closed チェーンの正しさを F-01 で説明）。

## Findings 詳細

---

### F-01 [non-blocking / should] TC-011 / TC-012: coordinator re-anchor 統合テストが不在

**ファイル**: `src/core/pipeline/parallel-review-round.ts:119-157`

`design.md` / `tasks.md` T-06 が「coordinator の re-anchor と evidence 不能時 fail-closed を round テストで固定」と明示しているが、対応テストファイルが存在しない。

TC-011（path 未接触 member が `baselineCommit` へ re-anchor され次 round で skip）、TC-012（evidence 不能 → no re-anchor → `selectPendingMembers` で mismatch → pending）はいずれも test-cases.md で "should" 優先度に分類されている。

**影響**:
- `2026-07-15-round-invalidation-source-scoped` の source-scoped 最適化との共存が機械テストで固定されていない。coordinator が re-anchor せずに approved member を残してしまうバグが入り込んでも今のテストでは検出できない。
- コアの fail-closed 不変条件（stale 承認バイパス封鎖）は must テスト群で固定済みのため、バグが合っても必ずセキュリティ的退行にはならないが、`approvedAtCommit` が更新されないまま蓄積すると毎回 reviewer が再走するパフォーマンス退行は検出できない。

**推奨**: 後続 iteration または follow-up request で `parallel-review-round` の coordinator テストを追加する。

---

### F-02 [cosmetic / info] TC-016 の describe コメントに旧関数名が残存

**ファイル**: `tests/unit/pipeline/transition-when.test.ts:224`

```
// TC-016: verification passed → adr-gen (when conformanceApprovedLatest)
```

関数は `conformanceApprovedForVerifiedRevision` に改名済みだが、このコメント行だけ更新されていない。アサション自体は `typeof row!.when === "function"` であり動作に影響なし。

---

### F-03 [cosmetic / info] `conformanceApprovedLatest` の dead export

**ファイル**: `src/core/pipeline/reverification.ts:71`

旧関数が `@deprecated` タグ付きで残存している。`reverification.test.ts` TC-012〜TC-014 がこの関数を直接 import しているため意図的な保持だが、将来の混乱を避けるため cleanup 候補として記録する。

---

### F-04 [cosmetic / info] `(selectPendingMembers as any)` キャスト不要

**ファイル**: `tests/unit/core/pipeline/select-pending-revision-binding.test.ts`（複数箇所）

`baselineCommit?` がオプショナル引数として確定した後も RED 状態で書かれた `as any` キャストが残っている。動作・lint ともに問題なし。

---

## 肯定的所見

- **D2 の entry-HEAD 打刻**: `executor.ts:556-558` で `step.run()` 呼び出し**前**に `captureHeadSha` を実行する実装が正確で、`propagateVerificationResult` との非対称が field doc に明記されている。TC-005 の stateful fake（entry で "entry-sha"、run() 後に "exit-sha"）が回帰テストとして機能している。
- **guard の pure 関数性**: `conformanceApprovedForVerifiedRevision` は state only（git I/O なし）で 4 条件を明確に列挙、コメントも充実。
- **D4 の convergence テスト**: `pipeline.build-fixer-reentry.test.ts` TC-017 が `maxIterations=10` の tight budget でループしないことを確認しており、budget 誤爆のリスクを具体的に排除している。
- **managed runtime fail-safe**: `baselineCommit = null` のブランチが `selectPendingMembers` 内で明示的に分岐されており、managed runtime での退行がない。

