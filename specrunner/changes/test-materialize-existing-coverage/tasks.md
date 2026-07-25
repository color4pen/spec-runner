# Tasks: manual カテゴリ must TC の coverage 集計除外

## 全体制約（全タスク共通）

- 先行変更で確立したトレーサビリティコメント規約を回帰させない。既存テスト
  （`tests/unit/prompts/test-materialize-prompt-contract.test.ts` /
  `tests/unit/core/verification/test-coverage-comment-form.test.ts` /
  `tests/unit/core/verification/test-coverage.test.ts` /
  `tests/unit/docs/test-coverage-docs-contract.test.ts`）の既存 assertion は無改変で green を維持する。
  新規挙動を固定するテストは既存ファイルを編集せず別ファイルに置く。
- manual 除外は must 集計対象の絞り込みであり、走査方式・assertion 存在確認（assertionless 判定）・
  TC-ID 境界一致は変更しない。
- `specrunner/changes/<slug>/test-cases.md` に `covered-by` 等の新フィールドを追加しない。
- `typecheck && test` が green。

## T-01: extractMustTcIds に Category: manual 除外を追加する

- [ ] `src/core/verification/test-coverage.ts` の `extractMustTcIds` の per-section 走査に、
      `**Category**: manual` を検出する正規表現（`priorityMustRe` と同型の
      `/\*\*Category\*\*:\s*manual/`、bullet 有無両形式を受理）を追加する。
- [ ] `currentIsMust` と並べて `currentIsManual` フラグを持ち、TC section 内の該当行で true にする。
      `flushCurrent` は `currentTcId && currentIsMust && !currentIsManual` のときのみ `mustTcIds` に
      push し、`currentIsManual` は section 切替でリセットする。
- [ ] 関数頭の Algorithm JSDoc に manual 除外の 1 ステップを追記する。
- [ ] 走査方式・assertionless 判定（Step 4b）・`tcIdBoundaryRe` の境界一致は変更しない。

**Acceptance Criteria**:

- `**Priority**: must` かつ `**Category**: manual` の TC は `totalMustTcs` に数えられず、
  `foundTcIds` / `missingTcIds` / `assertionlessTcIds` のいずれにも現れない。
- `**Category**: unit` / `integration` / Category 欄なしの must TC の判定は従来と同一
  （既存 `test-coverage.test.ts` が無改変で green）。
- test-coverage の走査方式・assertion 検出・境界一致は無変更。

## T-02: test-materialize prompt に manual TC 対象外の記述を追加する

- [ ] `src/prompts/test-materialize-system.ts` の `TEST_MATERIALIZE_BASE` の `## Method` 節
      （must TC 一覧確認の Step 1 周辺、または既存 Step 3 の近傍）に、`**Category**: manual` の
      must TC は自動テストコード化・トレーサビリティコメント追記のいずれの対象でもない旨を追記する。
      要点:
  - manual TC には自動テストを書かない。
  - manual TC にはトレーサビリティコメントを付けない（検証実体を伴わないコメントは gate の偽装 pass
    になるため作らない）。
  - manual TC の検証は conformance / レビュー gate の管轄である。
- [ ] 追記は `## Method` 節の内側に置き、新規 h2 見出しを作らない。汎用語で記述し、リポジトリ固有の
      テスト配置パスを参照しない。

**Acceptance Criteria**:

- `TEST_MATERIALIZE_SYSTEM_PROMPT` の `## Method` 節に、manual カテゴリの TC が自動テスト化・
  トレーサビリティコメントの対象外である旨（コメントを作成しない旨を含む）が含まれる
  （prompt contract テストで固定される）。
- Question / Contract / Method / Evidence / Completion の 5 節構成と順序が維持される
  （`prompt-skeleton-drift-guard.test.ts` が green）。
- 既存 Step 3 のトレーサビリティコメント手順の記述と既存 prompt-contract の assertion は無改変で green。

## T-03: docs に manual 除外規約を明文化する

- [ ] `docs/test-coverage.md` に manual 除外の節を追記する:
  - `**Category**: manual` の must TC は test-coverage の must 集計から除外されること。
  - その検証は conformance / レビュー gate の管轄であること。
  - 既存の「TC-ID リテラル走査」「トレーサビリティコメントによる既存カバレッジ表明」の記述は残す。
- [ ] `docs/README.md` の docs/ ファイル一覧の `test-coverage.md` 行の説明文に manual 除外を反映する。

**Acceptance Criteria**:

- `docs/test-coverage.md` に manual 除外の記述（must 集計から除外 + conformance / レビュー gate の管轄）
  が含まれ、既存の literal 走査・traceability の記述も残っている。
- `docs/README.md` に `test-coverage.md` 行が残り、説明に manual 除外が反映されている
  （既存 docs-contract テストは green のまま）。
- `docs/guarantees.md` の保証番号・版号は変更しない。

## テストの取り扱い（downstream 参照用）

以下のテストは spec.md の Scenario から test-case-gen が採番し、test-materialize が materialize する。
implementer は T-01〜T-03 でこれらを green にする。coverage manual 除外 fixture は実装前は red
（`extractMustTcIds` が未だ manual を除外しないため）である点が、既存の comment-form の
characterization テストと異なる。新規テストは既存テストファイルを編集せず別ファイルに置く:

- coverage manual 除外 fixture（新規 `tests/unit/core/verification/test-coverage-manual-exclusion.test.ts`）:
  - `**Priority**: must` + `**Category**: manual` の TC が test file に ID 出現なしでも
    `missingTcIds` に入らず、status が他 must TC の充足のみで決まることを固定（T-01 完了までは red）。
  - `**Category**: unit` / `integration` の must TC は従来どおり missing 判定されることを固定（回帰）。
- prompt manual-scope contract（新規 `tests/unit/prompts/test-materialize-manual-scope-contract.test.ts`）:
  - `TEST_MATERIALIZE_SYSTEM_PROMPT` の `## Method` 節に manual 対象外記述が含まれることを固定
    （T-02 完了までは red）。
- docs manual contract（新規ファイル、既存 docs-contract を壊さない追加）:
  - `docs/test-coverage.md` に manual 除外規約が記述されていることを固定（T-03 完了までは red）。

## T-04: 検証

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green。

**Acceptance Criteria**:

- `typecheck && test` が green。
- 先行変更の既存テストが無改変で green のまま（回帰なし）。
- 新規 fixture / contract テストが green。
