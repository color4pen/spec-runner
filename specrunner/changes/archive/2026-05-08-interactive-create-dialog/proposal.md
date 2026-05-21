## Why

PR #124 の 1-shot create は `query()` を一度呼んで結果を受け取るだけで、ユーザーとの対話なしに request.md を生成する。LLM がコードベースを十分に調査せず推測で書くため品質が低い。要件の練り上げ・深掘りができず、出力を手動で編集し直すことが常態化している。

R1（interactive-query-foundation）で `query()` が `prompt: AsyncIterable<SDKUserMessage>` を受け取る generator prompt と、`continue` / `resume` セッション継続をサポートした。この基盤の上に、create コマンドの本体を対話型 REPL に再設計する。

## What Changes

- `src/core/command/create-dialog.ts` に対話型 create の本体を新設。CommandRunner を継承せず、4 phase 構造（initSession → dialogLoop → detectCompletion → finalize）で構成
- `src/prompts/create-dialog.ts` に対話用 system prompt を新設。コードベース調査を積極的に行う指示と、`<!-- FINAL_DRAFT -->` マーカープロトコルを含む
- `src/state/draft-store.ts` に軽量な draft 永続化ストアを新設。`specrunner/requests/draft/<slug>/` に保存
- `src/cli/create.ts` のファサードを更新し、`--no-llm` 以外はデフォルトで対話モードに切り替え
- SDK の `stream_event` からテキストをリアルタイム表示し、ツール実行状況を簡潔に表示する UI 層を実装

## Capabilities

### New Capabilities

- `create-dialog`: 対話型 REPL による request.md 作成。4 phase 構造、ストリーミング表示、`<!-- FINAL_DRAFT -->` マーカーによる完了検出、draft 永続化

### Modified Capabilities

- `cli-commands`: `specrunner create` サブコマンドの振る舞いを対話モードに変更。`--no-llm` は既存の scaffold テンプレートを維持
- `request-management`: draft ライフサイクル（`specrunner/requests/draft/<slug>/`）の追加。finalize 時に `active/` へ移動

## Impact

- `src/core/command/create-dialog.ts`: 新規。対話エンジン本体（4 phase）
- `src/prompts/create-dialog.ts`: 新規。対話用 system prompt + 初回 user message builder
- `src/state/draft-store.ts`: 新規。draft の save / load / delete
- `src/cli/create.ts`: 変更。ファサードのルーティング（`--no-llm` 以外 → 対話モード）
- `src/core/command/create.ts`: 変更なし（`--no-llm` パス用に残置）
- `src/adapter/claude-code/message-types.ts`: 変更。stream_event 関連の type guard 追加
- テスト: 4 phase 各 phase のユニットテスト、マーカー検出、draft-store、ストリーミングパース
