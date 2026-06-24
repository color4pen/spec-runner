# Tasks: provider-aware-init

## T-01: model registry を現行 Codex セットへ更新し、PROVIDER_DEFAULTS を追加する

対象ファイル: `src/config/model-registry.ts`

- [x] `BUILTIN_MODEL_REGISTRY` から OpenAI エントリ `o3`, `gpt-5.1`, `gpt-5.2-codex`,
      `gpt-5.3-codex` を削除する
- [x] `BUILTIN_MODEL_REGISTRY` に `"gpt-5.4-mini": { provider: "openai" }` と
      `"gpt-5.3-codex-spark": { provider: "openai" }` を追加する
- [x] `gpt-5.4`, `gpt-5.5` および全 anthropic エントリは変更しない
- [x] provider デフォルトテーブルを新しい export 定数として追加する。`Provider` 型・
      `BUILTIN_MODEL_REGISTRY` と同一ファイルに置く（新ファイルを作らない）:
  - `defaults`（全ステップ向け）と任意の `design`（高品質ステップ向け）を持つ型を定義する
  - `anthropic`: `defaults = "claude-sonnet-4-6"`、`design` は持たせない（design step の
    ハードコード `claude-opus-4-6[1m]` に解決させ、legacy scaffold 形状を保つ — design.md D3）
  - `openai`: `defaults = "gpt-5.4-mini"`、`design = "gpt-5.5"`
- [x] テーブルの各モデル名（全 provider の `defaults` / `design`）が `BUILTIN_MODEL_REGISTRY`
      に存在することをコメントで明示する（不変条件: init が書くモデルは必ず registry にある）

**Acceptance Criteria**:
- `BUILTIN_MODEL_REGISTRY` に `o3` / `gpt-5.1` / `gpt-5.2-codex` / `gpt-5.3-codex` が存在しない
- `BUILTIN_MODEL_REGISTRY` の `gpt-5.4-mini` / `gpt-5.3-codex-spark` が provider `openai`
- 新テーブルの全モデル名が `BUILTIN_MODEL_REGISTRY` のキーに含まれる
- anthropic エントリ・`gpt-5.4` / `gpt-5.5` が変更されていない

---

## T-02: init に provider オプションを追加し、scaffold を provider 対応にする

対象ファイル: `src/cli/init.ts`

- [x] `runInit` の options 型に `provider?: Provider`（T-01 で定義した `Provider` 型）を追加する。
      `runtime?` は既存のまま残す
- [x] `provider` 未指定時は `"anthropic"` を既定値とする
- [x] T-01 の provider デフォルトテーブルから、選択 provider のエントリを引く
- [x] scaffold 生成（`existingConfig.steps ?? { ... }` の `{ ... }` 部分）を provider 対応にする:
  - `steps.defaults` は従来どおり `{ model: <provider defaults>, maxTurns: null, timeoutMs: null }`
  - テーブルに `design` が定義されている場合のみ `steps.design = { model: <provider design> }` を
    追加する（anthropic では追加しない）
- [x] provider 名による `if` 分岐をハードコードしない。分岐はテーブル lookup と
      「`design` が定義されているか」の 1 判定のみに閉じる（design.md D1 / D3）
- [x] config-write-hygiene の挙動（グローバル config が存在すれば scaffold 生成を丸ごとスキップ）
      は維持する。provider 展開は「config 不在の初回生成」経路の中だけで行う
- [x] `delete runtime` / `delete anthropic` の既存処理、project scaffold 作成、ログ出力は変更しない

**Acceptance Criteria**:
- `runInit({ provider: "openai" })`（config 不在）で生成された config が
  `steps.defaults.model === "gpt-5.4-mini"` かつ `steps.design.model === "gpt-5.5"`
- `runInit({ provider: "anthropic" })`（config 不在）で生成された config が
  `steps.defaults.model === "claude-sonnet-4-6"` かつ `steps.design` キーを持たない
- `runInit({})`（config 不在、フラグなし）の結果が `runInit({ provider: "anthropic" })` と同一
- グローバル config が存在する場合、`provider` の値に関わらず config ファイルが書き換わらない

---

## T-03: command-registry の init エントリに provider フラグを追加する

対象ファイル: `src/cli/command-registry.ts`

- [x] `COMMANDS.init.flags` に
      `provider: { type: "string", values: ["anthropic", "openai"] as const }` を追加する
      （既存の `runtime` フラグは残す）
- [x] init handler で `parsed.flags["provider"]` を読み、`runInit({ runtime, provider })` に渡す。
      値域検証は flag-parser が担うため handler 側で再検証しない（design.md D5）
