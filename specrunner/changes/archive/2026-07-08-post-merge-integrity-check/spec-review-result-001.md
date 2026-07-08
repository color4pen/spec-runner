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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Correctness | design.md / tasks.md (T-02) | `failedStep` is specified as the literal string `"post-merge integrity check (main)"`. For repos whose base branch is not `main` (e.g. `develop`), the escalation label will be misleading. `recommendedAction` already uses `<baseBranch>` dynamically, creating an inconsistency within the same escalation block. | Use `\`post-merge integrity check (${baseBranch})\`` so the label matches the actual base branch in every repo. |
| 2 | LOW | Testability | tasks.md (T-01) | T-01 lists acceptance criteria for config schema validation (non-array rejected, empty-string element rejected, absent key OK) but no test task explicitly covers these cases. The validation is exercised indirectly only if existing schema test infrastructure covers new fields automatically. | Add a test for `archive.postMergeVerify` validation to the config-schema test suite (e.g. alongside the existing `protectedPaths` / `verification.commands` schema tests) or call it out in T-05/T-07 explicitly. |

## Assessment

**Design correctness**: All 7 decisions (D1–D7) are internally consistent and correctly motivated. The critical insertion point (Step 5→6, only on "this execution's merge") is precisely specified and avoids both the resume path (Step 2) and the merged-during-wait path (Step 4). The rationale for excluding those paths—escalation-loop risk on resume and misattribution risk on Step 4—is accurate given the existing code at lines `:189` and `:317`.

**Codebase alignment**: Cross-referenced against the implementation:
- `ShellCommand` type at `schema.ts:115` and `shellCommandSchema` at `:693` exist as stated; the addition of `postMergeVerify?: ShellCommand[]` to `ArchiveConfig` is a minimal extension.
- `mergePullRequest` at `merge-then-archive.ts:478`, the Step 6 cleanup call at `:532`, and the two non-attributable cleanup calls at `:189` / `:317` match the design's insertion and exclusion points exactly.
- `formatEscalation` signature (`failedStep / detectedState / recommendedAction / resumeCommand`) matches `escalation.ts`.
- `createTransportAuth({ token, cwd }).wrapSpawn(spawn)` is available and used correctly in the design.

**Security**: The `postMergeVerify` attack surface is equivalent to the existing `verification.commands` and `workspace.setup` config keys—arbitrary shell commands supplied by the repo maintainer via a committed config file. No new trust boundary is crossed. GitHub token injection uses HTTP extraheader (not embedded in command strings), so it does not leak into `sh -c` execution. The design's note that combined stdout+stderr is captured for escalation output is accurate; secrets are stripped from the child-process env by `SpawnFn`, which is a sufficient mitigation for the stated risk.

**Backward compatibility**: `postMergeVerify` absent or `[]` → the module is never called (no fetch, no worktree, no commands). The existing test suite stays green by construction, and T-06 pins this via the "unset/empty → unchanged" scenario.

**Test coverage**: T-05 and T-06 cover the five key scenarios (pass, fail with escalation content, fail-fast, fetch-failure warn-and-continue, cleanup best-effort). The escalation-content assertions (PR number, merge SHA, failing output, remediation text, "MERGED" stated honestly) are explicitly called out.

**Infrastructure failure handling (D6)**: Returning `{ ok: true }` on fetch/worktree-add failure with a `stderrWrite` warning is the correct approach. The caller sees "no integrity failure detected" (which is true—the check did not execute), while the warning provides the honest "not verified" signal to the operator. This satisfies requirement 4 (no blockage) and avoids false-pass semantics.
