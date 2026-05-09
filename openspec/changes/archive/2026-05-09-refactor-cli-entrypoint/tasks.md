## 1. フラグパーサーの実装

- [x] 1.1 `src/cli/flag-parser.ts` を新規作成。`FlagDef`, `ParsedArgs`, `FlagParseError` 型と `parseFlags()` 関数をエクスポートする
- [x] 1.2 `parseFlags()` の実装: `--flag=value` 分解、`--flag value`（string 型の次引数 consume）、boolean フラグ、`-h` → `help` マッピング、positional 引数の抽出
- [x] 1.3 unknown flag 検出で `FlagParseError` を throw する実装
- [x] 1.4 enum バリデーション（`FlagDef.values` に含まれない値で `FlagParseError`）の実装
- [x] 1.5 required positional 不足で `FlagParseError` を throw する実装

## 2. フラグパーサーのテスト

- [x] 2.1 `tests/unit/cli/flag-parser.test.ts` を新規作成
- [x] 2.2 `--flag=value` 形式の string フラグパースのテスト
- [x] 2.3 `--flag value` 形式（スペース区切り）の string フラグパースのテスト
- [x] 2.4 boolean フラグのテスト
- [x] 2.5 `-h` が `help: true` にマッピングされるテスト
- [x] 2.6 unknown flag で FlagParseError が throw されるテスト
- [x] 2.7 enum 制約違反で FlagParseError が throw されるテスト
- [x] 2.8 required positional 不足で FlagParseError が throw されるテスト
- [x] 2.9 positional と flag が混在する場合のテスト

## 3. コマンドレジストリの実装

- [x] 3.1 `src/cli/command-registry.ts` を新規作成。`CommandDef`, `ParentCommandDef`, `CommandEntry` 型をエクスポートする
- [x] 3.2 `COMMANDS: Record<string, CommandEntry>` を定義し、全 9 コマンド（init, login, run, request, ps, doctor, finish, rm, resume）のフラグ定義と handler を登録する
- [x] 3.3 各 handler 内で `ParsedArgs` → 既存ハンドラ引数への変換を実装する。変換ロジックが現在の `bin/specrunner.ts` の各 case と同一動作になることを確認する
- [x] 3.4 `request` コマンドを `ParentCommandDef` として定義し、`template` と `validate` サブコマンドの handler を実装する
- [x] 3.5 `finish` コマンドの handler で `--help` フラグ時に `FINISH_USAGE` を出力して exit(0) する処理を実装する
- [x] 3.6 `init` コマンドの handler で `--runtime` の enum バリデーションエラーメッセージを現在と同等にする（`Unknown --runtime value: "...". Valid values are "managed" or "local".`）

## 4. エントリポイントの書き換え

- [x] 4.1 `bin/specrunner.ts` から switch/case ブロック全体を削除する
- [x] 4.2 `COMMANDS` と `parseFlags`, `FlagParseError` を import し、レジストリベースのディスパッチを実装する
- [x] 4.3 subcommand 分岐（`"subcommands" in entry`）を実装する
- [x] 4.4 `FlagParseError` の catch で `process.stderr.write(e.message)` + usage 出力 + `process.exit(2)` を実装する
- [x] 4.5 handler 内の非 FlagParseError（ランタイムエラー）は現在と同様に `Fatal:` プレフィックスで stderr 出力 + `process.exit(1)` する
- [x] 4.6 `USAGE` と `FINISH_USAGE` の export を維持する
- [x] 4.7 `bin/specrunner.ts` が 100 行以下であることを確認する

## 5. 既存テストの調整

- [x] 5.1 `tests/unit/cli/specrunner-resume-dispatch.test.ts` が pass することを確認する。mock パスや呼び出し形式が変わった場合は調整する
- [x] 5.2 `command-registry.ts` が各ハンドラを import するため、テスト側の mock が正しく intercept されることを確認する

## 6. 検証

- [x] 6.1 `bun run typecheck` が green
- [x] 6.2 `bun run test` が green
