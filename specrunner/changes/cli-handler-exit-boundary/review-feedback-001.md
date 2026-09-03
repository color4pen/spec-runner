# Code Review Feedback — cli-handler-exit-boundary — iteration 1

## Summary

- **Scope**: 72 files changed, 5007 insertions, 712 deletions
- **Verification**: all phases passed (build / typecheck / test / lint / coverage)
- **Production contract**: `CommandHandler` is now `Promise<number>` across all 30 handlers; `process.exit` is at 0 AST calls in `src/cli/**`; entrypoint ratchet enforced by 10 architecture checks

---

## Evidence

### Acceptance criteria vs implementation

| Criterion | Status | Evidence |
|---|---|---|
| `CommandHandler` returns `Promise<number>` | ✓ | `src/cli/command-handler.ts:15`; Check 8 ratchet |
| All 30 handlers return explicit exit code | ✓ | Check 8 ratchet; all `handle*` exports have `Promise<number>` annotation |
| `src/cli` `process.exit` = 0 (AST) | ✓ | Check 7 ratchet in `architecture-ratchet.test.ts`; grep confirms 0 call expressions in production files |
| `process.exit` centralized in `bin/specrunner.ts` | ✓ | Check 9 allowlist `{bin/specrunner.ts, src/core/runtime/local.ts, src/core/runtime/managed.ts}` |
| Common `FlagParseError`/`SpecRunnerError`/unexpected error conversion at dispatch boundary | ✓ | `bin/specrunner.ts:124-137`; EC-05/06/07/08 fixture cases pass |
| Domain-meaningful catches maintained | ✓ | `doctor.ts` flat `Fatal:`/1 catch preserved; `prune.ts` two-phase SpecRunnerError catches kept; `attach.ts` domain-specific error messages kept |
| CommandSpec structure matches R3a base fixture | ✓ | `cli-contract-snapshot.test.ts` (not in diff → continues to pass) |
| stdout/stderr/exit code/order matches base fixture | ✓ | `cli-exit-contract.test.ts` 23 EC cases against `cli-exit-contract.base.json`; all green |
| No migration shims / adapters | ✓ | `runRun`, `runResume`, `runReopen` void wrappers deleted; grep confirms absence |
| Architecture ratchet present | ✓ | Checks 7–10 in `architecture-ratchet.test.ts` |

### TC coverage (must-priority cases from test-cases.md)

| TC | Description | Coverage |
|---|---|---|
| TC-001 | success → 0 | EC-01 fixture |
| TC-002 | primitive non-zero transparent | EC-02 (value=7) fixture |
| TC-003 | handler usage error | EC-03, EC-18–23 fixtures |
| TC-004 | all handlers conform to number contract | Check 8 ratchet |
| TC-005 | no `process.exit` in `src/cli` | Check 7 ratchet |
| TC-006 | dispatch boundary owns termination | EC-01/02 + Check 9 |
| TC-007 | normal exit produces no extra stderr | EC-01 `stderr: []` in fixture |
| TC-008 | process.exit not redistributed | Check 9 allowlist |
| TC-009 | FlagParseError at boundary | EC-05 fixture |
| TC-010 | SpecRunnerError at boundary | EC-06/07 fixtures |
| TC-011 | unexpected error at boundary | EC-08 fixture |
| TC-013 | doctor flat Fatal catch maintained | `doctor.ts:246-250`; `handleDoctor` catch preserved |
| TC-014 | doctor repair independent display | `doctor.ts:271-275`; `handleDoctorRepair` catch preserved |
| TC-017 | CommandSpec matches base | `cli-contract-snapshot.test.ts` |
| TC-018 | exit contract matches base (23 cases) | `cli-exit-contract.test.ts` |
| TC-019 | missing case detected | fixture completeness guard in test |
| TC-020 | guard order maintained | EC-16 (worktree) / EC-17 (repo) fixture |
| TC-021 | process.exit re-introduction detected | Check 7 + Check 9 |
| TC-023 | handler contract deviation detected | Check 8 |
| TC-024 | no switch/case in entrypoint | Check 10 |
| TC-026 | void wrappers deleted | `src/cli/resume.ts` -3 lines; `run.ts` -6 lines; `reopen.ts` wrapper removed |
| TC-031 | gate: all verification phases green | verification-result.md |

---

## Findings

### F-01 — False-positive tests in command-registry-reopen.test.ts

**Severity**: medium  
**File**: `src/cli/__tests__/command-registry-reopen.test.ts`  
**Lines**: TC-004-registry-c (~91–114) and TC-012-b (~142–164)

Both test cases use the old `process.exit` spy pattern:

```typescript
try {
  await handler!(makeParsedArgs({ flags: {} }));
  expect.fail("Expected process.exit(2) to be called");
} catch (err) {
  expect((err as Error).message).toMatch(/process\.exit\(2\)/);
}
```

Under the new contract the handler returns `2` without calling `process.exit`. The flow becomes:

1. `handler!()` resolves to `2` — no exception
2. `expect.fail("Expected process.exit(2) to be called")` throws an `AssertionError` with that literal message
3. The catch receives the `AssertionError`
4. `expect(msg).toMatch(/process\.exit\(2\)/)` tests whether `"Expected process.exit(2) to be called"` matches the regex — it **does**, because the substring `process.exit(2)` is present

Result: the tests always pass, regardless of whether `process.exit` is called or the handler returns an exit code. They provide false confidence and will not catch a regression to the old `process.exit`-calling pattern.

