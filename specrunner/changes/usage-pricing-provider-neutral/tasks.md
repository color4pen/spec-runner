# Tasks: usage / pricing と one-shot デフォルトモデルの provider 中立化

## T-01: `MODEL_PRICING` に OpenAI / Codex 系エントリを追加し、出典記述を provider 中立化する

- [ ] `src/core/usage/pricing.ts` の `MODEL_PRICING` に、`BUILTIN_MODEL_REGISTRY`
      （`src/config/model-registry.ts`）で provider `"openai"` として登録された全モデルのエントリを追加する:
  - 対象: `o3`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.1`, `gpt-5.5`
      （実装時に registry の openai エントリを再確認し、漏れなく追加する）
- [ ] 各 OpenAI エントリは `ModelPricing`（`input` / `output` / `cacheRead` / `cacheWrite`、USD per 1,000,000 tokens）
      を満たす。`cacheRead` に cached-input 単価、`cacheWrite` は `0`（OpenAI 系に cache write 課金は無い）を設定する（design D4）。
- [ ] 単価値は OpenAI 公式公開料金を出典としてコメントに出典・"as of" 日付を残す。公開単価が無いモデル名は
      最も近い公開 tier を近似として割り当て、近似である旨をコメントに明記する（既存 `[1m]` の "flat-rate
      approximation" 先例に倣う）。
- [ ] ファイル冒頭 / テーブル上部の出典コメントを provider 中立に改める（"Anthropic official pricing" 固定の記述を
      provider 横断＋各 provider 別出典の記述へ）。design D3。
- [ ] `ModelPricing` 型・`computeCostUsd` の計算式・`normalizeModelKey` の regex は変更しない。

**Acceptance Criteria**:
- `computeCostUsd("gpt-5.3-codex", usage)`（正の token）が有限の数値（非 `null`）を返す
- `lookupPricing(name)` が registry の全 openai モデルで非 `null`
- 既存 Claude エントリ・型・計算式は不変
- `bun run typecheck` が green

---

## T-02: one-shot デフォルトモデルを共有定数 `DEFAULT_ONE_SHOT_MODEL` に集約する

- [ ] `src/config/model-registry.ts` に `export const DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-4-5";` を新設
      （現行 one-shot デフォルト値を維持する。design D5）。コメントで「config が何も与えない場合の one-shot
      フォールバック」である旨を明記する。
- [ ] `src/adapter/claude-code/query-one-shot.ts` のインラインリテラル `opts.model ?? "claude-sonnet-4-5"`
      （`getStepExecutionConfig` 呼び出しの `model` フィールド）を `opts.model ?? DEFAULT_ONE_SHOT_MODEL` に置換し、
      `DEFAULT_ONE_SHOT_MODEL` を import する。解決チェーン（`getStepExecutionConfig`）自体は変更しない。
- [ ] `query-one-shot.ts` と `src/core/port/one-shot-query-client.ts` の doc コメント
      `Default: "claude-sonnet-4-5"` を `Default: DEFAULT_ONE_SHOT_MODEL（config 解決チェーン経由）` 相当へ更新する。

**Acceptance Criteria**:
- adapter / ポートに provider 固有のデフォルトモデルのインラインリテラルが残らない（grep で確認）
- `config.steps.defaults.model` が設定されている場合、`opts.model` 未指定で SDK query に渡る `model` が
  その値になる
- config も `opts.model` も無い場合、SDK query に渡る `model` が `DEFAULT_ONE_SHOT_MODEL` になる
- `bun run typecheck` が green

---

## T-03: pricing の unit test を追加 / 拡張する

- [ ] `tests/core/usage/pricing.test.ts` に以下を追加する:
  - OpenAI/Codex モデル（例: `gpt-5.3-codex`）で `computeCostUsd` が非 `null` の数値を返す
  - 同モデルで `computeCostUsd` の結果が、`MODEL_PRICING` エントリから 4 軸合算式で再計算した値と一致する
  - 未知モデル（例: `totally-unknown-model-xyz`）で `computeCostUsd` が `null`、`formatUsd(null)` が `"$?"`（退行なし）
  - drift guard: `BUILTIN_MODEL_REGISTRY`（`src/config/model-registry.ts` から import）の全モデル名について
    `lookupPricing(name)` が非 `null`（design D2 の invariant）

**Acceptance Criteria**:
- 上記ケースが green
- `bun run test` が green

---

## T-04: one-shot デフォルトモデルの config 解決 test を追加する

- [ ] `tests/unit/adapter/claude-code/query-one-shot.test.ts` に以下を追加する（既存のスタブ `QueryFn` で
      `options.model` を capture するパターンを流用）:
  - `config.steps.defaults.model` を設定し `opts.model` 未指定のとき、capture した `model` がその config 値になる
  - config に steps モデル設定が無く `opts.model` / `modelOverride` も無いとき、capture した `model` が
    `DEFAULT_ONE_SHOT_MODEL`（`src/config/model-registry.ts` から import）と等しい

**Acceptance Criteria**:
- 上記ケースが green
- `bun run typecheck && bun run test` が green

---

## T-05: 全体検証

- [ ] `bun run typecheck && bun run test` が green であることを確認する
- [ ] 受け入れ基準（OpenAI モデルで cost が数値 / 未知モデルで null / one-shot デフォルトが config 解決 /
      typecheck && test green）が満たされることを確認する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- request の受け入れ基準 4 項目をすべて満たす
