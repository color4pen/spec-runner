# Regression Gate Result — Iteration 002

## Verification Summary

3 findings from the ledger verified. All 3 are **fixed** in the current code.

---

## Finding 1 — [MEDIUM] TC-008「archive backstop no-op when draft consumed」テスト未実装

**File**: `tests/unit/core/archive/orchestrator.test.ts`

**Status: FIXED**

Lines 819–855 implement TC-008. The test overrides `mockFs.exists` to return `false` for any path containing `specrunner/drafts`, runs `runArchiveOrchestrator`, then asserts that `fs.rm` is not called for any draft path. This correctly covers the no-op branch when the draft was already consumed at start.

---

## Finding 2 — [LOW] managed.ts git add failure is non-throwing

**File**: `src/core/runtime/managed.ts:214`

**Status: FIXED**

Lines 214–216 now `throw new Error(...)` on git add failure:

```ts
if (gitAddChangeFolderResult.exitCode !== 0) {
  throw new Error(`Failed to stage change folder request.md: ...`);
}
```

The asymmetry is resolved. All three runtime paths (workspace-materializer, local, managed) now throw on git add failure, making the two-stage defense symmetric.

---

## Finding 3 — [MEDIUM] 非 canonical requestFilePath + canonical draft 共存 → canonical draft が無言で消費される

**File**: `src/core/artifact/copy-artifacts.ts:147`

**Status: FIXED**

`consumeDraft` now accepts an optional `requestFilePath?: string` parameter (line 151). Lines 155–159 check canonical equivalence:

```ts
if (requestFilePath !== undefined) {
  const flatAbs = path.join(repoRoot, dir, `${slug}.md`);
  const dirAbs  = path.join(repoRoot, dir, slug, "request.md");
  if (requestFilePath !== flatAbs && requestFilePath !== dirAbs) return;
}
```

When started from a non-canonical path, `consumeDraft` returns immediately without touching the canonical draft. All three callers (`workspace-materializer.ts:241`, `local.ts:446`, `managed.ts:268`) pass `opts.requestFilePath` to propagate this guard.
