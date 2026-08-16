# Regression Gate Result — Iteration 2

## Verification Summary

All 7 findings from the ledger were verified against the current branch code. None have regressed.

---

## Finding Verification

### [MEDIUM] D4: design.md「SDK の全 message は session_id を持つ」の不整合

**Status: FIXED**

Current design.md (lines 36–38) now reads:
> `session 初期化時に送られる SDKSystemMessage (init) は session_id を持つ。…(SDKUserMessage.session_id は optional であり全 message が持つとは限らない)。`

The original incorrect claim is absent. Accurate statement using `SDKSystemMessage` (init) as the basis is present.

---

### [LOW] graceFired 変数名 → graceArmed

**Status: FIXED**

`agent-runner.ts` line 698: `let graceArmed = false;`
Comment on line 704: `if (graceArmed) return; // already armed — idempotent`

Variable is now `graceArmed`, consistent with the comment's intent.

---

### [HIGH] T-02 early session_id capture persists across resume-fallback

**Status: FIXED**

`agent-runner.ts` lines 844–845:
```typescript
// T-02: reset so the fallback session's init message is captured as the new sessionId.
extractedSessionId = undefined;
```

`extractedSessionId` is reset at the resume-fallback boundary before the second `runQuery()` call.

---

### [LOW] D5 path omits touchedFiles from AgentRunResult

**Status: FIXED**

`agent-runner.ts` line 1232:
```typescript
touchedFiles: extractTouchedFilesFromMessages(touchedFileMessages, cwd),
```

The D5 return at lines 1222–1233 includes `touchedFiles`.

---

### [LOW] D5 path calls sessionLogWriter.close() without writeSummary()

**Status: FIXED**

`agent-runner.ts` line 1220:
```typescript
sessionLogWriter?.writeSummary({ sessionId: extractedSessionId, model: resolvedConfig.model, modelUsage: extractedModelUsage });
```

`writeSummary` is called before `close()` in the D5 path.

---

### [MEDIUM] F2: followUpAttempts/addedTurns stale 0 in D5 outer catch

**Status: FIXED**

`agent-runner.ts` lines 914–920 (before the `try` block at line 922):
```typescript
// T-06: track per-type added-turn counters at run() scope
let followUpAttempts = 0;
let reportRetry = 0;
let postWork = 0;
let outputRepair = 0;
```

All 4 counters are now declared at `run()` scope and are accessible from the D5 catch path (lines 1226–1228 use actual accumulated values).

---

### [LOW] F1: No test for resume-fallback + grace-exit postWork resume

**Status: FIXED**

`agent-runner-report-settles.test.ts` lines 466–527: TC-008 is present.

> `TC-008: resume-fallback 後に grace-exit した場合、postWork が第 2 session の id で resume される`

Test verifies `capturedResume === "new-session-id"` and `capturedResume !== "old-session-id"` when call 1 throws (resume-fallback), call 2 provides the new session id and grace-exits, and call 3 is the postWork turn.

---

## Verdict

No regressions detected. All 7 findings are confirmed fixed.
