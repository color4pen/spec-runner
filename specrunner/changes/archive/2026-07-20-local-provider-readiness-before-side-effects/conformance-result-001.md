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
| tasks.md | ✅ | All T-01–T-08 checkboxes marked complete |
| design.md | ✅ | D1–D5 realized; minor note on probe default wiring (see below) |
| spec.md | ✅ | All 6 Requirements and all Scenarios covered |
| request.md | ✅ | All acceptance criteria T1–T7 satisfied with test evidence |

## J1: tasks.md — all checkboxes complete

All T-01 through T-08 checkboxes are marked `[x]`. No incomplete tasks.

## J2: design.md decisions

| Decision | Status | Evidence |
|----------|--------|----------|
| D1 — Gate at top of `CommandRunner.execute()` before `prepare()` | ✅ | `src/core/command/runner.ts:96-111` — `if (this.runtime.assertProviderReadiness)` fires before `this.prepare()` |
| D2 — Live probe (not connection pre-ordering) | ✅ | `src/adapter/claude-code/provider-readiness-probe.ts` — bounded SDK query with `AbortController`, `maxTurns:1`, no tools, early abort on authenticated turn |
| D3 — Injectable seam: optional on `RuntimeStrategy`, required on `RealRuntimeStrategy` | ✅ | `src/core/port/runtime-strategy.ts` — `assertProviderReadiness?` optional on port, present as required member on `RealRuntimeStrategy` intersection type |
| D4 — Classification mirrors `describeGitFetchFailure`: prescriptive first sentence + detail | ✅ | `src/core/runtime/provider-readiness.ts` — `PRESCRIPTIVE_MESSAGES` static first sentence, `detail` appended after `"\n"` when present |
| D5 — Exit 1, no `RunResultContract` JSON on readiness failure | ✅ | `runner.ts:108-110` — `return 1` with comment "Do NOT emit RunResultContract JSON here — no job exists yet" |

**Minor note**: D3 states "The default is wired at the composition root (`createRuntime`)," but the real probe is instantiated via lazy dynamic import inside `LocalRuntime.assertProviderReadiness()` rather than in `factory.ts`. Task T-04 explicitly permits this ("or rely on the constructor default"). Production behavior is identical and the injection seam is intact.

## J3: spec.md requirements

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Readiness verified before any run/resume side effect | ✅ | Gate fires before `prepare()`, which is the first side-effect call on both run and resume paths |
| Four failure kinds with distinct messages and prescriptions | ✅ | `PRESCRIPTIVE_MESSAGES` and `PROVIDER_READINESS_HINTS` each have four distinct entries |
| Exactly once per run/resume | ✅ | Single `if` call in gate block; TC-006 counting probe verifies call count = 1 |
| No raw error or credential value in first sentence | ✅ | First sentence drawn from static `PRESCRIPTIVE_MESSAGES`; detail appended only on second line |
| Injectable seam, no real token required | ✅ | `providerReadinessProbe` constructor option on `LocalRuntime`; fakes return predetermined results |
| Managed runtime unchanged | ✅ | `ManagedRuntime.assertProviderReadiness` is an explicit no-op; existing managed tests pass |

## J4: request.md acceptance criteria

| Criterion | Status | Test coverage |
|-----------|--------|---------------|
| T1 — No side effects on readiness failure; breakage check load-bearing | ✅ | TC-001 (`prepare()` not called for all 4 failure kinds), TC-003 (without gate, `prepare()` IS called) |
| T2 — Four kinds via injection; distinct messages + hints; hint existence check | ✅ | TC-004 (distinct messages and hints), TC-005 (`hint-command-existence.test.ts` covers `PROVIDER_READINESS_HINTS`) |
| T3 — Probe called exactly once | ✅ | TC-006 (counting probe asserts `callCount === 1` for both not-ready and ready paths) |
| T4 — Raw error/credential absent from first sentence; detail preserved | ✅ | TC-007 (first line free of raw error text; detail present on following line) |
| T5 — Tests green without real token; no long-lived CI token added | ✅ | Verification: 564 test files / 7736 tests passed; all via injected fakes |
| T6 — Managed existing tests pass unchanged | ✅ | TC-009 (managed no-op resolves); full test suite green in verification |
| T7 — `typecheck && test` green | ✅ | Verification: build ✅, typecheck ✅, test ✅, lint ✅, changed-line-coverage ✅ |

## Architecture

- `src/core/port/provider-readiness.ts` has no imports from `adapter/` or `core/runtime/` (port-layer invariant satisfied).
- `runner.ts` B-6 allowlist entry added: `assertProviderReadiness(process.env` is a port-method call, not a raw subprocess spawn; `LocalRuntime` calls `stripSecrets` internally before passing env to the SDK.
- `src/core/runtime/provider-readiness.ts` imports only from port layer and `errors.ts` — no adapter back-edges.

## Summary

Implementation is complete and fully conformant. All design decisions are realized, all spec requirements satisfied, all acceptance criteria have test coverage, and `typecheck && test` is green.
