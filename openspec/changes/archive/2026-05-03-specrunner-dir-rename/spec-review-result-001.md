# Spec Review Result — specrunner-dir-rename

**Change**: specrunner-dir-rename  
**Review iteration**: 001  
**Reviewer**: spec-reviewer agent  
**Date**: 2026-05-03

---

- **verdict**: approved

---

## Summary

The specification for `specrunner-dir-rename` is complete, consistent, and ready for implementation. This change addresses a legitimate pre-existing issue (namespace leak + non-existent directory references) with a clear design rationale and comprehensive implementation plan.

The specification demonstrates:
- **Completeness**: All affected files (src, tests, specs) are enumerated with line-level precision
- **Consistency**: Delta specs align with design decisions; acceptance criteria are mechanically verifiable
- **Feasibility**: The change is a straightforward mechanical rename with well-defined scope boundaries
- **Risk awareness**: User-responsibility filesystem migration is explicitly scoped out with documented risks

All three delta specs are present and correctly specify the modifications to existing specs. The tasks.md provides detailed line-by-line implementation guidance. The acceptance criteria include grep-based verification commands that can be executed to confirm completion.

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|

_(No findings)_

## Review Notes

### Architecture Evaluation

1. **Namespace separation is sound**: The decision to move `openspec-workflow/requests/` to `specrunner/requests/` correctly separates user-facing workflow state from internal dev tooling. The `openspec-workflow/` directory retaining ADRs, instincts, and learned-patterns is appropriate.

2. **Filesystem model simplification is justified**: Reducing from 4 directories (active, awaiting-merge, merged, canceled) to 2 (active, merged) is architecturally correct. The design.md clearly explains that `awaiting-merge` is a lifecycle state (JobState.status) rather than a filesystem location, which avoids unnecessary git mv operations and state synchronization risks.

3. **Breaking change is acceptable**: For a single-user dogfooding repository, the decision to make this a breaking change without backward compatibility is pragmatic and reduces implementation complexity.

### Specification Completeness

1. **Scope definition**: The change clearly distinguishes between:
   - In-scope: Source code, tests, and specs updates
   - Out-of-scope: Filesystem migration (user responsibility), JobStatus enum changes (separate change), backward compatibility

2. **File enumeration**: All 4 source files, 6 test files, and 3 delta specs are listed with specific line numbers. This level of precision is appropriate for a mechanical refactoring.

3. **Acceptance criteria**: The 11 acceptance criteria include mechanically verifiable grep commands, build/test pass requirements, and specific code structure validations.

### Delta Spec Quality

All three delta specs (`cli-commands/spec.md`, `cli-finish-command/spec.md`, `job-state-store/spec.md`) follow the required format:
- Clear "MODIFIED" sections identifying what changes
- Rationale sections explaining why
- Implementation requirements with code examples
- Test requirements updated to match

The delta specs correctly remove `awaiting-merge` alternation from patterns and update directory references from `openspec-workflow/requests/` to `specrunner/requests/`.

### Risk Assessment

The design.md Risks section identifies 5 key risks with appropriate mitigation strategies:
1. User filesystem migration incomplete → User must complete before merge
2. Self-referential dogfooding → Manual gh pr merge + openspec archive
3. Request.md uncommitted → Propose agent has content via deps
4. Git rename detection fails → User performs git mv
5. Doctor --json consumers see change → Check id remains stable

All risks are acknowledged and either accepted (user coordination) or mitigated (structural stability).

### Consistency Checks

1. **Cross-document alignment**: The proposal.md, design.md, and tasks.md are consistent in:
   - File counts (4 src, 6 tests, 3 specs)
   - Directory structure (active + merged only)
   - Out-of-scope items (filesystem migration, JobStatus enum, cancel command)

2. **Naming consistency**: The specification consistently uses:
   - `specrunner/requests/` (new path)
   - `openspec-workflow/requests/` (old path, to be removed)
   - `active/` and `merged/` (retained directories)
   - `awaiting-merge` and `canceled` (removed filesystem references)

3. **Test coverage**: The tasks.md Phase 2 includes updates to all test files that reference the old paths, with specific test case rewrites (TC-131, TC-132, TC-133) to validate `active/` auto-detection.

### Verifiability

The acceptance criteria enable mechanical verification:
- `grep -rn "openspec-workflow/requests" src/` → 0 matches
- `grep -rn "awaiting-merge" src/` → 0 matches  
- `grep -rn "canceled" src/` → 0 matches
- `bun run build` → PASS
- `bun test` → PASS
- Delta specs exist at specified paths

This allows the implementer to self-verify and the code-reviewer to confirm completion.

## Recommendations (Optional)

While the specification is approved as-is, the following are optional considerations for future iterations:

1. **Post-merge verification**: Consider adding a verification step in the acceptance criteria to run `specrunner doctor` after the filesystem migration to confirm the new directory structure is recognized.

2. **Migration guide**: While out-of-scope for this change, a follow-up documentation update could provide a step-by-step migration guide for users (though this is a single-user dogfooding repo, so lower priority).

---

**Verdict rationale**: The specification meets all requirements for completeness, consistency, and feasibility. No HIGH or CRITICAL findings were identified. The change is well-scoped, thoroughly documented, and ready for implementation.
