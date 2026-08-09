# Spec: regression-gate を新規退行の検出に限定する

## Requirements

### Requirement: regression-gate は既知未修正 finding を退行事由にしない

regression-gate の verdict 導出は、gate agent が報告した finding のうち **既知未修正集合** に
fingerprint（`file|line|title`）が一致するものを needs-fix の事由から除外 SHALL する。
既知未修正集合とは、gate に渡された findings ledger のうち routing 層の severity policy で
code-fixer に routing されない finding（severity `low`）である。fingerprint 照合は既存の
`dedupeFindings` と同一のキーを流用 MUST する。ledger 自体は全件のまま維持し、gate agent は
全 ledger エントリを検証してよい（除外は verdict 導出直前の入力整形で行う）。

#### Scenario: approved 経路の未修正 low finding は needs-fix にならない

**Given** findings ledger に severity `low`・resolution `fixable` のエントリ L がある
（reviewer が approved 時に one-shot 経路へ routing したが code-fixer が修正していない）
**And** gate agent が L と同一 fingerprint（同じ file/line/title）の退行 finding を
severity `high`・resolution `fixable` で報告する
**When** regression-gate の verdict を導出する
**Then** その finding は既知未修正集合に一致するため除外され、verdict は `approved` になる
**And** gate ↔ code-fixer の再検証ループは発生しない

#### Scenario: 既知未修正が無ければ空 ledger と同じく approved

**Given** gate agent が報告した finding が全て既知未修正集合に一致する
**When** verdict を導出する
**Then** verdict は `approved`（needs-fix ではない）になる

### Requirement: regression-gate は新規退行に needs-fix を返す

既知未修正集合に fingerprint が一致しない fixable finding に対して、regression-gate は従来通り
`needs-fix` を返 SHALL する。修正済みであった finding が退行した場合（ledger 上 severity が
`low` でない、すなわち routing 対象だった finding）も、既知未修正集合に含まれないため needs-fix になる。

#### Scenario: 新規検出の退行は needs-fix

**Given** gate agent が fixable finding F を報告する
**And** F の fingerprint が既知未修正集合（ledger の low エントリ）のいずれとも一致しない
**When** verdict を導出する
**Then** verdict は `needs-fix` になる

#### Scenario: 修正済み finding の退行は needs-fix

**Given** findings ledger に severity `medium`・resolution `fixable` のエントリ M がある
（code-fixer が一度修正したが最終コードで退行した）
**And** gate agent が M と同一 fingerprint の退行 finding を報告する
**When** verdict を導出する
**Then** M は既知未修正集合（low のみ）に含まれないため除外されず、verdict は `needs-fix` になる

### Requirement: LOW 除外は routing 層 1 箇所で表現し code-fixer prompt は severity 再フィルタしない

code-fixer への routing 対象 finding 集合は、severity policy を単一関数で適用して決定 SHALL する
（severity `low` の fixable finding は routing 対象から除外する）。code-fixer の prompt からは
severity を再フィルタする指示（`Ignore LOW severity findings`）を全変種から除去 MUST し、
prompt が「渡された finding を再度 severity で捨てる」二重フィルタを持たないようにする。

#### Scenario: standard reviewer path の routing は low を除外する

**Given** active reviewer の最新 run に severity `low`・`fixable` の finding と
severity `high`・`fixable` の finding がある
**When** standard reviewer path で code-fixer に routing する finding 集合を導出する
**Then** 集合には `high` の finding が含まれ、`low` の finding は含まれない

#### Scenario: code-fixer prompt に severity 再フィルタ行が存在しない

**Given** code-fixer の全 prompt 変種
**When** `Ignore LOW severity findings` を全文検索する
**Then** `src/` 配下で該当が 0 件である

### Requirement: regression-gate の ledger 説明が実装の実態と一致する

regression-gate の system prompt および gate に注入する ledger ブロックの説明は、ledger の実態
（reviewer が指摘した fixable findings 全件であり、修正済みとは限らない）と一致 SHALL する。
「code-fixer が修正した findings」という趣旨の記述を残してはなら MUST NOT ない。

#### Scenario: 「修正した findings」記述が残っていない

**Given** `src/prompts/regression-gate-system.ts` の ledger 説明
**When** 説明文を確認する
**Then** ledger は「reviewer が指摘した fixable findings（修正済みとは限らない）」と説明されている
**And** 「code-fixer が修正した findings の完全リスト」という記述は存在しない
