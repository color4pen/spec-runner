# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

**コード実態の確認**

- `src/templates/step-output-templates.ts:109-116`: docstring が `Result YAML block (all keys)` を machine-parsed と主張していることを確認（request 前提と一致）
- `src/templates/step-output-templates.ts:143-154`: Result セクションコメントに所有者・書込時点・enum 意味の記述がないことを確認
- `src/core/verification/test-coverage.ts:extractMustTcIds`: 読み取り対象が `##[#]?\s+TC-\d+` heading と `**Priority**: must` / `**Category**: manual` パターンのみ。Summary セクション・Result YAML ブロックは一切 parse しないことをコードで確認
- `src/prompts/test-case-gen-system.ts:71-75`: `result` enum 意味・確定時点の定義が存在しないことを確認
- `src/prompts/test-materialize-system.ts:43`: `test-cases.md は変更禁止` はあるが Result YAML ブロックへの個別言及がないことを確認
- `src/core/step/write-scope.ts`: `GUARDED_WRITE_STEPS` に `test-materialize` が含まれ、`protectedCanonPaths` に `test-cases.md` が含まれることを確認

**既存テストとの整合**

- `tests/templates/step-output-templates.test.ts` TC-T005: `contains Result YAML keys` アサーション（result: / total: / automated: / manual: / must: / should: / could: / blocked_reasons:）が存在することを確認。提案変更（コメント内文言追加のみ）では Result YAML キー行は保持されるため無改変で green ✓
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` TC-012: `Category determination:` / `Priority determination:` / `result determination:` の不在を検査することを確認。tasks.md が日本語散文（`result` の値の意味:）での記述を明示しており、禁止文字列とは異なる形式 ✓
- `tests/unit/prompts/test-materialize-prompt-contract.test.ts` TC-003: 5 節骨格と Method 内 h2 非存在をチェックすることを確認。T-04 の追記先は `## Contract` 節の注記であり Method 節は改変されない ✓
- `tests/unit/prompts/test-materialize-manual-scope-contract.test.ts`: Method 節の manual 除外記述を検査。T-04 は Contract 節のみ変更するため影響なし ✓

**spec / design / tasks 整合性**

- request.md の要件 1–4 → spec.md の Requirement 1–4 → tasks.md T-01–T-04 の対応が確認できた
- 設計判断（D1–D4）は要件の根拠を論理的に説明しており、矛盾がない
- T-05 では既存ファイル無改変・新規ファイル追加の制約が明記されている
- セキュリティ観点: 変更対象はテンプレートコメント・LLM 向けプロンプトのテキストのみ。認証・入力バリデーション・write-scope 挙動は一切変更しない。OWASP 該当なし

**docstring 修正の実態確認（T-02 の前提）**

現 docstring の `Machine-parsed fields:` 列挙:
```
 * - TC-NNN heading format         ← extractMustTcIds が parse ✓
 * - Summary section (4 items)     ← extractMustTcIds は parse しない ✗
 * - Result YAML block (all keys)  ← extractMustTcIds は parse しない ✗
```
`extractMustTcIds` の実装から、Priority / Category が parse 対象であることを確認。現 docstring には Priority / Category の記述がない。

## 検証できなかった項目

- 新規テストファイルの実際の実装が T-05 AC を満たすかどうか（実装前のため）
- docstring 検査テストが docstring 領域を正確に抽出する実装方法（実装詳細として委ねられている）

## Findings 詳細

### F-001: T-02 の受け入れ基準が Design D3 の意図を完全に固定しない

**対象**: `spec.md` の Scenario「docstring に Result YAML の machine-parsed 記述が残っていない」/ `tasks.md` T-02 Acceptance Criteria

**観点**: 仕様の完全性

`design.md` D3 の Alternatives considered には次の記述がある:

> Summary を machine-parsed のまま残す — 却下。`extractMustTcIds` は Summary も parse しない。実態は「TC heading + Priority / Category」のみであり、docstring はそれに正確に一致させる。

設計の意図は「Summary section (4 items)」も docstring の machine-parsed 列挙から除去することである。コードで確認した通り、`extractMustTcIds` は Summary セクションを parse しないため、設計の主張は正しい。

しかし `spec.md` の Scenario の Then 節および `tasks.md` T-02 AC は:

1. `Result YAML block (all keys)` が machine-parsed とする記述の**不在**のみを固定する
2. TC-NNN heading と Priority / Category が machine-parse 対象とする記述の**存在**を固定する

「Summary section (4 items)」の**不在**を固定するテストが AC に含まれていない。実装が `Result YAML block (all keys)` だけを除去し `Summary section (4 items)` を残した場合、全 AC テストが green となるが docstring は部分的に不正確なまま残る。

**影響範囲**: 低。本変更の主旨（Result YAML の意味欠落解消）には直接影響しない。ただし設計意図（docstring を実態に「正確に一致させる」）が不完全になるリスクがある。

**対応選択肢**:
1. tasks.md T-02 AC に「`Summary section (4 items)` を machine-parse 対象とする記述が残っていないこと」を追加し、spec.md Scenario の Then 節に同条件を追記する
2. このまま進める（Summary の不正確記述は次の仕様整合タスクで対処する）

このまま進める場合でも、T-02 の実装者が tasks.md 本文の「docstring を実態に合わせる」という指示を読んで Summary も除去する可能性は高い。テスト固定がないだけであり、機能的ブロッカーではない。