- [x] `provider` 未指定（`undefined`）はそのまま `runInit` に渡し、T-02 の既定値 `anthropic` に
      委ねる
- [x] login の `provider` フラグ（`values: ["github", "claude"]`）には触れない。init とは独立した
      別 `FlagDef` であり同名・別意味で問題ない

**Acceptance Criteria**:
- `specrunner init --provider openai` が引数エラーなく `runInit` に `provider: "openai"` を渡す
- `specrunner init --provider gemini` が flag parse error（exit 2 相当）になる
- `specrunner init`（フラグなし）が `provider: undefined` を渡し、従来どおり動作する

---

## T-04: deprecated モデルを参照する既存テストのフィクスチャを更新する

`o3` は registry テスト以外にも「有効な OpenAI モデル」のフィクスチャとして複数テストで
使われている。T-01 で `o3` を削除すると `validateConfig` が「not in the model registry」を投げ、
doctor は openai step を検出できなくなり、dispatch ルーティングは `CONFIG_INVALID` になる。
これらを現行 OpenAI モデル `gpt-5.4-mini` へ置換する（テストの意図＝「有効な openai モデル」は不変）。

対象ファイル:

- [x] `tests/config/model-registry.test.ts`
  - L29-30 の `BUILTIN_MODEL_REGISTRY["o3"]` / `["gpt-5.3-codex"]` 参照を、維持/追加された
    現行 openai モデル（例: `gpt-5.5` / `gpt-5.4-mini`）への参照に置換する
  - L71 の `resolveProvider("o3", merged)` を現行 openai モデル（例: `gpt-5.4-mini`）に置換する
- [x] `tests/config/schema.test.ts`
  - L128 / L137 / L463 の `model: "o3"` を `model: "gpt-5.4-mini"` に置換する
    （local 受理ケース・managed 拒否ケース・byRequestType managed 拒否ケースの意図は不変）
- [x] `tests/adapter/dispatching/agent-runner.test.ts`
  - L105 の `makeCtx("o3")` を `makeCtx("gpt-5.4-mini")` に置換する（openai → CodexAgentRunner
    へ dispatch する意図は不変）
- [x] `tests/core/doctor/checks/runtime/codex-cli.test.ts`
  - L45 / L63 / L78 の `model: "o3"` を `model: "gpt-5.4-mini"` に置換する（openai step 検出の
    意図は不変）

**Acceptance Criteria**:
- 上記 4 ファイルに `"o3"` / `"gpt-5.3-codex"` などの deprecated モデル名が残っていない
  （`tests/core/usage/pricing.test.ts` は `MODEL_PRICING` を参照しており本変更の対象外・変更しない）
- これらのテストが green

---

## T-05: provider-aware init と registry 整合性の新規テストを追加する

対象ファイル: `tests/init.test.ts`, `tests/config/model-registry.test.ts`

### init provider テスト（`tests/init.test.ts`）

- [x] `runInit({ provider: "openai" })`（config 不在）→ 生成 config に
      `steps.defaults.model: "gpt-5.4-mini"` と `steps.design.model: "gpt-5.5"` が含まれる
- [x] `runInit({ provider: "anthropic" })`（config 不在）→ `steps.defaults.model: "claude-sonnet-4-6"`
      かつ `steps.design` が undefined（legacy byte 一致）
- [x] `runInit({})`（config 不在、フラグなし）→ `runInit({ provider: "anthropic" })` と同一形状
      （`steps.design` undefined、`provider` フィールドなし）
- [x] グローバル config が存在する状態で `runInit({ provider: "openai" })` を実行しても config が
      書き換わらない（事前作成した config のコンテンツ不変）

### registry 整合性テスト（`tests/config/model-registry.test.ts`）

- [x] deprecated モデル（`o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex`）が
      `BUILTIN_MODEL_REGISTRY` に存在しないことを検査する
- [x] 現行モデル（`gpt-5.4-mini`, `gpt-5.3-codex-spark`）が provider `openai` で存在することを
      検査する
- [x] PROVIDER_DEFAULTS の全モデル名（全 provider の `defaults` / `design`）が
      `resolveProvider(name, merged)` で例外なく解決できることを検査する（init が書くモデルが
      必ず registry にある不変条件のガード）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- spec.md の全 Requirement のシナリオがテストでカバーされている
- 既存 init テスト（`runInit({})` 後方互換、TC-010 / TC-011 / config-write-hygiene 系）が引き続き
  green
