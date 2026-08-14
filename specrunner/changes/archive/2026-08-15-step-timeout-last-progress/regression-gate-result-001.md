# Regression Gate Result — step-timeout-last-progress — Iteration 1

## Evidence

All four ledger findings were verified against the current branch HEAD.

### Finding 1 — [LOW] isToolUse 返り値型に id が含まれず T-04 の実装ガイダンスが曖昧

**Status: FIXED (no regression)**

`src/adapter/claude-code/message-types.ts` line 35:
```
content_block: { type: "tool_use"; name: string; id?: string; input?: Record<string, unknown> }
```
`id?: string` is present in the narrowed return type of `isToolUse`. `tasks.md` T-03 also carries the explicit bullet: "Extend `isToolUse`'s narrowed `content_block` type to include `id?: string`…"

### Finding 2 — [LOW] T-03 → T-04 のタスク依存順序が未記載

**Status: FIXED (no regression)**

`tasks.md` T-04 header now reads:

```
**前提: T-03 完了** (T-03 must be complete before T-04 — `isToolResult` and `cb.id` access are required by this task.)
```

Dependency ordering is explicit.

### Finding 3 — [LOW] TC-017 (step:progress still emitted) has no explicit test assertion

**Status: FIXED (no regression)**

`src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts` TC-005 (line 179):
```typescript
expect(emitSpy).toHaveBeenCalledWith("step:progress", expect.objectContaining({ tool: "Bash" }));
```
The spy assertion pins step:progress emission at the main work loop site.

### Finding 4 — [LOW] TC-017 step:progress assertion covers main loop only (postWork and repair sites untested)

**Status: FIXED (no regression)**

Two new describe blocks were added to the same test file:
- Lines 268–308: `TC-017 (site 2)` — asserts `emitSpy` received `step:progress` during a postWork follow-up turn.
- Lines 314–365: `TC-017 (site 3)` — asserts `emitSpy` received `step:progress` during an output-repair turn.

Both postWork and repair observation sites are now individually exercised with explicit assertions.

## Summary

No regressions detected. All four findings are resolved in the current code.
