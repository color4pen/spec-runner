# Tasks: test-cases.md の Result YAML の所有権を test-case-gen に固定する

<!--
実装順序の指針:
  T-01（テンプレート Result コメント）→ T-02（テンプレート docstring）→ T-03（gen prompt）→
  T-04（materialize prompt）→ T-05（最終検証）。
不変条件: Result YAML の schema（キー集合）・write-scope 検証・test-coverage 検査・Summary 形式は変更しない。
既存の test-cases.md 関連テスト（テンプレート形式・coverage 検査）は無改変で green を保つこと。
新規テストは既存テストファイルを改変せず、別ファイルに追加すること。

enum 意味の統一定義（T-01 / T-03 で同一に使う）:
  completed = 全 TC の設計が完了し blocked_reasons が空
  partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  failed    = 生成自体が成立しなかった

禁止文字列（prompt-skeleton-drift-guard.test.ts TC-012 を赤にする）:
  "Category determination:" / "Priority determination:" / "result determination:"
  → enum 意味は日本語散文（例:「`result` の値の意味:」）で記述し、これらの文字列を使わないこと。
-->

## T-01: TEST_CASES_TEMPLATE の Result ブロックコメントに所有権・書込時点・enum 意味を追記する

- [ ] `src/templates/step-output-templates.ts` の `TEST_CASES_TEMPLATE`（117-163 付近）の
      Result セクション要求コメント（`Result section MUST appear at the very end...` の HTML コメント内、
      143-154 付近）に、次を明記する:
      - 所有者: Result YAML は **test-case-gen** によるテストケース生成の結果記録である。
      - 書込時点: 生成時に**一度だけ**書かれ、後続ステップ（test-materialize を含む）は更新しない。
      - `result` の値の意味（統一定義を使用）:
        `completed` = 全 TC の設計が完了し `blocked_reasons` が空 /
        `partial` = 一部 TC が設計不能で `blocked_reasons` に記録あり /
        `failed` = 生成自体が成立しなかった。
- [ ] 既存の Result YAML キー行（`result:` / `total:` / `automated:` / `manual:` / `must:` / `should:` /
      `could:` / `blocked_reasons:`）と Summary セクション形式は改変しない（追記は HTML コメント内の説明文に限定）。
- [ ] 禁止文字列 `result determination:`（および `Category determination:` / `Priority determination:`）を
      導入しない。

**Acceptance Criteria**:
- `TEST_CASES_TEMPLATE` の Result ブロックコメントに所有者（test-case-gen）・書込時点（生成時に一度）・
  `completed` / `partial` / `failed` の意味が含まれることを、新規テンプレート文言テストで固定する。
- 既存テスト `tests/templates/step-output-templates.test.ts` の「contains Result YAML keys」および
  Summary 関連アサーションが**無改変で green**。
- `prompt-skeleton-drift-guard.test.ts` TC-012（`result determination:` 等の非存在）が**無改変で green**。

## T-02: TEST_CASES_TEMPLATE の docstring を machine-parse の実態に整合させる

- [ ] `src/templates/step-output-templates.ts:109-116` の `TEST_CASES_TEMPLATE` 直前 docstring の
      `Machine-parsed fields:` 列挙から `Result YAML block (all keys)` を除去する。
- [ ] docstring を実態に合わせる: machine-parse 対象は `### TC-NNN` heading と `**Priority**` / `**Category**`
      フィールドである（`src/core/verification/test-coverage.ts` の `extractMustTcIds` が消費）。
      Result YAML は pipeline で parse されない旨を注記する。
- [ ] docstring はコメントであり runtime 値に現れないため、検査は source テキスト読取りで行う（T-05 の新規テスト）。

**Acceptance Criteria**:
- `TEST_CASES_TEMPLATE` 直前の docstring に `Result YAML block (all keys)` を machine-parsed とする記述が
  残っていないことを、source テキストを `readFileSync` で読む新規テストで固定する。
- 同 docstring に TC-NNN heading と `Priority` / `Category` を machine-parse 対象とする記述が含まれることを
  テストで固定する。
