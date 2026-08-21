# Conformance Result — tamper-provenance-baseline (Iteration 1)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Summary

All normative requirements from request.md and spec.md are satisfied. typecheck and test
are both green. No findings.

---

## Scope of Changes (git diff main...HEAD --stat)

Implementation files changed:

| File | Change |
|---|---|
| `src/core/port/runtime-strategy.ts` | +32: `lastCommitTouchingPath` optional method added to port; required in `RealRuntimeStrategy` |
| `src/core/port/step-types.ts` | +8: `authorizedCanonWriters` field added to `CliStepDeps` |
| `src/core/types.ts` | +13: `authorizedCanonWriters` field added to `PipelineDeps` |
| `src/core/runtime/local.ts` | +46: `lastCommitTouchingPath` implementation (git log, discriminated union) |
| `src/core/runtime/managed.ts` | +12: `lastCommitTouchingPath` implementation (always unavailable) |
| `src/core/resume/canon-provenance.ts` | +74: `authorizedCanonWriterSteps` helper added |
| `src/core/step/bite-evidence/tamper.ts` | Rewritten: hash-comparison → provenance classification; `parseCommitToken` added |
| `src/core/step/bite-evidence/step.ts` | Rewritten: lineage fold/digest → provenance wiring |
| `src/core/step/bite-evidence/gate.ts` | +2: reason string updated (routing unchanged) |
| `src/core/pipeline/run.ts` | +22: `authorizedCanonWriterSteps` injection in `buildPipelineForJob` and `runPipeline` |
| `src/core/step/bite-evidence/__tests__/gate.test.ts` | Pin cases updated + new provenance tests added |
| `src/core/runtime/__tests__/last-commit-touching-path.test.ts` | New: TC-007..TC-011 |
| `src/core/resume/__tests__/authorized-canon-writer-steps.test.ts` | New: TC-017 |

---

## 検証した項目

### Request Acceptance Criteria

**AC1: test-case-gen → spec-review → spec-fixer（正規編集）→ bite-evidence の経路で tamper 扱いにならない (テストで固定)**

- `checkTamperStatus({ authorizedWriters: {"test-case-gen","spec-fixer","operator-apply"}, lastCanonCommitToken: "spec-fixer", worktreeDirty: false, evidenceAvailable: true })` → `match` (branch 4)
- Gate maps `match` → proceed (not failed)
- Covered by TC-001 (pure function) and TC-001 integration in `gate.test.ts`
- ✅ SATISFIED

**AC2: operator 適用（--apply-canon 相当）による変更が tamper 扱いにならない (テストで固定)**

- `parseCommitToken("operator-apply: <slug>", slug)` → `"operator-apply"`; authorizedWriters includes `"operator-apply"` → `match`
- Covered by TC-002 in `gate.test.ts`
- ✅ SATISFIED

**AC3: 認可経路で説明できない変更（非所有 step・証跡外の書き換え）が引き続き failed (テストで固定)**

- Non-owner step: `lastCanonCommitToken = "implementer"` (not in authorizedWriters) → branch 5 → `mismatch` → gate `failed`
- Uncommitted change: `worktreeDirty = true` → branch 2 → `mismatch` → gate `failed`
- Non-conforming commit subject: `parseCommitToken` returns null → `NON_CONFORMING_SUBJECT_SENTINEL` (non-null, never in authorizedWriters) → branch 5 → `mismatch` → gate `failed`
- Covered by TC-003(provenance) and TC-004(provenance) in `gate.test.ts`
- ✅ SATISFIED

**AC4: 採用した証跡が欠落するシナリオ（lineage 記録失敗等）の挙動をテストで固定**

- Design D2: authority is now `lastCommitTouchingPath` (durable git log), not events.jsonl lineage (best-effort)
- Lineage record absence has zero effect on the provenance check
- TC-025 / TC-005(provenance): lineage absent but `"spec-fixer: <slug>"` commit present → token = `"spec-fixer"` → `match`
- ✅ SATISFIED

**AC5: 既存テストのうち gate.test.ts の「test-case-gen 固定基準」pin ケースのみ更新を許容。それ以外は無変更で green**

- TC-032 was the only existing pin case updated: signature changed from `checkTamperStatus(lineage, currentHash)` to `checkTamperStatus({ authorizedWriters, lastCanonCommitToken, worktreeDirty, evidenceAvailable })`
- `evidence-base-gate.test.ts`, `gate-empty-selection.test.ts`, `gate-no-test-materialize.test.ts` — confirmed zero diff vs main (git diff output was empty)
- These tests pass raw `tamperStatus: "mismatch"` / `"inconclusive"` to `runBiteEvidenceGate`, which is unaffected (D4: routing and union unchanged)
- ✅ SATISFIED

