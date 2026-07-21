# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` で変更範囲を確認（37 ファイル変更、主に prompts / templates / step / tests）
- `bun run typecheck` を実行し green を確認（型エラー 0 件）
- `bun run test` を実行し全 green を確認（566 test files、7918 passed、1 skipped）
- `src/core/step/judge-verdict.ts` / `src/core/step/__tests__/judge-verdict.test.ts` の diff が 0 件であることを確認（routing 不変）

**受け入れ基準の grep 確認**:
- judge prompt / initial message / template における `required for machine parsing` / `The file MUST contain a verdict line` / `The verdict line MUST be exactly` → 全ソースファイルで 0 件（テストの assert 文字列のみ）
- `PIPELINE_RULES` における `Score / Weight / Total / Convergence Trend / plateau` → 0 件
- `src/prompts/fragments.ts` における `本番障害、データ損失` など severity 文言 → 0 件

**実装内容の確認**:
- `src/prompts/judge-rules.ts`：`SEVERITY_DEFINITION`（4 段）/ `REQUEST_REVIEW_SEVERITY_DEFINITION`（3 段）を新設、`VERDICT_BLOCKING_RULES` の findings-priority 但し書きを削除、blocking rules 本体を保持することを確認
- `src/prompts/fragments.ts`：`PIPELINE_RULES` から Scoring（Score 基準 / Weight / Total）/ Iteration Comparison / Convergence Trend / Findings Format / Severity 表を全削除、Categories / Verdict / VERDICT_BLOCKING_RULES 埋め込みを保持することを確認
- 全 6 judge system prompt のソースを読み、verdict 行指示・hardcoded severity bullet が 0 件、`${SEVERITY_DEFINITION}` 埋め込みが存在することを確認（code-review / spec-review / conformance / regression-gate / custom-reviewer は `SEVERITY_DEFINITION`、request-review は `REQUEST_REVIEW_SEVERITY_DEFINITION`）
- 全 4 result template が evidence report 形式（`## 検証した項目` / `## 検証できなかった項目` / `## Findings 詳細`）に再定義され、verdict placeholder / 7 列表 / Scores 表が削除されていることを確認
- `CodeReviewStep.outputContracts` が 7 列表チェックを持たず evidence セクション存在チェック（`##\s+検証した項目` / `##\s+検証できなかった項目`、policy: "follow-up"）に置換されていることを確認
- `tests/helpers/pipeline-mock-client.ts` の judge result md 生成が evidence report 形式（`## 検証した項目` / `## 検証できなかった項目` セクション付き）に更新されていることを確認
- 新設テスト `src/core/step/__tests__/verdict-channel-unification.test.ts`（TC-001〜TC-019）を読み、全ての must シナリオに対応するアサーションが存在することを確認
- 各 initial message builder（code-review / conformance / custom-reviewer / regression-gate）の出力に verdict 行指示が存在しないことを確認

## 検証できなかった項目

None

## Findings 詳細

None（指摘なし）

## Findings

<!-- 注: このテーブルは旧パイプライン gate（7 列表チェック）を通過するための互換用途。
     findings の正は上記 report_result（typed）である。-->

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

---

**補足観察（verdict に影響しない）**:

`src/prompts/conformance-system.ts` の `CONFORMANCE_BASE` は `## Completion` という見出しの下に `${SEVERITY_DEFINITION}` と `${DECISION_NEEDED_DEFINITION}` を置いている。`buildSystemPrompt` は後置の `COMPLETION_DIRECTIVE`（これも `## Completion` heading を持つ）を append するため、rendered prompt に `## Completion` 見出しが 2 箇所現れる。ただし:

- これは本変更の導入ではなく、変更前から `COMPLETION_DIRECTIVE` が append されている既存構造（pre-existing）
- 前置セクションは定義（severity / resolution）のみを含み、後置の `COMPLETION_DIRECTIVE` が実際の完了指示を担うため機能は正しい
- テストは green であり routing 不変が確認されている

対処は後続の「5 部構成骨格への再構成」（scope 外）で行うのが適切であり、本 request のスコープ内での修正は不要。