- `typecheck` が green（docstring 変更のみ、export・型は不変）。

## T-03: test-case-gen system prompt に result の enum 意味と確定規則を追記する

- [ ] `src/prompts/test-case-gen-system.ts` の `TEST_CASE_GEN_BASE` に、Result YAML の `result` について
      次を散文で明記する（Result YAML の配置指示がある `## Method` 内の Summary Section 付近、75 行付近）:
      - `completed` / `partial` / `failed` の意味（T-01 と同一の統一定義）。
      - 確定規則: Result YAML は**生成完了時点で確定**し、後続ステップは書き換えない。
- [ ] 既存の 5 部構成骨格（`## Question` / `## Contract` / `## Method` / `## Evidence` / `## Completion`）と
      各節の順序、および既存 `### Testable Behaviors Extraction` → `### Repeat Invocation & Idempotency Axis`
      → `### Summary Section (Required)` の h3 順序を変えない。
- [ ] 禁止文字列 `result determination:` を使わない。

**Acceptance Criteria**:
- `TEST_CASE_GEN_SYSTEM_PROMPT` に `completed` / `partial` / `failed` の意味と
  「生成完了時点で確定し後続ステップは書き換えない」旨が含まれることを、新規 prompt contract テストで固定する。
- `prompt-skeleton-drift-guard.test.ts` の 5 節見出し・順序アサーション（TC-001）が**無改変で green**。
- 既存 `tests/prompts/test-case-gen-system.test.ts` の h3 順序テスト（TC-RIA-01）が**無改変で green**。

## T-04: test-materialize system prompt に Result YAML の実装完了後非更新を追記する

- [ ] `src/prompts/test-materialize-system.ts` の `TEST_MATERIALIZE_BASE` の `## Contract` 節、write-set の
      `test-cases.md は変更禁止` 行（43 付近）の注記として、次を明記する:
      test-cases.md 末尾の Result YAML は test-case-gen が**生成時に一度書いた記録**であり、
      テスト実装の完了状態を反映するフィールドではない。**実装完了後も更新しない**。
- [ ] 追記は `## Contract` 節内に置き、`## Method` 節に新規 h2 見出しを追加しない。5 部構成骨格
      （Question / Contract / Method / Evidence / Completion）と順序を保つ。
- [ ] リポジトリ固有パス（`architecture/` 等）を導入しない。

**Acceptance Criteria**:
- `TEST_MATERIALIZE_SYSTEM_PROMPT` に「Result YAML は生成時の記録であり、実装完了後も更新しない」旨が
  含まれることを、新規 prompt contract テストで固定する。
- 既存 `tests/unit/prompts/test-materialize-prompt-contract.test.ts` および
  `tests/unit/prompts/test-materialize-manual-scope-contract.test.ts` の 5 節骨格・inner-h2 非存在・
  `architecture/` 非参照アサーションが**無改変で green**。

## T-05: 検証テストを追加し、フルスイートを green にする

- [ ] 新規テストファイルを追加する（既存テストファイルは改変しない）:
      - テンプレート Result コメント文言テスト + docstring 実態整合テスト（T-01 / T-02 を固定）。
        docstring テストは `src/templates/step-output-templates.ts` の source を読み、`TEST_CASES_TEMPLATE`
        直前の docstring 領域を検査する。
      - test-case-gen prompt contract テスト（T-03 を固定）。
      - test-materialize prompt contract テスト（T-04 を固定）。
- [ ] 追加テストは対応するソース変更前は赤、変更後に green になること（TDD の red→green を満たす）。
- [ ] リポジトリ全体で `typecheck && test` を実行し green を確認する。既存の test-cases.md 関連テスト
      （テンプレート形式・coverage 検査・drift-guard）が**無改変で green** であることを確認する。

**Acceptance Criteria**:
- 新規テストが T-01〜T-04 の受け入れ基準（所有者・書込時点・enum 意味・確定規則・非更新・docstring 実態）を
  すべて機械的に固定している。
- `typecheck` が green。
- `test`（フルスイート）が green。既存の test-cases.md 関連テストは無改変で green のまま。
