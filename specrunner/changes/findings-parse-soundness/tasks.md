# Tasks: findings-parse-soundness

## T-01: Fix `parseFindings` to treat `line: null` as absent

**File**: `src/core/port/report-result.ts`

- [ ] Locate the guard on line ~162 inside `parseFindings`:
  `if ("line" in f && f["line"] !== undefined && typeof f["line"] !== "number") return { ok: false };`
- [ ] Add `f["line"] !== null` before the `typeof` check, so the full condition becomes:
  `if ("line" in f && f["line"] !== undefined && f["line"] !== null && typeof f["line"] !== "number") return { ok: false };`
- [ ] Confirm the existing `line` capture below (`if (typeof f["line"] === "number") finding.line = f["line"]`) remains unchanged — `null` will simply not set `finding.line`, which is the correct behavior.

**Acceptance Criteria**:
- `parseFindings([{ severity: "high", resolution: "fixable", file: "a.ts", title: "T", rationale: "R", line: null }])` returns `{ ok: true, value: [{ ..., /* no line field */ }] }`.
- `parseFindings([{ severity: "high", resolution: "fixable", file: "a.ts", title: "T", rationale: "R", line: "bad" }])` still returns `{ ok: false }` (non-null non-number is still invalid).
- `parseFindings([{ severity: "high", resolution: "fixable", file: "a.ts", title: "T", rationale: "R", line: 5 }])` still returns `{ ok: true, value: [{ ..., line: 5 }] }`.

---

## T-02: Add tests for `parseFindings` / `parseObservations` null-line symmetry

**File**: `src/core/port/__tests__/report-result.test.ts` (create new file)

- [ ] Create `src/core/port/__tests__/` directory if it does not exist.
- [ ] Write a `describe("parseFindings")` block covering:
  - `line: null` in a single finding → `{ ok: true }`, finding retained, no `line` field on the finding object.
  - `line: null` in one of multiple findings → all findings retained.
  - `line: "string"` → `{ ok: false }` (still rejected).
  - `line: 5` → `{ ok: true, value: [{ line: 5 }] }`.
  - No `line` field at all → `{ ok: true }`, no `line` field on the finding.
- [ ] Write a `describe("parseObservations")` block covering the same cases (null → retained, string → rejected, number → retained, absent → no field).
- [ ] Write a `describe("symmetry: parseFindings vs parseObservations")` block asserting that both functions accept and reject the same set of `line` values (null, number, absent → accept; non-null non-number → reject).

**Acceptance Criteria**:
- All new tests pass under `bun run test`.
- The tests import `parseFindings` and `parseObservations` from `../../port/report-result.js`.
- No mocks or I/O — pure unit tests.

---

## T-03: Remove `stripNullDeep` from codex adapter

**Files**: `src/adapter/codex/agent-runner.ts`, `src/adapter/codex/strict-schema.ts`

- [ ] In `src/adapter/codex/agent-runner.ts`:
  - Remove `stripNullDeep` from the import on the `./strict-schema.js` import line (retain `toOpenAIStrictSchema`).
  - In `tryExtractToolResult`, inside `tryParseAndValidate`, remove the `const normalized = stripNullDeep(json);` line and replace the `reportTool.parseInput(normalized)` call with `reportTool.parseInput(json)`. The local variable `normalized` is removed entirely.
  - Update the JSDoc comment on `tryExtractToolResult` (step 1 description) to remove the `→ stripNullDeep` mention.
- [ ] In `src/adapter/codex/strict-schema.ts`:
  - Delete the entire `stripNullDeep` function (the exported function and its JSDoc comment, roughly lines 93–115).
  - Do not remove `toOpenAIStrictSchema`, `makeNullable`, or the module-level JSDoc.

**Acceptance Criteria**:
- `stripNullDeep` is no longer exported from `strict-schema.ts` (verified by: the name does not appear in the file after the edit).
- `agent-runner.ts` no longer references `stripNullDeep`.
- Existing `agent-runner-completion-report.test.ts` tests still pass — codex completion extraction continues to work.

---

## T-04: Add test confirming codex completion works with `line: null` after `stripNullDeep` removal

**File**: `src/adapter/codex/__tests__/agent-runner-completion-report.test.ts`

- [ ] Add a new test case to the `"T-04: Unit tests for tryExtractToolResult"` describe block:
  - Input: a raw JSON string containing a findings array where one finding has `"line": null`, using the existing `mockReportTool` or a new one that passes `parseJudgeReportInput`.
  - Since `mockReportTool` uses a simple `verdict` check, add a focused unit test using the real `parseJudgeReportInput` or `parseFindings` directly from report-result to confirm the flow works without `stripNullDeep`.
  - Specifically: call `tryExtractToolResult` with a JSON string `{ ok: true, findings: [{ severity: "high", resolution: "fixable", file: "a.ts", title: "T", rationale: "R", line: null }] }` and a `reportTool` whose `parseInput` calls `parseJudgeReportInput`. Expect `toolResult` to be non-null.

