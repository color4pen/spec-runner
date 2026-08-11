# Regression Gate Result — detach-start-ack — Iteration 1

## Evidence

| # | Finding | File | Status | Evidence |
|---|---------|------|--------|----------|
| 1 | [MEDIUM] T-06（統合テスト）が tasks.md に存在しない | tasks.md | **FIXED** | T-06 section is present (lines 73–83) with all checklist items `[x]`. Test placed in `detach-integration.test.ts`. |
| 2 | [LOW] spawn 失敗 Scenario が spec.md に存在しない | spec.md | **FIXED** | "Scenario: spawn failure does not hang the parent" exists at lines 65–70 with explicit `onError` / `handle.pid === undefined` coverage. |
| 3 | [MEDIUM] T-06（統合テスト）が存在しない（duplicate of #1） | tasks.md | **FIXED** | Same as #1. |
| 4 | [MEDIUM] Open Questions が未確定のまま | design.md:247 | **FIXED** | Lines 247–252: "N = 40 lines (operator-confirmed)" and "200 ms (operator-confirmed)" are both committed with seam-pin instructions. |
| 5 | [LOW] spawn 失敗 Scenario が存在しない（duplicate of #2） | spec.md:50 | **FIXED** | Same as #2. |
| 6 | [LOW] spec-fixer-deferred コメントが解消済み問題を参照 (stale) | design.md:257 | **FIXED** | File is 255 lines; the HTML comment no longer exists. |
| 7 | [LOW] Stale inline comment 'detach exits immediately' | src/cli/command-registry.ts:422 | **FIXED** | Line 422 now reads `// --detach + --json are mutually exclusive (detach waits for registration, no JSON contract)`. "exits immediately" wording is gone. |

## Checked: 7 / Skipped: 0 / Unverified: 0
