# Regression Gate Result — Iteration 002

## Evidence

**Checked**: 4 findings from the ledger
**Skipped**: 0
**Unverified**: 0

---

## Finding 1: [LOW] isToolUse 返り値型に id が含まれず T-04 の実装ガイダンスが曖昧

**Status**: FIXED — no regression

- `src/adapter/claude-code/message-types.ts` line 35: `isToolUse` narrowed `content_block` type now includes `id?: string`.
- `specrunner/changes/step-timeout-last-progress/tasks.md` T-03 third bullet explicitly documents both options ("Extend `isToolUse`'s narrowed `content_block` type to include `id?: string`… Alternatively, cast…").

---

## Finding 2: [LOW] T-03 → T-04 のタスク依存順序が未記載

**Status**: FIXED — no regression

- `tasks.md` T-04 line 44: `**前提: T-03 完了** (T-03 must be complete before T-04 — isToolResult and cb.id access are required by this task.)` added.

---

## Finding 3: [LOW] TC-017 (step:progress still emitted) has no explicit test assertion

**Status**: FIXED — no regression

- `src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts` TC-005 describe block (line 159) uses `emitSpy` and asserts `expect(emitSpy).toHaveBeenCalledWith("step:progress", expect.objectContaining({ tool: "Bash" }))` (line 185).

---

## Finding 4: [LOW] TC-017 step:progress assertion covers main loop only (postWork and repair sites untested)

**Status**: FIXED — no regression

- Two new describe blocks added to the test file:
  - Lines 274–313: "TC-017 (site 2): step:progress emitted during postWork follow-up turn" — asserts `emitSpy` called with `step:progress` in the postWork path.
  - Lines 320–371: "TC-017 (site 3): step:progress emitted during output-repair turn" — asserts `emitSpy` called with `step:progress` in the repair path.

---

## Verdict

No regressions. All four LOW findings remain fixed in the current code.
