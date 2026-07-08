# Spec: verification 変更行実行検証（lcov changed-line gate）

自己完結の behavior spec。型 / FSM / 構造が自動で強制しない Layer-1 の振る舞いを固定する。

## Requirements

### Requirement: verification.coverage config を宣言できる

`.specrunner/config.json`（および user global config）の `verification.coverage` に、coverage 付きテスト実行コマンド（`ShellCommand` 形の `command`）・lcov 出力パス（`lcovPath`）・検証対象 surface glob（`include`）・除外 glob（`exclude`）・強化閾値（`minChangedLineCoverage`）を宣言できる MUST。`include` は必須かつ非空、`lcovPath` は必須の非空 string、`exclude` と `minChangedLineCoverage` は任意 SHALL。

#### Scenario: well-formed な coverage config が validation を通る

**Given** `verification.coverage` に `{ command: "vitest run --coverage", lcovPath: "coverage/lcov.info", include: ["src/**"] }` を持つ config
**When** config を validate する
**Then** validation を通過する

#### Scenario: include 欠落は validation エラー

**Given** `verification.coverage` に `command` と `lcovPath` はあるが `include` が無い config
**When** config を validate する
**Then** validation エラーになる

#### Scenario: include が空配列は validation エラー

**Given** `verification.coverage.include` が `[]`（空配列）の config
**When** config を validate する
**Then** validation エラーになる

### Requirement: 宣言時、ゲートは変更ファイルごとに変更行の実行を判定する

`verification.coverage` が宣言されているとき、verification は coverage コマンドを実行し、`lcovPath` の lcov（`SF:` / `DA:` 行）を自前パーサで読み、base branch との変更行と突合する MUST。判定は「base…HEAD の変更ファイル（削除を除く）」のうち `include` にマッチし `exclude` にマッチしないファイルごとに次の決定表に従う MUST。

- lcov に存在しないファイル（テスト実行で一度もロードされていない）→ **fail**（fail-closed）
- lcov に存在し、変更行に DA レコード（実行可能行）が無いファイル → pass
- lcov に存在し、変更 DA 行があり 1 行も実行されていないファイル（既定閾値）→ **fail**
- lcov に存在し、変更 DA 行の実行割合が閾値以上のファイル → pass
- `include` 不一致 または `exclude` 一致のファイル → 対象外（判定しない）

#### Scenario: 変更ファイルの DA 行が全て未実行 → failed + ファイル列挙

**Given** `include: ["src/**"]` を宣言し、変更ファイル `src/foo.ts` の変更行に DA 行があり lcov 上いずれも実行回数 0
**When** ゲートが判定する
**Then** status は failed で、失敗ファイル一覧に `src/foo.ts` が含まれる

#### Scenario: 変更 DA 行が 1 行でも実行 → passed

**Given** `include: ["src/**"]` を宣言し、変更ファイル `src/foo.ts` の変更 DA 行のうち少なくとも 1 行が lcov 上実行回数 > 0
**When** ゲートが判定する
**Then** status は passed で `src/foo.ts` は失敗ファイルに含まれない

#### Scenario: 変更行に DA レコードが無い → passed

**Given** `include: ["src/**"]` を宣言し、変更ファイル `src/types.ts` の変更行が lcov 上いずれも DA レコードを持たない（型定義・コメント等の非実行行）
**When** ゲートが判定する
**Then** status は passed

#### Scenario: lcov 不在ファイル → failed（fail-closed）

**Given** `include: ["src/**"]` を宣言し、変更ファイル `src/bar.ts` が lcov に `SF:` レコードとして一切存在しない
**When** ゲートが判定する
**Then** status は failed で、失敗ファイル一覧に `src/bar.ts` が含まれる

#### Scenario: exclude 宣言ファイル → 対象外

**Given** `include: ["src/**"]`・`exclude: ["src/generated/**"]` を宣言し、変更ファイル `src/generated/api.ts` が lcov に存在しない
**When** ゲートが判定する
**Then** `src/generated/api.ts` は対象外で、fail の原因にならない

#### Scenario: include 外ファイル → 対象外

