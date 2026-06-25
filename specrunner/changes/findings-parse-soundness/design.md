# Design: findings-parse-soundness

## Context

Pipeline invariant: CLI derives verdict from agent findings; agent does not self-judge.
This invariant holds only when the CLI can parse the findings the agent emits.

Four independent defects break this chain today:

**(a) `parseFindings` rejects `line: null` — drops the whole findings array**
`src/core/port/report-result.ts:162` guards:
```
if ("line" in f && f["line"] !== undefined && typeof f["line"] !== "number") return { ok: false };
```
`null` satisfies `"line" in f`, satisfies `!== undefined`, and satisfies `typeof ... !== "number"`, so the guard fires and the entire findings array is rejected. The CLI sees zero findings → retries → escalation. All genuine findings and the derived verdict are lost.

**(b) Codex runtime masked bug (a) via `stripNullDeep`**
`src/adapter/codex/agent-runner.ts` calls `stripNullDeep(json)` before `parseInput`, removing `null` values before the parser sees them. Local and managed runtimes do not apply this stripping, so the same agent output passes in codex and fails in local/managed — a runtime-split defect.

**(c) Dead review-scores path with loose numeric parsing**
`src/core/parser/review-scores.ts:parseReviewScores` is never called from production code. `ParsedStepResult.scores` is declared in `src/core/port/step-types.ts` but never populated or consumed. Four files across `src/core/parser/` and `src/kernel/` carry this dead surface. The request calls for deletion rather than tightening, because the verdict is derived entirely from findings collection (`judge-verdict.ts`).

**(d) managed `verifyFindingRefs` misclassifies JSON array files as directories**
`src/core/runtime/managed.ts:347-369` fetches file content via the GitHub Contents API (with `Accept: application/vnd.github.v3.raw`). When the path is a directory, GitHub returns a JSON array of directory entries. The code detects this with `JSON.parse` + `Array.isArray`, but any regular file whose content is a top-level JSON array (e.g. a schema file, lock file excerpt, or test fixture) is indistinguishable by this test. Such a finding is pushed to `nonExistent` and the finding is silently discarded.

## Goals / Non-Goals

**Goals**:
- `line: null` in findings arrays is normalized to "absent" (finding retained, line field omitted) in the kernel parser, independent of runtime.
- `parseFindings` and `parseObservations` treat `line: null` identically.
- Codex `stripNullDeep` is removed after kernel normalization makes it redundant.
- Dead review-scores path is deleted entirely (4 files + `scores` field in `ParsedStepResult`).
- managed `verifyFindingRefs` no longer misclassifies top-level JSON array files as directories.

**Non-Goals**:
- Changing the `line` field in the `report-tool` zod schema (`optional(number())` stays).
- Changing verdict derivation logic in `judge-verdict.ts`.
- Fixing other runtime asymmetries (signal handler, interruption journal).
- Tightening loose numeric parsing in review-scores (path is deleted, not tightened).
- Credential containment (B-6, separate request).

## Decisions

### D1: Normalize `line: null` in kernel parser, not in adapters

**Change**: Add `f["line"] !== null` to the `parseFindings` guard at `src/core/port/report-result.ts:162`:
```typescript
// Before
if ("line" in f && f["line"] !== undefined && typeof f["line"] !== "number") return { ok: false };
// After
if ("line" in f && f["line"] !== undefined && f["line"] !== null && typeof f["line"] !== "number") return { ok: false };
```
This makes the guard identical to the one in `parseObservations` (line 232).

**Rationale**: The kernel parser is the single source of truth. Normalizing in the adapter (the existing codex `stripNullDeep` approach) means the same agent output is accepted in one runtime and rejected in another — a latent, hard-to-detect class of bugs. Placing the fix in the parser eliminates the asymmetry at the root.

**Alternatives considered**: Per-adapter normalization (rejected — the asymmetry source, as codex shows). Zod schema change to `nullable()` (rejected — out of scope; `report-tool` schema stays `optional(number())`).

---

### D2: Delete `stripNullDeep` after kernel normalization subsumes it

**Change**: Remove the `stripNullDeep(json)` call from `tryExtractToolResult` in `src/adapter/codex/agent-runner.ts`. Delete the `stripNullDeep` function from `src/adapter/codex/strict-schema.ts` and its import in `agent-runner.ts`. `toOpenAIStrictSchema` is retained (still required for structured output schema generation).

