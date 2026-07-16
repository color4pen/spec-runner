# Conformance Result — assurance-profile-spine — iteration 001

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
| tasks.md | ✓ | 全 T-01〜T-08 の checkbox が [x] かつ実装で裏付けられている |
| design.md | ✓ | D1–D6 すべて実装に反映されている |
| spec.md | ✓ | 全 Requirement / Scenario がテストで固定されている |
| request.md | ✓ | 受け入れ基準 9 件がすべて充足されている |

---

## Scope of Review

| Artifact | Reviewed |
|----------|----------|
| rules.md | ✓ identity priming |
| tasks.md | ✓ all checkboxes [x] |
| design.md | D1–D6 noted |
| spec.md | all Requirements / Scenarios noted |
| request.md | all acceptance criteria noted |
| git diff --stat | 26 files, +2088/−38 lines |

---

## Judgment 1 — Spec Conformance (SHALL / MUST)

### Requirement: JobState holds profile as optional branch-borne attribute

- `JobState.profile?: EffectiveProfile` added at `src/state/schema/types.ts:326` with correct JSDoc (immutable, absent→legacy compat). **✓**
- `validateJobState` does not reject profile-absent state (D6). **✓**
- Round-trip (persist→load) preserves value: TC-PROFRT-003. **✓**

### Requirement: standard profile is self-consistent

- `STANDARD_PROFILE` is built body-first; `policyDigest: computePolicyDigest(_standardBody)` is composed at module load (`src/state/profile.ts:41–56`). **✓**
- `computePolicyDigest` accepts `Pick<EffectiveProfile, "id"|"schemaVersion"|"budget"|"assurance">` — `policyDigest` structurally excluded from hash input. **✓**
- TC-PROF-001 asserts `STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)`. **✓**
- TC-PROF-004 asserts sensitivity to body fields and invariance to `policyDigest` tamper. **✓**

### Requirement: new job records STANDARD_PROFILE branch-borne

- `buildInitialJobState` sets `profile: params.profile ?? STANDARD_PROFILE` (`src/store/job-state-store.ts:84`). **✓**
- Existing callers (`LocalRuntime.bootstrapJob` / `ManagedRuntime.bootstrapJob`) unchanged. **✓**
- TC-PROFRT-001 / TC-PROFRT-003 confirm persistence. **✓**

### Requirement: absent profile resolves to standard without state mutation

- `getProfile(state)` = `state.profile ?? STANDARD_PROFILE` (`src/state/profile.ts:66`). **✓**
- TC-PROF-002 asserts non-destructiveness and `STANDARD_PROFILE` identity. **✓**

### Requirement: profile is immutable per job

- `TransitionContext.patch` type: `Omit<JobState, "version"|"jobId"|"createdAt"|"status"|"history"|"profile">` (`src/state/lifecycle.ts:24`). **✓**
- `JobStateStore.update` patch type: `Omit<JobState, "version"|"jobId"|"createdAt"|"profile">` (`src/store/job-state-store.ts:281`). **✓**
- TC-PROFRT-004 walks `running → awaiting-resume → running → awaiting-archive` and asserts profile identity at each step. **✓**
- No runtime-derived silent re-resolution path exists. **✓**

### Requirement: attach verifies stored profile self-consistency fail-closed

- `verifyCheckpoint` checks `state.profile !== undefined` before verifying (raw presence, not `getProfile`) (`src/core/attach/verify-checkpoint.ts:153`). **✓**
- digest mismatch → `checkpointNotAttachableError("profile-inconsistent", …)` (`:157–161`). **✓**
- `schemaVersion > SUPPORTED_PROFILE_SCHEMA_VERSION` → `checkpointNotAttachableError("profile-uninterpretable", …)` (`:163–168`). **✓**
- Profile absent → verification skipped (backward compat). **✓**
- No local-config re-resolution in verification path. **✓**
- `verifyCheckpoint` is a pure predicate (no I/O), so failure does not create job state / worktree / sidecar. **✓**
- TC-VC-015 / TC-VC-016 / TC-VC-017 / TC-VC-018 cover all four Scenarios. **✓**

### Requirement: profile introduction does not change standard behavior

