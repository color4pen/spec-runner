# Code Review Feedback — iteration 002

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | Robustness — rejected Promise memoized | `src/git/transport-auth.ts:185–199` | Carried from iter-001 finding #3. If a caller-provided `resolveOriginUrl` throws, `resolvePromise` is set to a rejected Promise and never cleared; subsequent `authArgs()` calls return the same rejection. In production all call sites pass no custom resolver, so the default `getRawOriginUrl` (which catches all errors and returns `undefined`) is used — production-harmless. Only affects tests that inject a throwing mock. | Wrap the IIFE body in try/catch, set `cachedArgs = []` and reset `resolvePromise = null` on failure, then return `[]`. | no |
| 2 | LOW | Testing — TC-027 partial coverage | `src/git/__tests__/transport-auth.test.ts` | TC-027 ("error log excludes the token", must-priority) is covered structurally: the "token security (D5)" tests verify auth args use base64 and don't embed the raw token. However, no test simulates a failed spawn and asserts the captured error message excludes the `extraheader` argument value. The design enforces safety (all error messages use `fetchResult.stderr.trim()`, not argv), but the test doesn't exercise the log output path end-to-end. | Add a test that creates a spy spawn returning `exitCode: 1` with a known `stderr` string, triggers the fetch path, catches the thrown Error, and asserts the message contains only the stderr and not the base64 token or extraheader value. | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.90

## Summary

All three findings from iteration 001 are addressed:

- **HIGH (wiring tests)**: TC-015 (LocalRuntime C1 fetch), TC-016 (StepExecutor C5 pushOnly via `gitTransportSpawn`), TC-022 (archive orchestrator C8 main push) are now present as dedicated wiring tests in `transport-auth.test.ts`. The tests mirror the exact construction and call patterns from `local.ts:106+437`, `local.ts:559`, and `orchestrator.ts:94-95+248`. A future refactor that silently disconnects wiring will produce failing tests.
- **MEDIUM (GHES non-standard port)**: `transport-auth.ts:63` now uses `url.host` (not `url.hostname`), and a dedicated test for `github.corp.com:8443` verifies the scope includes the port.
- **LOW (rejected Promise memoized)**: Not fixed (carried to finding #1 above), but production-harmless since all production call sites use the default `getRawOriginUrl` that never throws.

The pre-warm `await this.transportAuth.authArgs().catch(() => {})` is correctly placed at the top of `setupWorkspace()` (line 360), before any branching — covering both fresh-run and all resume paths. The `gitTransportSpawn` sync accessor therefore has a populated cache for all pipeline execution paths.

Verification: `typecheck` and all 4120 tests pass.
