# Test Cases: loop-iteration-budget-reset

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 9
- **Manual**: 1
- **Priority**: must: 8, should: 2, could: 0

---

### TC-001: re-entry via implementer gets a fresh verification budget (observed-bug regression)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Fixer-pair loop budget resets per convergence episode > Scenario: re-entry via implementer gets a fresh verification budget (observed-bug regression)

---

### TC-002: continuation through the paired fixer keeps counting within an episode

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Fixer-pair loop budget resets per convergence episode > Scenario: continuation through the paired fixer keeps counting within an episode

---

### TC-003: spec-review and code-review reset identically on non-fixer re-entry

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Fixer-pair loop budget resets per convergence episode > Scenario: spec-review and code-review reset identically on non-fixer re-entry

---

### TC-004: conformance exhausts after maxIterations even while other gates pass (termination regression)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Loops without a dedicated fixer retain a lifetime budget > Scenario: conformance exhausts after maxIterations even while other gates pass (termination regression)

---

### TC-005: Both loopIters and fixerIters are reset together on fresh episode entry

**Category**: unit
**Priority**: must
**Source**: design.md > D1: fresh-episode リセットを「gate への非 fixer 直前 step からの到達」で起点化する / tasks.md > T-01

**GIVEN** `maxIterations = 2`, `loopFixerPairs` maps `verification → build-fixer`, and `fixerIters[build-fixer]` has reached `maxIterations` from a prior episode
**WHEN** verification is entered from a non-fixer predecessor (e.g. `implementer`)
**THEN** `loopIters[verification]` is set to `0` AND `fixerIters[build-fixer]` is set to `0` before any exhaustion check reads them, enabling the fixer to run in the new episode

---

### TC-006: Conformance is structurally excluded from reset by the isFixerPairLoop condition

**Category**: unit
**Priority**: must
**Source**: design.md > D2: conformance（dedicated fixer なし loop）は lifetime counter を保持する / tasks.md > T-01

**GIVEN** conformance has no entry in `loopFixerPairs` (i.e. `pairedFixerForNext === undefined`)
**WHEN** the fresh-episode reset block evaluates conformance as `nextStep`
**THEN** the reset branch is not taken and conformance's `loopIters` continues to accumulate across the full run lifetime

---

### TC-007: Reset occurs after transition resolution and before all exhaustion checks

**Category**: unit
**Priority**: must
**Source**: design.md > D3: リセットは「transition 解決後・exhaustion check 前」に 1 箇所で行う / tasks.md > T-01

**GIVEN** a fixer-pair gate is determined as `nextStep` and the predecessor is not its paired fixer
**WHEN** the `runInternal` loop processes this transition
**THEN** both counters are set to `0` before the loop entry-guard exhaustion check (`loopIters[nextStep] >= maxIterations`), the fixer entry-guard check (`fixerIters[nextStep] >= maxIterations`), and the no-fixer-loop immediate exhaustion check — ensuring a stale value never triggers a premature escalate

---

### TC-008: StepRun.attempt numbering is unaffected by fixerIters episode reset

**Category**: unit
**Priority**: should
**Source**: design.md > D4: `fixerIters` リセットは attempt 採番・resume を侵さない

**GIVEN** build-fixer has run to `maxIterations` in episode 1, then `fixerIters[build-fixer]` is reset to `0` for episode 2
**WHEN** build-fixer runs in episode 2
**THEN** `StepRun.attempt` is derived from `state.steps[build-fixer].length + 1` (store-side counter), not from `fixerIters`, so attempt numbering increments correctly across episodes and is unaffected by the in-memory reset

---

### TC-009: First arrival at a fixer-pair gate on a fresh run triggers reset without regression

**Category**: unit
**Priority**: should
**Source**: design.md > D1 (初回到達ケース: predecessor は fixer ではない → fresh)

**GIVEN** a pipeline whose `loopIters` and `fixerIters` Maps are empty (no prior iterations)
**WHEN** implementer completes and verification is entered for the very first time
**THEN** the reset fires (setting both Maps to `0`) and the subsequent `+1` in loop entry bookkeeping produces `iter = 1`, identical to the pre-fix behavior — no regression to the initial-entry path

---

### TC-010: bun run typecheck passes after T-01 implementation

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** the fresh-episode reset block is inserted into `src/core/pipeline/pipeline.ts` at the specified location using the existing `loopIters`, `fixerIters`, `loopNames`, and `loopFixerPairs` identifiers without declaration changes
**WHEN** `bun run typecheck` is executed
**THEN** no TypeScript type errors are reported

---

## Result

```yaml
result: completed
total: 10
automated: 9
manual: 1
must: 8
should: 2
could: 0
blocked_reasons: []
```
