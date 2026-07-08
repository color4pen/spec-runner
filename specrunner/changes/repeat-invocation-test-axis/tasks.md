# Tasks: test-case-gen に繰り返し実行・冪等性の導出軸を追加する

## T-01: test-case-gen prompt に繰り返し実行・冪等性の導出軸を追加する

`src/prompts/test-case-gen-system.ts` の `TEST_CASE_GEN_BASE` に、繰り返し実行・冪等性の
導出軸セクションを追加する（`## Testable Behaviors Extraction` の後、`## Summary Section (Required)`
の前あたりが自然な挿入位置）。

- [x] `TEST_CASE_GEN_BASE` に導出軸セクションを追加する。含めるべき要素:
  - [x] 全 request でこの観点の検討を強制する旨（適用可否を暗黙判断で省略しない）
  - [x] 適用トリガの明示: server / handler / 接続 / 初期化 / 資源管理系の成果物
  - [x] 該当する場合、同一操作の連続呼び出し（2 回目以降）が成功／冪等であることを検証する
        **must** TC として導出する指示
  - [x] 該当が無い場合、test-cases.md に「該当なし」を明示する指示（無言の省略を禁止する旨）
  - [x] 「該当なし」明示は自由記述の注記として書かせ、`### TC-{NNN}` 形式・Summary・Result YAML 等の
        機械 parse 対象は変更しない旨（要件 3 / D4 と整合）
- [x] 追記文言に `e2e` および ``greps `tests/`` を含めないこと（既存の負 assertion に抵触しないため）
- [x] `tests/prompts/test-case-gen-system.test.ts` に、導出軸が prompt 文字列に含まれることを固定する
      テストを追加する（既存の prompt 文字列 assertion 規約に従う）

**Acceptance Criteria**:
- `TEST_CASE_GEN_SYSTEM_PROMPT` が「繰り返し実行・冪等性」の観点、2 回目以降の呼び出しを検証する
  must TC 導出の指示、および「該当なし」明示（無言省略の禁止）の指示を含むことを、追加テストで固定している。
- 既存の `tests/prompts/test-case-gen-system.test.ts`（`not.toContain("e2e")` 等の負 assertion を含む）が
  無変更のまま green。
- spec.md の Requirement「test-case-gen prompt が繰り返し実行・冪等性の導出軸を全 request で要求する」の
  Scenario「prompt に導出軸の指示が含まれる」に対応する must TC が存在する。

## T-02: request template の受け入れ基準ガイダンスに同観点を追記する

`src/core/command/request.ts` の `buildScaffoldTemplate` が出力する scaffold の `## 受け入れ基準`
セクションのガイダンス（既存の `<!-- コツ: … -->` HTML コメント内）に、繰り返し実行・冪等性の
観点を追記する。

- [x] `## 受け入れ基準` の既存 HTML コメント内に、該当する成果物（server / handler / 接続 / 初期化 /
      資源管理系）では 2 回目の呼び出しを受け入れ基準に含める旨のガイダンスを追記する
- [x] 追記は既存 HTML コメント内に閉じ、新しい checkbox（`- [ ]`）を増やさない
      （`parseRequestMdContent` と既存 request.test.ts を壊さないため）
- [x] セクション順序・見出し（`## 背景` → `## 現状コードの前提` → `## 要件` → … → `## 受け入れ基準`）を
      変更しない
- [x] `tests/unit/core/command/request.test.ts` に、`buildScaffoldTemplate`（もしくは `executeTemplate`）
      出力に同観点ガイダンスが含まれることを固定するテストを追加する

**Acceptance Criteria**:
- `buildScaffoldTemplate(...)` / `executeTemplate(...)` の出力に、該当成果物では 2 回目の呼び出しを
  受け入れ基準に含める旨の繰り返し実行・冪等性ガイダンスが含まれることを、追加テストで固定している。
- `buildScaffoldTemplate` の出力が引き続き `parseRequestMdContent` を pass する。
- 既存の `tests/unit/core/command/request.test.ts`（セクション順序・required section の assertion を含む）が
  無変更のまま green。
- spec.md の Requirement「request template の受け入れ基準ガイダンスが同観点を案内する」の
  Scenario「template 出力にガイダンスが含まれる」に対応する must TC が存在する。

## T-03: 既存契約の不変を確認し、全体検証を green にする

- [x] `TEST_CASES_TEMPLATE`（`src/templates/step-output-templates.ts`）の機械 parse 形式・TC-ID 契約・
      must/should/could の意味を変更していないことを確認する（差分を作らない）
- [x] `bun run typecheck` が green であることを確認する
- [x] `bun run test` が green であることを確認する（新規追加テストを含む全テスト）

**Acceptance Criteria**:
- `TEST_CASES_TEMPLATE` および TC-ID 形式・must/should 区分に差分が無い（要件 3）。
- `bun run typecheck && bun run test` が green。
- 既存テストは無変更で green（本変更で追加したテストのみが新規）。
