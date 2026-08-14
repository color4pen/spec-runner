# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

**Diff scope**: `git diff main...HEAD --stat` で 20 ファイル確認。  
**実装ファイル（14 件）を全件精読**:
- `src/core/pipeline/types.ts` — STANDARD_TRANSITIONS 49→52 行、行順序・guard 付き先頭確認
- `src/core/pipeline/spec-observation.ts` — 3 predicate 全件（specFixerObservationForward / specFixerNeedsFixForward / specReviewNeedsFixIsTcOnly）
- `src/core/pipeline/test-gen-exemption.ts` — rename 追随（specFixerForwardsToImplementer の import 先変更）
- `src/core/step/judge-verdict.ts` — deriveSpecReviewVerdict の priority 4a/4b/4c ロジック、ConformanceFixTarget 型制約
- `src/core/step/canon-escalation.ts` — testCaseGenEffectiveFixer 追加
- `src/core/step/canon-write-scope.ts` — writableByFixer map への test-case-gen エントリ追加
- `src/core/step/spec-review.ts` — reads() 条件分岐（isTestGenRequired）
- `src/core/step/test-case-gen.ts` — buildMessage の TC findings 注入ロジック
- `src/prompts/spec-review-system.ts` — test-cases.md 入力追加、TC照合観点（step 5）追加
- `src/prompts/test-case-gen-system.ts` — 振る舞いレベル記述指示、tasks.md 委譲メモ指示
- `src/prompts/conformance-system.ts` — **スコープ外変更を検出**（後述）
- `src/kernel/report-result.ts` — FixTarget への "test-case-gen" 追加
- `src/core/step/code-fixer.ts` — severity 分別指示追加（code-review operator adoption 追随）
- `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts` — 1471 行、TC カバレッジ確認

**Acceptance criteria 12 件を全件テスト対応確認**:  
design.md の受け入れ基準 AC-01〜AC-12 を test-cases.md の TC-001〜032 にマッピングし、専用テストファイルの describe ブロックを突き合わせた。

**STANDARD_TRANSITIONS 行数**: `types.ts` の assert で 52 を確認。

**typecheck && test GREEN**: 前回イテレーション検証済み。

## 検証できなかった項目

- conformance-system.ts の変更が PR #992（conformance-canon-tiers）の diff と完全に一致するかの行単位の再確認（main 側の該当ファイルを直接読まなかった）。ただし削除テスト TC-001〜007 の内容と、現行プロンプトの記述から変更の方向性は特定済み。
- 実際の agent 実行による end-to-end 動作（integration test 相当は pipeline 単体テストで代替）。

## Findings 詳細

### HIGH — conformance-system.ts スコープ外変更

main commit `8172940ab` ("conformance の正典に格差を付ける: request/spec は規範、design/tasks は計画 #992") で確立した normative/plan 二層格差が本ブランチで差し戻されている。

具体的な変更:
1. **normative/plan anchor 文字列の削除**: `[[NORMATIVE]]` / `[[PLAN]]` の宣言が消えた
2. **checkbox 完了性 gate の追加**: 「tasks.md の checkbox 完了を確認する」という明示 gate が追加された（TC-007 が禁止していた挙動）
3. **pin テスト TC-001〜007 全件削除**: `tests/unit/core/step/conformance.test.ts` から conformance-canon-tiers の 7 件が削除された

design.md のスコープ定義:
> "conformance の変更は機械的追随のみ — CanonWriteScope への test-case-gen 追記"

CanonWriteScope への追記は `canon-write-scope.ts` で実施済み。`conformance-system.ts` へのプロンプト変更・テスト削除はこのスコープを超えている。

修正: `conformance-system.ts` を main HEAD の内容に戻し、`conformance.test.ts` の TC-001〜007 を復元する。

---

### MEDIUM — buildTestCaseGenInitialMessage のメッセージ全体 wrap 漏れ

design D5:
> "spec-fixer の pattern に倣い、メッセージ全体を `<user-request>` で wrap する"

現実装では `requestContent` のみが `<user-request>` タグ内に入っており、slug / branch / specReviewFindingsBlock はタグ外に置かれている。spec-fixer の `buildSpecFixerInitialMessage` は全コンテキストをひとつのブロック内に格納しており、D5 の意図するパターンと一致していない。

プロンプトインジェクション耐性の観点から、findings block が `<user-request>` 外に出ると外部データ（judge 報告）がシステムコンテキストと混在するリスクがある。実害は限定的だが D5 の明示仕様違反。

修正: `buildTestCaseGenInitialMessage` の返却文字列全体を `<user-request>...</user-request>` で囲む。

---

### LOW — TC-013 の pin テスト欠落

TC-013（should priority）「免除 type (`request-review`) の spec-review 入力に test-cases.md が含まれない」に対応するテストが専用テストファイルに存在しない。

`spec-review.ts` の `reads()` 実装は正しい（`isTestGenRequired(state.request.type)` で分岐）。ただし免除パスの回帰防止が未担保。

修正: `request.type = "request-review"` で `reads()` を呼んだとき `test-cases.md` が含まれないことを確認する 1 テストを追加する。
