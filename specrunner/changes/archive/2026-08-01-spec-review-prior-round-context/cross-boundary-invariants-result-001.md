# Cross-Boundary Invariants Review Result — spec-review-prior-round-context

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### レビュー観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

### 読んだファイル

- `specrunner/changes/spec-review-prior-round-context/design.md`
- `specrunner/changes/spec-review-prior-round-context/tasks.md`
- `src/core/step/prior-round-context.ts`（新規）
- `src/core/step/spec-review.ts`（変更）
- `src/core/step/step-context-builder.ts`（変更）
- `src/git/dynamic-context.ts`（変更���
- `src/core/port/step-types.ts`（変更）
- `src/prompts/spec-review-system.ts`（��更）
- `src/core/step/fixer-helpers.ts`（`getLatestJudgeFindings` の挙動確認）
- `src/core/port/runtime-strategy.ts`（`listCommitChangedFiles` の contract 確認���
- `src/core/step/commit-orchestrator.ts`���finding-recency の OID 解決との競合確認）
- `src/core/pipeline/types.ts`（遷移テーブル確認）
- `src/core/pipeline/spec-observation.ts`（`specFixerForwardsToTestGen` 実装確認）
- `src/adapter/claude-code/agent-runner.ts`（`enrichContext` 呼び出し順序確認）
- `src/adapter/managed-agent/agent-runner.ts`（同上）
- `src/adapter/codex/agent-runner.ts`（同上）
- `src/core/step/executor.ts`���`buildStepContext` の呼び出し位置・StepRun push 前後の timing 確認）
- `src/kernel/report-result.ts`（`Finding` 型のフィールド定義確認）

### 検証した不変条件一覧

#### 1. one-shot 寿命の構造的保証

`priorRoundContext` は `DynamicContext` の optional field であり、`DynamicContext` は per-run の in-memory 値（`JobState` に永続化されない）。`collectDynamicContext` は `priorRoundContext` を設定しない（`dynamic-context.ts` 確認）。`AgentRunContext` は `JobState.steps` に記録されず、`StepRun` の `outcome` / `toolResult` に `priorRoundContext` が入る経路がない。one-shot 寿命は構造的に保証される。✓

#### 2. `buildStepContext` → `enrichContext` の実行順序と保存

実行経路:
1. `executor.ts:313` — `buildStepContext` 呼び出し（`prepareRoundContext` がここで起動され `priorRoundContext` を dynamicContext に merge）
2. `ctx.input.dynamicContext` に enriched dynamicContext が格納される
3. `adapter.run(ctx)` が呼��れる（`executor.ts:352`）
4. 各 adapter で `stepCtx.dynamicContext = ctx.input.dynamicContext`（既に enriched）
5. `step.enrichContext(stepCtx.dynamicContext!, ...)` 呼び出し
6. `SpecReviewStep.enrichContext` は passthrough noop → `priorRoundContext` 保持
7. `step.buildMessage(state, stepCtx)` — `deps.dynamicContext?.priorRoundContext` を読む

`SpecReviewStep.enrichContext` が noop（`return dynamicContext` そのまま）であることを `spec-review.ts:100-102` で確認。`priorRoundContext` は `buildMessage` まで届く。✓

#### 3. timing 不変: `buildStepContext` は現 round の StepRun push 前

`executor.ts` の実行順序:
- `buildStepContext`（:313）→ `prepareStepArtifacts`（:335）→ agent run（:352）→ StepRun push（finalize 内）

`runAgentStep` に渡される `state` は finalize 前のものであり、現 round の StepRun は未 push。`computeSpecReviewIteration(state) = state.steps[SPEC_REVIEW]?.length + 1` が「前回までの完了済み run 数 + 1」を返すことで iteration gate が正確に機能する。`getLatestJudgeFindings(state, SPEC_REVIEW)` も前周（round iteration−1）の findings を返す。✓

#### 4. finding-recency（OID）との干渉なし

finding-recency（`commit-orchestrator.ts:271-278`）が使う OID:
- `state.steps[SPEC_REVIEW][length-2]?.commitOid`（2番目に古い spec-review の exit-HEAD）
- step 完了後（finalize 内）に実行

prior-round context が使う OID:
- `state.steps[SPEC_FIXER][length-1]?.commitOid`（最新 spec-fixer の exit-HEAD）
- step 実行前（buildStepContext 内）に実行

異なる step の異なるタイミングで異なる OID を参照。干渉なし。��

#### 5. 省略契約（導出不能時の degrade）

`derivePriorRoundContext` の null 返却条件:
- `iteration < 2` → `null`
- `resolvePriorFixerOid(state) === null` → `null`
- `runtimeStrategy?.listCommitChangedFiles` 不在（managed 相当）→ `null`
- `listCommitChangedFiles` が `{ kind: "unavailable" }` → `null`

`buildStepContext` が `prepareRoundContext` を `try/catch` で囲んでいる（:154-160）。いずれのケースでも step は正常続行。`never-throw` 設計は `runtime-strategy.ts` の contract doc と整合。✓

#### 6. `computeSpecReviewIteration` の二重呼び出し整合

