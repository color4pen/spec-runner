# Code Review Feedback — iteration 001

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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | Testing | `tests/unit/util/spawn-background.test.ts` | TC-014 (should: `unref()` verified) is absent. TC-SB-01 covers env strip / stdio / shell but never asserts `proc.unref()` was called. Production code calls `unref()` correctly and the suite is green; this is a coverage gap for a "should" scenario only. | Add an assertion in TC-SB-01 (or a dedicated sub-test): after calling `spawnBackground`, assert the fake `ChildProcess`'s `unref` spy was called exactly once. | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.8

## Summary

### Scope

4 changed source files (`src/util/spawn.ts` extended, `src/core/runtime/power-assertion.ts` new, `src/core/runtime/local.ts` modified, `src/core/runtime/factory.ts` updated) and 4 new test files. All 471 test files / 6493 tests green. `managed.ts` untouched.

### Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Acquire at job start; release on success/error/signal | ✓ TC-LPA-01–04 cover all three exit paths with injected spawn |
| Fail-open on unsupported platform | ✓ TC-LPA-05 (linux) + TC-PA-02 (linux / win32) |
| Fail-open on ENOENT | ✓ TC-PA-03: synchronous `onError` invocation; no throw + warn message asserted |
| B-12: no new `node:child_process` importer | ✓ `power-assertion.ts` imports only from the seam; B-12 arch tooth passes |
| B-6: env stripped of secrets | ✓ TC-SB-01: `GH_TOKEN` / `ANTHROPIC_API_KEY` absent, `PATH` retained |
| Managed runtime unchanged | ✓ `managed.ts` unmodified; factory.test.ts TC-RT-002 / TC-RT-003 pass |
| `typecheck && test` green | ✓ verification-result.md: all 5 phases passed |

### Implementation notes

**`spawnBackground`**: env composition mirrors `spawnCommand` exactly (single `stripSecrets` strip point per file). Synchronous `error` listener prevents ENOENT from becoming an unhandled event. `proc.unref()` prevents the child from anchoring the CLI event loop. The `killed` flag makes `kill()` idempotent; the try/catch around `proc.kill("SIGTERM")` prevents post-exit throws. `noopSpawnBackground` separates the opt-in production path from the default used by all other test contexts.

**`acquirePowerAssertion`**: Clean platform gate (`platform !== "darwin"` → shared no-op singleton). Darwin path spawns `caffeinate -i -w <parentPid>` — minimal correct flags. `onError` routes to `warn` and returns the handle unchanged so `release()` safely calls `kill()` even after a failed spawn. No `process.env` access (B-6 out of scope). All code paths are synchronous and non-throwing.

**`local.ts` lifecycle binding**: `releasePowerAssertion` is captured before `signalCleanup` is defined, so both the normal teardown path and the signal path (which bypasses `teardown`) hold the same closure. `teardown` releases before `cleanupWorktreeOnFailure`, freeing the assertion promptly on every `finalStatus` value. Double-release is safe because `kill()` is idempotent.

**Factory**: The composition root injects the real `spawnBackground` only for `local` runtime. TC-PA-FACTORY asserts `spawnBackgroundFn !== noopSpawnBackground`, closing the opt-in contract.

**Orphan prevention**: Three independent mechanisms — teardown `kill()`, signal-path `kill()`, and `caffeinate -w <parentPid>` — prevent orphans. The `-w` flag is a race-free backstop for crash/SIGKILL requiring no extra bookkeeping.

The single LOW finding (missing `unref()` assertion, "should" priority) does not affect correctness. No blocking issues.

