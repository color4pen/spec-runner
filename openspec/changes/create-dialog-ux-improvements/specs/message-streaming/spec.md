# Delta Spec: message-streaming (create-dialog-ux-improvements)

## ADDED Requirements

### Requirement: LLM 応答待ちスピナー

`query()` 呼び出しから最初の text_delta 受信までの間、MUST stderr にスピナーアニメーションを表示する。

`process.stderr.isTTY === false` の場合、スピナーは MUST 無効化される（ANSI エスケープがゴミ文字になるのを防止）。

#### Scenario: スピナー表示と停止

- **WHEN** `query()` が呼び出される
- **THEN** stderr にスピナーアニメーションが表示される
- **AND** 最初の text_delta を受信するとスピナーが消えてテキストが表示される

#### Scenario: 非 TTY 環境

- **WHEN** `process.stderr.isTTY === false`（パイプ環境等）
- **THEN** スピナーは表示されない（`start()` が no-op）

### Requirement: ツール実行中の表示制御

tool_use_summary 受信時は MUST スピナーを停止して `[tool] <summary>` を stderr に表示する。次の text_delta を受信するまでスピナーは MUST NOT 再開しない（チャタリング防止）。

#### Scenario: ツール実行表示

- **WHEN** tool_use_summary が受信される
- **THEN** スピナーが停止し `[tool] <summary>` が stderr に表示される
- **AND** 次の text_delta を受信してもスピナーは再開しない

#### Scenario: ツール連続実行

- **WHEN** tool_use_summary が連続して受信される
- **THEN** 各 `[tool] <summary>` が順番に表示される
- **AND** スピナーは再開しない

### Requirement: スピナーモジュール

スピナーは MUST `src/cli/spinner.ts` に独立モジュールとして実装される。`createSpinner()` ファクトリ関数が `{ start(): void; stop(): void }` を返す MUST。外部ライブラリ（ora 等）は MUST NOT 使用しない。

#### Scenario: createSpinner の API

- **WHEN** `createSpinner()` を呼び出す
- **THEN** `{ start, stop }` オブジェクトが返される
- **AND** `start()` でスピナーが開始、`stop()` で停止する

## MODIFIED Requirements

### Requirement: FINAL_DRAFT 検出時の表示

FINAL_DRAFT 検出時、ストリーミング出力済みの全文は MUST NOT ANSI エスケープでクリアしない（そのまま残す）。検出後の確認メッセージで MUST draft ファイルのパスを表示する:

```
request.md を作成しました: specrunner/requests/draft/<slug>/request.md

この内容で request.md を書き出しますか？ [y/N]
```

#### Scenario: FINAL_DRAFT 検出時の表示

- **WHEN** FINAL_DRAFT マーカーが検出される
- **AND** slug が確定済みである
- **THEN** ストリーミング出力済みの全文はそのまま残る
- **AND** draft ファイルパスが stderr に表示される
- **AND** 書き出し確認 `[y/N]` が表示される

#### Scenario: slug 未確定時の FINAL_DRAFT

- **WHEN** FINAL_DRAFT マーカーが検出される
- **AND** slug が未確定である
- **THEN** draft ファイルパスは表示されない（パスを構成できないため）
- **AND** 書き出し確認 `[y/N]` は表示される

### Requirement: processAssistantTurn のストリーミング制御抽出

`processAssistantTurn` からストリーミング表示制御（スピナー start/stop + text_delta の stdout 出力 + tool_use_summary の stderr 出力）は MUST 独立関数 `consumeStream()` に抽出される。`processAssistantTurn` は制御フロー（slug 検出 / FINAL_DRAFT 検出 / ユーザー確認）に MUST 専念する。

#### Scenario: consumeStream による責務分離

- **WHEN** processAssistantTurn が呼び出される
- **THEN** ストリーミング I/O は consumeStream() に委譲される
- **AND** processAssistantTurn は slug 検出 / FINAL_DRAFT 検出 / ユーザー確認のみ担当する