**AC6: typecheck && test が green**

- `bun run typecheck`: clean (no errors, tsc --noEmit)
- `bun run test`: 808 test files passed, 12073 tests passed (1 skipped, 2 todo)
- ✅ SATISFIED

---

### Spec Requirements

#### Requirement 1: 認可された変更経路による変更を tamper としない (SHALL NOT / MUST)

_gate は tamper fail-closed を発火させず base/candidate 評価へ進行しなければならない (MUST)_

**Scenario: spec-fixer の正規編集は tamper 扱いにならない**

- `authorizedCanonWriterSteps` (canon-provenance.ts) scans descriptor steps, collects those whose `writes()` includes `test-cases.md`, adds `"operator-apply"`. Result for standard pipeline: `{"test-case-gen", "spec-fixer", "operator-apply"}`
- `lastCommitTouchingPath("…/test-cases.md", cwd)` → `{ kind: "found", subject: "spec-fixer: <slug>" }`
- `parseCommitToken("spec-fixer: <slug>", slug)` → `"spec-fixer"`
- `checkTamperStatus({ ..., lastCanonCommitToken: "spec-fixer", evidenceAvailable: true, worktreeDirty: false })` → branch 4 → `match`
- Gate: `match` → does not trigger fail-closed → proceeds to base/candidate evaluation
- ✅

**Scenario: operator 適用による変更は tamper 扱いにならない**

- `lastCommitTouchingPath` → `"operator-apply: <slug>"` → token `"operator-apply"` ∈ authorizedWriters → `match`
- ✅

#### Requirement 2: 認可経路で説明できない変更を fail-closed にする (MUST)

**Scenario: 非所有 step に帰属する変更は failed**

- `parseCommitToken("implementer: <slug>", slug)` → `"implementer"`; not in authorizedWriters → branch 5 → `mismatch` → gate `failed`
- ✅

**Scenario: 証跡外の未 commit 書き換えは failed**

- `listWorktreeChanges` includes test-cases.md path → `worktreeDirty = true` → branch 2 → `mismatch` → gate `failed`
- ✅

#### Requirement 3: tamper 判定は durable な commit 帰属を証跡とする (MUST / SHALL NOT)

_best-effort lineage record が欠落していても tamper（偽陽性）と判定してはならない (SHALL NOT)_

- Old `checkTamperStatus(lineage, currentHash)` is completely replaced; no reference to `LineageRecord` or `events.jsonl` remains in tamper.ts or step.ts
- `lastCommitTouchingPath` uses `git log -1` — durable git history, independent of lineage recording
- `appendLineage` best-effort failure → no events.jsonl entry → has zero effect on provenance path
- TC-025: demonstrates `match` even when no lineage record exists (lineage absence is irrelevant)
- ✅

#### Requirement 4: provenance 証跡を導出できないとき proceed する (MUST × 2)

_fail-closed は積極的に認可外と判定できた変更に限定しなければならない (MUST)_

- `lastCommitTouchingPath` returns `unavailable` → `evidenceAvailable = false` → branch 1 → `inconclusive` → gate proceeds
- `listWorktreeChanges` returns `unavailable` → `evidenceAvailable = false` → `inconclusive`
- `authorizedCanonWriters` absent or empty → `evidenceAvailable = false` → `inconclusive`
- `managed runtime`: `lastCommitTouchingPath` always returns `unavailable` → `evidenceAvailable = false` → `inconclusive`
- Outer try/catch in step.ts: any unexpected exception → `tamperStatus = "inconclusive"` (proceed)
- TC-026, TC-027, TC-028 in gate.test.ts; TC-010 in last-commit-touching-path.test.ts
- ✅

---

## Design / Tasks Plan Context (non-normative)

| Decision | Status |
|---|---|
| D1: content-identity → provenance | Implemented as designed |
| D2: durable commit history as authority | Implemented — lineage completely removed from tamper path |
| D3: inconclusive → proceed on unavailable | Implemented — all unavailability branches route to inconclusive |
| D4: TamperStatus union + gate routing stable | Union unchanged; routing unchanged; reason string updated with "tamper" preserved (`/tamper/i` matches) |
| D5: `lastCommitTouchingPath` port method | Added as optional on `RuntimeStrategy`, required on `RealRuntimeStrategy`; local + managed implemented |
| T-01..T-05 checkboxes | All checked |

No divergences between design/tasks plan and implementation.

---

## 検証できなかった項目

None.

---

## Findings 詳細

None.
