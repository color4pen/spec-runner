# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | maintainability | `src/adapter/claude-code/agent-runner.ts` | `ClaudeCodeRunner` constructor (line 133) still uses `sdkQuery as unknown as QueryFn` directly instead of reusing the now-exported `defaultQueryFn`. Intentional per TC-003 (adapter-internal usage is B-2 compliant), but causes the cast to appear twice in the same file. | (Non-blocking) Consider `this.queryFn = deps._queryFn ?? defaultQueryFn;` inside `ClaudeCodeRunner` to eliminate the duplicate cast; requires confirming no test relies on the constructor's direct `sdkQuery` reference. Out of scope for this refactoring. | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.9

## Summary

実装はデザイン（D1/D2/D3）に完全準拠。変更は最小限（3ファイル、実質 +3 / -5 行の src 変更）で目的を達成している。

**受け入れ基準の確認：**
- `src/core/` への `@anthropic-ai/*` 直 import なし → ✅（local.ts line 15 が adapter 経由に置換済み）
- `arch-allowlist.ts` R2 (B-2) エントリ削除 → ✅（B-2 セクションコメントごと削除）
- B-2 arch test green → ✅（`core-invariants.test.ts` 3281 tests passed）
- `queryFn` 注入 seam 維持 → ✅（`LocalRuntimeOptions.queryFn?: QueryFn` 不変、constructor デフォルトが `defaultQueryFn` に差し替え）
- verification 全 phase green → ✅（build/typecheck/test/lint 全 exit 0）

**テストカバレッジ確認（test-cases.md）：**
- must 16件：全件充足
- TC-014 の ratchet 機能確認：`core-invariants.test.ts` line 446-462 の regression guard test が B-2 allowlist empty 状態で正しく新規違反を検出することを確認
- T-04 regression guard の B-2 suppression 例を B-6 に差し替えた変更も適切（B-2 allowlist が空になったため旧例が成立しなくなるのを正しく対処）

唯一の非ブロッキング観察：`ClaudeCodeRunner` constructor が `defaultQueryFn` を使わず `sdkQuery` を直参照している。これは TC-003 で意図的に維持することが指定されており、adapter 内部の使用は B-2 対象外のため問題なし。
