# Spec: `specrunner usage` の step × model 内訳と USD コスト表示

## Requirements

### Requirement: 引数なし `specrunner usage` が step × model 交差表を表示する

引数なし `specrunner usage`（`showUsageSummary`）の出力に、step × model の交差表を SHALL 含める。
各行は step 名・model 名・input token・output token・USD コストを MUST 表示する。step 軸の key は、
当該 invocation の `stepName` が存在すればそれを、無ければ `command`（`request-review` / `request-generate`）を
用いる MUST。

#### Scenario: job step の usage が step × model 行として出る

**Given** archive 配下の `usage.json` に `command: "job"`, `stepName: "implementer"`, `modelUsage` に
`claude-opus-4-6[1m]` を持つ entry がある
**When** `specrunner usage`（引数なし）を実行する
**Then** 出力の "By step × model" セクションに `implementer` の見出しと、その配下に
`claude-opus-4-6[1m]: in=<i> out=<o> cost=$<x.xxxx>` 形式の行が含まれる

#### Scenario: stepName を持たない invocation は command 名でバケットされる

**Given** `command: "request-review"`（`stepName` 無し）の entry がある
**When** `specrunner usage` を実行する
**Then** "By step × model" セクションに `request-review` の見出しでその model 行が現れる

### Requirement: 既存の slug × model 集計を上位サマリとして維持する

`showUsageSummary` は従来の slug × model 集計（各 slug の model 別 token 内訳）と grand total を、引き続き
SHALL 出力する。step × model 交差表はこの slug 集計の下位に追加 MUST し、slug 集計を置き換えない。

#### Scenario: slug 別集計が引き続き表示される

**Given** archive に複数 slug の `usage.json` が存在する
**When** `specrunner usage` を実行する
**Then** 出力に各 slug の見出しと model 別 token 内訳（in/out/cacheRead/cacheCreate）が含まれ、さらに
grand total が表示される

### Requirement: 出力の各行に USD コストを表示する

slug × model 行・step × model 行・grand total 行のそれぞれに、USD コストを MUST 付与する。USD は
`"$" + 小数第4位` 形式で表示 SHALL する。

#### Scenario: 各集計行に cost 列が付く

**Given** 料金テーブルに登録済みの model を持つ usage データ
**When** `specrunner usage` を実行する
**Then** slug 行・step×model 行・grand total 行のいずれにも `cost=$<x.xxxx>` が表示される

### Requirement: USD コストはモデル別料金テーブルで計算する

USD コストは、model ごとの料金テーブル（input / output / cacheRead / cacheWrite の per-token 単価）を用いて
MUST 計算する。計算は `inputTokens`・`outputTokens`・`cacheReadInputTokens`・`cacheCreationInputTokens` の
4 要素にそれぞれの単価を乗じた合計 SHALL とする。

#### Scenario: 4 種の token に対応する単価で合算する

**Given** ある model の `ModelUsage` が input/output/cacheRead/cacheCreation の各 token を持つ
**When** その行のコストを計算する
**Then** コストは 4 種の token × 対応単価の総和に等しい

### Requirement: model key を正規化して料金テーブルへ解決する

料金テーブル解決は、model key 末尾の `-YYYYMMDD`（date suffix）を除去したうえで行う MUST。`[...]`（1M-context
等の context-window suffix）は別 SKU として保持し、`[1m]` 付きと無しを別 key として扱う SHALL。

#### Scenario: date suffix 付き key が解決される

**Given** model key が `claude-haiku-4-5-20251001` で、テーブルに `claude-haiku-4-5` が登録されている
**When** その行のコストを計算する
**Then** date suffix を除去した key で料金が解決され、コストが算出される

#### Scenario: 1M-context variant は別 key として扱われる

**Given** model key `claude-opus-4-6[1m]` と `claude-opus-4-6` がともに usage に現れる
**When** それぞれのコストを計算する
**Then** `[1m]` 付きは `[1m]` 用の単価、無しは標準単価で計算され、両者が混同されない

### Requirement: 料金未登録 model はコスト不明として明示する

料金テーブルに未登録の model 行は、コストを不明として `"$?"` で MUST 表示する。grand total の "Total cost" は
料金既知の分のみを合算 SHALL し、未登録 model が存在する場合はその件数を注記 MUST する。

#### Scenario: 未登録 model が $? で表示され total から除外される

**Given** 料金テーブルに無い model を含む usage データ
**When** `specrunner usage` を実行する
**Then** その model 行は `cost=$?` を表示し、"Total cost" は既知分のみの合計に
`(excludes N unpriced model(s))` の注記が付く

### Requirement: 集計出力が決定的に並ぶ

`showUsageSummary` の出力は実行ごとに決定的な順序で MUST 並ぶ。slug は名前昇順、step は合計コスト降順
（同点は名前昇順）、各セクション内の model はコスト降順（同点は名前昇順）で SHALL ソートする。

#### Scenario: 高コスト step が先頭に並ぶ

**Given** 合計コストの異なる複数 step を含む usage データ
**When** `specrunner usage` を実行する
**Then** "By step × model" セクションは合計コスト降順で step が並び、最も高コストな step が先頭に現れる

### Requirement: 既存の互換挙動を保つ

`modelUsage` が `null` の invocation は集計から除外 MUST する。`usage.json` を持たない archive entry は
silent skip し、その件数を末尾に注記 SHALL する。`bun run typecheck && bun run test` が green SHALL。

#### Scenario: usage.json 不在 archive が skip される

**Given** archive に `usage.json` を持たないディレクトリが存在する
**When** `specrunner usage` を実行する
**Then** その entry は集計に含まれず、出力末尾に `(K archive entries skipped — no usage.json)` が表示される
