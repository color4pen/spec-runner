# Spec Review Result: archive-skip-specs-nested-detect — Iteration 1

## Verdict

- **verdict**: approved

## Summary

The specification for `archive-skip-specs-nested-detect` is well-structured, complete, and ready for implementation. It addresses a real architectural misalignment where the current flat `.md` file detection conflicts with openspec's nested delta spec convention (`specs/<spec-name>/spec.md`), causing systemic drift. The proposal correctly identifies this as a spec change (not a bug) since the code accurately implements the current specification.

The design decisions are sound: nested-first detection with flat fallback provides backward compatibility while prioritizing the canonical convention. The self-referential nature of this change (it creates a nested delta spec that will be detected by its own new logic during archive) provides excellent validation. The scope is appropriately bounded, with clear exclusions for retrospective drift recovery and openspec-workflow plugin changes.

Implementation tasks are detailed and sequenced correctly across four phases (core logic, test infrastructure, test updates, spec/ADR creation, validation). Test coverage is comprehensive with both positive and negative cases for nested/flat layouts. The delta spec properly uses MODIFIED directives to update the base spec's archive Requirement scenarios.

Minor findings below are primarily documentation improvements and edge case clarifications that do not block implementation.

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | design.md:36-50, tasks.md:28-30 | Error handling for `fs.stat` failures in mixed scenarios is implicit: design shows `isDirectory` helper with try-catch returning `false` on error, but doesn't specify behavior when a directory exists but `stat` throws due to permissions. In a mixed layout where one directory is stat-able and another throws EPERM, the current logic would skip the failing entry and continue. This is likely correct behavior but should be explicitly documented. | Add a NOTE to design.md D1 algorithm section: "Permission errors on individual entries are treated as non-directories (continue iteration). Full `readdir` failure returns `false` (no specs detected)." Add assertion to tasks.md T1.2 error handling: "Catch block handles per-entry errors; full readdir failure is caught at T1.3 level." |
| 2 | MEDIUM | consistency | proposal.md:38, design.md:58-59, tasks.md:126-140 | Delta spec file path inconsistency: proposal.md:38 says "openspec/specs/cli-finish-command/spec.md", design.md:59 says "openspec/changes/archive-skip-specs-nested-detect/specs/cli-finish-command/spec.md" (correct), tasks.md:125 says the same (correct). The proposal should clarify it's referring to the delta spec location, not the base spec. | Update proposal.md:38 to: "openspec/changes/archive-skip-specs-nested-detect/specs/cli-finish-command/spec.md — delta spec (via MODIFIED directive)" to match design.md and tasks.md terminology. |
| 3 | MEDIUM | completeness | tasks.md:14, design.md:8-9 | The `path` module import is referenced in design.md code samples (e.g., line 24 `path.join(specsPath, entry)`) but tasks.md T1.3 implementation doesn't explicitly mention ensuring `path` is imported at the top of archive-openspec.ts. The current file already imports path (line 9), but the task should verify this since the helper relies on it. | Add to tasks.md T1.3 implementation step 0: "Verify `import * as path from 'node:path'` exists at file top (already present in current code, no change needed unless missing)." Or add to T1.5 checklist: "Confirm path module import present." |
| 4 | LOW | maintainability | design.md:151-156, tasks.md:123-140 | Delta spec includes implementation code snippet (design.md D4's algorithm copy-pasted into spec.md lines 62-81): While this provides clarity for implementers, it creates maintenance burden if implementation evolves post-merge. The spec shows async/await details that are implementation-specific rather than behavioral requirements. | Consider moving implementation snippet from spec.md to a NOTE or removing it entirely. Keep only behavioral description: "Detection checks nested first (specs/<name>/spec.md for each directory), then flat fallback (specs/*.md). Implementation reference: src/core/finish/archive-openspec.ts hasSpecFiles function." Tasks.md already provides full implementation guidance; spec.md can reference it. |
| 5 | LOW | completeness | tasks.md:189, design.md:238 | Manual E2E validation (T8.5) says "actual E2E execution happens in verification phase, not implementer phase" but doesn't specify who performs it or what the acceptance criteria are. The proposal AC mentions "E2E verification" but design/tasks don't define the verification script or manual steps. | Add to tasks.md T8.5: "Verification step (post-implementation): Run `specrunner finish archive-skip-specs-nested-detect` in a test environment and confirm via stdout/logs that openspec archive was called WITHOUT --skip-specs flag. Check git log for archive commit message." Or defer to separate verification task if outside implementer scope. |
| 6 | LOW | consistency | proposal.md:44, design.md:43, specs/cli-finish-command/spec.md:32-33 | Fallback behavior description varies slightly: proposal says "Flat fallback decision: TBD in design phase", design D1 commits to "fall back to flat layout for backward compatibility", but spec.md NOTE lines 31-33 says "flat layout is fallback" without explaining *why* (backward compatibility). Proposal should be updated since design resolved the TBD. | Update proposal.md:44 to: "Flat fallback decision: Support both nested+flat (nested-first priority) for backward compatibility per D1." Remove "TBD in design phase" since it's resolved. |
| 7 | LOW | completeness | tasks.md:46-65, tests/finish-archive-openspec.test.ts:19-28 | Test helper functions `makeNestedSpecsFs` and `makeFlatSpecsFs` (T2.2, T2.3) need to include `stat` method to match the updated FinishFs interface, but the task descriptions don't explicitly say to add `stat` to the returned FinishFs object. Current makeFs at line 26 will need `stat` added, and the new helpers should inherit or define it. | Add to tasks.md T2.2 and T2.3: "Returned FinishFs must include `stat` method (see T2.1 default implementation) configured to return appropriate isDirectory values for the fixture scenario." |
| 8 | LOW | feasibility | design.md:154, tasks.md:123 | Alternative considered "Use dirent from readdir" (design.md:154-156) mentions changing FinishFs.readdir signature but doesn't note that Node.js fs.promises.readdir with `{ withFileTypes: true }` returns `Dirent[]`, not `string[]`. While correctly rejected, the explanation could clarify this would break the existing FinishFs contract which other modules depend on. | Update design.md:154 alternative explanation: "requires changing FinishFs.readdir signature from `Promise<string[]>` to `Promise<Dirent[]>`, breaking all existing call sites (move-requests-dir.ts, etc.). Non-viable without interface versioning." |

## Architecture Alignment

**Positive**:
- Correctly identifies spec-vs-implementation alignment issue (not a bug, spec itself is wrong)
- Design follows established patterns: FinishFs interface extension mirrors existing DoctorFs pattern
- ADR creation aligns with openspec-workflow governance model
- Self-referential validation (this change archives itself correctly) is excellent design
- Delta spec uses MODIFIED directive appropriately per openspec convention
- Test coverage follows existing TC naming scheme and structure

**Concerns**:
- None blocking. Minor finding #4 (code in spec) is stylistic. All critical architectural decisions are sound.

## Feasibility Assessment

**Implementation Complexity**: Low-Medium
- Core logic change is ~30 lines (helper functions)
- FinishFs interface addition is non-breaking (all implementations must add `stat`)
- Test fixture updates are mechanical but require careful mock setup

**Risk Factors**:
- Low: Flat fallback mitigates all backward compatibility risks
- Low: Self-validation during archive provides immediate signal if logic is incorrect
- Low: Existing tests continue to pass with nested fixtures (TC-024/025 remain same assertions, just different setup)

**Dependencies**:
- Zero external dependencies
- Zero openspec CLI changes
- Implementation is self-contained within finish module

## Recommendation

**Approve** for implementation. Minor findings are documentation improvements that can be addressed during implementation or post-merge. No blocking technical issues. The specification is sufficiently detailed for an implementer to execute without ambiguity.

**Suggested Implementation Order**:
1. Phase 1 (core logic) to establish new detection
2. Phase 2 (test infrastructure) to support new fixtures
3. Phase 3 (test updates) to validate behavior
4. Phase 4 (spec/ADR/validation) to document and dogfood

**Post-Implementation Notes**:
- Monitor first archive execution of this change itself for validation
- Consider removing flat fallback in future version if telemetry shows zero usage (per design.md Q1)
