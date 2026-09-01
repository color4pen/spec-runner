# Conformance Result — Iteration 003

**Change**: runtime-mutation-lifecycle-capability-split (R2b)
**Reviewer**: conformance agent (iteration 3)
**Normative sources**: request.md (Acceptance Criteria) + spec.md (Requirements / Scenarios)
**Plan sources**: design.md (D1–D6), tasks.md (T-01 – T-17) — referenced as context, not conformance gates

---

## Summary

All thirteen Acceptance Criteria and all eleven normative Spec Requirements remain satisfied (carried forward from iteration 002, verified against current HEAD). One low-severity cosmetic finding exists in TC-T15-05: a stale block comment and redundant `as PipelineDeps` cast that describe pre-R2b behavior. All normative items pass.

---

## Delta from Iteration 002

The only change since iteration 002 is the stale comment / redundant cast in `tests/unit/step/executor-lifecycle-ordering.test.ts` TC-T15-05 (lines 252–275), which describes old `buildDeps()` → `unknown` semantics that were superseded by R2b.

Specifically:
- Lines 252–264: block comment states `buildDeps()` "MUST declare its return type as `unknown` at the port boundary" — contradicts the current `RuntimeStrategy` interface where `buildDeps()` returns `PipelineDeps` directly (runtime-strategy.ts line 400).
- Line 267 `it(...)` description: "RuntimeStrategy.buildDeps() returns unknown at port boundary; caller casts to PipelineDeps (DSM §3)" — incorrect after R2b.
- Lines 273–274: inline comments say "buildDeps() returns `unknown`" and "Caller must cast, exactly as runner.ts does" — both inaccurate.
- Line 275: `as PipelineDeps` cast is redundant now that `buildDeps()` returns `PipelineDeps` directly.

This does not affect any normative acceptance criterion. The test still compiles and passes because TypeScript does not reject a redundant safe cast. The finding is low-severity cosmetic/accuracy.

---

## Evidence Matrix — Acceptance Criteria (request.md)

### AC-1: 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない
**PASS** — Carried from iteration 002. No `deps.runtimeStrategy` references in executor.ts, pipeline.ts, parallel-review-round.ts, runner.ts, step-completion.ts, commit-orchestrator.ts. `runtimeStrategy`-named fields in param objects are typed as narrow capabilities (CommitInspectionCapability | undefined, etc.).

### AC-2: `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない
**PASS** — Carried from iteration 002. `runtimeStrategy?: RuntimeStrategy` field absent from `src/core/types.ts`. Replaced by 7 typed capability fields.

### AC-3: capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない
**PASS** — Carried from iteration 002. Four capability interfaces: `StepArtifactLifecycleCapability` (5 methods), `StepIoValidationCapability` (3 methods), `TerminalStateCapability` (1 method), `RoundGitEffectsCapability` (5 methods). No single `MutationRuntimeStrategy` mega-interface.

### AC-4: capability method は required で、能力不在は注入値で表現される
**PASS** — Carried from iteration 002. All capability methods required except `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard?` (fail-open semantics; justified). Consumer guards use field presence check `deps.stepArtifact ? ...`.

### AC-5: 対象 4 signature の domain payload `unknown` ゼロ
**PASS** — Carried from iteration 002. `buildDeps()` → `PipelineDeps`; `finalizeStepArtifacts()` fully typed; `commitFinalState(cwd: string, slug: string, state: JobState)`; `commitRoundArtifacts(infra: CommitPushInfra, egressParams?: RoundEgressParams)`.

### AC-6: 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される
**PASS** — Carried from iteration 002. Production `as PipelineDeps` (runner.ts) removed; `as CommitPushInfra` (local.ts) removed; egress params restore cast removed.

### AC-7: 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない
**PASS** — Carried from iteration 002. Count reduced from 4 to 2 (monotone decrease), both in full-pipeline e2e test mocks, zero in `src/` production files.

### AC-8: R2a の read-only leaf consumer が full facade 依存へ戻っていない
**PASS** — Carried from iteration 002. `adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` accept narrow capability types; no `deriveCommitInspectionCapability(runtimeStrategy)` call at consumer sites.

