## MODIFIED Requirements

### Requirement: `specrunner` バイナリは 7 つのサブコマンドを提供する

`specrunner` CLI は SHALL `init`、`login`、`create`、`run`、`ps`、`doctor`、`finish` の 7 サブコマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。

`create` サブコマンドの引数 / フラグは MUST 以下の形式である:

```
specrunner create <description> [--type <type>] [--slug <slug>] [--no-llm] [--run]
```

- 第一引数 `<description>` は必須。request の説明文
- `--type <type>` は request の type（デフォルト: `new-feature`）
- `--slug <slug>` は request の slug（未指定時は description から自動生成）
- `--no-llm` は LLM を使わず scaffold テンプレートを出力するモード
- `--run` は `--no-llm` と組み合わせた場合のみ有効（対話モードでは無視）

#### Scenario: create コマンドの実行

- **WHEN** ユーザーが `specrunner create "description" --type new-feature --slug my-feature` を実行する
- **THEN** 対話型 REPL またはテンプレート出力（`--no-llm` 時）で request.md を生成する

## ADDED Requirements

### Requirement: `specrunner create` はデフォルトで対話モードを使用する

`specrunner create` は MUST `--no-llm` が指定されていない場合、対話型 REPL モードで request.md を生成する。`--no-llm` が指定された場合は SHALL scaffold テンプレートを出力する（既存の非対話動作を維持）。

#### Scenario: 対話モードの起動

- **WHEN** ユーザーが `specrunner create "description" --type new-feature --slug my-feature` を実行する
- **THEN** 対話型 REPL が起動し、`> ` プロンプトでユーザー入力を待つ

#### Scenario: --no-llm で scaffold テンプレート出力

- **WHEN** ユーザーが `specrunner create "description" --no-llm` を実行する
- **THEN** scaffold テンプレートを `specrunner/requests/active/<slug>/request.md` に書き出し、パスを stdout に出力して終了する

### Requirement: 対話モードは 4 phase 構造で動作する

対話モードは MUST 以下の 4 phase で構成される:

1. **initSession**: DynamicContext 収集 + request パターン収集 + system prompt 組み立て + `queryInteractive()` 呼び出し
2. **dialogLoop**: ユーザー入力 → SDK 応答のストリーミング表示のループ。SDK の generator prompt 経由で実現
3. **detectCompletion**: LLM が `<!-- FINAL_DRAFT -->` マーカーを含む最終版 request.md を提示したかの判定
4. **finalize**: ファイル書き出し + `parseRequestMdContent()` バリデーション + stdout 出力 + draft 削除

#### Scenario: 対話による要件練り上げ

- **GIVEN** 対話 REPL が起動している
- **WHEN** ユーザーが要件の詳細や修正要望を入力する
- **THEN** LLM がコードベースを Read / Grep / Glob で調査し、応答をストリーミング表示する

#### Scenario: LLM 応答のストリーミング表示

- **WHEN** LLM が応答を生成する
- **THEN** `stream_event` の `content_block_delta` → `text_delta` をリアルタイムに `process.stdout.write()` で出力する
- **AND** ツール実行（Read / Grep / Glob）の状況を `process.stderr` に `[tool] <summary>` 形式で表示する

#### Scenario: LLM 応答完了後のプロンプト表示

- **WHEN** LLM の応答が完了する
- **THEN** 改行 + `> ` プロンプトを表示してユーザー入力を待つ

### Requirement: `<!-- FINAL_DRAFT -->` マーカーで完了を検出する

LLM が request.md の全セクションが十分に埋まったと判断した場合、MUST `<!-- FINAL_DRAFT -->` マーカーに続けて最終版を提示する。CLI は SHALL このマーカーを検出して書き出し確認を行う。

#### Scenario: マーカー検出後の確認

- **WHEN** LLM の応答テキストに `<!-- FINAL_DRAFT -->` マーカーが含まれる
- **THEN** CLI が `この内容で request.md を書き出しますか？ [y/N]` と確認する

#### Scenario: 確認に y で応答

- **WHEN** ユーザーが `y` または `Y` と入力する
- **THEN** finalize phase に進み、`specrunner/requests/active/<slug>/request.md` にファイルを書き出す
- **AND** `parseRequestMdContent()` でバリデーションを実行する
- **AND** type と slug が入力パラメータと一致することを検証する
- **AND** パスを stdout に出力する

#### Scenario: 確認に n で応答

- **WHEN** ユーザーが `n` またはその他の入力をする
- **THEN** 対話を継続し、ユーザーが修正要望を入力できる

### Requirement: `exit` / `quit` 入力で draft を保存して終了する

ユーザーが REPL プロンプトで `exit` または `quit` と入力した場合、CLI は MUST 現在の draft を `specrunner/requests/draft/<slug>/` に保存して終了する。

#### Scenario: exit で draft 保存

- **WHEN** ユーザーが `> ` プロンプトで `exit` と入力する
- **THEN** 現在の draft を `specrunner/requests/draft/<slug>/request.md` に保存する
- **AND** メタデータを `specrunner/requests/draft/<slug>/draft-state.json` に保存する
- **AND** 正常終了する（exit code 0）

### Requirement: 対話モードは local runtime 専用である

対話モードは SHALL `LocalRuntime` の `queryInteractive()` メソッドを使用する。`ManagedRuntime` が渡された場合は MUST エラーメッセージを表示して exit code 1 で終了する。

#### Scenario: ManagedRuntime で対話モードを試みた場合

- **WHEN** `runtime: "managed"` の設定で `specrunner create` を対話モードで実行する
- **THEN** `Interactive mode requires local runtime.` を stderr に出力し、exit code 1 で終了する
