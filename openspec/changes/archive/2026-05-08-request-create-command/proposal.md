# request.md を CLI 1 コマンドで生成する

## Problem

request.md は手動作成。毎回プロジェクトの文脈を一から組み立てる必要がある。

## Approach

CLI が DynamicContext + merged requests パターンを収集し、1 回の LLM query に注入して request.md を生成する。`specrunner create "<description>"` で完結。

## Key decisions

- 1 回の query() で完結（対話モード YAGNI）
- pipeline の外に配置（CommandRunner 不使用）
- slug は CLI が deterministic に生成
- コンテキスト注入は構造的サンプリング（同一 type 3 件 + 異 type 1 件）
- `--run` はデフォルト OFF