`prepareRoundContext` と `buildMessage` の両方で `computeSpecReviewIteration(state)` を呼ぶ。`state` は両者を通じて同一オブジェクト（mutate なし）であるため、iteration 値は一致する。iteration gate は `derivePriorRoundContext` に集約されており、`buildMessage` は `priorRoundContext` の有無だけを見る（gate 二重管理なし）。✓

#### 7. `Finding` フィールドマッピングの安全性

`getLatestJudgeFindings` が返す `Finding[]` から `{ severity, resolution, file, title }` を projection。`Finding` interface（`kernel/report-result.ts`）で `severity: FindingSeverity`（required）、`resolution: FindingResolution`（required）、`file: string`（required）、`title: string`（required）を確認。`undefined` になるフィールドはない。✓

#### 8. conformance-triggered spec-fixer 経由での spec-review 再起動時の動作

実際の遷移経路（`types.ts:244-246` + `spec-observation.ts:60-81` で確認）:
- conformance → needs-fix:spec-fixer → spec-fixer
- spec-fixer approved + `specFixerForwardsToTestGen = false`（conformance entry のため Condition 1 で false）→ 無条件行 spec-fixer → spec-review が発火
- spec-review が iteration N+1 で起動

このとき:
- `resolvePriorFixerOid` = conformance-triggered spec-fixer の commitOid（最新 spec-fixer run）
- `getLatestJudgeFindings` = iteration N の spec-review findings

注入は正しく機能する（conformance-triggered fixer が何を変えたかと、直前 spec-review 所見が reviewer に届く）。✓

---

## 検証できなかった項目

- `specFixerForwardsToTestGen` の判定が期待通り false になるかを実際の pipeline integration test で確認することは今回のスコープ外（既存テスト `spec-review-fixer-routing.test.ts` が regression guard として機能することを確認するにとどめた）

---

## Findings 詳細

### F-001 (LOW): design.md のルーティング主張が実コードと食い違う（実装は正しい）

**ファ���ル**: `specrunner/changes/spec-review-prior-round-context/design.md`（line 127）

**証拠**:

design.md:127 の主張:
> "conformance 由来の spec-fixer 起動は spec-fixer → test-gen へ抜けて spec-review へ戻らない（`src/core/step/fixer-helpers.ts` の routing）ため、spec-review 時点の最新 spec-fixer run はループ fixer であることが保証される"

実際の routing（`src/core/pipeline/spec-observation.ts:60-74`）:

```ts
export function specFixerForwardsToTestGen(state: JobState): boolean {
  // Condition 1: not a conformance-triggered entry → false を返す
  if (getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER) !== null) return false;
  ...
}
```

遷移テーブル（`src/core/pipeline/types.ts:244-246`）:
```ts
{ step: SPEC_FIXER, on: "approved", to: TEST_CASE_GEN, when: specFixerForwardsToTestGen }, // conformance entry は false → 発火せず
{ step: SPEC_FIXER, on: "approved", to: SPEC_REVIEW },  // conformance entry はここが発火
```

conformance-triggered spec-fixer は **test-case-gen へ行かず spec-review へ戻る**。design.md の主張は逆。

**なぜ実装は壊れていないか**: `resolvePriorFixerOid` は最新 spec-fixer run の commitOid を返す（trigger 問わず）。conformance 経由でも spec-review ループ経由でも、直前の spec-fixer run が正しく参照される。design doc の routing 説明は誤りだが、結論（最�� spec-fixer run を使う）は正しい。

**リスク**: 将来の保守者が "conformance-triggered spec-fixer は spec-review へ戻ら���い" という誤った前提でコードを変更した場合に、この注入経路のカバレッジが想定外に減る可能性がある。

---

### F-002 (LOW): `prepareRoundContext` → `enrichContext` の順序不変がインターフェースに明記されていない

**ファイル**: `src/core/port/step-types.ts`（`enrichContext` doc comment）

**証拠**:

実行順序（adapter 3 系統で確認）:
1. `buildStepContext` → `prepareRoundContext` → `priorRoundContext` を dynamicContext に merge
2. adapter 内で `enrichContext(stepCtx.dynamicContext!, ...)` → spec-review は noop

`AgentStep.enrichContext` の doc comment（`step-types.ts:243`）:
> "Returns a new DynamicContext with additional fields populated."

この doc は「`prepareRoundContext` が事前に書き込んだフィールドを保持すること」を要求していない。現状 `SpecReviewStep.enrichContext` は passthrough noop なので問題は起きていない。しかし将来 `enrichContext` を非 noop に変更した場合、`priorRoundContext` が drop されても TypeScript エラーにならない（field は optional）。

**現状リスクゼロの根拠**: `spec-review.ts:100-102` のコメントに "既存の noop `enrichContext` は変更不要（そのまま維持）" と明記されており、tasks.md T-03 も "���存の noop `enrichContext`（spec-review.ts:98-100）は変更不要（そのまま維持）" と指示している。

**改善候補（ブロッカーではない）**: `AgentStep.enrichContext` の doc comment に "注意: `prepareRoundContext` が設定したフィールドを消去しないよう、通常は `{ ...dynamicContext, ...newFields }` で返すこと" を一言添えると、将来の誤実装を防ぎやすい。
