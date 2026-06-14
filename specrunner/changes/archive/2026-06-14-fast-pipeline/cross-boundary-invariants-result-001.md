# cross-boundary-invariants review — fast-pipeline — iteration 001

## Scope

- **Reviewer**: cross-boundary-invariants
- **Purpose**: 変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する
- **diff stat**: src/ 3 ファイル変更（registry.ts +67, types.ts +46, kernel/pipeline-ids.ts +1）。specrunner/ に設計アーティファクト・テストを追加。

---

## 検査した不変条件と結果

### I-1: `composeReviewerDescriptor` が `permissionScope` を保持するか

**結論: 保持される ✓**

`compose-reviewers.ts:111` の返却オブジェクトは `{...base, steps, transitions, loopNames, loopFixerPairs, roles, maxIterationsByStep}` という spread 構造。`permissionScope` はオーバーライド対象フィールド一覧に含まれないため、`{...base}` 経由でそのまま引き継がれる。

fast + custom reviewer が組み合わさる場合も、composed descriptor の `permissionScope.checkpoint === "conformance"` は維持される。`buildPipeline` は `descriptor.permissionScope` を `StepExecutor` に渡す（`run.ts:55`）ため、executor の scope 検出は正しく機能する。

### I-2: `buildPipeline` → `StepExecutor` への `permissionScope` 注入

**結論: 正常 ✓**

`run.ts:55`:
```typescript
const executor = new StepExecutor(bus, runner, deps.storeFactory, deps.gitTransportSpawn, undefined, descriptor.permissionScope);
```
`FAST_DESCRIPTOR.permissionScope`（checkpoint=conformance）が executor に注入される。`computeExtraScopeFindings` は `stepName !== permissionScope.checkpoint` でガードするため、conformance 以外では scope 合成が走らない（単一 checkpoint 不変条件を維持）。

### I-3: `resolveResumeStep` と fast step 名の関係

**結論: 互換 ✓**

`resolve-step.ts` は `ALL_STEP_NAMES_SET`（`AGENT_STEP_NAMES ∪ CLI_STEP_NAMES`）で membership 検査を行う。fast の 9 steps（request-review / design / implementer / verification / build-fixer / code-review / code-fixer / conformance / pr-create）はすべて `AGENT_STEP_NAMES` または `CLI_STEP_NAMES` に収録済み。fast job の `--from conformance` 等は問題なく解決される。

### I-4: `LOOP_ERROR_CODES` と fast loopNames のカバレッジ

**結論: 全カバー ✓**

`FAST_DESCRIPTOR.loopNames = [VERIFICATION, CODE_REVIEW, CONFORMANCE]`。これら 3 キーはすべて `LOOP_ERROR_CODES` に登録済み。`Pipeline.handleExhausted` が `LOOP_ERROR_CODES[loopName]` を引くパスで KeyError が起きる可能性なし。

### I-5: `getPipelineId` fallback と legacy state

**結論: 不変条件を破らない ✓**

`getPipelineId` は `state.pipelineId ?? STANDARD_PIPELINE_ID` を返す。fast job は `pipelineId: "fast"` を持ち、`getPipelineDescriptor("fast")` → `FAST_DESCRIPTOR` と解決される。fast が存在しなかった期間の legacy state（`pipelineId` 欠落）は `"standard"` にフォールバック。既定経路への影響なし。

### I-6: `needs-fix:spec-fixer` の escalate フォールバック（意図通りか）

**結論: 意図した正直な挙動 ✓**

`FAST_TRANSITIONS` には `{ step: CONFORMANCE, on: "needs-fix:spec-fixer", to: ... }` 行がない。`pipeline.ts:298` の `transition?.to ?? "escalate"` がフォールバックして escalation になる。これは design.md D2 で明示された設計意図（「spec/design レベルの修正を要する変更は fast 不適格、エスカレーションが誠実」）と一致する。

### I-7: fast 固有分岐が src/ に存在しないか

**結論: 存在しない ✓**

`git diff main...HEAD -- src/` を確認した結果、src/ 変更は以下 3 ファイルのみ:
- `src/core/pipeline/registry.ts`: FAST_DESCRIPTOR 追加 + PIPELINE_REGISTRY エントリ追加
- `src/core/pipeline/types.ts`: FAST_TRANSITIONS 追加
- `src/kernel/pipeline-ids.ts`: PIPELINE_IDS.FAST 追加

`pipelineId === "fast"` 等の profile 名分岐は皆無。gate は `permissionScope` の有無から発火し（`#693` 汎用 gate、`assertRuntimeSupportsScope`）、checkpoint は step 名で判定する（`computeExtraScopeFindings`）。いずれも profile 名非依存。

### I-8: reverification チョークポイントの不変条件

**結論: 順序・述語ともに保持 ✓**

`FAST_TRANSITIONS` は `conformanceApprovedLatest` ガード付き行（`VERIFICATION passed → PR_CREATE`）を無条件行（`VERIFICATION passed → CODE_REVIEW`）の前に置いており、standard と同一の先頭一致ルールに従う。`codeChangedSinceLastVerification` ガード付き `CONFORMANCE approved → VERIFICATION` 行も無条件行の前に配置済み。predicates は `JobState` のみを見て pipelineId に依存しないため fast でも正しく機能する。

### I-9: `scope-escalation.test.ts` T-01 の述語整合性

**観察: テストは通過するが describe タイトルが実態と乖離 (低)**

`scope-escalation.test.ts:218`:
```
describe("T-01: PIPELINE_REGISTRY profiles have no permissionScope", () => {
```
assertions は `STANDARD_DESCRIPTOR.permissionScope` と `DESIGN_ONLY_DESCRIPTOR.permissionScope` が undefined であることのみを確認しており、今後も通過する。しかし describe タイトルは「PIPELINE_REGISTRY の全 profile が permissionScope を持たない」と読めるが、FAST はすでに permissionScope を宣言している。タイトルが実態と乖離。

**functional impact: なし**。assertions は STANDARD / DESIGN_ONLY に限定しており、今回の変更で false にはならない。

### I-10: `pipeline-run-gate.test.ts` afterEach コメントの陳腐化

**観察: コメントが実態と乖離 (低)**

`pipeline-run-gate.test.ts:66`:
```
// Remove fixture descriptor — production registry stays at 2 entries.
```
production registry は現在 3 本（standard / design-only / fast）。afterEach は FIXTURE_ID のみを削除するため、動作は正しい。コメントのみ陳腐化している。

**functional impact: なし**。afterEach の delete 対象は fixture のみで production entries に触れない。

---

## 総合判定

不変条件の機能的な破れは検出されなかった。

- `composeReviewerDescriptor` → `permissionScope` 保持 ✓（spread 経由）
- `buildPipeline` → executor への注入 ✓
- `resolveResumeStep` → fast step 名との互換 ✓（全 fast step が標準 step 名セットに収録）
- `LOOP_ERROR_CODES` カバレッジ ✓
- legacy state fallback 不変 ✓
- `needs-fix:spec-fixer` escalate フォールバック ✓（意図通り）
- profile 名分岐なし ✓
- reverification 順序・述語不変 ✓

観察事項 2 件（I-9, I-10）はいずれも stale なコメント／タイトルであり、機能的欠陥ではない。

- **verdict**: approved
