# Spec Review Result: abolish-success-status — Iteration 1

## Verdict

- **verdict**: approved
- **iteration**: 1
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Summary

The specification demonstrates strong coherence across proposal, design, and implementation tasks. The change addresses a real architectural problem (ambiguous `success` status causing race conditions and CLI misreporting) exposed through dogfooding. All three specification documents are well-aligned: proposal clearly articulates the problem and impact scope, design provides comprehensive decision rationale with explicit trade-off analysis, and tasks break down implementation into granular, verifiable steps with precise file/line references.

The specification correctly identifies all touch points in the codebase (verified against current implementation at executor.ts:196, :412, :780; cli/run.ts:184; finish/job-state-update.ts:17-25; pipeline.ts:303). Design decisions are sound: complete abolition over aliasing leverages TypeScript's exhaustiveness checking, the separation of `finish` (happy path) vs. `cancel` (failure path) preserves forensic evidence, and 1-time migration balances backward compatibility with technical debt management.

Minor documentation hygiene issues are present but do not constitute blockers. The specification is ready for implementation.

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | completeness | openspec/changes/abolish-success-status/tasks.md:77-83 | Task T5.1 provides incomplete guidance for `handleExhausted` status write location. The note "Review the full function to locate the precise insertion point" leaves ambiguity for the implementer. Current implementation at pipeline.ts:329-337 constructs the error object and returns state without status field modification. | Add explicit instruction: "After line 336 (`hint: errorShape.hint(nnn),`), add `status: "failed" as const` to the updated state object alongside the error field. The complete object should be `{ ...state, steps: updatedSteps, status: "failed", error: {...}, updatedAt: ... }`." |
| 2 | LOW | consistency | openspec/changes/abolish-success-status/tasks.md:29 | Pipeline-end history message update specifies "Propose pipeline completed; awaiting merge" but does not address the step name "success" (line 412: `step: "success"`). The spec does not clarify whether the step field should remain as `"success"` literal or be updated to `"awaiting-merge"` for consistency. | Clarify in task T2.2 whether `step: "success"` field should remain unchanged (as a completion marker distinct from status) or be updated to `step: "awaiting-merge"` for alignment. Recommended: keep `step: "success"` unchanged (it marks pipeline completion event) and document this decision in design.md to prevent implementer confusion. |
| 3 | LOW | completeness | openspec/changes/abolish-success-status/tasks.md:87-125 | Test update section (T6.1-T6.4) references TC-029 and TC-031 but does not specify expected behavior for the new backward compatibility test case when a legacy state file is subsequently persisted. The test verifies read-time migration but not write-time persistence. | Add verification step to T6.2: "After loading, trigger a state update (e.g., `await store.update(loaded, { step: 'test' })`) and re-read the state file to assert that the persisted JSON contains `status: 'awaiting-merge'` (not `success`), confirming the migration is sticky." |
| 4 | LOW | maintainability | openspec/changes/abolish-success-status/design.md:79 | Migration removal TODO target is "2026-06 release" but the specification does not define what constitutes a "release" in the spec-runner project context (semver tag? branch merge? deployment milestone?). This may cause confusion when determining migration layer removal timing. | Add a note in design.md Decision 4 or proposal.md "Out of Scope" section: "Release milestone is defined as a semver tag (e.g., v1.2.0) in the spec-runner repository. Migration layer removal should occur in the first release after 2026-06-01." |
| 5 | LOW | consistency | openspec/changes/abolish-success-status/proposal.md:69, design.md:127, tasks.md:129 | ADR filename is specified as `ADR-20260503-abolish-success-status.md` in all three documents, which is correct per the `openspec-workflow/adr/` naming convention (`ADR-YYYYMMDD-<slug>.md`). However, the ADR content template in tasks.md uses "Accepted (2026-05-03)" in the Status section, which could be misread as the acceptance date rather than the authoring date if the ADR undergoes revision before acceptance. | Update tasks.md T7.1 ADR template Status section to clarify: "Accepted" (without date) or "Proposed (2026-05-03)" if the ADR requires future acceptance gate. Align with existing ADR conventions in `openspec-workflow/adr/` directory (check existing ADRs for status format precedent). |

## Convergence

- **trend**: initial review (no previous iteration)
- **recommendation**: approve and proceed to implementation (Step 4 implementer)

## Notes

### Strengths

1. **Problem clarity**: Proposal effectively uses concrete dogfooding evidence (PR #67, PR #68) to demonstrate the bug rather than hypothetical scenarios.
2. **Design rigor**: All five design decisions include rejected alternatives with explicit trade-off analysis, enabling future reviewers to understand the decision context.
3. **Implementation precision**: Tasks.md provides exact line numbers for all modifications (executor.ts:196, :412, :733; run.ts:184; job-state-update.ts:17-25; pipeline.ts:303), reducing implementer ambiguity.
4. **Scope discipline**: Clear delineation of out-of-scope work (cancel command, UX visualization, migration layer removal) prevents scope creep.
5. **Testability**: Acceptance criteria are concrete and measurable (all checkboxes have corresponding task verification steps).

### Verified Assumptions

- ✅ Current `JobStatus` type at schema.ts:5 matches proposal's baseline (`"running" | "success" | "failed" | "terminated" | "archived"`)
- ✅ Three `status: "success"` writes exist at executor.ts:196, :412, :780 as specified
- ✅ CLI completion check at run.ts:184 uses `finalState.status === "success"` pattern
- ✅ `assertJobFinishable` at job-state-update.ts:17-25 only rejects `status === "running"`
- ✅ `handleExhausted` at pipeline.ts:303-342 does not modify status field (confirmed missing implementation)
- ✅ Spec reference to `awaiting-merge` exists in `openspec/specs/cli-finish-command/spec.md` lines 33, 138, 229

### Risk Assessment

- **Low risk**: TypeScript compiler will catch all unhandled `JobStatus` pattern matches, forcing comprehensive migration audit.
- **Low risk**: Backward compatibility layer is transparent and will self-migrate existing state files on first read.
- **Medium risk**: Task T5.1's ambiguous guidance could result in incorrect status write placement, but test coverage (T8.3) will catch runtime failures.
- **Low risk**: The change does not modify external APIs or CLI command syntax; impact is isolated to internal state management.

### Implementation Order Recommendation

Follow the task order as specified (T1→T2→T3→T4→T5→T6→T7→T8), but recommend running `bun run typecheck` after T1.1 to generate a comprehensive list of all code sites requiring migration, which can inform tasks T2-T5.

## Conclusion

The specification is **approved** for implementation. All five LOW-severity findings are documentation hygiene improvements that do not block implementation. The implementer can proceed with the task sequence while addressing findings 1-3 inline during implementation (they clarify intent rather than require spec revision). Findings 4-5 are post-implementation documentation improvements.

CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 5. No blocking issues detected.
