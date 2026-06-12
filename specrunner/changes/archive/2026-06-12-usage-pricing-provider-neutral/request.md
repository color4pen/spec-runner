# usage / pricing と one-shot デフォルトモデルの provider 中立化

## Meta

- **type**: spec-change
- **slug**: usage-pricing-provider-neutral
- **base-branch**: main
- **adr**: true

## 背景

cost 集計と表示が Claude 系モデル前提になっており、OpenAI 系モデルで step を実行すると cost が `$?`（null）になる。Codex 移行後は全 step がこの状態になり、usage 可視性（job show の step 別 cost 表示）が事実上失われる。また one-shot クエリのデフォルトモデルが特定 provider のモデル名にハードコードされている。

## 現状コードの前提

- `src/core/usage/pricing.ts:31-95` — `MODEL_PRICING` テーブルは Claude 系モデルのみ（gpt / openai エントリ 0 件、grep 確認済み）。`lookupPricing()` は `-YYYYMMDD` サフィックスを正規化して lookup し、未知モデルは `computeCostUsd` が null を返す
- `src/adapter/claude-code/query-one-shot.ts:54` — デフォルトモデルが `"claude-sonnet-4-5"` にハードコード
- `src/config/model-registry.ts:13-29` — `BUILTIN_MODEL_REGISTRY` + `config.models` でモデル → provider の解決機構が既に存在する（pricing はこの registry と統合されていない）
- codex adapter は `turn.usage` から ModelUsage を集計済み（`src/adapter/codex/agent-runner.ts:308-318`）— 欠けているのは単価側のみ

## 要件

1. OpenAI / Codex 系モデルの単価を cost 計算で解決できるようにする。単価の置き場（MODEL_PRICING テーブルへの追加 / model registry への統合 / config での上書き可否）は design で決定し、判断理由を記録する
2. 未知モデルは現行どおり null（`$?` 表示）で壊れないことを維持する
3. one-shot クエリのデフォルトモデルのハードコードを解消する（config 経由の解決に揃える）

## スコープ外

- codex adapter の機能 parity（別 request: codex-adapter-parity）
- credential 管理（`anthropic.apiKey` 等の命名・構造）の中立化 — local runtime では SDK 側の認証に委譲されており現時点で実害がないため、実需が出た時点で別 request
- 課金レポートの新機能

## 受け入れ基準

- [ ] OpenAI 系モデル名で ModelUsage を与えたとき cost が数値で算出されることをテストで固定する
- [ ] 未知モデルで null が返ることをテストで固定する（退行なし）
- [ ] one-shot デフォルトモデルが config から解決されることをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- Codex 移行（6 月中）の usage 可視性確保。本 request は codex-adapter-parity と独立に並行実行可能（編集領域: core/usage / config、codex-adapter-parity は adapter/codex）
