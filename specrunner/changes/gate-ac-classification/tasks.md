# Tasks: TC 分類への gate カテゴリ導入

## 全体制約（全タスク共通）

- 既存 manual 除外の挙動を byte 単位で不変に保つ。`extractMustTcIds` の manual 判定パス
  （`categoryManualRe` / `currentIsManual` / `flushCurrent` の manual 条件）は改変しない。gate は並列に追加する。
- 除外の判定点は `extractMustTcIds` の 1 箇所のままとする。`evaluateTestCoverage` / 各消費者に第二の除外判定を
  追加しない。
- 走査方式・assertion 存在確認（assertionless 判定 / Step 4b）・`tcIdBoundaryRe` の境界一致は変更しない。
- `test-cases.md` に `Covered-by` 等の機械 parse 対象の新フィールドを追加しない。gate TC の phase 記録は
  本文の散文注記に留める（design D2）。
- prompt / template への追記は既存の 5 節骨格・form 制約を壊さない。新規 h2 見出しを追加しない。
  `Category determination:` 等の判定基準表を template に追加しない（`prompt-skeleton-drift-guard` TC-012）。
- 既存テストは無改変で green。新規挙動を固定するテストは既存テストファイルを編集せず別ファイルに置く。
- `typecheck && test` が green。

## T-01: extractMustTcIds に Category: gate 除外を追加する

- [ ] `src/core/verification/test-coverage.ts` の `extractMustTcIds` の per-section 走査に、`**Category**: gate` を
      検出する正規表現 `categoryGateRe = /\*\*Category\*\*:\s*gate/`（`categoryManualRe` と同型、bullet 有無の
      両形式を受理）を追加する。
- [ ] `currentIsManual` と並べて `currentIsGate` フラグを持ち、TC section 内の該当行で true にする。
      `flushCurrent` は `currentTcId && currentIsMust && !currentIsManual && !currentIsGate` のときのみ
      `mustTcIds` に push し、`currentIsGate` は section 切替でリセットする。
- [ ] 走査ループの分岐に `else if (currentTcId && categoryGateRe.test(line)) { currentIsGate = true; }` を
      manual 分岐と並べて追加する。
- [ ] 関数頭の Algorithm JSDoc に gate 除外の 1 ステップを追記し、enum 行
      `**Category**: unit | integration | manual | gate` がコロン直後 `unit` のため gate / manual いずれの
      正規表現にもマッチしない旨の境界注記を追記する（既存の manual 境界注記と並記）。
- [ ] manual 判定パス・走査方式・assertionless 判定（Step 4b）・`tcIdBoundaryRe` の境界一致は変更しない。

**Acceptance Criteria**:

- `**Priority**: must` かつ `**Category**: gate` の TC は `totalMustTcs` に数えられず、`foundTcIds` /
  `missingTcIds` / `assertionlessTcIds` のいずれにも現れない（spec の gate 除外 Scenario 群を満たす）。
- `**Category**: manual` の must TC の除外挙動は無変更（既存 `test-coverage-manual-exclusion.test.ts` /
  `test-coverage.test.ts` が無改変で green）。
- `**Category**: unit` / `integration` / Category 欄なしの must TC の判定は従来と同一。
- gate を含む enum 行での誤除外が起きない。
- 除外判定点は `extractMustTcIds` の 1 箇所のまま。走査方式・assertion 検出・境界一致は無変更。

## T-02: test-case-gen prompt に gate 定義・分類規則を追加する

- [ ] `src/prompts/test-case-gen-system.ts` の `## Method` 節内 Summary の Category 列挙を
      `**Category**: unit | integration | manual | gate` に更新する。
- [ ] 既存の各カテゴリ定義行と同じ体裁で gate の定義行を追記する:
  - gate: 充足基準がプロジェクト全体の検証 command の結果（build / typecheck / lint / テストスイート全体の
    green、CI green 等）である TC。
  - 分類規則: THEN がプロジェクト全体の command の成功（exit 0 / green）である TC は unit / integration では
    なく gate に分類する。
  - gate TC には GWT のテスト手順を書かず、充足を検証する verification phase 名（または
    `verification.commands` の command 名）を本文に記録する。
