## 1. import 追加

- [x] 1.1 `src/core/pipeline/pipeline.ts`: `transitionJob` を `../../state/lifecycle.js` から import する
- [x] 1.2 `src/core/pipeline/pipeline.ts`: `appendHistoryEntry` を `../../state/schema.js` から import する
- [x] 1.3 `src/core/step/executor.ts`: `transitionJob` を `../../state/lifecycle.js` から import する

## 2. pipeline.ts — history スプレッド構文の置換

- [x] 2.1 L158-170（loop entry bookkeeping）: `{ ...state, history: [...state.history, entry] }` を `appendHistoryEntry(state, entry)` に置換する。`updatedAt` の更新は `appendHistoryEntry` の戻り値に含まれるため別途セットする
  ```typescript
  // Before (L158-170):
  state = {
    ...state,
    history: [
      ...state.history,
      {
        ts: new Date().toISOString(),
        step: currentStep,
        status: "started" as const,
        message: `${currentStep} iteration ${loopIters.get(currentStep)} started`,
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  // After:
  state = appendHistoryEntry(state, {
    ts: new Date().toISOString(),
    step: currentStep,
    status: "started" as const,
    message: `${currentStep} iteration ${loopIters.get(currentStep)} started`,
  });
  state = { ...state, updatedAt: new Date().toISOString() };
  ```

- [x] 2.2 L211-223（loop exit bookkeeping）: 同様に `appendHistoryEntry` に置換する
  ```typescript
  // Before (L211-223):
  state = {
    ...state,
    history: [
      ...state.history,
      {
        ts: new Date().toISOString(),
        step: currentStep,
        status: historyStatus,
        message: `${currentStep} iteration ${loopIter} completed with verdict: ${verdict}`,
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  // After:
  state = appendHistoryEntry(state, {
    ts: new Date().toISOString(),
    step: currentStep,
    status: historyStatus,
    message: `${currentStep} iteration ${loopIter} completed with verdict: ${verdict}`,
  });
  state = { ...state, updatedAt: new Date().toISOString() };
  ```

## 3. pipeline.ts — status 遷移の transitionJob 置換

- [x] 3.1 L253-254（`running → awaiting-merge`）: `transitionJob` に置換する
  ```typescript
  // Before (L253-254):
  state = { ...state, status: "awaiting-merge", updatedAt: new Date().toISOString() };
  const endStore = new JobStateStore(state.jobId);
  await endStore.persist(state);

  // After:
  const { state: mergeState } = transitionJob(state, "awaiting-merge", {
    trigger: "pipeline",
    reason: "pipeline complete",
  });
  state = mergeState;
  const endStore = new JobStateStore(state.jobId);
  await endStore.persist(state);
  ```

- [x] 3.2 L85-101（catch block `running → awaiting-resume`）: `transitionJob` に置換する。`resumePoint` と `error` は `ctx.patch` で渡す
  ```typescript
  // Before (L87-101):
  finalState = {
    ...finalState,
    status: "awaiting-resume",
    resumePoint: { ... },
    error: { ... },
    updatedAt: new Date().toISOString(),
  };
  await store.persist(finalState);

  // After:
  const { state: resumeState } = transitionJob(finalState, "awaiting-resume", {
    trigger: "pipeline",
    reason: (err as Error).message ?? String(err),
    patch: {
      resumePoint: {
        step: (finalState.step ?? "propose") as StepName,
        reason: (err as Error).message ?? String(err),
        iterationsExhausted: 0,
      },
      error: {
        code: "PIPELINE_UNHANDLED_ERROR",
        message: (err as Error).message ?? String(err),
        hint: "",
      },
    },
  });
  finalState = resumeState;
  await store.persist(finalState);
  ```

- [x] 3.3 L260-272（escalation `running → awaiting-resume`）: `transitionJob` に置換する
  ```typescript
  // Before (L260-272):
  if (nextStep === "escalate" && (state.status !== "failed" || ...)) {
    state = {
      ...state,
      status: "awaiting-resume",
      resumePoint: { ... },
      updatedAt: new Date().toISOString(),
    };
    const escalateStore = new JobStateStore(state.jobId);
    await escalateStore.persist(state);
  }

  // After:
  if (nextStep === "escalate" && (state.status !== "failed" || !FATAL_ERROR_CODES.has(state.error?.code ?? ""))) {
    const { state: escalateState } = transitionJob(state, "awaiting-resume", {
      trigger: "pipeline",
      reason: state.error?.message ?? `${currentStep} escalated`,
      patch: {
        resumePoint: {
          step: currentStep as StepName,
          reason: state.error?.message ?? `${currentStep} escalated`,
          iterationsExhausted: loopIters.get(currentStep) ?? 0,
        },
      },
    });
    state = escalateState;
    const escalateStore = new JobStateStore(state.jobId);
    await escalateStore.persist(state);
  }
  ```

## 4. pipeline.ts — handleExhausted の transitionJob 置換

- [x] 4.1 L393-411（`handleExhausted`）: steps 更新はそのまま残し、status 遷移部分を `transitionJob` に置換する
  ```typescript
  // Before (L393-408):
  const updated: JobState = {
    ...state,
    steps: updatedSteps,
    status: "awaiting-resume",
    resumePoint: { ... },
    error: { ... },
    updatedAt: new Date().toISOString(),
  };

  // After:
  const stateWithSteps = { ...state, steps: updatedSteps };
  const { state: exhaustedState } = transitionJob(stateWithSteps, "awaiting-resume", {
    trigger: "pipeline",
    reason: errorShape.message(this.maxIterations),
    patch: {
      resumePoint: {
        step: exhaustedLoopName as StepName,
        reason: errorShape.message(this.maxIterations),
        iterationsExhausted: this.maxIterations,
      },
      error: {
        code: errorShape.code,
        message: errorShape.message(this.maxIterations),
        hint: errorShape.hint(nnn),
      },
    },
  });
  const exhaustedStore = new JobStateStore(exhaustedState.jobId);
  await exhaustedStore.persist(exhaustedState);
  return exhaustedState;
  ```

## 5. executor.ts — timeout 遷移の transitionJob 置換

- [x] 5.1 L138-142（timeout `running → awaiting-resume`）: `transitionJob` に置換する
  ```typescript
  // Before (L138-142):
  state = {
    ...state,
    status: "awaiting-resume" as const,
    resumePoint: { step: step.name as StepName, reason: "timeout", iterationsExhausted: 0 },
    error: errorInfo,
  };

  // After:
  const { state: timeoutState } = transitionJob(state, "awaiting-resume", {
    trigger: "executor",
    reason: "timeout",
    patch: {
      resumePoint: { step: step.name as StepName, reason: "timeout", iterationsExhausted: 0 },
      error: errorInfo,
    },
  });
  state = timeoutState;
  ```

## 6. 検証

- [x] 6.1 `bun run typecheck` が green であることを確認する
- [x] 6.2 `bun run test` が green であることを確認する
- [x] 6.3 `pipeline.ts` に `state.status = ` または `status: "awaiting-` / `status: "running"` の直接代入が存在しないことを grep で確認する（`transitionJob` 呼び出し以外）
- [x] 6.4 `pipeline.ts` に `history: [...state.history` のスプレッド構文が存在しないことを grep で確認する
