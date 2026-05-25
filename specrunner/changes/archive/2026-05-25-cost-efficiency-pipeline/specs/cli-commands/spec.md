# cli-commands Specification (delta)

## Requirements

### Requirement: specrunner usage subcommand

`specrunner usage [<slug>]` SHALL be a top-level subcommand that aggregates and displays token usage.

- 引数なし: 全 archive を走査し、slug ごとの total token 数サマリを表示する
- slug 指定: 該当 slug の `usage.json` を読み込み、entry ごと / model 別 / total を詳細表示する

#### Scenario: slug 指定で usage 詳細を表示

- WHEN `specrunner usage my-feature` を実行する
- AND `specrunner/changes/archive/*-my-feature/usage.json` が存在する
- THEN `usage.json` の各 `commandInvocations` entry が行ごとに表示される
- AND model 別の total token 数が末尾に表示される
- AND exit code 0 を返す

#### Scenario: slug が active change にある

- WHEN `specrunner usage my-feature` を実行する
- AND `specrunner/changes/my-feature/usage.json` が存在する (archive にはない)
- THEN active change の `usage.json` が読み込まれて表示される
- AND exit code 0 を返す

#### Scenario: slug が見つからない

- WHEN `specrunner usage nonexistent` を実行する
- AND 該当する active change も archive も存在しない
- THEN stderr に "No usage data found for slug 'nonexistent'" を出力する
- AND exit code 1 を返す

#### Scenario: 同一 slug が複数日付の archive に存在

- WHEN `specrunner usage my-feature` を実行する
- AND `archive/2026-05-20-my-feature/` と `archive/2026-05-25-my-feature/` が存在する
- THEN 最新日付 (`2026-05-25`) の archive の `usage.json` が使用される

#### Scenario: 引数なしで全 archive サマリを表示

- WHEN `specrunner usage` を実行する
- THEN 全 archive ディレクトリを走査する
- AND `usage.json` が存在する archive ごとに slug + total token 数を 1 行で表示する
- AND `usage.json` が存在しない archive は silent skip する
- AND skip された archive 数を末尾に表示する
- AND exit code 0 を返す

### Requirement: request review の usage.json 副作用

`specrunner request review <slug>` SHALL append a `CommandInvocation` entry to `specrunner/drafts/<slug>/usage.json` after the LLM invocation completes.

#### Scenario: slug 指定での review 後に usage が記録される

- WHEN `specrunner request review my-slug` を実行する
- AND review が正常完了する
- THEN `specrunner/drafts/my-slug/usage.json` の `commandInvocations` に `command: "request-review"` の entry が追加される
- AND entry に `timestamp` (ISO 8601) と `modelUsage` が含まれる

#### Scenario: 2 回 review で entries が累積する

- WHEN `specrunner request review my-slug` を 2 回実行する
- THEN `usage.json` の `commandInvocations` に 2 entry 蓄積される (上書きされない)

#### Scenario: file path 指定で slug 解決できない場合

- WHEN `specrunner request review /tmp/random-request.md` を実行する
- AND file path から slug が特定できない
- THEN review は通常通り実行され結果が表示される
- AND usage.json への追記は silent skip される (warning ログのみ)

#### Scenario: usage tracking 失敗時にレビュー出力がブロックされない

- WHEN `specrunner request review my-slug` を実行する
- AND usage.json への書き込みが何らかの理由で失敗する
- THEN review 結果は通常通り stdout に出力される
- AND exit code は review verdict に基づいて決定される (usage 失敗の影響なし)

### Requirement: request generate の usage.json 副作用

`specrunner request generate "<text>"` SHALL append a `CommandInvocation` entry to `specrunner/drafts/<slug>/usage.json` after the LLM invocation completes.

#### Scenario: generate 後に usage が記録される

- WHEN `specrunner request generate "add dark mode"` を実行する
- AND generate が正常完了する
- THEN 生成された slug に対応する `specrunner/drafts/<slug>/usage.json` に `command: "request-generate"` の entry が追加される
