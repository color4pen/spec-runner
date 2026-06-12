# Tasks: codex-completion-report-fallback

## T-01: Replace `tryParseToolResult` with `tryExtractToolResult`

Add a `ParseAttemptResult` interface and implement `tryExtractToolResult` in `src/adapter/codex/agent-runner.ts`, replacing the existing `tryParseToolResult` function.

- [x] Define `interface ParseAttemptResult { toolResult: BaseReportResult | null; failureReason: string | null; rawFragment: string | null }` in `agent-runner.ts`
- [x] Implement `tryExtractToolResult(finalResponse: string, reportTool: ReportToolSpec): ParseAttemptResult`
  - Strategy 1 (raw parse): `JSON.parse(finalResponse.trim())` → `stripNullDeep` → `parseInput`; on success return `{ toolResult: result, failureReason: null, rawFragment: null }`
  - Strategy 2 (code-fence): regex ` /```(?:json)?\s*\n?([\s\S]*?)```/ ` to extract fence body, parse, validate
  - Strategy 3 (bracket): `finalResponse.indexOf('{')` / `finalResponse.lastIndexOf('}')`, extract substring, parse, validate
  - If all three fail: return `{ toolResult: null, failureReason: <last failure reason>, rawFragment: <first 200 chars of finalResponse + "…" if truncated> }`
  - `failureReason` values: `"json-parse-error"` (JSON.parse threw), `"validation-failed"` (parseInput returned ok: false), `"no-json-found"` (no `{` found in string)
- [x] Remove the old `tryParseToolResult` function
- [x] Update all two call sites (line ~452 and ~474) to use `tryExtractToolResult`

**Acceptance Criteria**:
- `tryExtractToolResult` with raw JSON `finalResponse` returns `toolResult` non-null (strategy 1 wins)
- `tryExtractToolResult` with ` ```json\n{...}\n``` ` returns `toolResult` non-null (strategy 2)
- `tryExtractToolResult` with `"text prefix\n{...}"` returns `toolResult` non-null (strategy 3)
- `tryExtractToolResult` with schema-invalid JSON returns `toolResult: null`
- `tryExtractToolResult` with non-JSON prose returns `{ toolResult: null, failureReason: "no-json-found", rawFragment: <fragment> }`
- `tryParseToolResult` no longer exists in the file

## T-02: Add parse failure diagnostic logging at call sites

At both call sites of `tryExtractToolResult`, emit a `stderrWrite` line when `toolResult` is null.

- [x] At the main turn call site (~line 452): after `tryExtractToolResult`, if `toolResult` is null, call `stderrWrite` with: `[codex] completion report parse failed (main turn): <failureReason>; fragment: "<rawFragment>"`
- [x] At the retry loop call site (~line 474): after `tryExtractToolResult`, if `toolResult` is null, call `stderrWrite` with: `[codex] completion report parse failed (attempt <attempt>/<maxAttempts>): <failureReason>; fragment: "<rawFragment>"`
- [x] Confirm that `rawFragment` from `tryExtractToolResult` is already truncated to ≤200 chars (enforced in T-01); no additional truncation needed here

**Acceptance Criteria**:
- When the main turn finalResponse is unrecoverable, a line is written to stderr containing `failureReason` and `rawFragment`
- When a retry turn finalResponse is unrecoverable, a line is written with the attempt number
- When the finalResponse is longer than 200 characters and unrecoverable, the logged fragment is ≤200 chars + `…`
- When `tryExtractToolResult` succeeds, no diagnostic line is written

## T-03: Remove `outputSchema` from follow-up retry turns

Modify the `toolReportRetry` loop to omit `outputSchema` and update the retry prompt.

- [x] In the `toolReportRetry` loop (~line 464), change `runFollowUpTurnWithRetry(activeThread, retryPrompt, { signal: abortController.signal, outputSchema })` to `runFollowUpTurnWithRetry(activeThread, retryPrompt, { signal: abortController.signal })`
- [x] Update `retryPrompt` text to: `"前の応答から JSON を取得できませんでした。コードフェンスや説明文を付けず、スキーマに一致する JSON オブジェクトのみを返してください。 (attempt ${attempt}/${retryPolicy.maxAttempts})"`
- [x] Verify the main work turn (`executeTurn` at ~line 398) still passes `outputSchema` unchanged

**Acceptance Criteria**:
- The `toolReportRetry` retry loop calls `runFollowUpTurnWithRetry` without an `outputSchema` property
- The updated retry prompt text no longer mentions "出力スキーマ" and instructs plain JSON without code fences
- The main work turn continues to pass `outputSchema` when `reportTool` is set

## T-04: Unit tests for `tryExtractToolResult`

Create `src/adapter/codex/__tests__/agent-runner-completion-report.test.ts` with unit tests for the extraction and observability logic.

- [x] Test: raw JSON finalResponse → `toolResult` non-null, `failureReason` null (strategy 1)
- [x] Test: ` ```json\n{...}\n``` ` finalResponse → `toolResult` non-null (strategy 2)
- [x] Test: ` ```\n{...}\n``` ` (no language tag) → `toolResult` non-null (strategy 2)
- [x] Test: inline code fence ` ```json {...} ``` ` → `toolResult` non-null (strategy 2)
- [x] Test: `"Explanation text\n{...}"` → `toolResult` non-null (strategy 3)
- [x] Test: `"{...}\ntrailing text"` → `toolResult` non-null (strategy 3)
- [x] Test: schema-invalid JSON `'{"unexpected":"field"}'` → `toolResult` null, `failureReason: "validation-failed"`
- [x] Test: non-JSON prose → `toolResult` null, `failureReason: "no-json-found"`, `rawFragment` ≤200 chars
- [x] Test: finalResponse longer than 200 chars, unrecoverable → `rawFragment` ends with `…` and is ≤201 chars total
- [x] Test: `tryParseToolResult` is not exported (removed)

For test fixtures, use a minimal `reportTool` stub that:
- Has a `zodSchema` with a required `verdict` string field
- Has a `parseInput` that returns `{ ok: true, value: parsed }` when `verdict` is present, `{ ok: false }` otherwise

**Acceptance Criteria**:
- All listed test cases pass
- No existing test is broken

## T-05: Integration test — all-turns-fail stays fail-closed

Add a test in `src/adapter/codex/__tests__/agent-runner-completion-report.test.ts` (same file as T-04) that exercises the full `CodexAgentRunner.run()` path with mocked thread.

- [x] Test: main turn + all retry turns return unrecoverable finalResponse → `result.toolResult` is null and `result.completionReason` is `"success"` (the work itself succeeded; toolResult null → escalation is the pipeline's responsibility)
- [x] Test: main turn returns code-fenced JSON (recoverable by D1) → `result.toolResult` non-null; no retry turns executed
- [x] Test: main turn returns unrecoverable JSON, first retry returns code-fenced JSON → `result.toolResult` non-null; `result.followUpAttempts` equals 1

Use `CodexAgentRunnerDeps._codexFactory` injection to supply a mock `CodexInstance`.

**Acceptance Criteria**:
- All three integration scenarios pass
- Existing behavior for `completionReason: "success"` is unchanged when extraction succeeds
- `typecheck && test` green

## T-06: Verify `typecheck && test` green

- [x] Run `bun run typecheck` — zero errors
- [x] Run `bun run test` — all tests pass, no regressions in existing test files

**Acceptance Criteria**:
- `bun run typecheck` exits 0
- `bun run test` exits 0
