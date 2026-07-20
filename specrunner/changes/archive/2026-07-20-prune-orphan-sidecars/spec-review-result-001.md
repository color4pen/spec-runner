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
| 1 | LOW | completeness | tasks.md | `W-03` test title says "all paths in rm hint" — will be stale after the update that moves paths from hint to details | Update the test description string alongside the assertion changes in T-06 |
| 2 | LOW | completeness | tasks.md T-05 | `readdirSync` type casting is implied but not called out; `nodeFsSync.readdirSync` returns `string[] \| Buffer[]` without an explicit encoding argument and the adapter must cast to `string[]` (as `buildRealFs` in doctor.ts already does) | Mirror the `as string[]` cast in the node-fs adapter constructed inside `runPrune`, same as the existing `buildRealFs` pattern |

## Review Notes

### Cross-document consistency

request.md → design.md → spec.md → tasks.md are internally consistent. Every requirement (R1–R4) maps to a design decision (D1–D5), a spec scenario, and a concrete task with its acceptance criteria. The AC-T1…T6 traceability is complete.

### Technical correctness

**`SidecarScanFs` ⊆ `DoctorFs`**: Verified. The four proposed `SidecarScanFs` members (`existsSync`, `readdirSync`, `stat`, `readFile`) are a proper subset of the existing `DoctorFs` interface (`src/core/doctor/types.ts:45-58`). `DoctorFs.stat` returns `{ mode: number; isDirectory(): boolean }`, which is structurally assignable to `SidecarScanFs.stat`'s `{ isDirectory(): boolean }`. TypeScript structural typing means `ctx.fs` is assignable to `SidecarScanFs` with no cast required.

**`detailsHuman` field**: Adding optional `detailsHuman?: string[]` to `DoctorResult` is purely additive. `formatHuman` renders `r.detailsHuman ?? r.details`, so all 20+ existing checks that don't set `detailsHuman` are byte-identical in human output. `formatJson` builds `JsonResultEntry` which maps only `r.details` and never reads `detailsHuman`, so JSON output is also unchanged for all existing checks (verified in `formatter.ts:111-126`).

**Exit code composition**: `worktreeResult.exitCode || sidecarResult.exitCode` is correct — since both are `0 | 1`, logical OR equals max. The design and tasks use both terms interchangeably with no contradiction.

**Backward compatibility of `orphanSidecarsCheck` export**: T-02 changes the check to the factory pattern but preserves the `orphanSidecarsCheck = createOrphanSidecarsCheck()` named export. The `checks/index.ts` import (`import { orphanSidecarsCheck } from "./storage/orphan-sidecars.js"`) and the re-export continue to work without modification.

**`ACTIVE_STATUSES` set**: Preserved verbatim (`running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated`). The tasks explicitly state "Do NOT change the set."

**`isOrphanSidecar` edge cases preserved**: JSON parse errors and unknown/malformed states return `false` (non-orphan / skip) in the current implementation. Tasks T-01 explicitly states "non-orphan for `ACTIVE_STATUSES` and for unknown/malformed states", maintaining the existing safe-default behavior.

**Idempotency**: The scan re-runs on each invocation against the real filesystem. After a successful `--force` run, the deleted directories are absent from `readdirSync`, so the next run returns an empty list and reports "No orphan sidecar directories found". Correctly idempotent.

### Security

**Path traversal**: Sidecar paths are constructed as `path.join(repoRoot, ".specrunner/local", entry)` where `entry` comes from `readdirSync`. On POSIX filesystems, literal `..` cannot be a directory entry name created by `mkdir`; `path.join` normalizes any traversal sequences. Deletion via `fs.rm(sidecarPath, { recursive: true, force: true })` is bounded to the derived path. No escalation of privilege: an attacker who can write to `.specrunner/local/` already has full repo write access.

**`rm -rf` hint removal**: Eliminating the 8 KB raw shell command from `hint` is a net security improvement — it removes a copy-pasteable destructive command from the output and replaces it with a product command that has explicit guards (dry-run default, explicit `--force`).

**No authentication surface**: This change adds no network calls, credential reads, or authentication paths.

**OWASP Top 10**: Not applicable (local CLI, no web surface, no SQL, no injection vectors beyond the existing codebase baseline).

### 破壊確認 (T2 destructive test)

The approach — a separate test variant that neutralizes the active-status guard via `scan` override and asserts the active sidecar IS deleted — correctly demonstrates that the guard is load-bearing. This is consistent with request.md AC-T2 semantics ("active 判定を無効化すると本テストが落ちること") reinterpreted as a positive proof-of-guard test.

### Scope boundary

Non-goals are correctly enforced: `pruneOrphanWorktrees`, `scanOrphanWorktrees`, the work-protection guard, and all other doctor checks are explicitly out of scope and untouched by the task definitions.
