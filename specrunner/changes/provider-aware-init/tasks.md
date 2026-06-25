# Tasks: init で provider を選択し provider 別デフォルトモデルを scaffold に書く + model registry 更新

## T-01: `PROVIDER_DEFAULTS` テーブルを model-registry.ts に追加

- [ ] `src/config/model-registry.ts` に provider 別デフォルトの型と定数を追加する（既存 `Provider` 型・`BUILTIN_MODEL_REGISTRY` と同一ファイルに凝集。新ファイルを作らない）
- [ ] 型 `ProviderDefaults { defaultModel: string; designModel?: string }` を定義し、各フィールドの意味（`defaultModel` = `steps.defaults.model`、`designModel` = `steps.design.model`。省略時は design step の built-in に委ねる）を doc コメントで明記する
- [ ] 定数 `PROVIDER_DEFAULTS: Record<Provider, ProviderDefaults>` を `{ anthropic: { defaultModel: "claude-sonnet-4-6" }, openai: { defaultModel: "gpt-5.4-mini", designModel: "gpt-5.5" } }` で定義する。anthropic で `designModel` を省略する理由（design.ts:12 の built-in `claude-opus-4-6[1m]` と一致し、legacy scaffold とバイト一致を保つため）をコメントで残す
- [ ] `PROVIDER_DEFAULTS` を export する（init.ts から参照するため）

**Acceptance Criteria**:
- `PROVIDER_DEFAULTS.anthropic.defaultModel === "claude-sonnet-4-6"` かつ `PROVIDER_DEFAULTS.anthropic.designModel === undefined`
- `PROVIDER_DEFAULTS.openai.defaultModel === "gpt-5.4-mini"` かつ `PROVIDER_DEFAULTS.openai.designModel === "gpt-5.5"`
- 型 `ProviderDefaults` と定数 `PROVIDER_DEFAULTS` が `model-registry.ts` から export される
- `bun run typecheck` が green

## T-02: `BUILTIN_MODEL_REGISTRY` を現行 OpenAI モデルへ更新

- [ ] `src/config/model-registry.ts` の `BUILTIN_MODEL_REGISTRY` から openai エントリ `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex` を削除する
- [ ] 同 registry に openai エントリ `gpt-5.4-mini`, `gpt-5.3-codex-spark` を追加する
- [ ] `gpt-5.4`, `gpt-5.5` は維持する（既存）。anthropic 群は一切変更しない

**Acceptance Criteria**:
- `BUILTIN_MODEL_REGISTRY` に `o3` / `gpt-5.1` / `gpt-5.2-codex` / `gpt-5.3-codex` が存在しない
- `BUILTIN_MODEL_REGISTRY["gpt-5.4-mini"]?.provider === "openai"` かつ `BUILTIN_MODEL_REGISTRY["gpt-5.3-codex-spark"]?.provider === "openai"`
- `BUILTIN_MODEL_REGISTRY["gpt-5.4"]?.provider === "openai"` かつ `BUILTIN_MODEL_REGISTRY["gpt-5.5"]?.provider === "openai"`
- anthropic エントリの集合・値が変更前と同一

## T-03: registry 削除で red になる既存テスト fixture を存命モデルへ差し替え

> registry から `o3` 等を消すと、それらを fixture に使うテストが `CONFIG_INVALID` / 判定変化で red になる。T-02 と同一 request 内で必ず揃える。差し替え先は存命の openai モデル `gpt-5.4`。

- [ ] `tests/config/model-registry.test.ts` — `o3` / `gpt-5.3-codex` の存在・provider アサーション（L29-30, L71 付近）を存命モデル（例 `gpt-5.4` / `gpt-5.5`）へ書き換える。さらに新モデル `gpt-5.4-mini` / `gpt-5.3-codex-spark` が `openai` に解決されること、deprecated 4 モデルが registry に無いことのアサーションを追加する
- [ ] `tests/config/schema.test.ts` — `steps.*.model: "o3"` を使う fixture（L128, L137, L463 付近）の `"o3"` を `"gpt-5.4"` へ差し替える。各テストの意図（local で openai 受理 / managed で拒否）は変えない
- [ ] `tests/core/doctor/checks/runtime/codex-cli.test.ts` — `steps: { implementer: { model: "o3" } }`（L45, L63, L78 付近）の `"o3"` を `"gpt-5.4"` へ差し替える
- [ ] `tests/adapter/dispatching/agent-runner.test.ts` — `makeCtx("o3")`（L105 付近）の `"o3"` を `"gpt-5.4"` へ差し替える（openai dispatch の検証意図は不変）
- [ ] `src/core/usage/pricing.ts` / `tests/core/usage/pricing.test.ts` は変更しない（`MODEL_PRICING` は registry とは独立。スコープ外）

**Acceptance Criteria**:
- 上記 4 テストファイルに `"o3"` / `"gpt-5.3-codex"` の参照が残っていない（pricing 関連を除く）
- 各テストの検証意図（registry provider 解決 / schema 検証 / doctor 判定 / dispatch routing）が変更前と等価
- `tests/config/model-registry.test.ts` に新モデル追加・deprecated 削除の回帰アサーションがある

