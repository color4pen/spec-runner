# Spec: permissionScope 宣言 pipeline で forbidden 空のとき run 準備で warning を出す

自己完結の behavior spec。型 / FSM / 構造が自動で強制しない Layer-1 の振る舞いを固定する。

## Requirements

### Requirement: scope 宣言 + 解決後 forbidden 空で run 準備時に warning を 1 回出す

`permissionScope` を宣言する descriptor に対し、config 解決後の `permissionScope.forbidden` が空であるとき、job 実行の準備段階で warning を 1 回出力する MUST。warning の文言は、対象 pipeline の id と、scope breach 検出が実質無効であること、および `pipeline.<id>.forbiddenSurfaces` を設定すれば有効化されることを含む SHALL。warning のみで pipeline は通常どおり実行され、exit code や状態遷移は変わらない MUST。

#### Scenario: fast（scope 宣言）+ forbidden 未設定の run 準備で warning が出る

**Given** `permissionScope` を宣言し config で forbidden surfaces が未設定（解決後 forbidden 空）の job
**When** その job の run 準備段階を実行する
**Then** stderr に scope breach 検出が実質無効である旨と `pipeline.fast.forbiddenSurfaces` を設定する旨を含む warning が 1 回出力される
**And** pipeline は中断されず通常どおり実行に進む

### Requirement: 判定は pipeline id に依存しない一般形

warning を出すか否かの判定は `descriptor.permissionScope !== undefined && descriptor.permissionScope.forbidden.length === 0` の一般述語で行う MUST。判定は解決後（`applyScopeConfig` 適用後）の descriptor に対して行い、profile 名（`fast` 等）への分岐を新設しない SHALL。

#### Scenario: 判定は解決後 descriptor の presence + 空で決まる

**Given** `permissionScope` を宣言し forbidden が空の解決後 descriptor（id は任意）
**When** warning 判定の pure 述語を評価する
**Then** 述語は true を返し、判定に pipeline id 固有の分岐を用いない

### Requirement: permissionScope を宣言しない pipeline では warning を出さない

`permissionScope` を宣言しない descriptor（standard / design-only）では、config の内容に関わらず warning を出さない MUST（挙動不変）。

#### Scenario: standard の run 準備で warning が出ない

**Given** `permissionScope` を宣言しない standard pipeline の job
**When** その job の run 準備段階を実行する
**Then** scope に関する warning は 1 件も出力されない

### Requirement: forbidden が 1 件以上解決される場合は warning を出さない

`permissionScope` を宣言する descriptor でも、config 解決後の forbidden が 1 件以上あるときは warning を出さない MUST（挙動不変）。

#### Scenario: fast + forbidden 設定済みで warning が出ない

**Given** `permissionScope` を宣言し config で forbidden surfaces が 1 件以上宣言された job
**When** その job の run 準備段階を実行する
**Then** scope に関する warning は 1 件も出力されない

### Requirement: 1 run 内で warning は重複しない

1 回の run で warning は最大 1 回に留まる MUST。scope 解決（`applyScopeConfig` / descriptor 解決）が run 中に複数回行われても、emission は run 準備の 1 回に固定される SHALL。判定を担う pure 関数はログ副作用を持たない MUST。

#### Scenario: 1 run で warning が 1 回

**Given** `permissionScope` を宣言し forbidden 未設定の job
**When** その job の run を実行する
**Then** scope warning は stderr にちょうど 1 回だけ出力される

#### Scenario: 判定 pure 関数は自身ではログを出さない

**Given** scope warning の判定を行う pure 関数（descriptor / job から warning 文言 or null を返す）
**When** その関数を複数回呼び出す
**Then** 関数は文言 or null を返すのみで、logWarn 等のログ副作用を一切起こさない

### Requirement: applyScopeConfig の pure 変換契約は不変

`applyScopeConfig` は本変更後も副作用のない pure 変換であり続ける MUST。`permissionScope` を持たない descriptor に適用したとき base を参照同一で返す既存契約は変わらない MUST。

#### Scenario: permissionScope なし → 参照同一で返る（既存契約維持）

**Given** `permissionScope` を持たない standard descriptor
**When** `applyScopeConfig` を適用する
**Then** 返り値は base と参照同一であり、`applyScopeConfig` はログ等の副作用を起こさない
