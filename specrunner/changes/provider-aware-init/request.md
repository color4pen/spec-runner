# init で provider を選択し、provider に応じたデフォルトモデルを scaffold に書く + model registry 更新

## Meta

- **type**: new-feature
- **slug**: provider-aware-init
- **base-branch**: main
- **adr**: false

## 背景

specrunner のデフォルトモデルは全ステップ `claude-sonnet-4-6` にハードコードされている。Codex（OpenAI）ユーザーが specrunner を使う場合、init 後に config の steps.defaults.model を手動で書き換える必要がある。

init で provider を選択させ、provider に応じたデフォルトモデルを scaffold に書くことで、どちらのプロバイダでも init → login → run で動くようにする。

加えて、model registry に含まれる OpenAI モデルが古い（`o3`, `gpt-5.1`, `gpt-5.2-codex` は deprecated）。現行の Codex CLI で使えるモデル（`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`）に更新する。

## 現状コードの前提

- `src/cli/init.ts:61` — scaffold に `model: "claude-sonnet-4-6"` を固定で書いている。provider を選択する対話フローがない
- `src/cli/init.ts:43` — config が既に存在する場合は scaffold 生成をスキップする（config-write-hygiene で修正済み）
- `src/config/model-registry.ts:13-28` — `BUILTIN_MODEL_REGISTRY` に `o3`, `gpt-5.1`, `gpt-5.2-codex` が含まれている。これらは Codex CLI で deprecated
- `src/config/model-registry.ts:35` — `DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-4-5"` が固定
- `src/config/schema.ts:337` — `SpecRunnerConfig.runtime?: "managed" | "local"` は存在するが、`provider` フィールドはない
- `src/adapter/dispatching/agent-runner.ts:28-30` — `resolveProvider()` でモデル名から provider を解決し、`"openai"` なら `CodexAgentRunner` に dispatch する。この仕組みは既に動いており、config の `steps.defaults.model` に OpenAI モデルを書けば全ステップが Codex で走る
- `src/core/step/design.ts:12` — design だけ `claude-opus-4-6[1m]`、他は全ステップ `claude-sonnet-4-6`。provider ごとにこの「design だけ高品質モデル」のパターンを再現する必要がある

## 要件

1. **init に provider 選択を追加**: `specrunner init` 実行時に `--provider anthropic|openai` フラグで provider を受け取る。フラグ省略時は `anthropic`（現行互換）
2. **provider に応じたデフォルトモデルを scaffold に書く**: provider ごとのデフォルトモデルテーブルを用意し、init が scaffold の `steps.defaults.model` と `steps.design.model` に対応するモデルを書く

   | 役割 | anthropic | openai |
   |---|---|---|
   | design（高品質） | `claude-opus-4-6[1m]` | `gpt-5.5` |
   | その他全ステップ | `claude-sonnet-4-6` | `gpt-5.4-mini` |

3. **model registry を更新**: deprecated な OpenAI モデルを削除し、現行モデルを追加する

   削除: `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex`
   追加: `gpt-5.4-mini`, `gpt-5.3-codex-spark`
   残す: `gpt-5.4`, `gpt-5.5`（既にある）

4. **既存 config がある場合は provider 選択しない**: config-write-hygiene で導入済みの「config が存在すれば触らない」挙動は維持する

## スコープ外

- `SpecRunnerConfig` に `provider` フィールドを追加すること — init が scaffold の `steps.defaults.model` に展開するだけで十分。config に provider を永続化する必要は今はない
- preflight / doctor での provider チェック — SDK の有無チェックは run 時に `loadOptionalProviderSdk()` が既にやっている
- 各ステップのハードコードモデル定数の変更 — resolution chain レベル5 として残す。config の `steps.defaults.model` が先に解決される
- `DEFAULT_ONE_SHOT_MODEL` の provider 対応 — one-shot query は別の使い方なので今回は対象外

## 受け入れ基準

- [ ] `specrunner init --provider openai` で生成された config に `steps.defaults.model: "gpt-5.4-mini"` と `steps.design.model: "gpt-5.5"` が含まれる
- [ ] `specrunner init --provider anthropic` で生成された config が従来と同一（`steps.defaults.model: "claude-sonnet-4-6"`）
- [ ] `specrunner init`（フラグなし）で生成された config が従来と同一（anthropic 互換）
- [ ] config が既に存在する場合、`--provider` の有無に関わらず config を書き換えない
- [ ] model registry から `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex` が削除されている
- [ ] model registry に `gpt-5.4-mini`, `gpt-5.3-codex-spark` が追加されている
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **init が scaffold の steps に展開する（採用）**: config に `provider` フィールドを持たず、init が `steps.defaults.model` と `steps.design.model` に直接書く。既存の 6-level resolution chain を一切変えない。最も侵襲が小さい
- **config に provider フィールドを追加する（却下）**: resolution chain に provider 解決層を足す必要があり、侵襲が大きい。init で scaffold に書くだけで同じ効果が得られるので不要
- **フラグ省略時は anthropic（採用）**: 既存ユーザーの挙動を変えない。Codex ユーザーは明示的に `--provider openai` を指定する
- **design だけ高品質モデル、他は汎用（採用）**: Claude の「opus/sonnet」パターンを OpenAI にも適用。design は `gpt-5.5`（フラグシップ）、他は `gpt-5.4-mini`（高速・低コスト）

## module-architect レビュー結果

### モジュール配置

- provider defaults テーブルは `src/config/model-registry.ts` に `PROVIDER_DEFAULTS` 定数として追加する。Provider 型 + BUILTIN_MODEL_REGISTRY と同一ファイルに凝集させる。新ファイル不要（cohesion）
- `src/cli/init.ts`（composition-root）は `PROVIDER_DEFAULTS` を参照するだけ。composition-root → shared-kernel の参照は DSM で許可済み
- `src/config/step-config.ts`（shared-kernel）は変更不要。provider の概念を持たない分離を維持する

### provider 条件式の散在防止

- provider 分岐は init.ts の scaffold 生成1箇所のみ（PROVIDER_DEFAULTS テーブルの lookup）
- run 時の dispatch は既存の `DispatchingAgentRunner` → `resolveProvider()` の chain が担い、init の変更とは独立
- provider 条件式の散在は構造的に起きない

### command-registry.ts のフラグ追加

- login が既に `provider` フラグを持つ（L260: `values: ["github", "claude"]`）。init の provider（anthropic / openai）とは値域が異なる。同名フラグだが意味が異なる点に注意
- init エントリの `flags` に `provider: { type: "string", values: ["anthropic", "openai"] }` を追加

### テストへの影響

- `tests/config/model-registry.test.ts:29` が `o3` を直接参照 → registry 更新で red になるためテスト側も更新が必要
- 既存 init テストは `runInit({})` でフラグなし呼び出し → デフォルト anthropic で後方互換
