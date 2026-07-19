# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Summary

設計・仕様・タスクは一貫しており、根本原因の分析と修正方針が正確。エンジン（`runInternal`）に閉じた修正が standard / parallel 両経路を同時に塞ぐ構造は正しい。受け入れ基準は機械検証可能な形で揃っている。セキュリティ上の懸念なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|

## Observations（非ブロッキング）

### O1: `regression-gate` approved + fixable + budget-exhausted に専用テストが無い

**対象**: `specrunner/changes/approved-not-overturned-by-fixer-budget/tasks.md`

`buildParallelReviewerTransitions` には `regression-gate → code-fixer`（findings-routing）行も存在する（reviewer-chain.ts:434-447）。エンジンレベルの修正はテーブル駆動のため `regression-gate` ケースも同一ロジックで処理されるが、T2 は `code-review` in parallel config のみを対象とする。エンジン機構は T2 の green で間接的に確認されるため実害は低い。

### O2: T-03 の挿入位置「366〜418 の間」が terminal check をまたぐ

**対象**: `specrunner/changes/approved-not-overturned-by-fixer-budget/tasks.md`（T-03）

`pipeline.ts:366` が `nextStep` 確定、370-416 が terminal check、418 が episode reset。「366〜418 の間」は terminal check をまたぐ。再 routing 条件は terminal 値に対して自明に偽のため前後どちらでも正しく動く。ただし terminal check の後（line 417 直後）に置く方が「非 terminal nextStep にのみ走る」意図が明確。

### O3: `fixerNames` の Set 生成が複数箇所になる

**対象**: `src/core/pipeline/pipeline.ts`

既存 exhaustion 検査（line 493）と、line 455 付近でも `const fixerNames = new Set(Object.values(this.loopFixerPairs))` が生成されている。T-03 の再 routing ロジックでも同じ Set が必要になり、生成が増える。`runInternal` の先頭で一度ホイストすると DRY になる。
