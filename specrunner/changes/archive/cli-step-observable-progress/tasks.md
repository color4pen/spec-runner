# Tasks: cli-step-observable-progress

## 1. bug-fix: iter 表示を loopNames 全体に拡大

**file**: `src/core/pipeline/pipeline.ts`

### 1.1 iter 開始表示のガード拡大

L164 の `if (isLoopStep)` を `if (isAnyLoopStep)` に変更。
L166 の `this.loopName` を `currentStep` に置換:

```diff
-        if (isLoopStep) {
-          const loopIter = newIter;
-          stdoutWrite(`[iter ${loopIter}/${this.maxIterations}] starting ${this.loopName}\n`);
+        if (isAnyLoopStep) {
+          const loopIter = newIter;
+          stdoutWrite(`[iter ${loopIter}/${this.maxIterations}] starting ${currentStep}\n`);
         }
```

### 1.2 terminal verdict 表示のガード拡大 + step 名置換

L240 の `if (isLoopStep)` を `if (isAnyLoopStep)` に変更。
L242 / L244 の `this.loopName` を `currentStep` に置換:

```diff
-        if (isLoopStep) {
+        if (isAnyLoopStep) {
           if (outcome === "approved") {
-            stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: approved → done\n`);
+            stdoutWrite(`[iter ${loopIter}] ${currentStep} verdict: approved → done\n`);
           } else if (outcome === "escalation" || outcome === "error") {
-            stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: escalation → halt\n`);
+            stdoutWrite(`[iter ${loopIter}] ${currentStep} verdict: escalation → halt\n`);
           }
         }
```

### 1.3 needs-fix 表示のガード拡大 + step 名置換

L344 の `if (isLoopStep && outcome === "needs-fix")` を `if (isAnyLoopStep && outcome === "needs-fix")` に変更。
L346 の `this.loopName` を `currentStep` に置換:

```diff
-      if (isLoopStep && outcome === "needs-fix") {
-        stdoutWrite(`[iter ${loopIter}] ${this.loopName} verdict: needs-fix → spawning fixer\n`);
+      if (isAnyLoopStep && outcome === "needs-fix") {
+        stdoutWrite(`[iter ${loopIter}] ${currentStep} verdict: needs-fix → spawning fixer\n`);
       }
```

### 1.4 prevLoopStep の代入条件

L361 `prevLoopStep = isLoopStep ? currentStep : ""` は primary loop のみの history メッセージ用。変更不要。

## 2. retries exhausted 表示に step 名追加

**file**: `src/core/pipeline/pipeline.ts`

### 2.1 L304: conventional exhaustion

```diff
-          stdoutWrite(`[iter ${nextLoopIter}/${this.maxIterations}] retries exhausted, escalating\n`);
+          stdoutWrite(`[iter ${nextLoopIter}/${this.maxIterations}] retries exhausted on ${nextStep}, escalating\n`);
```

`nextStep` は exhaustion check の対象 loop step 名 (= L291 の `nextStep`)。

### 2.2 L330: fixer exhaustion

```diff
-          stdoutWrite(`[iter ${this.maxIterations}/${this.maxIterations}] retries exhausted, escalating\n`);
+          stdoutWrite(`[iter ${this.maxIterations}/${this.maxIterations}] retries exhausted on ${exhaustedLoopName}, escalating\n`);
```

`exhaustedLoopName` は L328-329 で既に計算済み。

## 3. 非 loopNames CliStep の [step] 表示

**file**: `src/core/pipeline/pipeline.ts`

### 3.1 入場表示 (step 実行直前)

L186 の `const stateBeforeExec = state;` の直前に追加:

```ts
      // --- Non-loop CliStep entry announcement ---
      const isNonLoopCliStep = step.kind === "cli" && !isAnyLoopStep;
      if (isNonLoopCliStep) {
        stdoutWrite(`[step] ${currentStep}\n`);
      }
```

### 3.2 完了表示 (outcome 確定後)

L211 `const outcome = ...` の直後 (L212 付近) に追加:

```ts
      // --- Non-loop CliStep completion announcement ---
      if (isNonLoopCliStep) {
        const stepVerdict = getLatestStepResult(state, currentStep)?.verdict;
        if (stepVerdict != null) {
          stdoutWrite(`[step] ${currentStep}: ${stepVerdict}\n`);
        }
      }
```

`isNonLoopCliStep` は 3.1 で計算済みの変数を再利用。verdict が null の場合 (parseResult が null を返した場合) は完了表示なし。

## 4. TC-029 fixture 更新

**file**: `tests/cli-stdout-snapshot.test.ts`

### 4.1 期待値の更新

L298:
```diff
-    expect(stdout).toContain(`[iter ${maxIterations}/${maxIterations}] retries exhausted, escalating`);
+    expect(stdout).toContain(`[iter ${maxIterations}/${maxIterations}] retries exhausted on spec-review, escalating`);
```

TC-029 は spec-review が exhaust するシナリオなので step 名は `spec-review`。

### 4.2 pipeline-integration.test.ts:531 の fixture 更新

**file**: `tests/pipeline-integration.test.ts`

L531:
```diff
-    expect(stdout).toContain("retries exhausted, escalating");
+    expect(stdout).toContain("retries exhausted on spec-review, escalating");
```

このテスト (TC-016) は spec-review が exhaust するシナリオなので step 名は `spec-review`。

### 4.3 pipeline.test.ts:432 の fixture 更新

**file**: `tests/core/pipeline/pipeline.test.ts`

L432:
```diff
-    expect(stdout).toContain("[iter 2/2] retries exhausted, escalating");
+    expect(stdout).toContain("[iter 2/2] retries exhausted on spec-review, escalating");
```

このテストも spec-review が exhaust するシナリオなので step 名は `spec-review`。

## 5. 新規テスト: loop iter stdout

**file**: `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts` (新規)

test helpers (makeMinimalState / makeMinimalDeps / makeStepObject / buildMockPipeline 等) は `tests/core/pipeline/pipeline.test.ts` のパターンを踏襲。

### 5.1 TC: spec-review の iter 表示 (既存挙動維持)

- Pipeline に spec-review (loopNames 含) を 1 iteration 走らせて approved
- stdout に `[iter 1/M] starting spec-review` を含むことを assert

### 5.2 TC: verification の iter 表示 (bug-fix)

- Pipeline に verification (loopNames 含) を 1 iteration 走らせて passed
- stdout に `[iter 1/M] starting verification` を含むことを assert

### 5.3 TC: code-review の iter 表示 (bug-fix)

- Pipeline に code-review (loopNames 含) を 1 iteration 走らせて approved
- stdout に `[iter 1/M] starting code-review` を含むことを assert

### 5.4 TC: loopNames step の verdict 表示が currentStep 名で出る

- spec-review approved → stdout に `spec-review verdict: approved → done` を含む
- verification needs-fix → stdout に `verification verdict: needs-fix → spawning fixer` を含む (verification は loopFixerPairs に build-fixer が paired)

### 5.5 TC: TC-068 regression 確認

- `tests/core/pipeline/pipeline.test.ts` の TC-068 が引き続き pass することをこのテストファイルからは直接確認しないが、`bun run test` で regression がないことを保証。テストファイル内に TC-068 言及のコメントを残す。

## 6. 新規テスト: cli step output

**file**: `tests/unit/core/pipeline/pipeline.cli-step-output.test.ts` (新規)

### 6.1 TC: dsv 入場表示

- dsv (kind: "cli", 非 loopNames) を実行する pipeline を構築
- stdout に `[step] delta-spec-validation` を含むことを assert

### 6.2 TC: dsv 完了表示 (approved)

- dsv が approved を返す
- stdout に `[step] delta-spec-validation: approved` を含むことを assert

### 6.3 TC: pr-create 入場表示

- pr-create (kind: "cli", 非 loopNames) を実行する pipeline を構築
- stdout に `[step] pr-create` を含むことを assert

### 6.4 TC: pr-create 完了表示 (success)

- pr-create が success を返す
- stdout に `[step] pr-create: success` を含むことを assert

### 6.5 TC: verdict null の CliStep は完了表示なし

- mock CliStep で parseResult が verdict: null を返す
- stdout に `[step] <name>:` を含まないことを assert

### 6.6 TC: verification (loopNames 含 CliStep) は [step] 表示が出ない

- verification を実行する pipeline を構築
- stdout に `[step] verification` を含まないことを assert (= `[iter N/M]` のみ)

### 6.7 TC: design (AgentStep 非 loopNames) は [step] 表示が出ない

- design を実行する pipeline を構築
- stdout に `[step] design` を含まないことを assert (= AgentStep は対象外)

## 7. delta spec: pipeline-orchestrator/spec.md 更新

**file**: `specrunner/specs/pipeline-orchestrator/spec.md`

### 7.1 既存 Requirement 更新

「Pipeline Emits Iteration Progress to Stdout」の本文を更新:

- `<loopName>` の記述を「loopNames に含まれる全 step」に拡大
- canonical format strings:
  - `[iter <N>/<max>] starting <currentStep>` (was `<loopName>`)
  - `[iter <N>] <currentStep> verdict: approved → done` (was `<loopName>`)
  - `[iter <N>] <currentStep> verdict: escalation → halt` (was `<loopName>`)
  - `[iter <N>] <currentStep> verdict: needs-fix → spawning fixer` (was `<loopName>`)
  - `[iter <N>/<max>] retries exhausted on <exhaustedStep>, escalating` (was `retries exhausted, escalating`)
- Scenario 更新: `<loopName>` → `<currentStep>` に置換

### 7.2 新規 Requirement 追加

「Pipeline Emits Step Progress for Non-Loop CliSteps」:

- CliStep かつ loopNames に含まれない step は入場時 `[step] <step-name>` を stdout に出力する
- verdict が non-null の場合、完了時 `[step] <step-name>: <verdict>` を追加出力する
- loopNames に含まれる CliStep (e.g. verification) は `[step]` 表示対象外 (`[iter N/M]` が優先)
- AgentStep は `[step]` 表示対象外

Scenario:
- dsv 入場時に `[step] delta-spec-validation` が出力される
- dsv 完了時に `[step] delta-spec-validation: approved` が出力される
- pr-create 入場時に `[step] pr-create` が出力される
- verification は `[step]` 表示が出ない

## Status

- [x] 1.1 iter 開始表示のガード拡大 (`if (isLoopStep)` → `if (isAnyLoopStep)`, `this.loopName` → `currentStep`)
- [x] 1.2 terminal verdict 表示のガード拡大 + step 名置換
- [x] 1.3 needs-fix 表示のガード拡大 + step 名置換
- [x] 2.1 conventional exhaustion に `on ${nextStep}` 追加
- [x] 2.2 fixer exhaustion に `on ${exhaustedLoopName}` 追加
- [x] 3.1 非 loopNames CliStep 入場表示 (`[step] <name>`)
- [x] 3.2 非 loopNames CliStep 完了表示 (`[step] <name>: <verdict>`)
- [x] 4.1 TC-029 fixture 更新 (`retries exhausted on spec-review, escalating`)
- [x] 4.2 TC-016 fixture 更新 (`retries exhausted on spec-review, escalating`)
- [x] 4.3 TC-063 fixture 更新 (`retries exhausted on spec-review, escalating`)
- [x] 5. 新規テスト `pipeline.loop-iter-stdout.test.ts` (5 TC, 7 it blocks)
- [x] 6. 新規テスト `pipeline.cli-step-output.test.ts` (7 TC, 7 it blocks)
- [x] 7.1 spec.md 既存 Requirement 更新 (loopNames 全体 + exhausted on <step>)
- [x] 7.2 spec.md 新規 Requirement 追加 (非 loopNames CliStep の [step] 表示)
- [x] `bun run typecheck && bun run test` green (168 files, 2015 tests)
