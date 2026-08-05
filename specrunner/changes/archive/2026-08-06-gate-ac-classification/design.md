# Design: TC 分類への gate カテゴリ導入

## Context

受け入れ基準（AC）には「充足基準がプロジェクト全体の検証 command の結果である」型が存在する
（`typecheck && test` が green、build 成功、lint 成功、CI green 等）。この gate 型 AC は起票側では正当だが、
下流の TC 分類には `unit | integration | manual` の 3 値しかなく、gate 相当の受け皿が無い。結果、gate 型 AC が
unit / integration の must TC として導出され、test-materialize がテストファイル化し、coverage gate がその存在を
要求する。gate 型 AC の充足は verification phase（build / typecheck / test / lint）の結果そのものであるため、
テストファイルとして再実装した瞬間に「検証 phase の再実行」というテストが生まれる。adopter のツールチェーン
（cargo 等）ではこれが CI 破壊に直結した。

すでに `Category: manual` の除外機構が同型の前例として存在する（ADR `2026-07-25-test-coverage-manual-tc-exclusion`）。
分類 1 値を 3 箇所（test-case-gen prompt / test-materialize prompt / coverage gate の単一判定点 `extractMustTcIds`）で
連動して尊重する構造である。gate はその第 2 適用として同じ構造で封じる。

現状の関連コード（request-review が attestation 済み、本設計でも整合を確認）:

- `extractMustTcIds`（`src/core/verification/test-coverage.ts:99-147`）が must 集合の唯一の決定点。
  per-section 走査で `**Priority**: must` を検出し、`**Category**: manual` を検出した TC を除外する。
  `flushCurrent` は `currentTcId && currentIsMust && !currentIsManual` のときのみ push する。
- 走査で使う正規表現: `priorityMustRe = /\*\*Priority\*\*:\s*must/`、`categoryManualRe = /\*\*Category\*\*:\s*manual/`。
  enum 行 `**Category**: unit | integration | manual` はコロン直後が `unit` のため manual にはマッチしない。
- test-case-gen prompt（`src/prompts/test-case-gen-system.ts:65-69`）の Summary 節で Category を
  `unit | integration | manual` と列挙し各値を定義している。
- test-materialize prompt（`src/prompts/test-materialize-system.ts:75-79`）の `## Method` 節に manual TC の
  実体化スキップ block がある。`## Contract` 節（同ファイル 32-53）が write-set と禁止事項を宣言する。
- `TEST_CASES_TEMPLATE`（`src/templates/step-output-templates.ts:126`）の Category 必須フィールド行が
  `**Category**: unit | integration | manual`。
- `docs/test-coverage.md` に manual 除外規約の節（55-66 行付近）と、`docs/README.md` の docs 一覧に
  test-coverage.md の説明行がある。

## Goals / Non-Goals

**Goals**:

- Category に第 4 値 `gate` を追加し、その充足を「検証 phase の結果」と定義する。
- gate 型 AC / TC を発生源（test-case-gen の分類）で正しく分類し、test-materialize での実体化と
  coverage gate での要求を構造的に止める。
- gate TC の充足が verification phase の管轄であることを 3 箇所（test-case-gen / test-materialize / coverage gate）で
  連動して尊重する。判定点は `extractMustTcIds` の 1 箇所のまま。
- 生成テストによるプロジェクト全体ツールチェーン再実行を prompt レベルで禁止する構造的受け皿を作る。
- manual 除外の既存挙動を byte 単位で不変に保つ。

**Non-Goals**:

- conformance に verification-result.md / test-cases.md を読ませる形式的連関（gate AC 充足判定の機械化）。
  分類の確立が先であり、連関は別 request で積む。
- request 雛形・起票規律の変更（gate 型 AC は起票側では正当）。
- 既存 manual 分類の挙動変更。
- verification phase 自体（build → typecheck → test → lint → security → test-coverage の構成・順序・実行モデル）の変更。

## Decisions

### D1: `extractMustTcIds` に Category: gate 除外を manual と同型で追加する

`src/core/verification/test-coverage.ts` の `extractMustTcIds` の per-section 走査に、`**Category**: gate` を
検出する正規表現 `categoryGateRe = /\*\*Category\*\*:\s*gate/`（`categoryManualRe` と同型、bullet 有無の両形式を
受理）を追加する。`currentIsManual` と並べて `currentIsGate` フラグを per-section で持ち、`flushCurrent` は
`currentTcId && currentIsMust && !currentIsManual && !currentIsGate` のときのみ `mustTcIds` に push する。
`currentIsGate` は TC section 切替でリセットする。

