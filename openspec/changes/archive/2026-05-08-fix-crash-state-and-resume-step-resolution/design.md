# Design: fix-crash-state-and-resume-step-resolution

## Overview

pipeline の crash 時 state 遷移漏れと resume の step 解決ロジックの 2 つの bug を修正する。pipeline の defense in depth 強化と、`resolveResumeStep()` の default logic を失敗理由に応じて分岐させる。

## Design Decisions

### D1: pipeline.runInternal() catch に store.fail() fallback

**Decision**: `.state` が付いていない throw を受けた場合、`store.fail()` で state を `failed` に設定する。

**変更箇所**: `pipeline.ts` L154-160

**現在のコード**:
```typescript
try {
  state = await this.executor.execute(step, state, deps);
} catch (err) {
  const errWithState = err as { state?: JobState };
  if (errWithState.state) {
    state = errWithState.state;
  }
  // state.status will be "failed" — outcome detection below handles it
}
```

**修正後**:
```typescript
try {
  state = await this.executor.execute(step, state, deps);
} catch (err) {
  const errWithState = err as { state?: JobState };
  if (errWithState.state) {
    state = errWithState.state;
  } else {
    // Safety net: executor threw without attaching state.
    // Mark as failed so getStepOutcome() returns "error" and
    // the transition table routes to "escalate" → awaiting-resume.
    const store = new JobStateStore(state.jobId);
    state = await store.fail(state, {
      code: "UNEXPECTED_STEP_ERROR",
      message: (err as Error).message,
      hint: "",
    }, currentStep);
  }
}
```

**Rationale**:
- executor は通常 `.state` を付けて throw する。`.state` がない場合は予期せぬ例外パス
- `store.fail()` は `status: "failed"` を設定して persist する（既存 API）
- `getStepOutcome()` は `status === "failed"` → `"error"` を返す（L306-308）
- transition table で `"error"` → `"escalate"` → L228 で `awaiting-resume` に遷移
- executor の既存コードには一切触れない。pipeline 側の defense in depth

**Trade-offs**:
- Pro: executor のどの例外パスが漏れても pipeline が救える
- Pro: 既存の transition table と escalation フローを再利用（新規コードパス最小）
- Con: `store.fail()` の persist が redundant になる可能性（L164 でも persist する）。ただし idempotent なので問題なし

### D2: pipeline.run() catch に最終防衛線

**Decision**: `runInternal` を超えて throw が漏れた場合、`status === "running"` なら `awaiting-resume` に遷移する。

**変更箇所**: `pipeline.ts` L79-87

**修正後**:
```typescript
} catch (err) {
  const errState = (err as Record<string, unknown>)["state"] as JobState | undefined;
  let finalState = errState ?? jobState;

  // Last-resort safety net: if state is still "running" after an unhandled throw,
  // transition to awaiting-resume so the job is resumable (not stuck).
  if (finalState.status === "running") {
    const store = new JobStateStore(finalState.jobId);
    finalState = {
      ...finalState,
      status: "awaiting-resume",
      resumePoint: {
        step: (finalState.step ?? "propose") as StepName,
        reason: (err as Error).message,
        iterationsExhausted: 0,
      },
      error: {
        code: "PIPELINE_UNHANDLED_ERROR",
        message: (err as Error).message,
        hint: "",
      },
      updatedAt: new Date().toISOString(),
    };
    await store.persist(finalState);
  }

  this.events.emit("pipeline:fail", {
    state: finalState,
    reason: (err as Error).message,
  });
  throw err;
}
```

**Rationale**:
- `runInternal` は "Step not found in pipeline" などの構造エラーで throw し得る。これらは step execution catch を通らない
- D1 の safety net をすり抜ける throw はここでキャッチされる
- `status === "running"` のチェックにより、D1 で既に `failed` → `awaiting-resume` に遷移済みの場合は二重書き込みしない
- `resumePoint.step` は `finalState.step`（最後に実行しようとした step）から取得。null の場合は `"propose"` fallback

