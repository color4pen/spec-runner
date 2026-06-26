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
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | `src/core/command/__tests__/resume-hard-crash.test.ts` | `makeJobState` が stale state に `resumePoint: undefined` を使い、running state に `resumePoint: null` を使っている。`resume.ts` の `?? null` 正規化で意味上は同一だが表記が不一致。 | 統一するなら `undefined` → `null` に揃える（または omit のまま）。挙動に影響しないため任意。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.75

## Summary

### 変更概要

`resolve-step.ts` に `stateStep` フォールバックパラメータを追加し、`resume.ts` の旧プリガードを削除して `state.step` を渡す形に変更。hard crash 後も inbox 自動回復が 1 サイクルで完了するようになった。

### 評価

**実装**: 最小差分で正確。`ALL_STEP_NAMES_SET.has(stateStep)` による membership check が `"init"` を正しく排除し、解決優先順序 `--from → resumePoint.step → state.step` を単一箇所（`resolveResumeStep`）に集約している。`resumeContext` は D4 通り `undefined` のまま（cosmetic のみ）。

**テスト**: 全受け入れ基準を網羅。resolve-step.test.ts（5 分類 × 複数ケース）+ resume-hard-crash.test.ts（wiring 検証）+ run-inbox.test.ts（T-05: 1 サイクル回復 + crash-loop boundary）+ resume.test.ts（TC-RESUME-005 更新）の 4 層で固定されており、退行面も小さい。

**軽微な指摘**: テストデータ内の `resumePoint: undefined` / `null` 表記揺れ（info, 動作影響なし）のみ。

**verification**: build ✓ · typecheck ✓ · test 5566/5566 ✓ · lint ✓

