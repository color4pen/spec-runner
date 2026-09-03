# Conformance Result — Iteration 6

**Change**: command-registry-handler-extraction  
**Iteration**: 6  
**Date**: 2026-09-03  
**Reviewer**: conformance agent  
**Resume context**: Operator ruling resolved F-1 (process.exit count) from iteration 5 escalation. All other normative items already PASS.

---

## Operator Ruling Applied

Iteration 5 escalated on finding F-1:

> The spec.md scenario 'process.exit 件数が変化しない' measures with a raw grep that counts comment lines and test files. The normative MUST (no aggregation/reduction/return-contract change of process.exit; all 67 registry calls moved 1:1 to handlers) is satisfied as conformance iter 5 verified. The +3 JSDoc comment lines and +24 references in new test files required by spec Req-5/6 are out of scope of the MUST and are ACCEPTED by the operator. Treat F-1 as resolved by operator ruling; do not require code changes or spec-fixer for it.

F-1 is resolved. Proceeding with reverification of all normative items.

---

## Scope Verified (git diff --stat)

89 files changed, 10594 insertions(+), 908 deletions(-)

Key files touched:
- `src/cli/command-registry.ts` (−736 lines, business logic removed)
- `src/cli/job-start-handler.ts` (new, 186 lines)
- `src/cli/job-resume-handler.ts` (new, 141 lines)
- `src/cli/job-archive-handler.ts` (new, 75 lines)
- `src/cli/scaffold-handlers.ts` (new, 21 lines)
- `src/cli/usage-handler.ts` (new, 20 lines)
- `src/cli/command-handler.ts` (new, 11 lines)
- `src/cli/__tests__/architecture-ratchet.test.ts` (new, 521 lines)
- `src/cli/__tests__/cli-contract-snapshot.test.ts` (new)
- `src/cli/__tests__/fixtures/cli-contract.base.json` (new, 913 lines)
- `bin/specrunner.ts` (no diff from base 483c75f7)
- `specrunner/changes/command-registry-handler-extraction/metrics.md` (new)

---

## Normative Items Verification

### Req-1: CommandSpec ツリーは handler の named function reference のみを保持する

**Check**: `grep -c "handler: async" src/cli/command-registry.ts` → **0**

PASS. The COMMANDS tree contains zero inline handlers. All 29 have been extracted to named functions in separate handler modules.

**Ratchet** (`architecture-ratchet.test.ts` Check 1): Runtime `handler.name === "handler"` check implemented for all CommandSpec nodes. Confirmed present in test file.

### Req-2: command-registry.ts は process.exit を呼び出さない

**Check**: `grep -c "process.exit" src/cli/command-registry.ts` → **0**

PASS. The 67 process.exit calls previously in command-registry.ts have been moved to handler modules with order, conditions, and exit codes preserved.

**Ratchet** (`architecture-ratchet.test.ts` Check 2): Source-text process.exit check with comment stripping implemented.

### Req-3: handler モジュールから command-registry.ts への value import が存在しない

**Check**: `grep -r "from.*command-registry" src/cli/*.ts | grep -v "import type" | grep -v "command-registry.ts"` → **(empty)**

PASS. No handler modules value-import command-registry.ts.

**Circular SCC check**: `src/cli/` internal dynamic imports checked: the only dynamic imports found reference `../config/schema.js`, `../state/schema.js`, `../util/repo-root.js` — all outside `src/cli/` and thus not subject to the `./` dynamic import ratchet. No `./`-relative dynamic imports within `src/cli/` modules.

**Ratchet** (`architecture-ratchet.test.ts` Check 3 + Check 5 + Check 6): Import graph cycle check, SCC check, and dynamic import check all implemented.

### Req-4: CommandSpec ツリーが CLI 契約の唯一の正本であり続ける

**Check**: `grep -c "export const COMMANDS" src/cli/*.ts` → only `command-registry.ts:1`

PASS. No parallel CLI contract registries introduced. Handler modules contain no duplicate command definitions, flag definitions, or help definitions.

**Ratchet** (`architecture-ratchet.test.ts` Check 4): Parallel COMMANDS export check implemented.

### Req-5: CLI 契約（command path・flags・aliases・guards）が変更前後で同一である

**Check**: `cli-contract-snapshot.test.ts` uses `expect(candidate).toEqual(baseFixture)` against `src/cli/__tests__/fixtures/cli-contract.base.json` (generated from base 483c75f7). No `toMatchSnapshot` usage.

PASS. The fixture is generated from the base revision and compared against current COMMANDS. The normalizer covers path, summary, visibility, aliasOf, requiresRepo, worktreeGuard, args, flags (type/min/values/deprecated), help (group/summary/detail), hasHandler, and children.

### Req-6: 既存の CLI contract テストが green を維持する

Verified by verification-result.md (passing). `bun run test` shows all tests green including `command-registry-resume.test.ts`, `from-issue.test.ts`, `resume-from-issue.test.ts`, `archive-from-issue.test.ts`, and other CLI tests.

PASS.

### Req-7: USAGE 定数が引き続き command-registry から import 可能である

**Check**: `command-registry.ts` contains `export { ARCHIVE_USAGE } from "./archive.js"`. LOGIN_USAGE, JOB_RESUME_USAGE, REOPEN_USAGE, USAGE remain in command-registry.ts.

PASS. Re-export pattern confirmed in registry file.

### Req-8: repository 全体の process.exit 件数が変化しない (F-1 — Resolved by Operator Ruling)

Operator ruling: The normative MUST (all 67 registry calls moved 1:1 to handlers, no aggregation/reduction/return-contract change) is satisfied. The +3 JSDoc comment lines and +24 test file references are out of scope.

ACCEPTED by operator ruling. This finding is CLOSED.

### Req-9: dispatch の error 境界（bin/specrunner.ts）を変更しない

**Check**: `git diff 483c75f715e2f6429684b5d52d711239559f4cea -- bin/specrunner.ts` → **(empty)**

PASS. bin/specrunner.ts is byte-for-byte identical to the base commit.

### Req-10: 実測値の before / after 表を正典フォルダに置く

**Check**: `specrunner/changes/command-registry-handler-extraction/metrics.md` exists (6260 bytes).

PASS. Metrics file is present with before/after table per request.md requirements.

---

## Request.md Acceptance Criteria — Final Status

| Criterion | Status |
|-----------|--------|
| command-registry.ts inline handler 0件 | PASS (verified: 0) |
| registry は宣言ファイルになる | PASS |
| registry内のcommand実処理0件 | PASS (fs/credential/GitHub client imports removed) |
| registry内のprocess.exit 0件 | PASS (verified: 0) |
| exit call条件・順序・exit code変更なし | PASS |
| handler→registryのvalue-import cycle 0件 | PASS |
| CommandSpecが唯一の正本 | PASS |
| CLI構造比較が変更前後で一致 | PASS (fixture-based toEqual) |
| stdout/stderr/exit codeテストgreen | PASS |
| architecture ratchetがある | PASS (6 checks implemented) |
| SpecRunner既存verificationがgreen | PASS |
| observable behavior差分なし | PASS |

---

## Summary

All normative items from request.md and spec.md are satisfied. The F-1 finding from iteration 5 has been resolved by operator ruling. No new findings identified. Implementation is complete and conformant.
