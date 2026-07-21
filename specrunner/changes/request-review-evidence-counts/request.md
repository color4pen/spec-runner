# request-review の完了契約に evidence counts を追加し、確認ゼロの approve を非 green にする

## Meta

- **type**: spec-change
- **slug**: request-review-evidence-counts
- **base-branch**: main
- **adr**: false

## 背景

judge 系 step の typed 完了契約には evidence counts（checked / skipped / unverified）が必須化され、checked=0 は escalation として機械的に非 green になる。しかし request-review は専用の report tool を使っており、evidence フィールドが**存在しない**。このため「何も検証せず findings: [] を返す」request-review が approve として素通りする経路が残っている。

request-review は pipeline の入口 gate（正典の確定判定）であり、確認ゼロの approve が最も危険な step の一つである。他の judge 系と同じ evidence 規律を適用する。

## 現状コードの前提

- `src/core/step/report-tool.ts:231-242` — `REQUEST_REVIEW_REPORT_TOOL` の zodSchema は ok / reason / verdict / findings / observations のみで evidence フィールドが無い
- `src/core/step/report-tool.ts` — `JUDGE_REPORT_TOOL` には evidenceSchema（checked / skipped / unverified の非負整数）と「REQUIRED when ok=true」の記述・parse 強制が導入済み。`parseEvidence` は `src/core/port/report-result.ts` に存在する
- `src/core/step/judge-verdict.ts` — `deriveRequestReviewVerdict` は findings と ok から approve / needs-discussion / reject を導出する（evidence 概念なし）
- `src/prompts/judge-rules.ts` — `EVIDENCE_COUNTS_DEFINITION`（記入指示の単一ソース fragment）が存在し、judge 系 prompt の Completion 節に注入済み。request-review prompt には未注入
- 後方互換の前例: evidence 欠落の旧 record は再評価せず、新規報告のみ必須とする（typed-evidence-gate と同方式）

## 要件

1. `REQUEST_REVIEW_REPORT_TOOL` に evidence フィールドを追加し、ok=true の新規報告で必須とする（parse で強制。欠落は完了として受理しない）。
2. `deriveRequestReviewVerdict` を拡張し、evidence が存在して `checked === 0` の場合は findings の内容に関わらず **approve にしない**（needs-discussion として扱い、理由に検証実績ゼロを明示する）。evidence 未定義（legacy 経路）は従来導出。
3. request-review の system prompt の Completion / Output 節に `EVIDENCE_COUNTS_DEFINITION` を注入する（単一ソース。文言の複製をしない）。
4. 後方互換: 旧 record の再評価はしない。resume 等で旧 record を読む経路は evidence 欠落を許容する。

## スコープ外

- checked の内容の真正性検証（anchor 照合は別 request）
- request-generate / producer 系への evidence 拡張
- verdict 3 値（approve / needs-discussion / reject）の意味変更

## 受け入れ基準

- [ ] `checked: 0` + `findings: []` の request-review 完了が approve にならない（needs-discussion になる）ことをテストで固定する
- [ ] `checked > 0` + `findings: []` は従来どおり approve であることをテストで固定する
- [ ] evidence フィールド欠落の新規報告が完了として受理されないことをテストで固定する
- [ ] 旧形式 record を含む state の読み取りが正常動作することをテストで固定する
- [ ] request-review の system prompt 出力に evidence 記入指示が含まれ、その文言が judge-rules.ts の単一ソース由来であることをテストで固定する
- [ ] 修正前の挙動（evidence なしで approve）に戻すと該当テストが fail することを破壊確認として記録する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: checked=0 → needs-discussion**。request-review の escalation 相当は needs-discussion（人間判断ルート）であり、既存 3 値の意味を保ったまま典型 judge の checked=0 → escalation と同型に揃える。
- **採用: JUDGE_REPORT_TOOL と同じ parseEvidence / evidenceSchema / EVIDENCE_COUNTS_DEFINITION を再利用**。専用実装や文言複製を作らない（単一ソース原則）。
- **却下: request-review だけ evidence を任意にする** — 入口 gate の確認ゼロ approve は正典弱化が全下流 gate を素通りする起点であり、他 judge より緩くする理由がない。
