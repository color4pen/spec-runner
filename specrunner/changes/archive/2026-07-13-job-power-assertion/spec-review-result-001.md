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
| 1 | LOW | Test coverage | tasks.md T-04 | `unref()` call is not explicitly tested. The spec requirement ("it is `unref()`-ed so it does not keep the CLI event loop alive") is stated in spec.md but T-04's three test cases cover env-strip, kill-idempotency, and onError plumbing — not `unref()`. In practice the KeepAlive binding already manages the loop, so a missed `unref()` would only cause a delay, not a hang. | Add a fourth T-04 assertion: after calling `spawnBackground`, assert the fake `ChildProcess`'s `unref` method was called exactly once. |

## Summary

Full review covering requirements, design decisions, spec scenarios, task breakdown, architecture invariants, and security.

**Requirements coverage**: All seven request.md requirements map cleanly to spec scenarios and design decisions. The acquire/release boundary (`registerCleanup` ↔ `teardown`/`signalCleanup`) is correctly identified and carried through design → spec → tasks.

**Architecture invariant compliance**:
- **B-12**: `spawnBackground` is added to the already-allowlisted `src/util/spawn.ts`. No new `node:child_process` importer; allowlist entry count is unchanged. ✓
- **B-6**: `spawnBackground` builds env via `stripSecrets(process.env)` exactly like `spawnCommand`. `power-assertion.ts` reads only `process.platform`, never `process.env`. ✓
- **B-4**: `spawn.ts` is a leaf module; the addition reuses the existing same-file `spawn` import and `stripSecrets` from the sibling `env-filter.js`. No upward `../` traversal added. ✓
- **DSM closure**: `power-assertion.ts` is classified as composition-root (`src/core/runtime/`). Its imports — `util/spawn.ts` (leaf) and `logger/stdout.ts` (shared-kernel) — are both permitted by the DSM whitelist for composition-root. ✓
- **B-7**: `logWarn` goes through `maskSensitive` inside `logger/stdout.ts`. No raw `process.stderr.write` in `core/` or `cli/`. ✓

**Signal path correctness**: The design correctly identifies that `signalCleanup` calls `process.exit(130)` directly and never flows through `teardown`. D4 threads `releasePowerAssertion` into the signal closure (defined before `signalCleanup`) so the release fires on all three exit paths (success teardown, error teardown, signal). ✓

**Fail-open**: Platform gate (`platform !== "darwin"` → no-op) and ENOENT path (async `error` event → `warn` + safe `kill()`) are both specified and tested in T-05. The synchronous `acquirePowerAssertion` never throws. ✓

**Orphan prevention**: Three independent mechanisms — teardown `kill()`, signal-path `kill()`, and `caffeinate -w <parentPid>` — prevent caffeinate orphans. The `-w` flag provides crash/SIGKILL backstop. ✓

**Security**: No new attack surface. `caffeinate` command is hardcoded; `parentPid` is `process.pid` (integer, not user input); env is secret-stripped. OWASP injection and credential-leakage concerns are not applicable.

**Managed runtime**: D5 and T-07 explicitly confirm `managed.ts` is untouched. ✓

The single LOW finding (missing `unref()` assertion in T-04) does not block implementation.
