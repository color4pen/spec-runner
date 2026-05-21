# Tasks: resume-from-correct-loop-step

## Task 1: [x] Extend `resolveResumeStep` to detect fixer-empty mismatch

**File**: `src/core/resume/resolve-step.ts`

### 1.1 Add `steps` parameter

Add an optional 4th parameter `steps?: Record<string, { outcome: { verdict: string | null } }[]>` to the function signature. When absent/undefined, the new logic is skipped (backward compat for existing callers and tests).

### 1.2 Import STANDARD_LOOP_FIXER_PAIRS

Import `STANDARD_LOOP_FIXER_PAIRS` from `../pipeline/run.js`. Build a reverse map: `FIXER_TO_LOOP: Record<string, string>` (e.g. `{ "code-fixer": "code-review", "spec-fixer": "spec-review", "build-fixer": "verification" }`).

### 1.3 Implement fixer-empty detection rule

In Tier 2 (from undefined + resumePoint present), **before** the existing `isReviewer` check, add:

```
if (steps !== undefined) {
  const pairedLoop = FIXER_TO_LOOP[resumePoint.step];
  if (pairedLoop !== undefined) {
    const fixerRuns = steps[resumePoint.step] ?? [];
    if (fixerRuns.length === 0) {
      // Fixer was never executed — the kill happened after transition but before fixer start.
      // Check if the paired loop step's last verdict is needs-fix/failed.
      const loopRuns = steps[pairedLoop] ?? [];
      const lastLoopVerdict = loopRuns.length > 0
        ? loopRuns[loopRuns.length - 1].outcome.verdict
        : null;
      if (lastLoopVerdict === "needs-fix" || lastLoopVerdict === "failed") {
        return pairedLoop as StepName;
      }
    }
  }
}
```

This handles: `resumePoint.step = "code-fixer"` + `state.steps["code-fixer"]` empty + `state.steps["code-review"][-1].verdict = "needs-fix"` → returns `"code-review"`.

Falls through to existing logic if conditions aren't met.

### 1.4 Update JSDoc

Update the function's JSDoc comment to document Tier 2a (fixer-empty detection, before existing Tier 2b).

---

## Task 2: [x] Pass `state.steps` from `resume.ts`

**File**: `src/core/command/resume.ts`

### 2.1 Update `resolveResumeStep` call

At line ~158, change:
```typescript
startStep = resolveResumeStep(this.options.from, resumePoint, fallbackStep);
```
to:
```typescript
startStep = resolveResumeStep(this.options.from, resumePoint, fallbackStep, state.steps);
```

No other changes needed in this file.

---

## Task 3: [x] Add unit tests for new behavior

**File**: `tests/unit/core/resume/resolve-step.test.ts`

### 3.1 Test: fixer-empty + loop needs-fix → loop step

```typescript
describe("resolveResumeStep - fixer-empty detection (issue #236)", () => {
  it("resumePoint=code-fixer + steps[code-fixer] empty + steps[code-review] needs-fix → code-review", () => {
    const steps = {
      "code-review": [{ outcome: { verdict: "needs-fix" } }],
    };
    expect(resolveResumeStep(undefined, { step: "code-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("code-review");
  });

  it("resumePoint=spec-fixer + steps[spec-fixer] empty + steps[spec-review] needs-fix → spec-review", () => {
    const steps = {
      "spec-review": [{ outcome: { verdict: "needs-fix" } }],
    };
    expect(resolveResumeStep(undefined, { step: "spec-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("spec-review");
  });

  it("resumePoint=build-fixer + steps[build-fixer] empty + steps[verification] failed → verification", () => {
    const steps = {
      "verification": [{ outcome: { verdict: "failed" } }],
    };
    expect(resolveResumeStep(undefined, { step: "build-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("verification");
  });
});
```

### 3.2 Test: fixer actually ran → stays on fixer (existing behavior preserved)

```typescript
it("resumePoint=code-fixer + steps[code-fixer] non-empty → code-fixer (fixer ran, crash restart)", () => {
  const steps = {
    "code-review": [{ outcome: { verdict: "needs-fix" } }],
    "code-fixer": [{ outcome: { verdict: "success" } }],
  };
  expect(resolveResumeStep(undefined, { step: "code-fixer", reason: "crash", iterationsExhausted: 0 }, undefined, steps))
    .toBe("code-fixer");
});
```

### 3.3 Test: --from fixer overrides fixer-empty detection

