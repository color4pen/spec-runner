# Regression Gate Result — report-settles-step iteration 1

## Verification Summary

All 7 ledger findings verified against current branch code.

## Findings Status

### ✅ FIXED: [MEDIUM] D4 — design.md "SDK の全 message は session_id を持つ" 不整合

`design.md` (Context section) now correctly states:

> "session 初期化時に送られる `SDKSystemMessage` (init) は `session_id` を持つ。…  
> (`SDKUserMessage.session_id` は optional であり全 message が持つとは限らない)。"

The inaccurate "全 message が持つ" wording is gone; SDKSystemMessage (init) is named as the basis.  **No regression.**

---

### ✅ FIXED: [LOW] graceFired → graceArmed 変数名

`agent-runner.ts:698`

```ts
let graceArmed = false;   // was graceFired
```

`agent-runner.ts:704`

```ts
if (graceArmed) return; // already armed — idempotent
```

Variable correctly named `graceArmed`. **No regression.**

---

### ✅ FIXED: [HIGH] T-02 extractedSessionId not reset at resume-fallback boundary

`agent-runner.ts:845`

```ts
// T-02: reset so the fallback session's init message is captured as the new sessionId.
extractedSessionId = undefined;
```

Reset is present immediately before `await runQuery()` in the resume-fallback path. **No regression.**

---

### ✅ FIXED: [LOW] D5 path omits touchedFiles

`agent-runner.ts:1230`

```ts
touchedFiles: extractTouchedFilesFromMessages(touchedFileMessages, cwd),
```

Present in the D5 return object. **No regression.**

---

### ✅ FIXED: [LOW] D5 path calls sessionLogWriter.close() without writeSummary()

`agent-runner.ts:1218`

```ts
sessionLogWriter?.writeSummary({ sessionId: extractedSessionId, model: resolvedConfig.model, modelUsage: extractedModelUsage });
sessionLogWriter?.close();
```

Both calls present in D5 path. **No regression.**

---

### ❌ STILL PRESENT: [MEDIUM] F2 — followUpAttempts/addedTurns stale 0 in D5 outer catch

**File**: `src/adapter/claude-code/agent-runner.ts`

`agent-runner.ts:1003–1006` — counters still declared **inside** the `try` block:

```ts
let followUpAttempts = 0;
let reportRetry = 0;
let postWork = 0;
let outputRepair = 0;
```

`agent-runner.ts:1224, 1226` — D5 return still uses hardcoded values:

```ts
followUpAttempts: 0,
// ...
addedTurns: ADDED_TURNS_ZERO,
```

If a hard abort fires during the follow-up phase, the actual consumed-turn counts are not recorded in telemetry. Fix: move all 4 declarations above line 914 (`try {`) to `run()` scope.

---

### ❌ STILL PRESENT: [LOW] F1 — resume-fallback 後 grace-exit postWork resume テスト未追加

**File**: `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts`

The test file (TC-001–TC-007) has no test case that:
- sets `ctx.session.resumeSessionId` to trigger resume-fallback
- lets the fallback session receive a report and grace-exit
- asserts that postWork executes with the **second** session's id as `resume`

The code fix (`extractedSessionId = undefined` at line 845) is in place, but the test to pin the behavior is absent.

## Evidence

| Finding | File | Status |
|---------|------|--------|
| D4 design.md session_id wording | specrunner/changes/report-settles-step/design.md | **FIXED** |
| graceFired → graceArmed | src/adapter/claude-code/agent-runner.ts:698 | **FIXED** |
| T-02 extractedSessionId reset | src/adapter/claude-code/agent-runner.ts:845 | **FIXED** |
| D5 touchedFiles | src/adapter/claude-code/agent-runner.ts:1230 | **FIXED** |
| D5 writeSummary | src/adapter/claude-code/agent-runner.ts:1218 | **FIXED** |
| F2 counters in try scope | src/adapter/claude-code/agent-runner.ts:1003–1006 | **STILL PRESENT** |
| F1 resume-fallback grace test | src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts | **MISSING** |
