# Tasks: spec-review lightweight mode enhancement

## 1. Lightweight instruction expansion

- [x] 1.1 `src/prompts/spec-review-system.ts` — `buildSpecReviewModeInstruction("lightweight")` の戻り値を拡充する。以下の構造化テキストを返す:

```typescript
function buildSpecReviewModeInstruction(mode: "full" | "lightweight"): string {
  if (mode === "lightweight") {
    return `Review scope: Lightweight review — this is a behavior-preserving change.

Verify (review normally):
- architecture: design patterns, responsibility separation, dependency direction
- correctness: logic, boundary conditions, edge cases

Simplify (reduced scope):
- completeness: verify task decomposition coverage only. Requirements coverage is not applicable for behavior-preserving changes.
- consistency: skip cross-referencing with existing specs. No spec changes are expected.

Skip (do not review):
- feasibility: effort estimation is not required for refactoring/chore.
- security: not required for this request type.`;
  }
  // full mode unchanged
  return "Review scope: Full review including security considerations (authentication, input validation, OWASP Top 10 where applicable).";
}
```

## 2. Dynamic maxTurns — interface

- [x] 2.1 `src/core/step/types.ts` — `AgentStep` interface に以下を追加:

```typescript
/**
 * Compute maxTurns dynamically based on runtime state.
 * When defined and returns a number, this value is used as the step-level
 * default (priority 3 in the resolution chain) instead of step.maxTurns.
 * When undefined or returns undefined, step.maxTurns is used as fallback.
 */
getMaxTurns?(state: JobState): number | undefined;
```

## 3. Dynamic maxTurns — SpecReviewStep implementation

- [x] 3.1 `src/core/step/spec-review.ts` — SpecReviewStep に `getMaxTurns` を追加:

```typescript
getMaxTurns(state: JobState): number | undefined {
  const mode = getSpecReviewMode(state.request.type);
  return mode === "lightweight" ? 10 : undefined;
},
```

`maxTurns: 15` は full mode のフォールバックとしてそのまま残す。

## 4. Dynamic maxTurns — ClaudeCodeRunner integration

- [x] 4.1 `src/adapter/claude-code/agent-runner.ts` — `getStepExecutionConfig` 呼び出し前に `getMaxTurns` を評価する:

```typescript
// Before (line 113-116):
const resolvedConfig = getStepExecutionConfig(ctx.config, step.name, {
  model: step.agent.model,
  maxTurns: step.maxTurns,
});

// After:
const dynamicMaxTurns = step.getMaxTurns?.(ctx.state);
const resolvedConfig = getStepExecutionConfig(ctx.config, step.name, {
  model: step.agent.model,
  maxTurns: dynamicMaxTurns ?? step.maxTurns,
});
```

## 5. Tests

- [x] 5.1 lightweight instruction テスト — `buildSpecReviewModeInstruction("lightweight")` の戻り値が以下を含むことを検証:
  - "behavior-preserving" または "Lightweight review"
  - "architecture" と "correctness" が Verify セクションにある
  - "completeness" が Simplify セクションにある
  - "feasibility" と "security" が Skip セクションにある

- [x] 5.2 full instruction テスト — `buildSpecReviewModeInstruction("full")` の戻り値が既存の文字列と一致することを検証（回帰テスト）

- [x] 5.3 SpecReviewStep.getMaxTurns テスト:
  - refactoring type → 10
  - chore type → 10
  - new-feature type → undefined
  - spec-change type → undefined
  - bug-fix type → undefined

- [x] 5.4 `tests/unit/step/step-model-maxturn-config.test.ts` の TC-006 "SpecReviewStep.maxTurns === 15" は変更しない（静的 maxTurns は 15 のまま）

- [x] 5.5 integration: `SpecReviewStep.buildMessage()` に refactoring type を渡した場合、初期メッセージに lightweight instruction が含まれることを検証

## 6. Verification

- [x] 6.1 `bun run typecheck` が green
- [x] 6.2 `bun run test` が green
