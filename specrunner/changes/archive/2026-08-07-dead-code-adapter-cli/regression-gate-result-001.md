# Regression Gate Result — dead-code-adapter-cli / Iteration 1

## Verdict

4 of 8 findings confirmed fixed. 4 regressions detected.

---

## Per-Finding Status

### [MEDIUM] T-06: SpawnFn import 操作がタスク本文と acceptance criteria で矛盾
**Status: FIXED**

`tasks.md` T-06 now instructs full removal of SpawnFn (not repoint to `util/git-exec.js`). The acceptance criteria `grep -r "_spawnFn\|spawnFn\|defaultSpawnFn\|git-exec" src/adapter/claude-code/ tests/unit/adapter/claude-code/` returns 0 matches — confirmed by no SpawnFn occurrences in `tests/unit/adapter/claude-code/agent-runner.test.ts`.

---

### [MEDIUM] T-08: fixture 定数名が design.md (REPORT_TOOL_FIXTURE) と tasks.md (REPORT_TOOL) で食い違い
**Status: FIXED**

`tasks.md` T-08 now uses `REPORT_TOOL_FIXTURE` in the fixture constant declaration (line 114), matching `design.md:38`. The acceptance criteria `grep -r '\bREPORT_TOOL\b' tests/` correctly uses word boundary — `REPORT_TOOL_FIXTURE` is not matched.

---

### [LOW] T-15: LEVEL_ORDER acceptance criteria が自己矛盾
**Status: FIXED**

`tasks.md` T-15 acceptance criteria now reads:
```
grep -r "\bexport.*LEVEL_ORDER\b\|\bLEVEL_ORDER\b" src/ bin/ tests/ --include='*.ts' | grep -v 'src/logger/stdout.ts'
```
This correctly excludes `stdout.ts` where `LEVEL_ORDER` remains as an unexported const, resolving the contradiction.

---

### [MEDIUM] REPORT_TOOL ローカル変数が acceptance criteria の grep 0 件条件を違反
**Status: FIXED**

`tests/unit/contract/agent-runner-contracts.test.ts:73` now declares `const REPORT_TOOL_SPEC: ReportToolSpec = { ... }`. `grep -r '\bREPORT_TOOL\b'` returns 0 matches in that file.

---

### [LOW] turnCount がコメントに残存（コメント内の言及含む条件に違反）
**Status: REGRESSION**

`src/adapter/claude-code/query-one-shot.ts:81` still contains:
```
* Replaces the former turnCount placeholder field.
```
The `turnCount` field itself was removed, but the JSDoc on `numTurns` mentioning it was not cleaned up. `grep -r 'turnCount' src/` returns this line.

---

### [LOW] turnCount が describe/コメント/文字列引数に複数残存
**Status: REGRESSION**

`tests/unit/adapter/claude-code/query-one-shot-metrics.test.ts` is not in the branch diff — it was never modified. The file has 8 occurrences of `turnCount` across file header (line 5), comment (line 93), describe string (line 96), it() string (line 97), inline comments (lines 124, 153), and `hasOwnProperty.call(result, "turnCount")` string arguments (lines 127, 154). These violate the grep-0-matches acceptance criteria.

---

### [LOW] formatAge がコメントに残存
**Status: REGRESSION**

`src/core/job-list/operations-view.ts` is not in the branch diff — it was never modified. Line 341 still contains:
```
* Re-uses the formatAge logic from ps.ts (copied here to stay import-clean).
```
This mentions the deleted `formatAge` function. The acceptance criteria covers comment-internal mentions.

---

### [LOW] ADR D1 references deleted assertBreakAfterCompletion as break-invariant guard
**Status: REGRESSION**

`specrunner/adr/2026-04-27-cli-core-pipeline.md` is not in the branch diff — it was never modified. Line 24 still reads:
```
completion.ts の assertBreakAfterCompletion ガードで検証
```
`assertBreakAfterCompletion` was deleted by T-02 and verified absent from all source/test files, but the ADR D1 text was not updated to reflect that the guard is now the `break` statement in `sse-stream.ts:132`.

---

## Evidence Summary

| # | Finding | Fixed? |
|---|---------|--------|
| 1 | T-06: SpawnFn tasks.md contradiction | ✅ Fixed |
| 2 | T-08: REPORT_TOOL_FIXTURE name mismatch | ✅ Fixed |
| 3 | T-15: LEVEL_ORDER AC self-contradiction | ✅ Fixed |
| 4 | REPORT_TOOL local var in contracts.test.ts | ✅ Fixed |
| 5 | turnCount JSDoc in query-one-shot.ts:81 | ❌ Regression |
| 6 | turnCount in query-one-shot-metrics.test.ts | ❌ Regression |
| 7 | formatAge comment in operations-view.ts:341 | ❌ Regression |
| 8 | ADR D1 assertBreakAfterCompletion reference | ❌ Regression |
