## REMOVED Requirements

This delta removes the `pipeline-loop-primitive` capability in its entirety. The `runLoopUntil` function at `src/core/loop.ts` is absorbed into `Pipeline.run` internal logic as part of this refactor. All Requirements are REMOVED.

The stdout progress format strings previously defined here are transferred to the `pipeline-orchestrator` ADDED delta as a new Requirement (`Pipeline Emits Iteration Progress to Stdout`) — see that delta for the authoritative bit-for-bit format definition.

### Requirement: `runLoopUntil` は body・evaluator・maxIterations・onExceeded を受け取る汎用 loop プリミティブである
**Reason**: `runLoopUntil(state, deps, opts)` exported from `src/core/loop.ts` is replaced by the `Pipeline` class driven by a declarative `Transition[]` table. The generic loop primitive abstraction is no longer required because the Pipeline class itself encapsulates iteration.
**Migration**: Loop-driving logic is absorbed into `Pipeline.run` driven by the declarative `Transition[]` table and `maxIterations` parameter. `src/core/loop.ts` is deleted (tasks 8.1a).

### Requirement: evaluator が `approved` を返したら即 exit する
**Reason**: This exit behavior is preserved verbatim inside `Pipeline.run`; the `runLoopUntil` function that implemented it is removed.
**Migration**: When the current step returns `approved`, the transition table routes to `end` and `Pipeline.run` terminates. The behavior is unchanged.

### Requirement: evaluator が `escalation` を返したら fixer を起動せず exit する
**Reason**: This exit behavior is preserved verbatim inside `Pipeline.run`; the `runLoopUntil` function that implemented it is removed.
**Migration**: When the current step returns `escalation`, the transition table routes to `escalate` and `Pipeline.run` terminates without spawning a fixer.

### Requirement: evaluator が `needs-fix` で iter < maxIterations なら次 iter で body を再実行する
**Reason**: Re-execution behavior is preserved verbatim inside `Pipeline.run`; the `runLoopUntil` function that implemented it is removed.
**Migration**: The cycle is preserved via the `spec-review --needs-fix→ spec-fixer` and `spec-fixer --approved→ spec-review` transition rows combined with the loop guard counter.

### Requirement: maxIterations 到達時は `onExceeded` を呼んで exit する
**Reason**: The `onExceeded` callback is replaced by `Pipeline`'s built-in loop guard; the function-pointer indirection is no longer required.
**Migration**: When the cycle count reaches `maxIterations`, `Pipeline.run` sets `state.error = { code: "SPEC_REVIEW_RETRIES_EXHAUSTED", ... }` and terminates. The error shape is preserved verbatim — see `pipeline-orchestrator` ADDED delta `Pipeline Enforces Loop Guard via maxIterations` Requirement.

### Requirement: body は必ず new state を返す（state は in-memory に保持）
**Reason**: State threading is now the internal responsibility of `Pipeline.run`; the body-returns-state contract is implicit in `StepExecutor.execute`'s return type.
**Migration**: `StepExecutor.execute` returns the updated `JobState` after each step, and `Pipeline.run` threads it to the next step. `writeJobState` is called at each step completion, preserving the observability guarantee for `specrunner ps`.

### Requirement: stdout 進捗フォーマットの正規定義は pipeline-loop-primitive spec にある
**Reason**: Single source of truth for the stdout iteration progress format is moved to the `pipeline-orchestrator` capability, where it is co-located with the Pipeline class that emits it.
**Migration**: The authoritative definition is transferred to `pipeline-orchestrator` ADDED delta `Requirement: Pipeline Emits Iteration Progress to Stdout`. The format strings are reproduced bit-for-bit in that Requirement.

### Requirement: `runLoopUntil` は state.history に loop entry を append する
**Reason**: `state.history` append behavior at iteration boundaries is moved into `Pipeline.run` and `StepExecutor`; the dedicated loop primitive's responsibility is removed.
**Migration**: `Pipeline.run` appends a history entry at each step transition; the shape `{ ts, step: loopName, status: "started" | "ok" | "warning" | "error", message }` is preserved verbatim.
