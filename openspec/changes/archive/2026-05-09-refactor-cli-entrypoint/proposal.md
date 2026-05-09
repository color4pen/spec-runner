## Why

`bin/specrunner.ts` が 338 行の switch/case でコマンドをディスパッチしている。各コマンドのフラグパース（`--flag=value`、unknown flag 検出）が case ごとに重複しており、新コマンド追加のたびに肥大化する（architect レビュー Finding #11, MEDIUM）。

各コマンドハンドラは既に `src/cli/*.ts` に分離されているので、エントリポイントはディスパッチのみに縮小可能。

## What Changes

- フラグ定義をデータとして宣言する `CommandDef` 型と、コマンドごとの定義を持つレジストリを導入する
- `--flag=value` / `--flag value` 分解、unknown flag 検出、enum バリデーションを 1 関数に集約する
- `bin/specrunner.ts` をレジストリ lookup + parseFlags + handler 呼び出しのみに縮小する（目標 100 行以下）

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `cli-commands`: エントリポイントの内部構造を switch/case からコマンドレジストリ + 共通フラグパーサーに変更。外部動作は不変

## Impact

- `src/cli/flag-parser.ts`: 新規。`FlagDef`, `ParsedArgs`, `parseFlags()` を提供
- `src/cli/command-registry.ts`: 新規。全コマンドの `CommandDef` 定義とレジストリ
- `bin/specrunner.ts`: switch/case を削除し、レジストリベースのディスパッチに書き換え（338 行 → 100 行以下）
- `tests/unit/cli/specrunner-resume-dispatch.test.ts`: 既存テストが引き続き pass することを確認。必要に応じて調整