```typescript
it("--from fixer + fixer-empty scenario → code-fixer (--from wins)", () => {
  const steps = {
    "code-review": [{ outcome: { verdict: "needs-fix" } }],
  };
  expect(resolveResumeStep("fixer", { step: "code-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
    .toBe("code-fixer");
});
```

### 3.4 Test: steps=undefined (legacy) → falls through to existing behavior

```typescript
it("resumePoint=code-fixer + steps=undefined → code-fixer (legacy path, no steps inspection)", () => {
  expect(resolveResumeStep(undefined, { step: "code-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, undefined))
    .toBe("code-fixer");
});
```

### 3.5 Test: fixer-empty but loop step has no needs-fix verdict → stays on fixer

```typescript
it("resumePoint=code-fixer + steps[code-fixer] empty + steps[code-review] approved → code-fixer (no mismatch)", () => {
  const steps = {
    "code-review": [{ outcome: { verdict: "approved" } }],
  };
  expect(resolveResumeStep(undefined, { step: "code-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
    .toBe("code-fixer");
});
```

---

## Task 4: [x] Create delta spec `cli-resume-command`

**File**: `specrunner/specs/cli-resume-command/spec.md` (NEW)

Create a new capability spec documenting resume step resolution behavior:

```markdown
## Purpose

`specrunner resume <slug>` の再開ステップ解決ロジック（`resolveResumeStep`）の振る舞いを定義する。

## Requirements

### Requirement: resume の既定動作は state の最終 step + verdict に基づき決定する

`--from` 未指定時、resume は state に記録された `resumePoint` と `steps` journal を分析して再開ステップを決定する MUST。

#### Scenario: fixer-empty mismatch (loop step needs-fix で中断)

- **GIVEN** `resumePoint.step` が fixer step (code-fixer / spec-fixer / build-fixer) である
- **AND** `state.steps[fixer]` が空（fixer が未実行）
- **AND** 対応する loop step の最終 verdict が `needs-fix` または `failed`
- **WHEN** `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** 対応する loop step (code-review / spec-review / verification) から再開する

#### Scenario: fixer が実際に実行済み (crash restart)

- **GIVEN** `resumePoint.step` が fixer step である
- **AND** `state.steps[fixer]` が非空（fixer が 1 回以上実行済み）
- **WHEN** `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** fixer step から再開する（= crash restart、既存挙動維持）

#### Scenario: reviewer step で exhaustion (iterationsExhausted > 0)

- **GIVEN** `resumePoint.step` が reviewer step (spec-review / code-review) である
- **AND** `resumePoint.iterationsExhausted > 0`
- **WHEN** `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** 対応する fixer step から再開する（= review exhaustion、既存挙動維持）

#### Scenario: crash (iterationsExhausted = 0)

- **GIVEN** `resumePoint.step` が任意の step で `iterationsExhausted = 0`
- **AND** fixer-empty mismatch に該当しない
- **WHEN** `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** `resumePoint.step` から再開する（= crash restart、既存挙動維持）

### Requirement: `--from` 指定時は既定を上書きして指定 role に対応する step から再開する

`--from <role>` が指定された場合、上記の自動解決を MUST 上書きし、role + phase に基づく step mapping で再開ステップを決定する。

#### Scenario: --from fixer で fixer-empty mismatch を上書き

- **GIVEN** fixer-empty mismatch に該当する state
- **WHEN** `specrunner resume <slug> --from fixer` を実行する
- **THEN** fixer step から再開する（= 明示指定が既定を上書き）

#### Scenario: --from critic で fixer crash を上書き

- **GIVEN** `resumePoint.step` が fixer step で fixer が実行済み
- **WHEN** `specrunner resume <slug> --from critic` を実行する
- **THEN** 対応する loop step (code-review / spec-review) から再開する

### Requirement: resumePoint が null かつ --from 未指定のとき resume を拒否する

`resumePoint` が null で `--from` も未指定の場合、resume は MUST エラーを返す。

#### Scenario: resumePoint null + from undefined

- **WHEN** `resumePoint` が null の状態で `specrunner resume <slug>` を `--from` なしで実行する
- **THEN** stderr に「再開位置が不明です」を出力し exit code 1 で終了する
```

---

## Task 5: [x] Verify

### 5.1 Type check

```bash
bun run typecheck
```

### 5.2 Run tests

```bash
bun run test
```

Ensure all existing resume tests pass (no regressions) and new tests pass.

---

## Execution Order

Tasks 1 → 2 → 3 → 4 → 5 (sequential; each depends on the previous)