**Acceptance Criteria**:
- The test passes without `stripNullDeep` in the call path.
- The test demonstrates runtime parity: the same JSON that would previously fail for local/managed now succeeds for codex too (via the kernel parser fix, not via null stripping).

---

## T-05: Delete dead review-scores path

**Files to delete**:
- `src/core/parser/review-scores.ts`
- `src/kernel/review-scores.ts`
- `src/core/parser/review-findings.ts`
- `src/kernel/review-findings.ts`

**File to edit**: `src/core/port/step-types.ts`

- [ ] Delete `src/core/parser/review-scores.ts` (entire file).
- [ ] Delete `src/kernel/review-scores.ts` (entire file).
- [ ] Delete `src/core/parser/review-findings.ts` (entire file).
- [ ] Delete `src/kernel/review-findings.ts` (entire file).
- [ ] In `src/core/port/step-types.ts`:
  - Remove `import type { ReviewScores } from "../../kernel/review-scores.js";`
  - Remove `import type { FindingSeverityCounts } from "../../kernel/review-findings.js";`
  - Remove `scores?: ReviewScores & Pick<FindingSeverityCounts, "critical" | "high">;` from the `ParsedStepResult` interface (including its JSDoc comment block).
  - Remove `export type { ReviewScores, FindingSeverityCounts };` from the bottom re-export section.

**Acceptance Criteria**:
- The four deleted files no longer exist.
- `bun run typecheck` passes (no dangling imports).
- No remaining import of `ReviewScores`, `FindingSeverityCounts`, or `parseReviewScores` anywhere in `src/`.
- `bun run test` passes (no existing test relied on the deleted path).

---

## T-06: Fix managed `verifyFindingRefs` directory detection

**File**: `src/core/runtime/managed.ts`

- [ ] Extract a pure helper function `isGitHubDirectoryListing(value: unknown): boolean` (file-scoped, not exported) above or near `verifyFindingRefs`:
  ```typescript
  function isGitHubDirectoryListing(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0) return false;
    const first = value[0] as Record<string, unknown>;
    return (
      typeof first === "object" &&
      first !== null &&
      typeof first["name"] === "string" &&
      typeof first["type"] === "string"
    );
  }
  ```
- [ ] In `verifyFindingRefs`, replace the `Array.isArray(parsed)` check inside the try/catch block with `isGitHubDirectoryListing(parsed)`.
- [ ] Update the inline comment from "Detect directory: GitHub API returns a JSON array for directory listings" to "Detect directory: GitHub API returns a JSON array of entries, each with `name` and `type` fields".

**Acceptance Criteria**:
- A finding referencing a file whose raw content is `["item1", "item2"]` (a plain JSON array) is NOT pushed to `nonExistent`.
- A finding referencing an actual directory (content is `[{ name: "foo.ts", type: "file", ... }]`) is still detected as a directory.
- An empty JSON array `[]` is not classified as a directory (falls through to line-count check, which is harmless).

---

## T-07: Add test for managed `verifyFindingRefs` JSON array file handling

**File**: `src/core/runtime/__tests__/managed-verify-finding-refs.test.ts` (create new file)

- [ ] Create `src/core/runtime/__tests__/` directory if it does not exist.
- [ ] Write a unit test that creates a minimal `ManagedRuntime`-like fixture (or extracts/stubs the `isGitHubDirectoryListing` logic via a test-only export or by testing through `verifyFindingRefs` with a mock GitHub client).
  - If `isGitHubDirectoryListing` is exported for testing, assert:
    - `isGitHubDirectoryListing([])` → `false`
    - `isGitHubDirectoryListing(["item1", "item2"])` → `false` (plain string array)
    - `isGitHubDirectoryListing([{ name: "foo.ts", type: "file" }])` → `true`
    - `isGitHubDirectoryListing({ name: "x" })` → `false` (not an array)
    - `isGitHubDirectoryListing(null)` → `false`
  - Alternatively, test `verifyFindingRefs` end-to-end by mocking `githubClient.getRawFile`:
    - When it returns `'["item1","item2"]'` (a plain JSON array file), a finding with a line reference is NOT in the returned `nonExistent` array.
    - When it returns `'[{"name":"a.ts","type":"file","path":"a.ts","sha":"abc"}]'` (a directory), a finding with a line reference IS in `nonExistent`.
    - When it returns `null`, the finding IS in `nonExistent` (file not found).

**Acceptance Criteria**:
- All new tests pass under `bun run test`.
- The plain JSON array case is explicitly covered with a test assertion.

---

## T-08: Verify `typecheck && test` green

- [ ] Run `bun run typecheck` and confirm exit code 0.
- [ ] Run `bun run test` and confirm exit code 0.
- [ ] Confirm no test file references `parseReviewScores`, `ReviewScores`, `FindingSeverityCounts`, or `stripNullDeep` (they were deleted; stale references would be a typecheck failure, but double-check).

**Acceptance Criteria**:
- `bun run typecheck` exits 0.
- `bun run test` exits 0.
- All acceptance criteria from T-01 through T-07 are satisfied.