- **Rationale**: must 集合の定義は抽出関数に属する。ここ 1 箇所で除外すれば verification gate と
  test-materialize output gate（`evaluateTestCoverage`）の双方が自動的に整合する（ADR 2026-07-25 が確定した
  「単一判定点」構造の第 2 適用）。manual と同型の並列 boolean にすることで、manual の既存判定ロジックを
  一切触らず byte 単位で不変に保てる（既存 manual テストが無改変で green）。走査は機械的リテラル判定のまま、
  意味的判定を導入しない。
- **Alternatives considered**:
  - `manual` / `gate` を「除外カテゴリの集合」に一般化して 1 つのループで判定する — 抽象度は上がるが、manual の
    既存判定パスを書き換えることになり、manual 挙動不変の証明が難しくなる。最小 diff と既存テスト無改変を優先し
    却下（将来 3 値目の除外が必要になった時点で一般化を検討）。
  - `evaluateTestCoverage` 側で抽出後にフィルタ / 各消費者で個別フィルタ — ADR 2026-07-25 が却下済み
    （第二の判定点・ロジック重複を生む）。判定点は `extractMustTcIds` 1 箇所を維持する。
  - `Covered-by` field / agent 判定による除外 — ADR 2026-07-25 が却下済み。判断の入る余地を消し、分類値 1 つで
    機械判定する。

### D2: gate TC の phase 記録は本文の散文注記とし、機械 parse 対象の新フィールドは追加しない

gate TC は充足を検証する verification phase 名（`build` / `typecheck` / `test` / `lint` / `security` のいずれか、または
`verification.commands` の command 名）を TC 本文に散文で記録する（例: 「検証 phase: `typecheck`, `test`」）。この記録は
人間 / conformance 向けのトレーサビリティ注記であり、`extractMustTcIds` を含むどの pipeline 処理も machine-parse
しない。

- **Rationale**: 要件 1 は記録形式を設計判断に委ねている。coverage の充足判定は D1 の単一判定点（Category 値 1 つ）で
  完結しており、phase 名は「どの verification phase が担うか」を示す traceability に過ぎない。これを機械 parse する
  第二フィールド（`**Phase**:` 等）にすると、ADR 2026-07-25 が却下した `Covered-by` と同型の「充足主張の第二正本」
  を生み、ドリフト（test-cases.md は更新したが phase 名が実態とずれる等）の温床になる。「各事実は一箇所に住む」原則に
  従い、充足判定は分類値に、phase 名は散文注記に留める。
- **Alternatives considered**:
  - `**Phase**: typecheck` の構造化フィールドを追加 — 見た目は明快だが機械 parse 可能に見え、将来 coverage 判定に
    誤って配線されるリスク（第二判定点化）。却下。
  - 何も記録しない（manual と完全同一） — 要件 1 が phase 記録を明示要求しているため不可。

### D3: test-case-gen prompt に gate 定義と分類規則を追加する

`src/prompts/test-case-gen-system.ts` の `## Method` 節内 Summary の Category 列挙を
`unit | integration | manual | gate` に更新し、gate の定義と分類規則を既存の各カテゴリ定義行と同じ体裁で追記する:

- gate: 充足基準がプロジェクト全体の検証 command の結果（build / typecheck / lint / テストスイート全体の green、
  CI green 等）である TC。THEN がプロジェクト全体の command の成功（exit 0 / green）である TC は unit / integration
  ではなく gate に分類する。gate TC には GWT のテスト手順を書かず、充足を検証する verification phase 名
  （または `verification.commands` の command 名）を本文に記録する。

- **Rationale**: 分類は発生源（test-case-gen）で決まる。ここで gate に正しく振り分けられれば、下流の
  test-materialize / coverage gate は分類値 1 つを尊重するだけでよい。既存の `unit | integration | manual` を
  部分文字列として残すため、`TC-CATG-02`（`toContain("unit | integration | manual")`）は無改変で green を維持する。
  記述は既存 5 節骨格の内側に置き、新規 h2 を追加しない。
- **Alternatives considered**: 分類規則を initial message 側に置く — initial message は run 固有 binding のみを持つ
  設計（`prompt-skeleton-drift-guard` TC-024）に反するため system prompt に置く。

### D4: test-materialize prompt に gate 実体化スキップ（Method）とツールチェーン再実行禁止（Contract）を追加する