**Rationale**: `stripNullDeep` was a compensatory workaround for D1. Once the kernel parser handles `null`, `stripNullDeep` is redundant and its presence perpetuates the illusion that the codex path is "different". Removing it collapses the three runtimes to a single parse path.

**Alternatives considered**: Keep `stripNullDeep` as a defense-in-depth layer (rejected — it obscures the runtime asymmetry and complicates future debugging).

---

### D3: Delete dead review-scores path entirely

**Files deleted**:
- `src/core/parser/review-scores.ts` — `parseReviewScores` + `ReviewScores`
- `src/kernel/review-scores.ts` — `ReviewScores` interface
- `src/core/parser/review-findings.ts` — `FindingSeverityCounts` interface
- `src/kernel/review-findings.ts` — `FindingSeverityCounts` interface

**Edits to `src/core/port/step-types.ts`**:
- Remove `import type { ReviewScores }` and `import type { FindingSeverityCounts }` lines
- Remove `scores?: ReviewScores & Pick<FindingSeverityCounts, "critical" | "high">` from `ParsedStepResult`
- Remove `export type { ReviewScores, FindingSeverityCounts }` re-export

**Rationale**: `parseReviewScores` has zero production callers; `ParsedStepResult.scores` is never set or read. Verdict is derived entirely from findings aggregation in `judge-verdict.ts`. Keeping dead surface with loose parsing (`parseFloat`, regex totals) adds maintenance overhead with no benefit.

**Alternatives considered**: Tighten the numeric parsing (rejected — dead path, tightening cannot help); preserve interfaces only (rejected — the `scores` field in `ParsedStepResult` creates an impression of populated data that never arrives, misleading implementers).

---

### D4: Detect GitHub directory listings by entry shape, not by `Array.isArray` alone

**Change**: Replace the `isDirectory` detection in `src/core/runtime/managed.ts:verifyFindingRefs` with a check that validates the GitHub directory entry structure:

```typescript
// Before: treats any JSON array as a directory
if (Array.isArray(parsed)) {
  isDirectory = true;
}

// After: require at least one entry with GitHub directory shape
function isGitHubDirectoryListing(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  const first = value[0] as Record<string, unknown>;
  return typeof first === "object" && first !== null
    && typeof first["name"] === "string"
    && typeof first["type"] === "string";
}
```

Empty arrays remain unclassifiable as directories by shape; since a finding pointing into an empty directory would have no valid line, the downstream line-count check still catches invalid refs.

**Rationale**: GitHub Contents API directory listings always have entries with `name: string` and `type: "file"|"dir"`. A regular file whose content is a JSON array (e.g. a test fixture, JSON schema) would not have elements matching this shape. The check is still heuristic, but the false-positive surface shrinks from "any JSON array" to "any JSON array whose first element has `name` and `type` string fields".

**Alternatives considered**: Separate API call for metadata (rejected — adds latency and complexity for a check already using the contents endpoint); rely on Content-Type header (rejected — `Accept: application/vnd.github.v3.raw` returns `application/json` for both files and directories in some configurations); full structural validation of all elements (rejected — overconstrained, GitHub adds fields over time).

## Risks / Trade-offs

**[Risk] JSON array file with GitHub-shaped first element is still misclassified**
A file whose first JSON element has `name: string, type: string` fields would trigger the directory check. Such a structure is plausible (e.g. a `manifest.json` with `[{ type: "file", name: "..." }]` entries). Mitigation: the false-positive rate is dramatically lower than the current check, and the finding is only dropped if it also has a `line` reference (undirected findings pass through). If this triggers in practice, a more precise fix (e.g. checking `sha` field, which directories always have) can be layered on.

**[Risk] Removing `stripNullDeep` reveals other null-field issues**
`stripNullDeep` may have been silently normalizing other null fields beyond `line`. After removal, codex agents that emit other null optional fields (e.g. `fixTarget: null`) may encounter new validation failures. Mitigation: the codex test suite covers the completion-report extraction path; existing tests will catch regressions. Other optional fields in `parseFindings` (e.g. `fixTarget`) already use `typeof f["fixTarget"] === "string"` guards that safely ignore nulls without returning `{ ok: false }`, so only `line` required the explicit fix.

**[Risk] Deleting `FindingSeverityCounts` / `ReviewScores` breaks external importers**
If downstream code outside `src/` imports these types from `core/port/step-types`, deletion will cause type errors. Mitigation: `grep` across the entire repository confirms no external consumers; the re-export in `step-types.ts` is the only exposure point.

## Open Questions

None — all decisions are architect-ratified in the request.