- [ ] 追記は既存 5 節骨格の内側に置き、新規 h2 見出しを作らない。汎用語で記述し、リポジトリ固有のテスト
      配置パスを参照しない。既存列挙 `unit | integration | manual` を部分文字列として残す。

**Acceptance Criteria**:

- `TEST_CASE_GEN_SYSTEM_PROMPT` に Category の列挙 `gate` と、gate 定義・分類規則・GWT を書かず phase を指す旨が
  含まれる（prompt contract テストで固定）。
- 既存 `TC-CATG-02`（`toContain("unit | integration | manual")`）が無改変で green。
- 5 節骨格・順序が維持される（`prompt-skeleton-drift-guard` が green）。

## T-03: test-materialize prompt に gate 実体化スキップとツールチェーン再実行禁止を追加する

- [ ] `src/prompts/test-materialize-system.ts` の `## Method` 節（manual スキップ block
      `test-materialize-system.ts:75-79` の同型）に gate TC の扱いを追記する:
  - gate TC には自動テストを書かない。
  - gate TC にはトレーサビリティコメント（`// TC-XXX`）を付けない（検証実体を伴わないコメントは coverage gate の
    偽装 pass になるため作らない）。
  - gate TC の充足は verification phase の管轄であり、test-materialize は関与しない。
- [ ] 同ファイルの `## Contract` 節に禁止規則を追記する:
  - プロジェクト全体の検証 command（build / typecheck / lint / テストスイート起動）の再実行をテスト本体として
    書かない。それは gate TC として分類され verification phase が担う。
  - 対象挙動の検証として必要な subprocess 実行（CLI 自身の起動等）は禁止しない。
- [ ] 両追記は既存 5 節骨格の内側に置き、新規 h2 見出しを作らない。汎用語で記述し、リポジトリ固有のテスト
      配置パスを参照しない。既存の manual スキップ block とトレーサビリティコメント手順は改変しない。

**Acceptance Criteria**:

- `TEST_MATERIALIZE_SYSTEM_PROMPT` の `## Method` 節に、gate カテゴリの TC が自動テスト化・トレーサビリティ
  コメントの対象外である旨（コメント偽装 pass 禁止・verification phase 管轄を含む）が含まれる。
- `TEST_MATERIALIZE_SYSTEM_PROMPT` の `## Contract` 節に、プロジェクト全体の検証 command の再実行をテスト本体
  として書かない旨と、対象挙動検証に必要な subprocess は禁止しない旨が含まれる。
- Question / Contract / Method / Evidence / Completion の 5 節構成と順序が維持される。
- 既存 `test-materialize-prompt-contract.test.ts` / `test-materialize-manual-scope-contract.test.ts` の assertion は
  無改変で green。

## T-04: template / docs を gate を含む形に追随する

- [ ] `src/templates/step-output-templates.ts` の `TEST_CASES_TEMPLATE` の Category 必須フィールド行を
      `**Category**: unit | integration | manual | gate` に更新し、HTML コメント内に gate の一文定義を添える。
      `Category determination:` 等の判定基準表は追加しない（form のみ所有）。
- [ ] `docs/test-coverage.md` に gate 除外の節を追記する（manual 除外節と同型）:
  - `**Category**: gate` の must TC は test-coverage の must 集計から除外されること。
  - その充足は verification phase（build / typecheck / test / lint 等）の管轄であること。
  - gate TC にトレーサビリティコメントを追記する必要はなく、検証実体を伴わないコメントは偽装 pass になること。
  - 既存の「TC-ID リテラル走査」「トレーサビリティコメント表明」「manual 除外」の記述は残す。
- [ ] `docs/README.md` の docs 一覧の `test-coverage.md` 行の説明文に gate 除外を反映する（manual と並記）。

**Acceptance Criteria**:

- `TEST_CASES_TEMPLATE` の Category 列挙に `gate` が含まれ、`unit | integration | manual` の部分文字列も残る
  （template テストで固定）。
- 既存 template テスト（`step-output-templates.test.ts` / `prompt-skeleton-drift-guard` TC-012）が無改変で green。
- `docs/test-coverage.md` に gate 除外の記述（must 集計から除外 + verification phase の管轄）が含まれ、既存の
  literal 走査・traceability・manual 除外の記述も残っている（既存 docs-contract テストが green のまま）。
