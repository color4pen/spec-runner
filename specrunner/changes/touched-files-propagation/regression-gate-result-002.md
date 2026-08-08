# Regression Gate Result — Iteration 2

## Verdict

All 8 findings from the review ledger are confirmed fixed. No regressions detected.

---

## Evidence

### [LOW] changesDirRel() の prefix チェックに trailing slash が必要
**File**: `src/adapter/claude-code/touched-files-recorder.ts`
**Status**: FIXED

`isChangeFolderPath(posixRelative)` is called at line 39. The predicate is defined in
`src/adapter/shared/touched-files-bundle.ts:24-26` and uses
`posixRelative.startsWith(changesDirRel() + "/")` — trailing slash present. A path like
`specrunner/changes-archive/foo.ts` correctly passes through (not excluded).

---

### [LOW] transient retry 時の accumulator 蓄積セマンティクスが設計に未明記
**File**: `specrunner/changes/touched-files-propagation/design.md`
**Status**: FIXED

D6 in the committed design.md includes the note:

> `retryWithBackoff` が `runMainWorkTurn`（= `runQuery`）を N 回呼ぶ場合、同一 `run()` スコープの
> accumulator に N 回分のメッセージが蓄積される。同一パスの重複排除（D4）が効くため実害はなく、
> 最終的な確定リストは dedup 済みの正確な記録となる。

The gap is closed.

---

### [MEDIUM] `JobState` と `AgentRunResult` への `[key: string]: unknown` index signature 追加
**File**: `src/state/schema/types.ts`, `src/core/port/agent-runner.ts`
**Status**: FIXED

`grep '[key: string]'` on `types.ts` finds only one match at line 335, inside `ProfileAssurance`
(pre-existing, unrelated). `JobState` (line 394+) has no index signature. `AgentRunResult` in
`src/core/port/agent-runner.ts` has no index signature.

Tests in `commit-orchestrator-touched-files.test.ts` use typed access
(`persistedState!.touchedFiles`, `state.touchedFiles`) — no `Record<string, unknown>` cast.
`NormalizedJobState = Omit<JobState, "steps"> & { steps: … }` is unaffected.

---

### [LOW] `buildTouchedFilesSection` が `state.touchedFiles` に不要な `as unknown as` キャストを使用
**File**: `src/adapter/shared/touched-files-bundle.ts`
**Status**: FIXED

Line 42: `const touchedFiles = state.touchedFiles;` — direct typed access, no cast.

---

### [LOW] cap 到達後に `seen.add` を省略しているため、同一ファイルが cap 超過後に何度も cap チェックまで到達する
**File**: `src/adapter/claude-code/touched-files-recorder.ts`
**Status**: FIXED

Lines 87-91:
```typescript
if (seen.has(normalized)) continue;
seen.add(normalized);               // ← added before cap check
if (result.length >= MAX_TOUCHED_FILES) continue;
result.push(normalized);
```
`seen.add` is called before the cap check, so a file that appears after the cap is hit is added to
`seen` on first encounter and skipped in O(1) on subsequent encounters.

---

### [LOW] 冗長な type cast が TypeScript の構造的チェックをバイパスする
**File**: `src/core/step/commit-orchestrator.ts`
**Status**: FIXED

Line 454: `s = { ...s, touchedFiles: { ...existing, [step.name]: result.touchedFiles } } as JobState;`

Uses `as JobState` (simple cast to the correct typed interface) rather than the previous
`as unknown as { touchedFiles?: Record<string, string[]> }` double-cast. Since `touchedFiles` is
now a named typed field of `JobState`, TypeScript structurally checks the spread against the
interface — the cast only satisfies the mutability constraint on `s`.

`buildTouchedFilesSection` in `touched-files-bundle.ts` uses `state.touchedFiles` directly with
no cast.

---

### [LOW] touchedFiles 配列の要素型（string）を validateJobState が検証しない
**File**: `src/state/schema/operations.ts`
**Status**: FIXED

Lines 336-338 in `validateJobState`:
```typescript
if (value.every((el) => typeof el === "string")) {
  sanitized[stepName] = value as string[];
}
```
Entries whose arrays contain non-string elements are silently dropped (fail-open).
Non-array values still throw (line 332-334). `{implementer: [123, null]}` is now handled:
the entry is dropped, not injected.

---

### [LOW] validateJobState の non-string 要素 silent drop が未テスト
**File**: `src/state/__tests__/touched-files-schema.test.ts`
**Status**: FIXED

A new describe block `"validateJobState: non-string array elements → drop entry (fail-open)"`
(lines 165-218) covers:
- `[123, null, undefined]` mixed → entry dropped
- pure null → entry dropped
- all strings → preserved
- no throw when non-string elements present

The drop behavior is now observable-tested and guarded against future regressions.

---

## Summary Table

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | LOW | changesDirRel trailing slash | FIXED |
| 2 | LOW | transient retry accumulator semantics undocumented | FIXED |
| 3 | MEDIUM | index signature on JobState / AgentRunResult | FIXED |
| 4 | LOW | as unknown as cast in buildTouchedFilesSection | FIXED |
| 5 | LOW | seen.add after cap check | FIXED |
| 6 | LOW | redundant double-cast in commit-orchestrator | FIXED |
| 7 | LOW | validateJobState skips element type check | FIXED |
| 8 | LOW | non-string element drop not tested | FIXED |

**Regressions**: 0  
**Contradictions**: 0
