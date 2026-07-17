# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All 6 tasks fully implemented; all checkboxes marked [x] |
| design.md | ✓ | D1–D6 all reflected in implementation; port/runtime-strategy.ts and .specrunner/config.json unchanged |
| spec.md | ✓ | All 5 requirements and all 8 scenarios covered by named tests |
| request.md | ✓ | T1–T6 + typecheck/test all green; backward-compat preserved |

---

## Detail

### tasks.md — all checkboxes [x]

T-01 (`scopedTestCommand` config field): `VerificationConfig.scopedTestCommand?: string` added to `src/config/schema/types.ts:159-162` with doc comment. `validation.ts:270` adds `scopedTestCommand: optional(nonEmptyString(...))` reusing existing helper. No change to `.specrunner/config.json`. ✓

T-02 (`runTestsAtCommit` rework): D3 precedence implemented at `local.ts:941-1007`. Scoped path: `fs.access` check → symlink → per-file `spawnScopedCommand` with single-quote escaping. Bail path: custom commands without `scopedTestCommand` → `unavailable`. Default path: unchanged `bun test` via `this.spawnFn`. Cleanup in finally with symlink unlinked first. JSDoc updated. Port signature untouched. ✓

T-03 (backward-compat test update + opt-in case): `bite-evidence-isolated-exec.test.ts` TC-006 comment clarifies `scopedTestCommand`-unset premise; still asserts `kind === "unavailable"` only. TC-005 added: custom commands + `scopedTestCommand` → `{kind:"ran"}` with per-file result. ✓

T-04 (real runtime integration): `bite-evidence-scoped-exec.test.ts` exercises TC-001 (dep resolves → passed), TC-001 break-check (dep renamed → not passing ran), TC-002 (no node_modules → unavailable), TC-007 (mixed pass/fail), TC-008 (cleanup), TC-009 (bad OID → unavailable), TC-012 (source node_modules survives). ✓

T-05 (E2E gate/floor): `bite-evidence-e2e-gate.test.ts` TC-010 drives real `runBiteEvidenceGate` and `deriveAchievedAssurance` through real `LocalRuntime` against a real throwaway repo. base commit (impl absent → red), candidate commit (impl present → green). Gate: `verdict:"passed"`, `baseResult:"red"`, `candidateResult:"green"`, `verified:true`. Floor: `biteEvidence:"required"` achieved. No fakes. ✓

T-06 (backward-compat + full suite): 532 test files / 7286 tests all green per `verification-result.md`. `git diff main...HEAD -- src/core/port/runtime-strategy.ts .specrunner/config.json` produces no output. ✓

### design.md — all decisions reflected

| Decision | Implementation location | Status |
|----------|------------------------|--------|
| D1 — symlink node_modules, fail-closed if absent | `local.ts:949-961` | ✓ |
| D2 — `scopedTestCommand?: string` opt-in field | `types.ts:159-162`, `validation.ts:270` | ✓ |
| D3 — scoped/bail/default precedence; `.bin` on PATH via verification `spawnCommand` alias | `local.ts:941-1007`, import at `local.ts:24` | ✓ |
| D4 — finally cleanup: symlink first, then worktree | `local.ts:1011-1035` | ✓ |
| D5 — no port signature change; managed untouched | empty diff on `runtime-strategy.ts` | ✓ |
| D6 — real runtime proof, not fakes | `bite-evidence-scoped-exec.test.ts`, `bite-evidence-e2e-gate.test.ts` | ✓ |

### spec.md — all requirements and scenarios covered

| Requirement | Covering tests | Status |
|-------------|---------------|--------|
| R1 — dependency resolution | TC-001, TC-002, TC-012 | ✓ |
| R2 — `scopedTestCommand` opt-in field | TC-003, TC-004, TC-011 | ✓ |
| R3 — custom commands per-file when scoped | TC-005, TC-006, TC-007 | ✓ |
| R4 — cleanup + never-throw | TC-008, TC-009 | ✓ |
| R5 — E2E bite tooth green | TC-010 | ✓ |

### request.md — acceptance criteria

- **T1** (real runtime integration): `bite-evidence-scoped-exec.test.ts` TC-001 uses real `LocalRuntime` + real git repo + hand-built dep. Returns `{kind:"ran"}` with correct per-file `passed`. ✓
- **T2** (dependency resolution + break-check): TC-001 break-check renames the dep and asserts result is not a passing `ran`. TC-012 asserts source `node_modules` survives cleanup. ✓
- **T3** (opt-in): TC-006 (unset → unavailable, premise documented), TC-005 (set → ran). ✓
- **T4** (per-file granularity): TC-007 runs two files with independent outcomes; each file's `passed` reflects its own exit code. ✓
- **T5** (E2E gate/floor): TC-010 — real `runBiteEvidenceGate` produces verified record; real `deriveAchievedAssurance` records `biteEvidence` as achieved. ✓
- **T6** (backward-compat): 532 test files all green; `.specrunner/config.json` and `runtime-strategy.ts` diff-clean. ✓
- **typecheck && test green**: build ✓, typecheck ✓, test ✓ (532 files), lint ✓ per `verification-result.md`. ✓

### Note — whitespace-only `scopedTestCommand` (TC-011 second case)

`scopedTestCommand: "   "` passes schema validation (`nonEmptyString` requires `length > 0`; whitespace passes). The implementation trims the value (`trim()`) and treats empty-after-trim as unset → bail path. This is intentional and documented in the test comment. Fail-closed behavior is preserved. No action needed.