- `budget`/`assurance` values are not read anywhere in src/ for branching decisions. **✓**
- 514 test files, 7071 tests all pass (verification-result.md). **✓**

---

## Judgment 2 — Design Decision Adherence (D1–D6)

| Decision | Implementation | Status |
|----------|---------------|--------|
| D1: `hashObject`/`canonicalJson` moved to `src/util/hash.ts` (leaf); `src/core/agent/hash.ts` = re-export shim | `src/util/hash.ts` is self-contained (`node:crypto` only); `src/core/agent/hash.ts` is a one-liner re-export | **✓** |
| D2: `EffectiveProfile` in `schema/types.ts`; helpers in `src/state/profile.ts` (pipeline-id.ts mirror) | `ProfileBudget`/`ProfileAssurance` type aliases declared; `SUPPORTED_PROFILE_SCHEMA_VERSION`, `computePolicyDigest`, `STANDARD_PROFILE`, `getProfile` in profile.ts | **✓** |
| D3: `STANDARD_PROFILE.policyDigest` derived at construction, `policyDigest` excluded from hash input | `_standardBody` defined without `policyDigest`, then composed; `computePolicyDigest` signature uses `Pick` | **✓** |
| D4: `buildInitialJobState` 焼き込み + patch Omit as compile-time guard | Both patch sites use `Omit<…, "profile">` | **✓** |
| D5: `verifyCheckpoint` uses raw presence (`!== undefined`) for guard, `getProfile` only for resolution afterward | Guard is `if (state.profile !== undefined)` — `getProfile` not called in the guard path | **✓** |
| D6: `validateJobState` does not throw on absent or present profile | Confirmed: `validateJobState` passes through profile as opaque optional | **✓** |

---

## Judgment 3 — Acceptance Criteria (request.md)

| Criterion | Evidence | Status |
|-----------|----------|--------|
| `EffectiveProfile` + `STANDARD_PROFILE` defined, self-consistent | TC-PROF-001; `profile.ts:53–56` | **✓** |
| `buildInitialJobState` sets `STANDARD_PROFILE`, persisted (branch-borne) | TC-PROFRT-001 / TC-PROFRT-003 | **✓** |
| `getProfile(state)` → `STANDARD_PROFILE` for absent, non-destructive | TC-PROF-002 | **✓** |
| profile immutable through `transitionJob` and resume | TC-PROFRT-004; patch Omit | **✓** |
| fail-closed: digest mismatch → `CHECKPOINT_NOT_ATTACHABLE` / `profile-inconsistent` | TC-VC-015 | **✓** |
| fail-closed: schemaVersion exceeded → `CHECKPOINT_NOT_ATTACHABLE` / `profile-uninterpretable` | TC-VC-016 | **✓** |
| absent profile → `standard`, attach succeeds (backward compat) | TC-VC-018 | **✓** |
| existing attach/publisher/worktree/pipeline/guard-halt tests unchanged, green | 514 files, 7071 tests pass | **✓** |
| `typecheck && test` green | verification-result.md: build ✓, typecheck ✓, test ✓ | **✓** |

---

## Judgment 4 — Behavioral Invariance

- `src/core/agent/hash.ts` is a transparent re-export shim; existing consumers resolve without change. **✓**
- No profile-value-based branches (`profile.id`, `profile.budget`, `profile.assurance`) exist in `src/`. **✓**
- All 514 test files / 7071 tests pass; lint and typecheck are green. **✓**
- `validateJobState` does not inject or default profile (no on-read mutation). **✓**
- Layer closure invariant maintained: `src/state/profile.ts` imports `src/util/hash.ts` (leaf), not `src/core/` — no B-3 violation. `core-invariants.test.ts` / `module-boundary.test.ts` pass within the 7071-test suite. **✓**

---

## Summary

全 4 判定項目クリーン。blocking 所見なし。コードレビュー（review-feedback-001.md）も `approved` / info 2 件のみ（R2–R4 への申し送り、修正不要）。

実装は request.md の受け入れ基準 9 件・spec.md の全 Requirement/Scenario・design.md D1–D6 をすべて満たしており、挙動不変も確認済み。
