# Regression Gate Result — Iteration 001

**Slug**: codex-scope-guidance
**Branch**: feat/codex-scope-guidance-7377ae6d
**Date**: 2026-08-26

## Ledger Verification

### Finding [1]: `fd1df408` — TC-012 (pure constant module invariant) has no dedicated runnable test task

**Status**: FIXED — no regression

**Evidence**:
`tests/adapter/codex/scope-guidance-provider-isolation.test.ts` lines 103–132 contains a dedicated
`describe("TC-012: scope-guidance.ts is a pure constant module with no imports", ...)` block that:
- Reads `src/adapter/codex/scope-guidance.ts` via `fs.readFile`
- Scans every line for lines starting with `import `, `import(`, or `require(`
- Fails with file:line detail listing if any violation is found
- The checkbox `- [x] test (TC-012)` in `tasks.md` is marked completed

`src/adapter/codex/scope-guidance.ts` itself contains zero import or require statements (only a
JSDoc block comment + a single `export const CODEX_SCOPE_GUIDANCE: string = ...`), so the test
passes in green and would turn red if an import were added.

**Verdict**: Finding is resolved. Not a regression.

---

### Finding [2]: `d4e71b86` — TC-013 (must): no automated test verifies CODEX_SCOPE_GUIDANCE value against canonical spec text

**Status**: FIXED — no regression

**Evidence**:
`tests/adapter/codex/scope-guidance-provider-isolation.test.ts` lines 207–241 contains a dedicated
`describe("TC-013: CODEX_SCOPE_GUIDANCE value matches canonical spec text exactly", ...)` block that:
- Reads `specrunner/changes/codex-scope-guidance/spec.md` via `fs.readFile`
- Locates the first ` ```text ` … ` ``` ` fence (the canonical guidance block that begins with
  `SpecRunner execution guidance:`)
- Sanity-checks that the extracted block starts with the expected header line
- Asserts `expect(CODEX_SCOPE_GUIDANCE).toBe(canonicalText)` — strict character-for-character equality
- Does not re-state the literal (imports `CODEX_SCOPE_GUIDANCE` from `../../../src/adapter/codex/scope-guidance.js`)

This is exactly the "reads spec.md, extracts the canonical guidance block, and asserts strict
equality against CODEX_SCOPE_GUIDANCE" test prescribed by the finding. Future edits to
`scope-guidance.ts` that change the guidance text will cause this test to fail.

**Verdict**: Finding is resolved. Not a regression.

---

## Summary

| Ref | Severity | Title | Status |
|---|---|---|---|
| `fd1df408` | LOW | TC-012 no dedicated runnable test task | Fixed — not a regression |
| `d4e71b86` | MEDIUM | TC-013 no spec-equality test | Fixed — not a regression |

**Regressions**: 0
**Evidence**: 2 checked, 0 skipped, 0 unverified
