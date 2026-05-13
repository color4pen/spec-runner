# Spec Review Result: decouple-pipeline-from-step-names

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-13
- **verdict**: approved

---

## Summary

request.md に記載された 5 箇所の step 名依存はすべてソースコードで確認でき、仕様の記述は正確。design.md の各 Change は影響範囲が限定的かつ具体的で、tasks.md は依存順に正しく並んでいる。delta-spec.md の要件は design と矛盾なし。

---

## Findings

### F1 — Change 1: dead branch 除去 ✅

`pipeline.ts:344-348` で `completionVerdict` を先にチェックしており、`DesignStep.completionVerdict` は `"success"` が宣言済み。line 351-354 の `if (stepName === STEP_NAMES.DESIGN)` は到達不能。除去は正しい。

ただし `pipeline.ts` は他にも `STEP_NAMES` を 8 箇所で参照（line 63, 96, 236-238, 286-288）。design.md/tasks.md ともに「他で使われていれば import を残す」と正しく注記。

### F2 — Change 2: phase フラグ ✅

`resolve-step.ts` の `SPEC_PHASE_STEPS` は `{DESIGN, SPEC_REVIEW, SPEC_FIXER}` を保持。設計は `phase: "spec"` を同じ 3 step に付与。一致。

`CODE_PHASE_STEPS` は `isSpecPhase()` の逆で暗黙的に使われるのみ（明示的参照なし）。除去しても `STEP_PHASE_MAP.get(x) === "spec"` で同等の判定が成立。

design.md の `STEP_PHASE_MAP` 構築で全 AgentStep singleton を import する方式は、circular dependency の心配なし（step → resume への逆参照は存在しない）。`VerificationStep` / `PrCreateStep`（CliStep）が map に含まれない点も、`isSpecPhase()` が false を返すので正しい。

### F3 — Change 3: needsProjectContext フラグ ✅

`executor.ts:23-25` の `PROJECT_CONTEXT_STEPS` は `{DESIGN, SPEC_REVIEW, IMPLEMENTER, CODE_REVIEW}`。設計で `needsProjectContext: true` を付与する 4 step と一致。

`executor.ts` の `STEP_NAMES` import は `PROJECT_CONTEXT_STEPS` のみで使用（line 21, 24）。除去後は import も不要。tasks.md T5 で「他で使われていなければ import も除去」と正しく条件付き。

### F4 — Change 4: useSseStrategy 抽出 ✅

`agent-runner.ts:99` で `step.agent.role === STEP_NAMES.DESIGN` が top-level dispatch にある。private method への extract は純粋なリファクタリング。core 層に SSE フラグを追加しない判断は Ports & Adapters パターンに沿う。

注意: `STEP_NAMES` import は `agent-runner.ts` に残る（`useSseStrategy` 内部 + error path）。design.md に明記済み。

### F5 — Change 5: error factory 統合 ✅

既存の `specReviewResultNotFoundError` は `specReviewResultPath(slug, iteration)` を内部で算出し、`codeReviewResultNotFoundError` は `reviewFeedbackPath(slug, iteration)` を使用。新 generic factory は呼び出し元で `resultFilePath`（`step.resultFilePath()` の戻り値）を直接渡す設計。

`resultFilePath` は `agent-runner.ts:435` で `const resultFilePath = step.resultFilePath(state, stepCtx)` としてスコープ内に存在。設計の主張は正確。

error code の導出: `"spec-review".toUpperCase().replace(/-/g, "_")` → `"SPEC_REVIEW"` + `"_RESULT_NOT_FOUND"` → `"SPEC_REVIEW_RESULT_NOT_FOUND"`。既存の `ERROR_CODES.SPEC_REVIEW_RESULT_NOT_FOUND` と一致。`CODE_REVIEW` も同様。後方互換性あり。

### F6 — delta-spec.md の妥当性 ✅

5 要件（R-phase-flag, R-needsProjectContext-flag, R-no-step-names-in-pipeline-framework, R-no-step-names-in-adapter-dispatch, R-generic-result-not-found-error）+ 既存 R-completion-verdict の更新。すべて design.md の Change 1-5 と 1:1 対応。

### F7 — Out of scope の判断 ✅

`REVIEWER_STEPS`、`STEP_MAPPING`、`LOOP_ERROR_CODES` を scope 外とする判断は妥当。これらは step 名を「データとして保持」しており「制御フロー分岐に使用」していない。resume 機能の本質的要件。

---

## Observations (non-blocking)

1. **Change 5 の signature 変更**: 既存 factory は `(slug, branch, iteration)` → 新 factory は `(stepName, resultPath, branch)`。呼び出し元の `iteration` 変数が不要になるが、同ブロック内で他に使われていないことを実装時に確認すること（tasks.md T8b に注記あり）。

2. **Change 4 の `useSseStrategy` 命名**: 現時点で SSE strategy を使うのは design step のみ。将来 2 つ目の SSE step が追加された場合、この method が自然な拡張ポイントになる。良い設計。

3. **`test-case-gen` の phase**: 未設定（= `"impl"` 扱い）。test-case-gen は spec phase と impl phase の境界にあるが、resume の phase 判定では code phase 側に倒すのが妥当（`resolve-step.ts` の既存 `CODE_PHASE_STEPS` に含まれている）。整合。
