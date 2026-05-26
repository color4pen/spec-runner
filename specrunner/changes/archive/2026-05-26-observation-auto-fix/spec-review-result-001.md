# Spec Review Result — observation-auto-fix

## Verdict

- **verdict**: approved

## Summary

3 軸 (pipeline 拡張 + reviewer 出力 schema + CLI verdict 簡素化) の整合性が取れており、設計判断は妥当。delta spec は正規形式を満たし、後方互換リスクも特定・緩和済み。

## Review Scope

- request.md — 要件・受け入れ基準・設計判断の記述
- design.md — 設計決定 D1〜D8 の妥当性
- tasks.md — 実装タスクの完全性・具体性
- specs/pipeline-orchestrator/spec.md — delta spec 形式・requirement/scenario の妥当性
- specs/agent-output-contract/spec.md — 同上
- 既存ソースとの整合性確認 (src/core/pipeline/types.ts, src/core/step/code-review.ts, src/core/parser/review-findings.ts, src/state/schema.ts, src/prompts/)

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | consistency | design.md / tasks.md | `when` predicate の記述が二箇所で異なる。design.md D1 は `getLatestStepResult(s, STEP_NAMES.CODE_REVIEW)` ヘルパー経由 (`lastReview?.verdict`) を示すが、tasks.md Task 4 は直接 state アクセス (`reviews[reviews.length - 1]?.outcome?.verdict`) を指定している。`getLatestStepResult` がコードベースに存在するかは不明で、state schema の実際のパスは `StepRun.outcome.verdict` であり tasks.md の方が正確。 | tasks.md の実装仕様を優先する旨を design.md に注記するか、design.md D1 のコードブロックを tasks.md と統一する。実装自体は tasks.md に従えば問題なし。 | no |
| 2 | LOW | consistency | src/prompts/fragments.ts | `PIPELINE_RULES` の Verdict 表の `approved` 条件に "スコア ≥ pass_threshold... かつ CRITICAL: 0, HIGH: 0" という記述が残る。CLI 側は今後スコアを判定材料にしないが (D4)、この文言は reviewer agent に対して score-based 判断を示唆する。設計では score table は agent の思考補助として自由に使える位置付けなので実害はないが、Task 5 の prompt 更新範囲に Verdict 表の条件文の更新が含まれていないため軽微な不整合が残る可能性。 | design.md / tasks.md のスコープ外として明記するか、Task 5 に Verdict 表の条件文のトーンダウン ("スコアを参考に判断する" 等) を追加する。blocking ではない。 | no |
| 3 | LOW | testing | tasks.md (Task 2 / Task 9) | `parseFixableFindings()` の unit test が tasks.md に明示されていない。Task 2 には完了条件として期待値が列挙されているが、対応する test file の作成は指定されていない。既存パーサーにも専用 unit test がないのでプロジェクトの現状パターンと一致しているが、parser の正確性はこの変更の核心であり、実装時に test を追加するのが望ましい。 | 必須ではないが、implementer が `parseFixableFindings()` の vitest unit test を自発的に書くことを推奨する。 | no |

## AC Checklist

- [x] reviewer approve + fix 対象の observation あり → `approved-with-fixes` verdict が定義され、transition table で `code-fixer` へ遷移する行が追加される (design D1, D2, Task 1, Task 4)
- [x] fixer 適用後に `fix: true` findings が resolve される設計 — code-fixer prompt が `Fix: yes` 全消化に更新される (design D6, Task 6)
- [x] reviewer 出力に machine-readable な finding list (Fix カラム) が必須化される (design D3, D7, Task 5, delta spec agent-output-contract)
- [x] table / score / 装飾要素は agent が任意で含めて良い — prompt から削除せず、CLI 判定材料から外す設計 (design D4, D7)
- [x] `determineVerdict()` 廃止・agent verdict 直接採用に設計変更済み (design D4, Task 3)
- [x] 既存 needs-fix loop は transition table の既存行を変更しないことで保護 (design D1 / D8, Task 4)
- [x] `bun run typecheck && bun run test` — Task 9 に確認手順が明示されている

## Security Assessment

- 新規ユーザー入力経路なし。`parseFixableFindings()` は agent 生成 markdown を bounded parse するのみ。
- Prompt injection リスク: `Fix` カラム値 (`yes`/`no`) は case-insensitive の文字列比較で処理され、eval や動的コード実行なし。
- OWASP Top 10 関連変更なし。認証・認可・セッション管理に触れる変更なし。
