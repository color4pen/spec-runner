# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード実態の確認（request.md の現状前提と突合）

- `src/templates/step-output-templates.ts:109-116`: docstring が `Machine-parsed fields:` として `TC-NNN heading format` / `Summary section (4 items)` / `Result YAML block (all keys)` の 3 項目を列挙していることをコードで確認
- `src/templates/step-output-templates.ts:143-154`: Result セクションコメント（HTML コメント内）に所有者・書込時点・enum 意味の記述が一切ないことを確認
- `src/core/verification/test-coverage.ts:extractMustTcIds`（L99-147）: 解析対象は `^##[#]?\s+(TC-\d+)` heading と `**Priority**: must` / `**Category**: manual` の 2 パターンのみ。Summary セクション・Result YAML ブロックは一切読まないことをコードで確認（request.md 前提と一致）
- `src/core/step/test-case-gen.ts:89-99`: `resultFilePath` が `null`、`parseResult` が `NULL_PARSE_RESULT`。Result YAML の内容検査なし（request.md 前提と一致）
- `src/prompts/test-case-gen-system.ts:60-75`: `blocked_reasons` の記録形式と Result YAML 配置指示はあるが、`result` の enum 意味（completed / partial / failed）と確定時点の定義が存在しないことを確認
- `src/prompts/test-materialize-system.ts:43`: `test-cases.md は変更禁止` は Contract の write-set に記載済みだが、Result ブロック・result 欄への個別言及がないことを確認
- `src/core/step/write-scope.ts`: `GUARDED_WRITE_STEPS` に `test-materialize` が含まれ（L37）、`protectedCanonPaths` に `test-cases.md` が含まれること（L71）を確認

### spec.md ↔ tasks.md ↔ design.md の一貫性確認

- request.md 要件 1–4 → spec.md Requirement 1–4 → tasks.md T-01–T-04 の対応が全て確認できた
- spec.md Requirement 4 の Scenario Then 節: 「Result YAML block (all keys)」と「Summary section (4 items)」**両方**の不在、かつ TC-NNN heading と Priority / Category を machine-parse 対象とする記述の存在を要求している（lines 72-75）
- tasks.md T-02 AC: 同じく `Result YAML block (all keys)` と `Summary section (4 items)` の**両方の不在**をテストで固定することが明記されている（T-02 AC lines 53-59）
- design.md D3 Alternatives considered の「Summary を machine-parsed のまま残す — 却下」の意図が spec.md・tasks.md の両方に正確に反映されている

### 前回レビュー（F-001）の解消確認

spec-review-result-001.md F-001 は「spec.md と tasks.md が `Summary section (4 items)` の不在を固定していない」という指摘だった。現在のバージョンを確認したところ：

- 現 spec.md (L73-75): `「Summary section (4 items)」を machine-parsed とする記述はいずれも存在せず` を Then 節に明示
- 現 tasks.md T-02 AC: `同 docstring に \`Summary section (4 items)\` を machine-parsed とする記述が残っていないことを同テストで固定する` を明記

→ F-001 は現バージョンで解消されている。

### 既存テストとの制約整合

**TC-012（prompt-skeleton-drift-guard.test.ts）**: `result determination:` / `Category determination:` / `Priority determination:` の不在を検査する。tasks.md T-01 / T-03 は日本語散文（「`result` の値の意味:」）での記述を明示し、禁止文字列の使用を tasks で明記している ✓

**TC-T005（step-output-templates.test.ts）**: `TEST_CASES_TEMPLATE` の Result YAML キー（result: / total: / automated: / manual: / must: / should: / could: / blocked_reasons:）の存在を検査する。T-01 の追記は HTML コメント内の説明文に限定し、既存 YAML キー行を改変しない設計 ✓

**TC-003（test-materialize-prompt-contract.test.ts）**: 5 節骨格と `## Method` 節内に新規 h2 なし、の 2 条件を検査する。T-04 の追記先は `## Contract` 節の write-set 行（`test-cases.md は変更禁止` 行への注記）であり、`## Method` 節は一切変更しない ✓

**test-materialize-manual-scope-contract.test.ts**: `## Method` 節内の manual 除外記述と inner-h2 非存在を検査する。T-04 は `## Contract` 節のみ変更するため無影響 ✓

**TC-RIA-01（test-case-gen-system.test.ts）**: h3 順序（Testable Behaviors Extraction → Repeat Invocation & Idempotency Axis → Summary Section）を検査する。T-03 の追記先は `### Summary Section (Required)` の内側（line 75 付近の本文）であり、h3 見出し自体の追加・順序変更はしない ✓

### セキュリティ評価

変更対象はテンプレート HTML コメントおよび TypeScript ソース内のハードコード文字列（LLM 向けシステムプロンプト）のみ。これらはビルド時に静的に確定しユーザー入力から導出されない。

- 認証機構: 変更なし
- 入力バリデーション: 変更なし
- write-scope 検証（`src/core/step/write-scope.ts`）: `GUARDED_WRITE_STEPS`・`protectedCanonPaths` とも変更なし
- test-coverage 検査ロジック: 変更なし
- OWASP Top 10: 該当なし

## 検証できなかった項目

- T-05 で追加される新規テストファイルの実装が AC をすべて満たすかどうか（実装前のため）
- docstring 検査テストが `readFileSync` でソースを読む際に、テスト実行環境（CWD）に対する相対パス解決が正しく行われるかどうか（実装詳細として実装者に委ねられている。ただし drift-guard TC-027 が同パターン `join(__dirname, "..", "pipeline-map.ts")` を既存確立済みの先例として用いており、手法は確立されている）

## Findings 詳細

None（前回 F-001 は現バージョンで解消済み。新たなブロッカーなし）
