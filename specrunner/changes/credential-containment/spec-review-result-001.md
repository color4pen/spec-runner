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
| 1 | LOW | Spec ambiguity | `tasks.md` T-11 | The allowlist entry for `src/adapter/claude-code/agent-runner.ts` uses `pattern: "resolveClaudeCodeOAuthTokenFn"` as the primary match. The actual grep-flagged line is line 271 (`process.env as Record<string, string \| undefined>,`), which does NOT contain the function name. Using the primary pattern verbatim causes B-6 test failure. The spec's own Note identifies this and provides the correct alternative (`"as Record<string, string \| undefined>"`), but leaves the resolution to the implementer rather than committing to the correct value. | Implementer must apply the Note's option (b): use `"as Record<string, string \| undefined>"` as the allowlist pattern, not `resolveClaudeCodeOAuthTokenFn`. The spec should be read as mandating the fallback pattern since the primary is verified-incorrect by inspecting the actual source. |

## Verification Notes

All background code claims verified against actual source in the worktree:

| Claim | File | Verified |
|-------|------|----------|
| `new sdk!.Codex()` passes no `env` | `src/adapter/codex/agent-runner.ts:267` | ✓ |
| `runSubprocess` passes no `env` | `src/util/git-exec.ts:15-18` | ✓ |
| `git show` spawn passes no `env` | `src/core/verification/runner.ts:183-184` | ✓ |
| `SECRET_DENYLIST` has 5 fixed keys only | `src/util/env-filter.ts:12-18` | ✓ |
| `MASK_PATTERNS` lacks `i` flag | `src/logger/stdout.ts:141-148` | ✓ |
| `indexOf("_")` logic leaks token body | `src/logger/stdout.ts:154-164` | ✓ |
| B-6 grep scans `src/core/` only | `tests/unit/architecture/core-invariants.test.ts:338-339` | ✓ |
| claude adapter already passes `stripSecrets` env | `src/adapter/claude-code/agent-runner.ts:268` | ✓ |
| `spawnScript` and `spawnCommand` already use `stripSecrets` | `src/core/verification/runner.ts:78`, `src/util/spawn.ts:46-47` | ✓ |
| `CodexSdk.Codex` has no-arg constructor (`new ()`) | `src/adapter/codex/sdk-loader.ts:7` | ✓ |
| `filterViolations` applies `isCommentLine` — JSDoc mentions of `process.env` in `env-filter.ts` are auto-filtered | `tests/unit/architecture/core-invariants.test.ts:138-145` | ✓ |

## Security Review

**Credential containment (primary concern)**

The denylist extension (`*_TOKEN / *_API_KEY / *_SECRET`, case-insensitive) covers GitHub Enterprise host tokens by suffix convention. `ANTHROPIC_BASE_URL` is not caught by the new patterns but remains in the explicit list — verified correct. The `OPENAI_API_KEY` explicit pass via `apiKey:` option restores codex auth after the pattern extension strips it from filtered env — design is self-consistent.

**Cross-provider leakage (A02)**

Codex SDK fix (D2) with `CodexOptions.env` correctly prevents Anthropic/GitHub credentials from reaching the OpenAI subprocess. The SDK option (`env` specified → no `process.env` inheritance) is the right mechanism over `process.env` mutation.

**Injection (A03)**

No new user-controlled input is introduced. All subprocess calls use `shell: false` or typed argument arrays. The `maskSensitive` refactor changes only the replacement logic, not input surface.

**Pattern denylist over-strip risk**

Any env var ending in `_TOKEN / _API_KEY / _SECRET` is stripped, including potential application-specific vars. Risk is documented and acceptable per design (these suffixes signal secrets by convention; denylist approach is explicitly chosen over allowlist).

**No new OWASP findings beyond the scope of this request.**
