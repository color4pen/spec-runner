## Purpose

TBD

## Requirements

### Requirement: symlink detection before fs.cp

`fs.cp` を呼び出す前に `fs.lstat` で symlink を検出し、symlink が存在する場合は `SpecRunnerError` を throw しなければならない (MUST)。対象は以下の3箇所:

- `src/core/runtime/local.ts` — request.md のコピー前
- `src/core/runtime/managed.ts` — request.md のコピー前
- `src/util/copy-artifacts.ts` — usage.json のコピー前

#### Scenario: symlink を渡すと SpecRunnerError が throw される

- Given: コピー元パスが symlink である
- When: `fs.cp` によるコピー操作が実行される前の symlink チェックが走る
- Then: `SpecRunnerError` が throw され、コピーは実行されない

### Requirement: shared symlink check utility

symlink チェックロジックは共通ユーティリティ関数として切り出し、3箇所すべてで再利用しなければならない (MUST)。

#### Scenario: 共通関数が各コピー箇所から呼ばれる

- Given: symlink チェック用ユーティリティ関数が存在する
- When: local.ts / managed.ts / copy-artifacts.ts の各コピー処理が実行される
- Then: すべての箇所で同一の共通関数を通じて symlink チェックが行われる

### Requirement: symlink check placed outside try/catch

`src/util/copy-artifacts.ts` における symlink チェックは既存の try/catch ブロックの外側に配置しなければならない (MUST)。try 内に配置すると `SpecRunnerError` が swallow される。

#### Scenario: SpecRunnerError が catch されずに伝播する

- Given: `copy-artifacts.ts` の symlink チェックが try/catch の外側にある
- When: コピー元が symlink であるため `SpecRunnerError` が throw される
- Then: エラーは catch されずに呼び出し元まで伝播する

### Requirement: normal file copy unchanged

symlink でない通常ファイルのコピーは従来通り動作しなければならない (MUST)。

#### Scenario: 通常ファイルは正常にコピーされる

- Given: コピー元パスが symlink でない通常ファイルである
- When: コピー操作が実行される
- Then: `SpecRunnerError` は throw されず、ファイルが正常にコピーされる
