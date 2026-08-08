# Regression Gate Result — Iteration 1

## Verified Findings (8 items)

### [FIXED] Finding 1: changesDirRel() の prefix チェックに trailing slash が必要
**File**: `src/adapter/claude-code/touched-files-recorder.ts`

Fixed. The recorder delegates to `isChangeFolderPath(posixRelative)` defined in
`src/adapter/shared/touched-files-bundle.ts`, which uses
`posixRelative.startsWith(changesDirRel() + "/")` — trailing slash is present and
this function is the single source of truth for both recording and injection layers.

---

### [FIXED] Finding 2: transient retry 時の accumulator 蓄積セマンティクスが設計に未明記
**File**: `specrunner/changes/touched-files-propagation/design.md`

Fixed. D6 now includes the paragraph:

> **transient retry 時の accumulator**: `retryWithBackoff` が `runMainWorkTurn`（= `runQuery`）を N 回呼ぶ場合、
> 同一 `run()` スコープの accumulator に N 回分のメッセージが蓄積される。同一パスの重複排除（D4）が効くため
> 実害はなく、最終的な確定リストは dedup 済みの正確な記録となる。

---

### [FIXED] Finding 3: `JobState` と `AgentRunResult` への `[key: string]: unknown` index signature 追加
**File**: `src/state/schema/types.ts`

Fixed. No `[key: string]: unknown` index signature was added to `JobState` or `AgentRunResult`.
The only such signature in types.ts is on `ProfileAssurance` (pre-existing, unrelated).
`JobState.touchedFiles` is a named typed optional field, and tests access it directly via
`state.touchedFiles` / `result.touchedFiles` without any Record cast.

---

### [FIXED] Finding 4: `buildTouchedFilesSection` が `state.touchedFiles` に不要な `as unknown as` キャストを使用
**File**: `src/adapter/shared/touched-files-bundle.ts`

Fixed. The function accesses `state.touchedFiles` directly:
```typescript
const touchedFiles = state.touchedFiles;
if (!touchedFiles) return "";
```
No `as unknown as` cast is present.

---

### [REGRESSION] Finding 5: cap 到達後に `seen.add` を省略しているため、同一ファイルが cap 超過後に何度も cap チェックまで到達する
**File**: `src/adapter/claude-code/touched-files-recorder.ts` (lines 87–91)

NOT fixed. Current code:
```typescript
if (seen.has(normalized)) continue;          // line 87
if (result.length >= MAX_TOUCHED_FILES) continue;  // line 88

seen.add(normalized);  // line 90  ← still after cap check
result.push(normalized);
```

`seen.add(normalized)` is still placed AFTER the cap check. Paths that arrive after the
100-file cap is reached are never added to `seen`, so each subsequent occurrence of such
a path passes the `seen.has` check and re-reaches the cap check before being discarded.
The fix (move `seen.add` to before the cap check) was described but not applied.

Results remain correct; only redundant work occurs. Severity LOW.

---

### [FIXED] Finding 6: 冗長な type cast が TypeScript の構造的チェックをバイパスする
**File**: `src/core/step/commit-orchestrator.ts`

Fixed. The commitSuccess path uses `as JobState` (spread of a JobState object, reasonable
narrowing), not the problematic `as unknown as { touchedFiles?: Record<string, string[]> }`.
`buildTouchedFilesSection` has no cast at all. The `as unknown as` pattern does not appear
in any of the newly added files.

---

### [FIXED] Finding 7: touchedFiles 配列の要素型（string）を validateJobState が検証しない
**File**: `src/state/schema/operations.ts`

Fixed. `validateJobState` now validates element types with fail-open semantics at lines 330–339:
- Entries whose array values contain non-string elements are dropped (not a crash).
- Entries with all-string arrays are preserved.
- Non-array values throw.
This matches the `reviewerStatuses` strictness pattern referenced in the finding.

---

### [FIXED] Finding 8: validateJobState の non-string 要素 silent drop が未テスト
**File**: `src/state/schema/operations.ts`

Fixed. `src/state/__tests__/touched-files-schema.test.ts` includes a dedicated describe block
("validateJobState: non-string array elements → drop entry (fail-open)") covering:
- Mixed array `[string, number]` → entry dropped, other steps preserved
- Array containing `null` → entry dropped
- All-string array → preserved
- No throw on non-string elements (fail-open)

---

## Summary

| # | Severity | Status |
|---|----------|--------|
| 1 | LOW | FIXED |
| 2 | LOW | FIXED |
| 3 | MEDIUM | FIXED |
| 4 | LOW | FIXED |
| 5 | LOW | **REGRESSION** |
| 6 | LOW | FIXED |
| 7 | LOW | FIXED |
| 8 | LOW | FIXED |

**Regressions**: 1 (Finding 5 — LOW, fixable)
