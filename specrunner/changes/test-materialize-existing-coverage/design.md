# Design: manual カテゴリ must TC の coverage 集計除外

## Context

test-coverage gate は must TC の充足を test file 群の TC-ID リテラル走査で機械的に検証する。
先行変更により「must TC が変更前から存在するテストで既に検証されている場合、その既存テストに
`// TC-0XX: <TC 名>` トレーサビリティコメントを 1 行追記することが充足の正式手段である」という規約が
既に確立・実装済みである。この半分は現行コードベースに存在する:

- `src/prompts/test-materialize-system.ts` の `## Method` 節 Step 3（既存テスト充足時の
  トレーサビリティコメント手順）
- `docs/test-coverage.md`（TC-ID リテラル走査規約 + トレーサビリティコメント規約）
- `tests/unit/prompts/test-materialize-prompt-contract.test.ts` /
  `tests/unit/core/verification/test-coverage-comment-form.test.ts` /
  `tests/unit/docs/test-coverage-docs-contract.test.ts`

残る空白は **Category: manual の must TC** である。`src/core/verification/test-coverage.ts` の
`extractMustTcIds`（lines 95-135）は `**Priority**: must` のみで must を判定し `**Category**` を
参照しない。そのため Category が `manual` の must TC にも test file 中の TC-ID 出現が要求される。
manual TC は定義上自動テストを書けないため、agent は「検証実体のないコメントをテストファイルに置いて
検査を通す（gate を騙る作法の常態化）」か「充足不能として停止する」の二択に追い込まれる。

`extractMustTcIds` は「どの TC を must と数えるか」の唯一の決定点である。2 つの消費者が共にここを
経由する:

- `runTestCoveragePhase`（verification step の test-coverage phase）
- `evaluateTestCoverage`（`src/core/runtime/local.ts:1329`、test-materialize の
  `outputContracts()` が宣言する `test-coverage` 契約の検査）

したがって `extractMustTcIds` で manual を除外すれば、verification gate と test-materialize の
output gate の双方が同時に manual TC を要求しなくなる。

## Goals / Non-Goals

**Goals**:

- `**Category**: manual` の must TC を must coverage 集計から除外する。除外は単一の決定点
  `extractMustTcIds` で、既存の Priority 走査と同型の機械的 section-scan として行う。
- test-materialize の system prompt に、manual TC が自動テスト化・トレーサビリティコメントの
  対象外であることを明記する（検証実体のないコメント偽装を防ぐ）。
- `docs/test-coverage.md` に manual 除外規約を明文化する。
- 先行変更で確立したトレーサビリティコメント規約とその既存テストを回帰させず維持する。

**Non-Goals**:

- トレーサビリティコメント規約の再実装（先行変更で実装済み。本変更では再実装せず、既存テストの
  無改変 green を維持する）。
- test-coverage の走査方式・assertionless 判定の変更（manual 除外は must 集計対象の絞り込みであり、
  走査ロジック・assertion 検出・境界一致は変更しない）。
- manual TC の検証手段そのものの設計（conformance / レビュー gate の管轄のまま変更しない）。
- test-cases.md への `covered-by` 等の新フィールド追加。
- 既存テストが「本当に当該 TC を検証しているか」の意味的検証。
- `docs/guarantees.md` の保証番号・版号の変更。

## Decisions

### D1: Category: manual の除外を extractMustTcIds の section-scan に組み込む

`extractMustTcIds` の per-section 走査ループに `**Category**: manual` 検出を追加する。既存の
`currentIsMust` と並べて `currentIsManual` フラグを持ち、TC section 切替（`flushCurrent`）で
リセットする。`flushCurrent` は `currentTcId && currentIsMust && !currentIsManual` のときのみ
`mustTcIds` に push する。検出正規表現は `priorityMustRe` と同型の `/\*\*Category\*\*:\s*manual/`
（bullet `- **Category**: manual` と plain 両形式を受理）。

- **Rationale**: 「must 集合の定義」は抽出関数に属する。ここ 1 箇所で除外すれば verification gate と
  test-materialize output gate の双方が自動的に整合する。走査は機械的リテラル判定のままで、意味的
  判定を導入しない。
- **Alternatives considered**:
  - `evaluateTestCoverage` 側で抽出後にフィルタする案 — 却下。`extractMustTcIds` が返す集合が
    「must 集合」という語義とずれる。output-contract 経路も `evaluateTestCoverage` を通るため
    動作はするが、除外責務を抽出の外に置くのは概念的に不自然。
  - 各消費者（`runTestCoveragePhase` / `local.ts`）で個別にフィルタする案 — 却下。ロジック重複と
    ドリフトを生む。
- **Edge**: test-cases.md テンプレートの `**Category**: unit | integration | manual` というリテラルは
  最初の `## TC-` section より前の HTML コメント（FORMAT REQUIREMENTS）内にあり、どの TC section にも
  属さないため走査対象にならない。加えて正規表現はコロン直後に `manual` を要求するため、
  `unit | integration | manual` 行（コロン直後は `unit`）にはマッチしない。誤除外は起きない。

