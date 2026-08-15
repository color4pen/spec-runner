# Regression Gate Result — absorb-test-materialize (iteration 3)

## Verification summary

All 9 ledger findings verified as fixed. No regressions detected.

---

## Finding verification

### F1 [LOW] T-02 doc scrub — state/schema/types.ts and config/schema/types.ts
- `src/state/schema/types.ts` line 226: now reads "Used by the bite-evidence gate (R4) for OID-based operations…" — no test-materialize reference. ✓
- `src/config/schema/types.ts` line 248: GUARDED set now lists "(implementer / code-fixer / adr-gen)" — no test-materialize reference. ✓
- **Status: FIXED**

### F2 [LOW] T-10 TC-015a duplicate risk in tasks.md
- Operator-apply commit (4d8182229) rewrote tasks.md line 138 to clarify TC-015a pin belongs inside `achieved-assurance.test.ts`, not as a new test-cases.md entry.
- No separate "test-cases.md にも TC-015a として追記する" directive remains.
- **Status: FIXED**

### F3 [MEDIUM] specFixerObservationForward JSDoc — test-materialize routing destination
- Module JSDoc (lines 1–13): "proceeds directly to implementer" — no test-materialize. ✓
- Function JSDoc line 56–57: "spec-fixer approved → implementer … observation pass goes directly to implementer" ✓
- @returns line 60: "forward directly to implementer (observation pass)" ✓
- Internal comment line 75: "routing incorrectly to implementer" ✓
- All 4 locations updated.
- **Status: FIXED**

### F4 [LOW] testGenRequired JSDoc — test-materialize in type-config.ts
- `src/config/type-config.ts` lines 27–28: "Whether this request type requires test generation (test-case-gen / bite-evidence)." and "pipeline bypasses test-case-gen and bite-evidence." — no test-materialize. ✓
- **Status: FIXED**

### F5 [LOW] "Currently FAILS because" comments in test files (6 locations)
- `grep -r "Currently FAILS because" src/` → no matches. ✓
- **Status: FIXED**

### F6 [MEDIUM] diffPathsBetweenCommits in RealRuntimeStrategy
- `src/core/port/runtime-strategy.ts`: no `diffPathsBetweenCommits` reference. ✓
- `src/core/runtime/local.ts`: no `diffPathsBetweenCommits` reference. ✓
- `src/core/runtime/managed.ts`: no `diffPathsBetweenCommits` reference. ✓
- `listChangedFilesBetweenCommits` present in port + LocalRuntime; ManagedRuntime returns unavailable.
- **Status: FIXED**

### F7 [LOW] bite-evidence-e2e-gate.test.ts — old test-materialize naming
- File no longer contains any test-materialize reference (grep: no matches). ✓
- Commit message uses "implementer: add feature test (impl absent → red at base)". ✓
- No `state.steps["test-materialize"]` usage. ✓
- No `diffPathsBetweenCommits` comment. ✓
- **Status: FIXED**

### F8 [LOW] diff-paths-between-commits.test.ts tests dead method
- File `src/core/runtime/__tests__/diff-paths-between-commits.test.ts` does not exist. ✓
- New `list-changed-files-between-commits.test.ts` added in its place. ✓
- **Status: FIXED** (file deleted)

### F9 [LOW] test-coverage.ts doc comment references deleted step test-materialize
- `src/core/verification/test-coverage.ts` lines 182/186: no test-materialize reference (grep: no matches). ✓
- Current doc: "implementer materializes tests" — correct post-change language. ✓
- **Status: FIXED**

---

## Observations

- `src/core/runtime/local.ts` line 1497 contains a stale comment: "test-materialize must produce test files after reading test-cases.md" in the test-coverage validation branch. This was not a ledger finding and is outside the finding set; noting for reference. Operational behavior is unaffected.
- Production files retain intentional historical references (legacy alias in resolve-step.ts, deprecation notes in registry.ts and config-effective.ts, design-change provenance comments in achieved-assurance.ts and oids.ts) — all correct by design.
