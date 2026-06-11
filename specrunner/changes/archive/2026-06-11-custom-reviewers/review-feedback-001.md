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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | correctness | `src/core/pipeline/compose-reviewers.ts:92` | カスタムレビューワーに `role: "reviewer"` を割り当てているため、design.md D6「専用ロール値 `"custom-reviewer"` を使用して既存インバリアントを維持する」に違反。test-cases.md TC-032（must）も `"custom-reviewer"` を期待値として指定しているが、テストは `"reviewer"` を検証しており仕様と齟齬。`StepRole` 型に `"custom-reviewer"` が存在しない（型変更未実施）。複数 reviewer 構成で「each phase has exactly one reviewer」不変条件が破れる。将来の resume/step-role 解決コードが両ロールを区別できない。 | `StepRole` に `"custom-reviewer"` を追加（`pipeline/types.ts:13`）。`compose-reviewers.ts:92` を `role: "custom-reviewer" as const` に変更。`compose-reviewers.test.ts:76-77` のアサーションを `"custom-reviewer"` に更新。 | yes |
| 2 | medium | correctness | `src/core/pipeline/reviewer-chain.ts:54` | `resolveActiveReviewer` が `endedAt` で判定しているが design.md D7 は `startedAt` を指定。加えて strict `>` による比較のため同値タイムスタンプ時は chain 前位（index 小）が残るが、設計は chain **後位（index 大）優先**を要求している。TC-028（should）がこの同値 tie-break を検証するテストケースだが `reviewer-chain.test.ts` に実装されていない。モック時刻を使うテスト環境で誤った reviewer を返す。 | `lastRun.endedAt` → `lastRun.startedAt` に変更。`>` を `>=` に変更して同値時に後続イテレーションで上書き（chain 後位が勝つ）。TC-028 テストを追加。 | yes |
| 3 | low | architecture | `src/core/command/pipeline-run.ts:96-98` | T-07「snapshot を `bootstrapJob`/`buildInitialJobState` に渡す」の設計に対し、`bootstrapJob` の port インターフェース（`runtime-strategy.ts:155`）が `reviewers` パラメータを持たず、呼び出し後に直接ミューテートしている。`bootstrapJob` が永続化を defer しているため実害はないが、port インターフェースと実装パターンが設計から乖離しており managed runtime 追加時の混乱要因になりうる。 | `RuntimeStrategy.bootstrapJob` signature に `reviewers?` を追加し `buildInitialJobState` へ渡す。または現ミューテーション手法に意図を明示するコメントを追記する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 6 | 0.30 |
| security | 8 | 0.25 |
| architecture | 7 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 7.25

## Summary

`typecheck && test` green（4289 tests pass）で受け入れ基準の "must" 項目はほぼ網羅されている。コアの機能実装（JUDGE_REPORT_TOOL identity 再利用・buildReviewerChainTransitions によるリテラル除去・composeReviewerDescriptor・load-time validation・snapshot 永続化）は設計に沿っており品質が高い。

ブロッキング項目は 2 件：

1. カスタムレビューワーの role 値が `"reviewer"` で登録されており、design.md D6 が明示する `"custom-reviewer"` 要件と TC-032（must 優先）仕様に反する。`StepRole` 型変更・compose ロジック修正・テストアサーション修正が必要。

2. `resolveActiveReviewer` が `endedAt`（設計は `startedAt`）で判定し、同値タイムスタンプ時の tie-break 方向が設計逆（前位優先になる）。TC-028 テストも未実装。

Finding 3（`bootstrapJob` のミューテーションパターン）は機能的に安全だが、アーキテクチャ整合性のため修正を推奨する。