TC-004-registry-d (directly below) is the correct new-contract test (`expect(result).toBe(2)`) and provides actual coverage. TC-004-registry-c and TC-012-b should be either deleted or rewritten to use the return-value pattern.

**Fixable**: replace the old spy+catch pattern with:
```typescript
const result = await handler!(makeParsedArgs({ flags: {}, ... }));
expect(result).toBe(2);
```

---

### F-02 — Stale `Promise<void>` type annotation on `getReopenHandler()` helper

**Severity**: low  
**File**: `src/cli/__tests__/command-registry-reopen.test.ts`  
**Lines**: `getReopenHandler` function (~49–55)

The helper returns the handler typed as `Promise<void>`:

```typescript
function getReopenHandler():
  | ((parsed: ParsedArgs, ctx?: Record<string, unknown>) => Promise<void>)
  | undefined {
  return COMMANDS["job"]?.children?.["reopen"]?.handler as ... | undefined;
}
```

The actual handler now returns `Promise<number>`. The stale annotation is inconsistent with the new contract, may suppress TypeScript errors on call sites, and misleads future maintainers about the handler's return type.

**Fixable**: change the return type to `Promise<number>`.

---

### F-03 — `configureMocks()` callback is not awaited in exit-contract-harness.ts

**Severity**: low  
**File**: `src/cli/__tests__/exit-contract-harness.ts`  
**Line**: 81 (`configureMocks();`)

The harness types the parameter as `() => void` and calls it without `await`:

```typescript
export async function runCase(
  argv: string[],
  configureMocks: () => void,   // typed as sync, called without await
): Promise<ExitContractSnapshot> {
  ...
  configureMocks();
  try {
    const mod = await import("../../../bin/specrunner.js");
    await mod.main();
```

In the actual test the callback is `async () => { await applySetup(caseDef.setup); }`. The async mock setup (which performs an `await import(...)` + `mockResolvedValue`) therefore races against the specrunner module import. Tests pass in practice because specrunner's import chain is large enough that mock setup completes first, but this ordering is not guaranteed. A future CI environment or caching change could expose the race.

**Fixable**: change the parameter type to `() => Promise<void>` and await the call:
```typescript
configureMocks: () => Promise<void>
...
await configureMocks();
```

---

## Observations

- The `stderrWrite` masking inconsistency (pre-dispatch sections use `process.stderr.write` directly; dispatch error boundary uses `stderrWrite`) is acknowledged in design.md D5 as a pre-existing issue, not introduced by this change.
- TC-025 (dispatch `process.exit` outside try/catch for the normal path) is met: `process.exit(code)` at line 138 is outside the try/catch; error-path exits inside the catch are correct behavior, not a violation.
- TC-027 (base fixture generated before production changes) is a manual check. The fixture and generator were added in this branch. Reviewers should confirm via `git log` that the fixture commit pre-dates production file changes.
- TC-028 (5 common-conversion catches deleted): confirmed. `handleJobArchive`, `handleJobResume`, `handleJobReopen`, `handleJobPrune`, and `handleJobAttach` have no catch blocks. Domain-level catches within `runPrune` and `runAttach` are independent and were not the handler-level catches targeted by the design.
- All 22 must-priority TCs are covered by automated tests; 4 should/could TCs (TC-027/028/029/030) are manual.

---

## 検証した項目

- `src/cli/command-handler.ts` — `CommandHandler` type alias (`Promise<number>`)
- `bin/specrunner.ts` — dispatch boundary structure, process.exit placement, error conversion logic
- `src/cli/__tests__/architecture-ratchet.test.ts` — Checks 1–10 (all 10 ratchets)
- `src/cli/__tests__/cli-exit-contract.test.ts` — 23 EC snapshot cases and fixture completeness guard
- `src/cli/__tests__/exit-contract-harness.ts` — runCase implementation, mock timing
- `src/cli/__tests__/exit-contract-cases.ts` — 23 case definitions
- `src/cli/__tests__/fixtures/cli-exit-contract.base.json` — fixture values for all 23 cases
- `src/cli/__tests__/command-registry-reopen.test.ts` — TC-004-registry-c/d, TC-012-b, TC-024-registry
- `src/cli/__tests__/command-registry-adopt-commits.test.ts` — adopt-commits flag wiring
- `src/cli/job-resume-handler.ts` — handler contract, catch removal, prompt-file catch retained
- `src/cli/job-archive-handler.ts` — handler contract, catch removal
- `src/cli/job-start-handler.ts` — handler contract, domain catches retained
- `src/cli/reopen.ts` — handler and runReopenCore, void wrapper deletion
- `src/cli/prune.ts` — handler contract, domain-level catches in runPrune
- `src/cli/attach.ts` — handler contract, domain-specific catches in runAttach
- `src/cli/cancel.ts` — handler contract, domain catches
- `src/cli/doctor.ts` — flat Fatal catch preservation in handleDoctor and handleDoctorRepair
- `specrunner/changes/cli-handler-exit-boundary/test-cases.md` — 31 TC definitions, must-priority coverage
- `specrunner/changes/cli-handler-exit-boundary/design.md` — D5/D8 design decisions, catch classification table
- `specrunner/changes/cli-handler-exit-boundary/verification-result.md` — all phases passed

---

## 検証できなかった項目

- **TC-027** (base fixture commit dating): `cli-exit-contract.base.json` and the generator test were both added in this branch. Whether the fixture was generated on `main@de88d1b5` before any production changes requires manual `git log --follow` / `git show <commit>` verification by a human reviewer — not mechanically verifiable from the worktree alone.
