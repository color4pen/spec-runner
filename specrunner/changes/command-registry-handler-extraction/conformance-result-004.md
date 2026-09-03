# Conformance Result — Iteration 4

**Change**: command-registry-handler-extraction  
**Iteration**: 4  
**Base**: `main@483c75f715e2f6429684b5d52d711239559f4cea`  
**Reviewer**: conformance agent  

---

## Summary

The R3a refactoring is substantively complete and meets almost all normative requirements. One medium-severity finding was identified: the raw `grep` count of `process.exit` in `src/` increased by 9 (production-only: +3) relative to the base, because three newly added JSDoc comments in `init.ts`, `login.ts`, and `credentials.ts` include the text "process.exit" as documentation. The actual process.exit **call** count in production code is unchanged (95 in base → 95 actual calls after, with 3 additional comment occurrences inflating the grep count to 98). This technically violates the spec's scenario (`件数が同一である`), which specifies a raw `grep` command as the measurement tool.

All other normative requirements are satisfied: inline handlers are zero, no process.exit in command-registry.ts, no value-import cycles, architecture ratchet covers all 6 required checks, CLI contract snapshot matches the base fixture, bin/specrunner.ts is byte-identical to base, and all 12,648 tests pass.

---

## Normative Checks

### Req 1: CommandSpec ツリーは handler の named function reference のみを保持する — ✅ PASS

- `grep "handler: async\|handler: function" src/cli/command-registry.ts` → 0 matches.
- Runtime check (architecture-ratchet Check 1): all `spec.handler.name` values are not `"handler"`.
- AST check (architecture-ratchet Check 1 second `it`): `findInlineHandlerNodes` finds 0 violations in command-registry.ts source.
- COMMANDS tree handler count: 30 (named references, unchanged from base).

### Req 2: command-registry.ts は process.exit を呼び出さない — ✅ PASS

- `grep "process.exit" src/cli/command-registry.ts` → 0 matches.
- Architecture ratchet Check 2 strips comments and confirms 0.
- Before: 67; After: 0. ✓

### Req 3: handler モジュールから command-registry.ts への value import が存在しない — ✅ PASS

- `grep -rn "import.*command-registry" src/cli/ --include="*.ts" | grep -v "__tests__|command-registry.ts"` → 0 matches.
- Architecture ratchet Check 3 (AST-based, handles multi-line imports): 0 violations.
- Architecture ratchet Check 5 (Tarjan SCC on src/cli/ value-import graph): 0 SCCs of size ≥ 2.
- Architecture ratchet Check 6 (./ dynamic imports): 0 matches in production src/cli/ files.

### Req 4: CommandSpec ツリーが CLI 契約の唯一の正本であり続ける — ✅ PASS

- `export const COMMANDS` appears only in `command-registry.ts`.
- Architecture ratchet Check 4 confirms this.
- No parallel registry, flag definition, or help definition exists in handler modules.

### Req 5: CLI 契約が変更前後で同一である — ✅ PASS

- `src/cli/__tests__/fixtures/cli-contract.base.json` generated from base `483c75f7`.
- `cli-contract-snapshot.test.ts` uses `expect(normalizeCommandsTree(COMMANDS)).toEqual(baseFixture)` — passes.
- Normalization covers: `path`, `summary`, `visibility`, `aliasOf`, `requiresRepo`, `worktreeGuard`, `args`, `flags` (type/min/values/deprecated, key-sorted), `help` (group/summary/detail), `hasHandler`, `children` (key-sorted, recursive).
- `vitest` `toMatchSnapshot` not used; no `.snap` files present.
- All 14 top-level commands present in fixture.

### Req 6: 既存の CLI contract テストが green を維持する — ✅ PASS

- Verification verdict: **passed** (build ✓, typecheck ✓, test ✓, lint ✓, coverage ✓).
- Test results: 12,648 passed, 1 skipped, 2 todo.
- No test expectation was modified to accommodate the new implementation.

