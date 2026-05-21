## Requirements

### Requirement: `specrunner managed` コマンドは `specrunner runtime` に rename される

`specrunner managed setup/status/reset` の全機能は `specrunner runtime setup/status/reset` として提供される。コマンド名以外の振る舞い・引数・フラグはすべて既存仕様を維持する。

旧 `specrunner managed` は SHALL NOT 動作する（`Unknown command: managed` を返す）。

#### Scenario: `specrunner runtime setup` が旧 `managed setup` と同等に動作する

- **WHEN** ユーザーが `specrunner runtime setup` を実行する
- **THEN** 既存の `specrunner managed setup` と同一の振る舞いで Anthropic Agent / Environment を設定し、exit code / stderr / stdout 出力は旧コマンドと同等である

#### Scenario: `specrunner runtime status` が旧 `managed status` と同等に動作する

- **WHEN** ユーザーが `specrunner runtime status` を実行する
- **THEN** 既存の `specrunner managed status` と同一の振る舞いで runtime 状態を表示し、exit code / stderr / stdout 出力は旧コマンドと同等である

#### Scenario: `specrunner runtime reset` が旧 `managed reset` と同等に動作する

- **WHEN** ユーザーが `specrunner runtime reset` を実行する
- **THEN** 既存の `specrunner managed reset` と同一の振る舞いで managed config をリセットし、exit code / stderr / stdout 出力は旧コマンドと同等である

#### Scenario: 旧 `specrunner managed` は廃止される

- **WHEN** ユーザーが `specrunner managed setup` を実行する
- **THEN** `Unknown command: managed` を stderr に出し exit code 2 で終了する（`runtime` への rename を示すヒントを含む）

## Renamed

- "`managed status` は `runtime != managed` のとき stale managed config を列挙する" → "`runtime status` は `runtime != managed` のとき stale managed config を列挙する"
- "`managed reset` は `runtime != managed` のとき警告を出し確認なしには destructive 操作を実行しない" → "`runtime reset` は `runtime != managed` のとき警告を出し確認なしには destructive 操作を実行しない"
- "`managed reset` の `--force` flag は runtime 不一致時の confirmation も bypass する" → "`runtime reset` の `--force` flag は runtime 不一致時の confirmation も bypass する"
- "non-TTY 環境では `--force` 無しの `managed reset` は中断する" → "non-TTY 環境では `--force` 無しの `runtime reset` は中断する"