### AC-9: command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される
**PASS** — `tests/unit/step/executor-lifecycle-ordering.test.ts` covers TC-T15-01 through TC-T15-05. TC-T15-05 contains the stale comment but the test itself still compiles and executes correctly; the invariant being tested (typed buildDeps return) is verified by the fact that no `unknown` return type is declared at line 400 of runtime-strategy.ts.

### AC-10: Local/Managed capability contract test、または同等の executable proof がある
**PASS** — Carried from iteration 002. `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` and `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` cover all 4 capability interfaces with compile-time and runtime assertions.

### AC-11: architecture 文書が実装後の責務と依存方向に一致する
**PASS** — Carried from iteration 002. `architecture/components.md` documents `RuntimeStrategy` as composition-root facade, `PipelineDeps.runtimeStrategy` as "廃止 (R2b)", R2a and R2b capability split, Local/Managed differences confined to concrete implementations.

### AC-12: SpecRunner verification が green
**PASS** — `verification-result.md` present in change folder. Per review instructions, existing PR evidence is authoritative.

### AC-13: 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない
**PASS** — `git diff main...HEAD --stat` shows changes within refactoring scope.

---

## Evidence Matrix — Spec Requirements (spec.md)

All eleven spec requirements carry PASS from iteration 002. No regression observed.

| Requirement | Status |
|---|---|
| Step artifact lifecycle capability is consumer-owned and typed | PASS |
| Terminal state capability carries typed parameters | PASS |
| Round git effects capability is consumer-owned and typed | PASS |
| buildDeps returns typed PipelineDeps without a cast | PASS |
| PipelineDeps does not hold a full RuntimeStrategy facade field | PASS |
| LocalRuntime.buildDeps injects all capabilities into PipelineDeps | PASS |
| ManagedRuntime preserves existing no-op semantics in capabilities | PASS |
| Capability methods are required; absence is expressed via undefined field | PASS |
| R2a read-only capabilities injected directly, not re-derived from facade | PASS |
| Command lifecycle ordering is preserved after capability split | PASS |
| Step finalize lifecycle ordering is preserved | PASS |

---

## Findings

### F-003-01 [LOW / cosmetic]: TC-T15-05 has stale comment and redundant cast describing pre-R2b behavior

**File**: `tests/unit/step/executor-lifecycle-ordering.test.ts`  
**Lines**: 252–275  
**Severity**: low (no normative criterion violated; test compiles and passes)

**Detail**:
- Block comment (lines 252–264) states that `RuntimeStrategy.buildDeps()` "MUST declare its return type as `unknown` at the port boundary" — contradicts current `runtime-strategy.ts` line 400 where `buildDeps()` returns `PipelineDeps` directly.
- `it()` description (line 267) and inline comments (lines 273–274) repeat the same stale narrative.
- `as PipelineDeps` cast on line 275 is now redundant since `buildDeps()` returns `PipelineDeps`; however TypeScript does not reject a redundant safe widening cast, so it causes no runtime or compile error.

**Required fix**: Update block comment, `describe`/`it` labels, and inline comments to reflect R2b semantics (typed return, no cast needed). Remove the redundant `as PipelineDeps` cast from line 275.

---

## Plan Divergences (design.md / tasks.md)

None beyond iteration 002.

---

## Metrics (Iteration 003 — unchanged from 002)

| Metric | Baseline (R2a) | After R2b |
|---|---|---|
| `unknown` tokens in target signatures | 8 | 0 |
| `as PipelineDeps` in production | 1 | 0 |
| `as CommitPushInfra` in production | 1 | 0 |
| Egress params restore cast in production | 1 | 0 |
| `as unknown as RuntimeStrategy` (all files) | 4 | 2 (monotone decrease) |
| `PipelineDeps.runtimeStrategy` production references | multiple | 0 |
| New capabilities introduced | 0 | 4 |
| Local/Managed contract test files | 0 | 2 |

---

## Verdict Input

All normative items verified PASS. One low-severity cosmetic finding (F-003-01) in a test comment/cast does not violate any normative criterion. Routing: code-fixer.
