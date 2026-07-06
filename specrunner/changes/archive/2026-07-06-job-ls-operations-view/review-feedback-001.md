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
| 1 | low | testing | `src/core/job-list/__tests__/operations-view.test.ts:158-173` | TC-017「falls back to startedAt when endedAt absent」が `endedAt` を実際には省略せず `startedAt` と同値の文字列を渡しているため、`run.endedAt ?? run.startedAt` の `??` フォールバックパスを踏まない。テスト意図と実装が乖離している。 | `makeStepRun` を介さず `StepRun` を直接構築して `endedAt: undefined` を渡すか、`makeStepRun` に `null/undefined` を受け付けるオプションを追加する。 | no |
| 2 | low | testing | `tests/unit/cli/ps-filter.test.ts:359-393` | TC-032「checkPrMerged is invoked exactly once」を謳うが、実際のアサーションは出力文字列の確認のみで呼び出し回数を検証していない。テストコメント自身が "may or may not be called" と認めている。また、`vi.hoisted()` と `vi.mock()` が `describe` ブロック内にあり、Vitest が将来バージョンでエラーになる旨の警告を出している（verification ログに記録あり）。 | `expect(mockCheckPrMerged).toHaveBeenCalledTimes(1)` を追加し、`vi.hoisted()` / `vi.mock()` をファイルトップレベルへ移動する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.85

## Summary

実装は要件・設計・受け入れ基準をすべて満たしている。

`operations-view.ts` の純粋関数分離（D1）は正しく機能しており、I/O なしで全テストを実行できる。`categorizeStatus` のモジュール初期化時の exhaustiveness チェック（全 7 ステータスの網羅検証）は将来の `JobStatus` 追加に対するランタイム安全弁として有効。全受け入れ基準（区分表示・escalation 発生元・次アクション・`--json` キー固定・フィルタ意味維持・typecheck && test グリーン）の達成を確認した。

報告した 2 件はいずれも "should" 優先度の test quality 改善点（実装の正しさには影響しない）。ブロッカーなし。

