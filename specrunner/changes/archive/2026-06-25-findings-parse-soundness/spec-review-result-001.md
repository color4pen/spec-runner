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
| 1 | LOW | Correctness | design.md | D4 residual risk: a file whose first JSON element has `name: string` and `type: string` fields (e.g. a manifest with `[{ type: "file", name: "..." }]` entries) will still be misclassified as a directory. The design explicitly documents this and calls out a future mitigation (checking `sha` field). Acceptable for this bug-fix scope. | No change needed now; document the `sha` field layering as a follow-up if triggered in practice. |
| 2 | LOW | Testing | tasks.md (T-07) | `isGitHubDirectoryListing` is declared file-scoped (not exported), but T-07 references testing it directly. The tasks offer the correct alternative (test via `verifyFindingRefs` with a mock GitHub client), so the path is clear, but the primary option in the task description could mislead implementers into exporting a private helper. | Prefer the end-to-end mock path in T-07 implementation; avoid exporting `isGitHubDirectoryListing` for test access only. |

## Review Notes

**Bug diagnosis accuracy**: All four defects are confirmed in source.

- (a) `parseFindings` line 162 — `f["line"] !== null` check absent; `null` trips the `typeof` guard and rejects the entire array. `parseObservations` line 232 already has the `!== null` guard — the asymmetry is real.
- (b) `stripNullDeep` present in `src/adapter/codex/agent-runner.ts:179` (codex path only); local/managed runtimes go directly through `parseFindings`. Runtime-split defect confirmed.
- (c) `parseReviewScores` has zero production callers (grep confirms sole definition in `review-scores.ts`). `ParsedStepResult.scores` declared in `step-types.ts` but never set or read. Dead path confirmed.
- (d) `Array.isArray(parsed)` at `managed.ts:351` — any JSON array file triggers `isDirectory = true`. Bug confirmed.

**Fix correctness**:

- D1 (`f["line"] !== null` addition): minimal, correct. Makes `parseFindings` guard identical to `parseObservations` line 232.
- D2 (`stripNullDeep` deletion): safe. All other optional fields in `parseFindings` (`fixTarget`, `options`, `origin`) use positive-match guards that silently ignore `null` without returning `{ ok: false }`. Only `line` had the problematic negative-reject pattern.
- D3 (dead path deletion): correct. Four files deleted, `scores` field and re-exports removed from `step-types.ts`. Verdict derivation path (`judge-verdict.ts`) untouched.
- D4 (`isGitHubDirectoryListing` shape check): a meaningful improvement. False-positive surface reduced from "any top-level JSON array" to "JSON array whose first element has `name: string` and `type: string`". Residual risk is acknowledged and low-probability.

**Security review (full scope)**:

- Input validation: `parseFindings` validates all fields via typed guards; the null fix does not weaken any other validation.
- Agent output injection (OWASP A03): agent JSON is parsed through typed structural guards, never eval'd or executed. No injection risk introduced.
- `ref.file` in `verifyFindingRefs` (GitHub API path from agent output): `github-client.ts:154` applies `encodeURIComponent` per path segment before constructing the URL. Path traversal from crafted `file` fields is mitigated by the GitHub API boundary and the encoding.
- Access control (OWASP A01): no changes to auth/authz paths.
- No new network calls, no new credential access, no new external surface.

**Test coverage**: Scenarios in `spec.md` cover the critical paths — null-line single/mixed/symmetry, codex parity without `stripNullDeep`, JSON array file vs. GitHub directory listing, and deletion regression. Test structure in `tasks.md` is concrete and sufficient.