## T-04: init.ts に provider 解決と provider 別 scaffold 書き込みを実装

- [ ] `runInit` の options 型に `provider?: Provider`（`anthropic | openai`）を追加する。`runtime` の既存挙動は不変
- [ ] provider 解決 helper `resolveInitProvider(flagProvider, io: { isTTY, ask })` を追加する: flag があればそれを返す / 非 TTY なら `"anthropic"` / TTY なら `io.ask(...)` の結果を解釈（`"2"` / `"openai"` / `"o"` → openai、空・その他 → anthropic）。テスト可能なよう `ask` を注入できる seam にする
- [ ] 既定配線では `process.stdin.isTTY` と `node:readline`（`src/cli/login.ts` / `src/cli/managed.ts` と同じ `readline.createInterface({ input: process.stdin, output: process.stdout })` パターン）で `ask` を構成し、プロンプト後に interface を close する
- [ ] provider 解決とプロンプトは **config 不在ブロック（`if (!configExists)`）の内側**でのみ実行する。config 存在時は provider を聞かず scaffold を書かない（現行挙動維持）
- [ ] scaffold 生成時、`PROVIDER_DEFAULTS[provider]` を引いて `steps.defaults.model = defaultModel`（`maxTurns: null` / `timeoutMs: null` は現行どおり）を書く。`designModel` が定義されているときのみ `steps.design = { model: designModel }` を追加する。anthropic では `steps.design` を書かない（バイト一致維持）
- [ ] provider 分岐はこの scaffold 生成 1 箇所（`PROVIDER_DEFAULTS` lookup と `designModel` 有無判定）に閉じる。`if (provider === "openai")` のようなリテラル provider 条件式を散在させない

**Acceptance Criteria**:
- `runInit({ provider: "openai" })`（config 不在）で生成 config に `steps.defaults.model === "gpt-5.4-mini"` かつ `steps.design.model === "gpt-5.5"` が含まれる
- `runInit({ provider: "anthropic" })`（config 不在）で生成 config が従来と同一（`steps.defaults.model === "claude-sonnet-4-6"`、`steps.design` 不在、`anthropic` / `runtime` フィールド不在）
- `runInit({})`（flag 無し・非 TTY）で anthropic に解決し従来と同一の config を生成する
- config 存在時は `--provider` の有無に関わらず config 内容が不変で、プロンプトを出さない
- `resolveInitProvider` が flag / 非 TTY / TTY 各分岐で期待 provider を返す（fake `ask` でテスト可能）

## T-05: command-registry.ts の init エントリに `--provider` フラグを追加

- [ ] `COMMANDS.init.flags` に `provider: { type: "string", values: ["anthropic", "openai"] as const }` を追加する
- [ ] init handler で `parsed.flags["provider"]` を `Provider | undefined` として取り出し、`runInit({ runtime, provider })` に渡す
- [ ] `COMMANDS.login` の既存 `provider` フラグ（値域 `["github", "claude"]`）には触らない（別エントリ・別値域。衝突しない）

**Acceptance Criteria**:
- `specrunner init --provider openai` / `--provider anthropic` が受理され runInit に provider が渡る
- `--provider` に許可外の値を渡すと CLI flag 層で弾かれる
- login コマンドの provider フラグ挙動が不変
- `bun run typecheck` が green

## T-06: init provider 挙動の新規テストを追加

- [ ] `tests/init.test.ts`（既存 XDG_CONFIG_HOME 隔離パターンを流用）に provider scaffold テストを追加する:
  - `runInit({ provider: "openai" })` → `steps.defaults.model === "gpt-5.4-mini"` かつ `steps.design.model === "gpt-5.5"`
  - `runInit({ provider: "anthropic" })` → `steps.defaults.model === "claude-sonnet-4-6"` かつ `config.steps.design === undefined`
  - `runInit({})`（非 TTY、flag 無し）→ anthropic と同一 scaffold（後方互換）
  - config 既存時に `runInit({ provider: "openai" })` を実行しても config 内容が不変
- [ ] provider 解決 helper のユニットテストを追加する（flag 指定 / 非 TTY デフォルト anthropic / TTY で fake `ask` が openai を返す各ケース）。実 stdin・実 readline に依存しない

**Acceptance Criteria**:
- 受け入れ基準の 5 ケース（openai flag / anthropic flag / TTY 対話 / 非 TTY デフォルト / config 存在時不変）に対応するテストが green
- provider 解決 helper のテストが実 TTY/stdin に依存せず決定的に green

## T-07: 全体回帰ゲート

- [ ] `bun run typecheck && bun run test` が green
- [ ] 既存 init テスト（`runInit({})` 呼び出し群）が後方互換で green のまま
- [ ] arch 不変条件（DSM: composition-root → shared-kernel 参照のみ。shared-kernel `step-config.ts` 不変）が green

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- 既存 init / model-registry / schema / doctor / dispatching テストが全て green
- アーキテクチャ検証が green