### D2: prompt に manual TC 対象外の記述を追加する

`src/prompts/test-materialize-system.ts` の `TEST_MATERIALIZE_BASE` の `## Method` 節（must TC 一覧を
確認する Step 1 の周辺、または既存 Step 3 の近傍）に、manual カテゴリの must TC は自動テストコード化・
トレーサビリティコメント追記のいずれの対象でもないことを追記する。検証実体を伴わないコメントを
manual TC のために作成しないこと、manual TC の検証は conformance / レビュー gate の管轄であることを
含める。

- **Rationale**: gate が manual coverage を要求しなくなった後も、agent が念のためコメントを付けて
  偽装 pass を作る余地を prompt レベルで塞ぐ。既存 Step 3 は「既存テストが充足している場合の
  トレーサビリティコメント」を正式手段として肯定しているため、その例外として manual を明示しないと
  agent が manual にもコメントを付けかねない。
- **Alternatives considered**: 追記せずコード側の除外のみに頼る案 — 却下。prompt は agent の行動の
  一次規範であり、コード側除外だけでは偽装コメントの動機を消せない。
- **制約**: 5 節骨格（Question / Contract / Method / Evidence / Completion）を維持し、新規 h2 見出しを
  追加しない。`## Method` 節の内側に置く。汎用語で記述し、リポジトリ固有パスを参照しない
  （no-project-local-refs 規律）。

### D3: docs/test-coverage.md に manual 除外を明文化する

`docs/test-coverage.md` に manual 除外の節を追記する: `**Category**: manual` の must TC は must 集計
から除外され、その検証は conformance / レビュー gate の管轄であること。既存の走査規約・トレーサビリティ
規約の記述は残す。`docs/README.md` の docs/ ファイル一覧の `test-coverage.md` 行の説明文にも manual
除外を反映する。

- **Rationale**: docs 原則「各事実は一箇所に住む」。focused doc は既に存在するため、新規 doc を
  作らず既存 doc を拡張する。
- **Alternatives considered**: 新規 doc を追加する案 — 却下。同一トピック（test-coverage 規約）は
  一冊に集約する（docs の最小冊数原則）。

### D4: 新規挙動は新規テストファイルで固定し、先行変更のテストは無改変で維持する

manual 除外・prompt manual-scope・docs manual の各挙動を固定するテストは新規ファイルに置き、先行変更の
既存テストファイル（`test-coverage.test.ts` / `test-coverage-comment-form.test.ts` /
`test-materialize-prompt-contract.test.ts` / `test-coverage-docs-contract.test.ts`）の既存 assertion を
編集しない。

- coverage manual 除外 fixture: 新規 `tests/unit/core/verification/test-coverage-manual-exclusion.test.ts`
- prompt manual-scope contract: 新規 `tests/unit/prompts/test-materialize-manual-scope-contract.test.ts`
- docs manual contract: 新規テストファイル（既存 docs-contract を壊さない追加）

これらのテストは spec.md の Scenario から test-case-gen が採番し、test-materialize が materialize する。
coverage / prompt / docs の実装（D1〜D3）が完了するまで red であり、implementer が green にする。

- **Rationale**: delta を隔離し、先行変更のテストを無編集に保つ（先行変更の tasks が確立した規律）。
- **Note**: test-case-gen が実際の TC-ID を採番する。本 change の fixture テストは自前の tempdir に
  test-cases.md と test file を書いて評価する自己完結型のため、プロジェクト全域走査における
  TC-ID の衝突には影響されない。

## Risks / Trade-offs

- [Risk] `extractMustTcIds` 変更で unit / integration の判定を誤って変えてしまう →
  Mitigation: unit / integration + must TC が従来どおり missing 判定される回帰 Scenario を固定し、
  既存 `test-coverage.test.ts` を無改変で green に保つ。
- [Risk] Category 正規表現の過剰マッチ（コードフェンス内やテンプレート enum 行での誤検出）→
  Mitigation: マッチはコロン直後の `manual` を要求し、走査は TC section 単位。テンプレート enum 行は
  TC section 外かつコロン直後が `unit` のため不一致。
- [Risk] グローバル TC-ID 衝突（本 change の test-cases.md の TC-ID が無関係な既存テストファイルの
  ID と偶然一致し false coverage になる）→ Mitigation: これは下流 test-case-gen の採番の責務であり
  本変更では変えない。fixture テストは自己完結型（自前 tempdir）で影響を受けない。
- [Trade-off] manual TC の検証は依然として機械化されず conformance / レビュー gate に委ねる。
  受容する — これにより「coverage gate が要求するものはすべて自動テストで充足可能」という契約に揃う。

## Open Questions

- `docs/guarantees.md` の G1 coverage 保証の文言が manual 除外により微修正を要するか。現時点では
  `docs/test-coverage.md` への明文化で足りるとし、保証番号・版号は変更しない。将来 guarantees.md の
  記述精緻化が必要になれば別 request で対応する。