- `docs/README.md` に `test-coverage.md` 行が残り、説明に gate 除外が反映されている。

## テストの取り扱い（downstream 参照用）

以下のテストは spec.md の Scenario から test-case-gen が採番し、test-materialize が materialize する。
implementer は T-01〜T-04 でこれらを green にする。新規テストは既存テストファイルを編集せず別ファイルに置く。
gate 除外 fixture は実装前は RED（現状 `extractMustTcIds` が gate を除外しないため gate must TC が missing 判定
される）である点で「歯の実在」を担保する。

- coverage gate 除外 fixture（新規 `tests/unit/core/verification/test-coverage-gate-exclusion.test.ts`）:
  - `**Priority**: must` + `**Category**: gate` の TC が test file に ID 出現なしでも `missingTcIds` に入らず、
    `totalMustTcs` に数えられず、status が他 must TC の充足のみで決まることを固定（T-01 完了までは RED）。
  - gate must TC が ID 出現ありでも `foundTcIds` / `assertionlessTcIds` に入らないことを固定。
  - **破壊確認**: 除外ロジック（`!currentIsGate` 条件）を一時的に外すと当該 gate 除外テストが fail することを
    verification / code-review の過程で確認し、fail-open でない（歯がある）ことを証明する。
  - **manual 無変更の回帰**: `**Category**: manual` の除外挙動が本変更で変わらないことを固定（既存
    `test-coverage-manual-exclusion.test.ts` は無改変 green を維持し、必要なら本 fixture 内でも manual と gate の
    共存ケースを 1 件確認する）。
  - bullet 形式 / plain 形式の `**Category**: gate` 両方が除外されることを固定。
  - gate を含む enum 行 `**Category**: unit | integration | manual | gate` があっても unit の must TC が誤除外
    されないことを固定（regression、実装前後で GREEN）。
- test-case-gen prompt gate contract（新規 `tests/unit/prompts/test-case-gen-gate-contract.test.ts` または
  既存様式に倣った prompt contract テスト。既存 `tests/prompts/test-case-gen-system.test.ts` は編集しない）:
  - `TEST_CASE_GEN_SYSTEM_PROMPT` に Category 列挙 `gate`・gate 定義・分類規則・GWT を書かず phase を指す旨が
    含まれることを固定（T-02 完了までは RED）。
- test-materialize prompt gate contract（新規 `tests/unit/prompts/test-materialize-gate-scope-contract.test.ts`。
  既存 `test-materialize-prompt-contract.test.ts` / `test-materialize-manual-scope-contract.test.ts` は編集しない）:
  - `## Method` 節に gate 実体化スキップ（コメント偽装 pass 禁止・verification phase 管轄を含む）が含まれることを固定。
  - `## Contract` 節にツールチェーン再実行禁止と、対象挙動検証に必要な subprocess は禁止しない旨が含まれることを固定。
  - 5 節骨格・順序が維持されることを固定（T-03 完了までは RED）。
- template gate contract（新規テスト、または既存 `tests/templates/step-output-templates.test.ts` を壊さない別ファイル）:
  - `TEST_CASES_TEMPLATE` の Category 列挙に `gate` が含まれることを固定（T-04 完了までは RED）。
- docs gate contract（新規 `tests/unit/docs/test-coverage-gate-contract.test.ts`。既存 docs-contract は編集しない）:
  - `docs/test-coverage.md` に gate 除外規約（must 集計から除外 + verification phase 管轄）が記述され、既存の
    走査・traceability・manual 除外の記述も残っていることを固定。
  - `docs/README.md` の test-coverage.md 行に gate 除外が反映されていることを固定（T-04 完了までは RED）。

## T-05: 検証

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green。

**Acceptance Criteria**:

- `typecheck && test` が green。
- 既存テスト（manual 除外 / prompt contract / template / docs-contract 群）が無改変で green のまま（回帰なし）。
- 新規 gate fixture / contract テストが green。gate 除外 fixture は破壊確認で歯の実在が確認済み。