### Req 7: USAGE 定数が引き続き command-registry から import 可能である — ✅ PASS

- `ARCHIVE_USAGE` is defined in `archive.ts` and re-exported by `command-registry.ts` via `export { ARCHIVE_USAGE } from "./archive.js"`.
- `LOGIN_USAGE`, `JOB_RESUME_USAGE`, `REOPEN_USAGE`, `USAGE` remain in `command-registry.ts`.
- Existing test imports (`import { ARCHIVE_USAGE } from "../command-registry.js"`) continue to resolve.

### Req 8: repository 全体の process.exit 件数が変化しない — ⚠️ FINDING

**Spec scenario**: `grep -r "process.exit" src/ --include="*.ts" | wc -l` should return the same count before and after.

**Measured counts (raw grep including comments and test strings)**:
- Base (483c75f7): 104
- After (HEAD): 113
- Delta: **+9**

**Production-only (src/ + bin/ excluding `__tests__` and `*.test.ts`)**:
- Base: 95
- After: 98
- Delta: **+3**

**Root cause**: All +3 production occurrences are JSDoc comment lines, not actual `process.exit()` call statements:

| File | Line | Content |
|------|------|---------|
| `src/cli/init.ts` | 174 | `* Wraps runInit and calls process.exit with the returned code.` |
| `src/cli/login.ts` | 154 | `* Wraps runLogin and calls process.exit with the returned code.` |
| `src/cli/credentials.ts` | 96 | `* Wraps runCredentialsSet and calls process.exit with the returned code.` |

The actual `process.exit()` call count in production code is unchanged: 95 calls (67 moved from `command-registry.ts` to handler modules, 28 already in other files). The remaining +6 in the total src/ count (test files: 24 → 30) are string literals used in test assertions (e.g., `` `process.exit(${code})` ``), including in the new `architecture-ratchet.test.ts`.

**Severity**: The literal spec scenario (raw grep) is violated. The behavioral intent (no change to actual process.exit call conditions, counts, or exit codes) is satisfied.

**Fix**: Reword the 3 JSDoc comments in `init.ts`, `login.ts`, `credentials.ts` to remove the text "process.exit" (e.g., replace with "exits with the returned code" or "calls process.exit(code)").

**Note on metrics.md**: `metrics.md` redefines the acceptance criterion as "before T-19 → after T-19 = ±0" rather than comparing base to HEAD. This is an interpretive deviation from the spec scenario which states comparison to the base.

### Req 9: dispatch の error 境界（bin/specrunner.ts）を変更しない — ✅ PASS

- `git diff 483c75f7 -- bin/specrunner.ts` → empty output (zero diff).
- `instanceof FlagParseError` / `instanceof SpecRunnerError` judgments are intact.
- No duck-type guards in production code.

### Req 10: 実測値の before / after 表を正典フォルダに置く — ✅ PASS

- `specrunner/changes/command-registry-handler-extraction/metrics.md` exists.
- All required items from `request.md` are present with before/after values and measurement commands:
  - command-registry.ts 行数 (1696 → 1084)
  - inline handler 数 (29 → 0)
  - named handler reference 数 (30 → 30)
  - registry 内 process.exit 件数 (67 → 0)
  - repository 全体の process.exit 件数 (both raw and production)
  - registry fs/credential/GitHub client value import 数 (4 → 0)
  - 抽出 handler module 数と command family 対応表
  - value-import SCC 数 (0 → 0)
  - CLI contract 比較対象 command 数 (30)
  - src/cli 内 ./ dynamic import 数 (0 → 0)
- **Caveat**: The production process.exit count comparison in metrics.md uses "before T-19 vs after T-19" (98 → 98) rather than "base vs HEAD" (95 → 98). See Req 8.

---

## Architecture Ratchet Coverage

All 6 checks from design.md D4 are implemented in `src/cli/__tests__/architecture-ratchet.test.ts`:

