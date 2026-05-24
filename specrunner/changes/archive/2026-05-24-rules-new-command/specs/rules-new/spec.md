# Spec: `specrunner rules new` コマンド

## Requirements

### Requirement: rules new コマンドの追加

CLI は `specrunner rules new <step-name> <rule-slug>` コマンドを提供しなければならない (MUST)。実行すると `specrunner/rules/<step-name>/<NN>-<rule-slug>.md` を生成し、stdout に作成パスを出力しなければならない (MUST)。ディレクトリが存在しない場合は自動作成しなければならない (MUST)。

#### Scenario: 正常系 — 新規ファイル生成

空の `specrunner/rules/implementer/` ディレクトリで `specrunner rules new implementer my-rule` を実行すると、`specrunner/rules/implementer/01-my-rule.md` が作成され、stdout にそのパスが出力される。

### Requirement: step 名の検証

CLI は `<step-name>` を `AGENT_STEP_NAMES` と突き合わせなければならない (MUST)。CLI step (verification / pr-create / delta-spec-validation) は受け付けてはならない (MUST NOT)。一致しない場合はエラー終了し、有効な agent step 名一覧を suggestion として表示しなければならない (MUST)。

#### Scenario: 不明な step 名

`specrunner rules new implmentor my-rule` を実行すると、stderr にエラーメッセージと有効な step 名候補が表示され、非ゼロ終了コードで終了する。

#### Scenario: CLI step の拒否

`specrunner rules new verification my-rule` を実行すると、エラー終了し candidates から verification は表示されない。

### Requirement: 番号 prefix の自動採番

CLI は `specrunner/rules/<step-name>/` 配下を scan し、既存ファイルの最大番号 + 1 でゼロパディング 2 桁の prefix を採番しなければならない (MUST)。空ディレクトリの場合は `01-` から開始しなければならない (MUST)。

#### Scenario: 既存ファイルがある場合の採番

`specrunner/rules/implementer/` に `01-foo.md` が存在する状態で `specrunner rules new implementer bar` を実行すると、`02-bar.md` が生成される。

#### Scenario: 空ディレクトリでの採番

ディレクトリが空の場合、生成ファイルは `01-<slug>.md` となる。

### Requirement: rule slug の sanitize

CLI は `<rule-slug>` の `_` および空白を `-` に変換し stderr に warning を出力しなければならない (MUST)。変換後に SLUG_REGEX で最終検証し、不合格の場合はエラー終了しなければならない (MUST)。

#### Scenario: アンダースコアの自動変換

`specrunner rules new implementer my_rule` を実行すると、stderr に warning が出力され、`my-rule` として処理される。

#### Scenario: 無効文字によるエラー終了

`specrunner rules new implementer my@rule` を実行すると、エラー終了コードで終了する。

### Requirement: 既存ファイルとの衝突回避

同名ファイルが既に存在する場合、CLI はエラー終了しなければならない (MUST)。上書きしてはならない (MUST NOT)。

#### Scenario: 衝突時のエラー

`specrunner/rules/implementer/01-my-rule.md` が存在する状態で `specrunner rules new implementer my-rule` を実行すると、ファイルは上書きされずエラーメッセージが出力される。

### Requirement: template の scaffold

生成ファイルは `## やめてほしいこと` / `## こうしてほしいこと` / `## 例外` の 3 セクションを含む template を含まなければならない (MUST)。冒頭に `<!-- ... -->` コメントで CLI 解釈なし・自由記述・番号 prefix が順序を決める旨・末尾優先方針を明示しなければならない (MUST)。template は source code 内の embedded const として保持しなければならない (MUST)。

#### Scenario: template 内容の確認

生成されたファイルを開くと、冒頭に `<!-- ... -->` コメントがあり、`## やめてほしいこと`・`## こうしてほしいこと`・`## 例外` の 3 セクションが含まれる。

### Requirement: help / error message

`specrunner rules --help` は step 名規約・番号 prefix の自動採番・推奨見出し・順序方針 (末尾優先) を含む usage を表示しなければならない (MUST)。エラーメッセージは step 名 typo / invalid slug / 既存衝突 のいずれも次のアクションを明示しなければならない (MUST)。

#### Scenario: rules --help の出力

`specrunner rules --help` を実行すると、step 名規約・採番ルール・推奨見出し・末尾優先方針を含む help テキストが stdout に出力される。

### Requirement: CLI surface 整合

`specrunner rules` は `request` と同型の noun-verb 構造でなければならない (MUST)。`bin/specrunner.ts` のコマンドルーティングに `rules` noun を登録しなければならない (MUST)。将来 `rules ls` / `rules show` を後追いで追加できる構造にしなければならない (MUST)。

#### Scenario: specrunner --help に rules が記載される

`specrunner --help` を実行すると、出力に `rules new` が記載されている。
