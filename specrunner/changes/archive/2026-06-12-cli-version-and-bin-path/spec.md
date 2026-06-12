# Spec: 公開 CLI の体裁 — `--version` と bin パス正規化

## Requirements

### Requirement: `specrunner --version` は package version を報告する

CLI は `specrunner --version` で起動されたとき、package.json に宣言された version 文字列を
stdout に書き出し、command registry へ dispatch せずに exit code 0 で終了 MUST。

#### Scenario: --version で version を出力し exit 0

**Given** specrunner が単一引数 `--version` で起動される
**When** main() が引数を処理する
**Then** package.json の `version` 文字列が stdout に書き出される
**And** プロセスは exit code 0 で終了する

#### Scenario: ソース実行とバンドル実行の両方で version が解決される

**Given** version resolver が実行中モジュールのディレクトリを起点に探索する
**When** バンドル `dist/specrunner.js` として実行される（最寄り先祖 package.json は package root）、
または repo ソースとして実行される（最寄り先祖 package.json は repo root）
**Then** resolver はその package.json の `version` フィールドを返す

### Requirement: 未知 command の挙動が保たれる

CLI は、登録 command でも intercept 対象の top-level flag でもない引数を従来どおり未知 command として
扱い、`Unknown command:` メッセージを stderr に書き出して exit code 2 で終了 MUST。

#### Scenario: 未知 command は exit 2

**Given** specrunner が未登録の command トークンで起動される
**When** main() が引数を処理する
**Then** `Unknown command: <token>` が stderr に書き出される
**And** プロセスは exit code 2 で終了する

### Requirement: package.json の bin パスは `./` prefix を持たない

package manifest は `specrunner` の bin を、先頭の `./` を付けず `dist/specrunner.js` として
宣言 MUST。これにより npm publish が「invalid and removed」警告を出さない。

#### Scenario: bin 値が正規化されている

**Given** 公開される package manifest
**When** `specrunner` の bin エントリが読まれる
**Then** その値はちょうど `dist/specrunner.js` である
