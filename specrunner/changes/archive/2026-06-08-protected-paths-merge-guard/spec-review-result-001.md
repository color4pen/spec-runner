# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Security | design.md / request.md | **Config self-protection gap**: The guard reads `archive.protectedPaths` from the current main branch's config at merge time (correct). However, if `.specrunner/config.json` itself is not listed in `protectedPaths`, a PR that removes the `protectedPaths` key will auto-merge (the guard uses main's old config → file doesn't match `.github/workflows/**` etc. → passes). After merge, the guard is disabled for all future PRs — re-establishing the closed loop the spec aims to prevent. The design and example config (design.md D5) do not mention this. | Add `.specrunner/config.json` to the recommended default `protectedPaths` example in design.md D5 and/or in the user-facing documentation. Alternatively, define a built-in always-guarded path set for specrunner-internal files, merged with user config (but this conflicts with the "no hardcode" principle, so the documentation route is preferred). |
| 2 | LOW | Testing | spec.md | **`?` glob operator has no test scenario**: spec.md requires `?` MUST match exactly one non-`/` character, but no Given/When/Then scenario exercises this. The `?` branch in the glob implementation could be silently wrong without test coverage. | Add a scenario: Given pattern `src/foo?.ts`, When matched against `src/fooX.ts`, Then `true`; and matched against `src/foo/x.ts`, Then `false`. |
| 3 | LOW | Spec completeness | spec.md | **`listPullRequestFiles` API failure in guard path is unspecified**: T-06 tasks describe handling a thrown error from `listPullRequestFiles` with an escalation, but spec.md has no formal scenario for this. The behavior is implementation-defined rather than spec-driven. | Add a scenario under "Merge guard" or "Fail-closed" requirement: Given `listPullRequestFiles` throws, When `job archive --with-merge` runs, Then the command exits with an escalation and does not merge. |

## Summary

The design is sound. The fail-closed model (truncated → block, empty patterns → bypass guard entirely), the pure-function extraction for `evaluateProtectedPaths` and `globMatch`, and the re-use of `formatEscalation` are all well-reasoned. The insertion point (after MERGED short-circuit, before wait loop) correctly avoids unnecessary CI polling for protected-path PRs. The config-layer placement (`archive.protectedPaths`) is consistent with existing `ArchiveConfig` cohesion.

The only security finding (MEDIUM) is a configuration gap — the code itself is correct — and is mitigated by a one-line addition to the documentation example. No blocking issues.