- `## Method` 節（manual スキップ block `test-materialize-system.ts:75-79` の同型）に gate TC の扱いを追記する:
  gate TC には自動テストを書かない / トレーサビリティコメント（`// TC-XXX`）も追記しない（検証実体を伴わない
  コメントは coverage gate の偽装 pass になるため作らない）/ gate TC の充足は verification phase の管轄である。
- `## Contract` 節に禁止規則を追記する: プロジェクト全体の検証 command（build / typecheck / lint / テストスイート
  起動）の再実行をテスト本体として書かない。それは gate TC として分類され verification phase が担う。対象挙動の
  検証として必要な subprocess 実行（CLI 自身の起動等）は禁止しない。

- **Rationale**: 「gate TC を実体化しない」は manual と同じ Method レベルの手順なので Method に、「ツールチェーン
  再実行をテスト本体に書かない」は write-set レベルの禁止規則なので Contract に置く（要件 5 が「contract に明記」と
  指定）。両方とも既存 5 節骨格の内側に散文 / bullet で追記し、新規 h2 を追加しない。subprocess 実行の全面禁止は
  CLI 自身の起動テスト等を巻き込むため、禁止対象を「プロジェクト全体の検証 command の再実行」に限定する。
- **Alternatives considered**:
  - 生成テスト側の環境 guard（ツールチェーンが無ければ skip）— skip して green になるテストは fail-open であり
    「歯があるフリ」。分類で発生源を断つ方針に反するため却下（request の architect 判断）。
  - 両記述を Method にまとめる — 要件 5 が「contract に」と明示指定しているため Contract に分離。

### D5: template / docs を gate を含む形に追随する

- `TEST_CASES_TEMPLATE`（`src/templates/step-output-templates.ts:126`）の Category 行を
  `**Category**: unit | integration | manual | gate` に更新する。gate の一文定義も HTML コメント内に添える。
  ただし `prompt-skeleton-drift-guard` TC-012 が禁じる `Category determination:` 等の判定基準表は追加しない
  （form のみ所有、判定基準は prompt が所有）。
- `docs/test-coverage.md` に gate 除外の節を追記する（manual 除外節と同型）: `**Category**: gate` の must TC は
  coverage 集計から除外され、その充足は verification phase の管轄である。既存の literal 走査 / traceability /
  manual 除外の記述は残す。
- `docs/README.md` の docs 一覧の test-coverage.md 説明行に gate 除外を反映する（manual と並記）。

- **Rationale**: template コメントと docs は実行される / 検証される知識であり、pipeline の形が変わったら追随を
  完了条件に含める（`docs/README.md` の原則 5）。既存 docs-contract テストが要求する記述（literal 走査 /
  traceability / manual 除外）は残すため、追記のみで既存テストは無改変 green。

## Risks / Trade-offs

- [enum 行に `gate` が加わり `categoryGateRe` / `categoryManualRe` の誤マッチが起きる懸念] → enum 行
  `**Category**: unit | integration | manual | gate` はコロン直後が `unit` のため両正規表現ともマッチしない。
  末尾の `gate` も `**Category**:\s*` 直後ではないため `categoryGateRe` に拾われない。gate を含む enum 行を
  使った誤除外なしの regression テストを固定する（spec の該当 Scenario）。
- [gate 除外が fail-open になり「歯があるフリ」になる懸念] → gate 除外の fixture テストは実装前 RED
  （現状 `extractMustTcIds` は gate を除外しないため gate must TC が missing 判定される）。実装後に GREEN。
  さらに除外ロジックを一時的に無効化すると当該テストが再び fail することを破壊確認する（歯の実在を証明）。
- [manual 挙動を巻き込む懸念] → D1 の並列 boolean 設計で manual 判定パスを触らない。manual の既存テスト
  （`test-coverage-manual-exclusion.test.ts` 他）を無改変で green に保つことを回帰基準にする。
- [test-cases.md の Summary の Automated / Manual カウントに gate が該当しない] → Result YAML / Summary は
  pipeline が machine-parse しない（テンプレート明記）。gate は Automated にも Manual にも数えない旨を prompt に
  散文で示すに留め、機械集計は変更しない（本 request の受け入れ基準の対象外）。

## Open Questions

- なし（gate 型 AC の充足を conformance が verification-result.md と機械照合する形式的連関は、本 request の
  スコープ外として別 request で扱うことが request で確定済み）。