**Trade-offs**:
- Pro: running stuck を完全に防止
- Con: `pipeline.run()` 内で await persist するため、throw 前に I/O が入る。ただしこのパスはすでに異常系であり、resilience > latency

### D3: resolveResumeStep() の from 未指定時 default を分岐

**Decision**: `from` 未指定時、`resumePoint` の内容に応じて再開 step を決定する。

**変更箇所**: `resolve-step.ts` L63-80

**修正後のロジック**:
```typescript
export function resolveResumeStep(
  from: string | undefined,
  resumePoint: ResumePoint | null,
  fallbackStep?: string,
): StepName {
  // 1. --from が明示的に指定された場合: 既存の role-based mapping（最優先）
  if (from !== undefined) {
    const role: ResumeRole =
      from === "fixer" ? "fixer" :
      from === "creator" ? "creator" :
      "critic";
    const phaseStep = resumePoint?.step ?? fallbackStep;
    const phase = phaseStep && isSpecPhase(phaseStep) ? "spec" : "code";
    return STEP_MAPPING[phase][role];
  }

  // 2. from 未指定 + resumePoint あり: 失敗理由に応じて分岐
  if (resumePoint !== null) {
    const isReviewer = REVIEWER_STEPS.has(resumePoint.step);
    if (resumePoint.iterationsExhausted > 0 && isReviewer) {
      // Review exhaustion: restart from corresponding fixer
      const phase = isSpecPhase(resumePoint.step) ? "spec" : "code";
      return STEP_MAPPING[phase]["fixer"];
    }
    // Crash/error: restart from the same step
    return resumePoint.step;
  }

  // 3. resumePoint null + from 未指定: fallback（既存挙動維持）
  const phase = fallbackStep && isSpecPhase(fallbackStep) ? "spec" : "code";
  return STEP_MAPPING[phase]["critic"];
}
```

**新規定数**:
```typescript
const REVIEWER_STEPS = new Set<StepName>(["spec-review", "code-review"]);
```

**Rationale**:
- reviewer step は `STEP_MAPPING` の critic 値と一致する。この 2 step だけが "review exhaustion" の対象
- `iterationsExhausted > 0` は loop guard による exhaustion を意味する（pipeline.ts L365-369 で設定される）
- crash/error（`iterationsExhausted === 0`）では同じ step からやり直すのが直感的。implementer crash → implementer 再実行
- review exhaustion では reviewer を再実行しても同じ結果になる可能性が高い。fixer で修正してから再 review が適切
- `--from` 指定時は一切変更なし。ユーザーの明示的意図が最優先

**既存テストへの影響**:
- `resolveResumeStep(undefined, makeResumePoint("spec-review"))` は現在 `"spec-review"` を返す（L71-73）
  - `makeResumePoint` は `iterationsExhausted: 0` で生成 → crash 扱い → `resumePoint.step` = `"spec-review"` を返す
  - **結果は同じ** — 既存テストはそのまま通る
- `resolveResumeStep(undefined, makeResumePoint("code-review"))` も同様 — crash 扱いで `"code-review"` を返す
  - **結果は同じ** — 既存テストはそのまま通る

## Open Questions

なし。設計は request.md で architect 評価済み。

## Implementation Phases

### Phase 1: pipeline catch safety net
1. `pipeline.runInternal()` catch に `else` 分岐追加（D1）
2. `pipeline.run()` catch に running → awaiting-resume fallback 追加（D2）

### Phase 2: resolveResumeStep default logic 分岐
3. `REVIEWER_STEPS` 定数追加
4. `resolveResumeStep()` の from 未指定パスを書き換え（D3）

### Phase 3: テスト
5. pipeline catch safety net テスト（要件 7, 8）
6. resolveResumeStep crash/exhaustion 分岐テスト（要件 9, 10, 11）

### Phase 4: 検証
7. `bun run typecheck && bun run test`