**Given** `include: ["src/**"]` を宣言し、変更ファイル `docs/readme.md` が lcov に存在しない
**When** ゲートが判定する
**Then** `docs/readme.md` は対象外で、fail の原因にならない

### Requirement: coverage コマンド失敗・lcov 不生成は failed

ゲートが実行される（宣言あり・先行検証 passed）とき、coverage コマンドの exit code が非 0、またはコマンド成功でも `lcovPath` の lcov が不在・空・パース不能なら、verification を failed にする MUST。宣言された保証を道具の失敗を理由に静かに無効化しない SHALL。

#### Scenario: coverage コマンドが非 0 で終了 → failed

**Given** `verification.coverage.command` が非 0 exit code で終了する
**When** ゲートが実行される
**Then** verification は failed になる

#### Scenario: lcov ファイルが生成されない → failed

**Given** coverage コマンドは成功するが `lcovPath` にファイルが生成されない
**When** ゲートが実行される
**Then** verification は failed になる

### Requirement: ゲートは commands path / phases path の両方で主検証の後に実行される

`verification.coverage` 宣言時、ゲートは `verification.commands` を使う repo（commands path）でも、package.json script fallback を使う repo（phases path）でも、主検証の後に実行される MUST。先行検証が failed の場合は fail-fast で skipped になる SHALL。

#### Scenario: phases path でゲートが実行される

**Given** `verification.commands` 未設定（phases path）で、coverage を宣言し全 script phase が passed
**When** verification を実行する
**Then** `changed-line-coverage` phase が実行され、その結果が verdict に反映される

#### Scenario: commands path でゲートが実行される

**Given** `verification.commands` を設定（commands path）し、coverage を宣言し全 command が passed
**When** verification を実行する
**Then** `changed-line-coverage` phase が実行され、その結果が verdict に反映される

### Requirement: config 未宣言ならゲートは skip され既存挙動が不変

`verification.coverage` が宣言されていないとき、ゲートは実行されず、verification-result.md に skip の事実が可視化される MUST。このとき phase 数・verdict・既存の verification 出力構造は不変であり、既存の verification テストは無変更で green を保つ SHALL。

#### Scenario: 未宣言時は skip の note が出て phase は増えない

**Given** `verification.coverage` を宣言しない config
**When** verification を実行する
**Then** verification-result.md に changed-line coverage gate が skip された旨の note が含まれ、`## Phase:` セクション数と verdict は coverage 導入前と同一である

### Requirement: TC-ID 照合は ID 境界の厳密一致で行う

test-cases.md の must TC ID とテストファイルの照合は、substring ではなく ID 境界の厳密一致で行う MUST。`TC-1` は `TC-10`（後続が数字）や `TC-1-2`（後続が `-数字`）にマッチしない SHALL。この検査は traceability 検査として残置し、合否の実質は変更行実行ゲートが担う。

#### Scenario: TC-1 が TC-10 にマッチしない

**Given** must TC が `TC-1` で、テストファイルに `TC-10` は現れるが `TC-1` 単独では現れない
**When** TC-ID 照合を実行する
**Then** `TC-1` は missing 扱いになる（`TC-10` に誤マッチしない）

#### Scenario: 完全一致する TC-ID は検出される

**Given** must TC が `TC-1` で、テストファイルに `TC-1` が境界付きで現れる
**When** TC-ID 照合を実行する
**Then** `TC-1` は found 扱いになる

### Requirement: 既定閾値は実行された変更行 > 0、config で強化可能

ゲートの既定 pass 条件は「対象ファイルの実行された変更 DA 行が 1 行以上」である MUST。`verification.coverage.minChangedLineCoverage`（0〜1）を指定したときは pass 条件が「実行された変更 DA 行 / 変更 DA 行 >= 閾値」に強化され、無指定時の既定挙動は不変である SHALL。

#### Scenario: 既定は 1 行実行で pass

**Given** `minChangedLineCoverage` 未指定で、対象ファイルの変更 DA 行のうち 1 行のみ実行され残りが未実行
**When** ゲートが判定する
**Then** そのファイルは pass する