| Check | Mechanism | Status |
|-------|-----------|--------|
| 1 | Runtime `handler.name !== "handler"` + AST `findInlineHandlerNodes` on registry source | ✅ |
| 2 | Strip comments + `process.exit` text search on registry source | ✅ |
| 3 | AST `ImportDeclaration` scan of all src/cli/*.ts (dynamic, not hardcoded) | ✅ |
| 4 | Regex `export const COMMANDS` on all src/cli/*.ts except registry | ✅ |
| 5 | Tarjan SCC on value-import graph of src/cli/*.ts | ✅ |
| 6 | AST `ImportExpression` scan for `./`-prefixed specifiers in src/cli/*.ts | ✅ |

---

## Handler Module Extraction Completeness

All 29 inline handlers from base command-registry.ts are extracted to named functions:

| Module (existing) | Functions added |
|---|---|
| `src/cli/init.ts` | `handleInit` |
| `src/cli/login.ts` | `handleLogin` |
| `src/cli/credentials.ts` | `handleCredentialsSet` |
| `src/cli/ps.ts` | `handleJobLs`, `handleJobStats` |
| `src/cli/job-show.ts` | `handleJobShow` |
| `src/cli/job-wait.ts` | `handleJobWait` |
| `src/cli/cancel.ts` | `handleJobCancel` |
| `src/cli/reopen.ts` | `handleJobReopen` |
| `src/cli/attach.ts` | `handleJobAttach` |
| `src/cli/prune.ts` | `handleJobPrune` |
| `src/cli/managed.ts` | `handleRuntimeSetup`, `handleRuntimeStatus`, `handleRuntimeReset` |
| `src/cli/doctor.ts` | `handleDoctor`, `handleDoctorRepair` |
| `src/cli/config-effective.ts` | `handleConfigEffective` |
| `src/cli/inbox.ts` | `handleInboxRun` |
| `src/cli/archive.ts` | `ARCHIVE_USAGE` (moved + re-exported) |

| Module (new) | Functions |
|---|---|
| `src/cli/request-handlers.ts` | `handleRequestNew`, `handleRequestPrompt`, `handleRequestLs`, `handleRequestTemplate`, `handleRequestValidate` |
| `src/cli/scaffold-handlers.ts` | `handleRulesNew`, `handleReviewersNew` |
| `src/cli/guide-handler.ts` | `handleGuide` |
| `src/cli/usage-handler.ts` | `handleUsage` |
| `src/cli/job-start-handler.ts` | `handleJobStart`, `resolveSlugForDetach` |
| `src/cli/job-resume-handler.ts` | `handleJobResume` |
| `src/cli/job-archive-handler.ts` | `handleJobArchive` |
| `src/cli/command-handler.ts` | `CommandHandler` type (neutral module) |

---

## Plan Divergence Notes (non-normative)

- **scaffold-handlers.ts uses `process.cwd()` instead of `ctx!.invokerCwd`** (tasks.md T-14 specified `ctx!.invokerCwd`). At dispatch time `ctx.invokerCwd === process.cwd()` since `buildCommandContext` captures `process.cwd()` at dispatch time. Functionally equivalent; not a spec violation.
- **metrics.md process.exit comparison**: Uses "before T-19 → after T-19" as the acceptance window rather than "base → HEAD". This is a documentation-level deviation, not a code violation.

---

## Findings

| # | Severity | File | Requirement | Description |
|---|----------|------|-------------|-------------|
| F1 | medium | `src/cli/init.ts` (L174), `src/cli/login.ts` (L154), `src/cli/credentials.ts` (L96) | Req 8 / spec Requirement: repository 全体の process.exit 件数が変化しない | Three JSDoc comments containing the text "process.exit" were added during extraction, causing the raw grep count to increase by +3 (production) / +9 (all src/ including tests). The spec scenario uses `grep -r "process.exit" src/ --include="*.ts" \| wc -l` which counts comment occurrences. The actual call count is unchanged. Fix: reword the 3 JSDoc descriptions to avoid the literal string "process.exit". |
