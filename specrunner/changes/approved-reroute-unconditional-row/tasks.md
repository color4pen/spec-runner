# Tasks:

## T-01: cleanTransition 探索の置換

`src/core/pipeline/pipeline.ts:471-479` の cleanTransition 探索を修正する。

- [ ] `pipeline.ts:471-479` の `cleanTransition` 探索を以下に置き換える:
  ```ts
  const cleanTransition = this.transitions.find(
    (t) =>
      t.step === currentStep &&
      t.on === "approved" &&
      t.to !== budgetSkippedFixer &&
      t.to !== "end" &&
      t.to !== "escalate" &&
      t.when === undefined
  );
  ```
- [ ] 探索条件から `!fixerNamesForReroute.has(t.to as string)` を削除する（`fixerNamesForReroute` は発火判定 `:457` のために構築は残す）

**Acceptance Criteria**:
- `pipeline.ts:471-479` の cleanTransition 探索に `fixerNamesForReroute` への参照が存在しない
- 探索条件が `t.when === undefined` + `t.to !== budgetSkippedFixer` + `t.to !== "end"` + `t.to !== "escalate"` の 5 条件になっている
- `bun run typecheck` が通る

## T-02: T-03 コメントの更新

T-03 ブロック (`pipeline.ts:431-501`) のコメントを新しい機能定義に合わせて更新する。

- [ ] `pipeline.ts:468-470` の cleanTransition 探索コメントを「clean approved transition = 同 verdict の unconditional row（`t.when === undefined`）」「除外は `budgetSkippedFixer` 単体と end/escalate のみ」に更新する
- [ ] `pipeline.ts:431-444` のブロックレベル説明を「T-03: unconditional approved row へ降りる」方針に合わせて更新する
- [ ] TC-014 の DESTRUCTION CONFIRMATION コメント（`:447-451`）は再現手順が変わらない範囲で保持する

**Acceptance Criteria**:
- T-03 ブロックのコメントが「unconditional row」「除外は skip 対象の paired fixer 単体」を説明している
- TC-014 DESTRUCTION CONFIRMATION コメントが保持されている

## T-03: spec-fixer 版再現テスト (TC-017) の追加

`tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts` に TC-017 を追加する。

シナリオ:
1. `spec-review` → needs-fix → `spec-fixer` (attempt 1)
2. `spec-review` → needs-fix → `spec-fixer` (attempt 2)  [spec-fixer budget = 2/2 消費]
3. `spec-review` → approved + routable fixable finding (spec-fixer-writable canon 宛)
   → guarded 行 `spec-review → spec-fixer` が選択されるが spec-fixer 予算切れ
   → T-03 が発火し、unconditional 行 `spec-review → implementer` へ reroute

- [ ] `makeSpecReviewNeedsFixRun` ヘルパー（attempt 番号のみ受け取る）を追加または流用し、spec-review needs-fix のステップ run を構築する
- [ ] `makeSpecReviewApprovedWithRoutableFixableRun` ヘルパーを追加し、approved + fixable finding (severity: "low", resolution: "fixable", spec-fixer-writable な file) を持つ spec-review run を構築する。`specReviewHasRoutableFixables` が true を返すために必要な toolResult 構造を含める
- [ ] TC-017 の `describe` ブロックを追加し、以下を assert する:
  - `result.status === "awaiting-archive"` (`SPEC_REVIEW_RETRIES_EXHAUSTED` が出ない)
  - `budgetSkippedEvents` に `{ step: "spec-review", fixer: "spec-fixer" }` が含まれる
  - `result.history` に未適用 finding 数が入った warning エントリが存在する（`"proceeding to"` 文言含む）
  - `implementerCallCount >= 1` (implementer が実行される)
- [ ] ファイル冒頭の TC 一覧コメント (`TC-001` 〜 `TC-016`) に `TC-017` を追記する
- [ ] パイプライン構成: `loopFixerPairs: { "spec-review": "spec-fixer", "verification": "implementer" }`, maxIterations=2, 遷移テーブルは `specReviewHasRoutableFixables` ガード付き `spec-review → spec-fixer` 行と unconditional `spec-review → implementer` 行を含む

**Acceptance Criteria**:
- TC-017 が修正後のコードで green
- TC-017 で `cleanTransition` 探索を `(!t.when || t.when(state))` + `!fixerNamesForReroute.has(t.to)` の旧条件に戻すと TC-017 が red になる（破壊確認）
- 既存 TC-001/TC-014/TC-016 が無改変で green

## T-04: 通し確認

- [ ] `bun run typecheck` が通ること
- [ ] `bun run test` が通ること（既存 TC を含む全テスト green）

**Acceptance Criteria**:
- `bun run typecheck` exit code 0
- `bun run test` exit code 0
