# Spec: 過大 request の粒度ゲート

## Requirements

### Requirement: request validate は過大な受け入れ基準に非ブロッキング警告を出す

`executeValidate` は `受け入れ基準` 節の top-level 項目数を数え、その数が閾値 15 以上のとき
stderr へ警告を書き出す SHALL。警告は実測根拠と分割検討（および分割検討済み宣言）の案内を含む
MUST。この警告は exit code を変えない — 他が妥当な request に対する戻り値は 0 のまま SHALL。
top-level 項目のカウントは HTML コメント内の行を除外し、行頭無インデントのリストマーカー
（`-` / `*` / `+` / `N.` / `N)`）のみを数える SHALL。

#### Scenario: 15 項目以上で警告し exit 0 を維持する

**Given** 受け入れ基準が 15 個の top-level 項目を持つ妥当な request.md
**When** `request validate` を実行する
**Then** stderr に規模警告（実測根拠を含む）が書き出される
**And** 戻り値は 0 である

#### Scenario: 14 項目以下では警告しない

**Given** 受け入れ基準が 14 個以下の top-level 項目を持つ妥当な request.md
**When** `request validate` を実行する
**Then** 規模警告は stderr に書き出されない
**And** 戻り値は 0 である

### Requirement: request-review は縫い目判定観点を持つ

request-review の system prompt は、この request が独立して収束できる単位を 2 つ以上含むかを
判定する観点を含む SHALL。判定基準として分割判定 3 基準（独立して設計・テストできる → 切る /
収束の意味論が異なる → 必ず切る / 受け入れ基準の相互参照 → 切らない）を含む MUST。実測較正値
（受け入れ基準 15 本以上は一発完走率 8%・exhausted 23%）を根拠として含む MUST。分割線が
見つかった場合は decision-needed finding として土台→上物の分割案を提示するよう指示する SHALL。

#### Scenario: system prompt に縫い目判定観点・3 基準・較正値が含まれる

**Given** `REQUEST_REVIEW_SYSTEM_PROMPT`
**When** その内容を検査する
**Then** 縫い目判定観点（独立して収束できる単位を 2 つ以上含むか）が含まれる
**And** 分割判定 3 基準が含まれる
**And** 実測較正値（8% / 23% / 15）が含まれる
**And** 分割線が見つかった場合に decision-needed finding として分割案を提示する指示が含まれる

### Requirement: 分割検討済み宣言は縫い目 finding を抑制する

request.md に理由付きの分割検討済み宣言（`## 分割検討済み` 節）がある場合、request-review は
縫い目 finding を上げない SHALL。この宣言尊重ルールは system prompt に明記される MUST。
スコープ外宣言を意図的な省略として尊重するのと同型の扱いである。

#### Scenario: 宣言尊重ルールが system prompt に含まれる

**Given** `REQUEST_REVIEW_SYSTEM_PROMPT`
**When** その内容を検査する
**Then** 分割検討済み宣言がある場合は縫い目 finding を上げない、という規則が含まれる
**And** 宣言は理由付きであることが要件として示される

### Requirement: authoring guidance が崖の実測と宣言規約を記載する

`docs/request-authoring.md` の粒度節は、崖の実測（10 本超で黄信号、15 本以上で一発完走率 8%・
exhausted 23%）と分割検討済み宣言の規約（書式 `## 分割検討済み`・置き場所・理由必須）を記載する
SHALL。request template の受け入れ基準節コメントは、規模の目安と分割検討済み宣言への言及を含む
SHALL。この追記は request template の checkbox 数を増やさない MUST。

#### Scenario: docs に実測値と宣言規約が記載される

**Given** `docs/request-authoring.md` の粒度節
**When** その内容を検査する
**Then** 15 本以上で一発完走率 8% の実測が記載される
**And** 分割検討済み宣言の書式・理由必須の規約が記載される

#### Scenario: request template が規模目安と宣言への言及を含む

**Given** `buildScaffoldTemplate` の出力
**When** 受け入れ基準節の HTML コメントを検査する
**Then** 規模の目安（15 項目で validate が警告する旨）が含まれる
**And** 分割検討済み宣言への言及が含まれる
**And** template の top-level checkbox 数は追記前と変わらない
