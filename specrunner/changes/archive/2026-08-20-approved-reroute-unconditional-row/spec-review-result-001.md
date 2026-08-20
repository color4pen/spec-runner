# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### バグの実在確認

`src/core/pipeline/pipeline.ts:453` で `fixerNamesForReroute = new Set(Object.values(this.loopFixerPairs))` を構築し、`pipeline.ts:475` の cleanTransition 探索の除外条件 `!fixerNamesForReroute.has(t.to as string)` に使っていることを実コードで確認した。

`src/core/pipeline/registry.ts:62-67` で `loopFixerPairs = { "code-review": "code-fixer", "spec-review": "spec-fixer", "verification": "implementer" }` であることを確認した。`Object.values(...)` に `implementer` が含まれるため、`spec-review approved → implementer`（unconditional 行）が除外されて cleanTransition が undefined になるというバグ説明は正しい。

### request.md の行番号参照の精度確認

| 参照 | 確認結果 |
|------|---------|
| `types.ts:258` guarded 行 `spec-review → spec-fixer` | ✓ 実在（`when: specReviewHasRoutableFixables`） |
| `types.ts:260` unconditional 行 `spec-review → implementer` | ✓ 実在 |
| `pipeline.ts:452-502` T-03 ブロック | ✓ `{` は `:452`、`}` は `:502` |
| `pipeline.ts:453` `fixerNamesForReroute` 構築 | ✓ 実在 |
| `pipeline.ts:457` `fixerNamesForReroute.has(nextStep)` 発火判定 | ✓ 実在 |
| `pipeline.ts:467` `currentStep === exhaustedReviewer` ガード | ✓ 実在 |
| `pipeline.ts:471-479` cleanTransition 探索 | ✓ 実在。除外条件は `!fixerNamesForReroute.has(t.to as string)` と `(!t.when \|\| t.when(state))` |
| `pipeline.ts:483` `pipeline:fixer:budget-skipped` emit | ✓ 実在 |
| `pipeline.ts:489-494` warning history 追記 | ✓ 実在（"proceeding to" 文言含む） |
| `pipeline.ts:583-589` fixer 入場前予算チェック | ✓ 実在 |
| `types.ts:190-194` LOOP_ERROR_CODES / SPEC_REVIEW_RETRIES_EXHAUSTED | ✓ 実在 |
| `registry.ts:62-67` loopFixerPairs | ✓ 実在 |

### spec.md の規範記法確認

全 Requirement に `SHALL` / `MUST` normative keyword と `#### Scenario:` があることを確認した。

- Requirement 1: "the pipeline SHALL find..." / "It MUST NOT exclude..." ✓
- Requirement 2: "The pipeline MUST NOT emit..." ✓
- Requirement 3: "The cleanTransition fix MUST NOT break..." ✓

### テストファイルの TC-017 不在確認

`tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts` がファイル末尾 TC-016 で終わり、TC-017 が存在しないことを確認した。

### TC-016 との境界確認

TC-016 は `loopFixerPairs = { "verification": "implementer" }` で `spec-review approved → implementer`（`isTestGenExempt` ガード付き）が verification の fixer 予算切れで誤発火しないことを確認する。本 request の TC-017 が対象とする「spec-review approved + spec-fixer 予算切れ → implementer への reroute」は別シナリオであり、TC-016 では担保されていない。ギャップは正確に述べられている。

### fix 内容の論理検証

提案された cleanTransition 探索:
```ts
t.step === currentStep &&
t.on === "approved" &&
t.to !== budgetSkippedFixer &&   // spec-fixer のみ除外
t.to !== "end" &&
t.to !== "escalate" &&
t.when === undefined             // unconditional 縛り
```

spec-fixer 予算枯渇時:
- `budgetSkippedFixer = "spec-fixer"`
- 候補行 `spec-review → spec-fixer`（guarded）: `t.when !== undefined` → 除外 ✓
- 候補行 `spec-review → implementer`（unconditional）: `t.to !== "spec-fixer"`, `t.when === undefined` → 採用 ✓

code-review 予算枯渇時（regression guard）:
- `loopFixerPairs = { "code-review": "code-fixer" }` のみの場合、`fixerNamesForReroute` に `implementer` は含まれない → 修正前後で同一挙動 ✓
- 実際の pipeline では `fixerNamesForReroute` に `implementer` が含まれる。現行コードでは code-review の cleanTransition として `code-review → conformance`（unconditional）が選ばれるが、`conformance` は `fixerNamesForReroute` に含まれないので除外されない → 現行コードでも正常動作。修正後（`t.to !== budgetSkippedFixer` 縛りのみ）でも `conformance` は `budgetSkippedFixer` でないため同様に採用される ✓

`t.when === undefined`（強い絞り）の影響: 現行 `(!t.when || t.when(state))` では guarded 行でも guard が true ならば拾いうるが、これは意図外の動作。仕様強化として `t.when === undefined` に変更することで unconditional 行のみを対象とする動作が確定する。既存テスト群（TC-001/014/016）が green のままであることが安全確認となる。

### セキュリティレビュー

変更はパイプライン state machine の内部遷移ロジックのみ。外部入力・認証・ファイル永続化・暗号処理の変更なし。OWASP Top 10 の該当項目なし。

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実行（ランタイム環境制約）
- TC-017 の修正前 red → 修正後 green の実測（実行できないため）

## Findings 詳細

### Finding 1 (medium / fixable): TC-017 helper の file パスが slug と照合されないと T-03 が発火しない

`specReviewHasRoutableFixables(state)` は `buildCanonWriteScopeFromState(state)` を介して `getJobSlug(state)` のスラッグ（`state.request.slug` → `state.branch` 前置詞除去 → `state.request.path` basename の優先順）から canon scope を計算する。finding の `file` が `writableByFixer["spec-fixer"]`（`specrunner/changes/<slug>/spec.md` 等）に含まれていないと関数が `false` を返し、guarded 行 `spec-review → spec-fixer` が選択されない。

この場合 T-03 は発火せず、`pipeline:fixer:budget-skipped` イベントが emit されないため、TC-017 の pin #2 が満たされない。テストは「修正前」でも「修正後」でも同様に red（pin #2 failure）になり、**破壊確認（TC-004 in test-cases.md）が成立しない**。

tasks.md は「spec-fixer-writable な file」と記述し「specReviewHasRoutableFixables が true を返すために必要な toolResult 構造を含める」と要求しているが、具体的なパス（`specrunner/changes/<slug>/spec.md` のような slug-bound パス）と `state.request.slug` の一致が必要な点を明示していない。既存の `makeCodeReviewApprovedWithFixableRun` が `src/optional-0.ts` を使う実績を参考にすると、実装者が `src/` 配下のパスを使うリスクがある。

**修正案**: tasks.md の `makeSpecReviewApprovedWithRoutableFixableRun` 説明に「`state` に `request.slug` を明示設定し（例: `"budget-test"`）、finding の `file` を `specrunner/changes/<slug>/spec.md` に合わせること」を追記する。
