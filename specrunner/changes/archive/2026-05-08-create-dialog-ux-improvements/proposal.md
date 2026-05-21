# create 対話 REPL の UX 改善（スピナー + FINAL_DRAFT 出力簡素化）

## Why

PR #133 で対話 REPL の基本動作は修正されたが、2 つの UX 問題が残っている:

1. **LLM 応答待ち中に何も表示されない** — `query()` を呼んでから最初の `stream_event`（text_delta）が返るまでの間、ターミナルにフリーズして見える。ツール実行中（Read / Grep / Glob）も同様の無音区間がある
2. **FINAL_DRAFT で request.md の全文がターミナルに出力される** — 対話中に draft ファイルは随時更新されているのに、全文出力は冗長。ファイルパスだけ提示すれば十分

加えて、`processAssistantTurn` にストリーミング表示制御と制御フロー（slug 検出 / FINAL_DRAFT 検出 / ユーザー確認）が混在しており、責務が肥大化している。

## What Changes

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/cli/spinner.ts` | **新規作成** — ANSI エスケープによる簡易スピナー。`start()` / `stop()` の 2 メソッド。stderr 出力。非 TTY 無効化 |
| `src/core/command/create-dialog.ts` | `processAssistantTurn` からストリーミング表示制御を抽出。FINAL_DRAFT 検出時の出力変更（draft パス表示） |

### テストファイル

| ファイル | 変更内容 |
|---------|---------|
| `tests/unit/cli/spinner.test.ts` | **新規作成** — スピナーの start/stop、TTY/非 TTY テスト |
| `tests/unit/core/command/create-dialog.test.ts` | ストリーミング制御抽出後の動作テスト追加 |

## Capabilities

### New Capabilities

- **スピナー表示**: LLM 応答待ち中に stderr にスピナーアニメーションを表示
- **ツール実行表示**: `[tool] <summary>` 表示後、次の text_delta までスピナーを再開しない（チャタリング防止）

### Modified Capabilities

- **FINAL_DRAFT 出力**: 全文出力をそのまま残し、確認メッセージで draft ファイルパスを提示
- **processAssistantTurn**: ストリーミング表示制御を独立関数に抽出。制御フローに専念

## Impact

- `src/cli/spinner.ts` が新規ファイルとして追加される。外部依存なし（ANSI エスケープ自前実装）
- `processAssistantTurn` の内部構造が変わるが、戻り値（`AssistantTurnResult`）は変更なし。呼び出し元の `executeCreateDialog` への影響なし
- FINAL_DRAFT 検出後の確認フロー自体は維持。出力メッセージのみ変更
