# Tasks: モデルカタログ更新 (Claude 5 / GPT-5.6)

## T-01: BUILTIN_MODEL_REGISTRY に新世代 6 モデルを追加する

- [ ] `src/config/model-registry.ts` の `BUILTIN_MODEL_REGISTRY`(13-27 行)に anthropic 3 エントリを追加:
  `"claude-opus-5": { provider: "anthropic" }`、`"claude-sonnet-5": { provider: "anthropic" }`、
  `"claude-fable-5": { provider: "anthropic" }`
- [ ] 同オブジェクトに openai 3 エントリを追加:
  `"gpt-5.6-sol": { provider: "openai" }`、`"gpt-5.6-terra": { provider: "openai" }`、
  `"gpt-5.6-luna": { provider: "openai" }`
- [ ] 既存 13 エントリは削除・変更しない(順序・値ともに保持)

**Acceptance Criteria**:
- `BUILTIN_MODEL_REGISTRY` に上記 6 キーが存在し、それぞれ正しい provider を持つ
- 既存 13 エントリが無変更で残る
- `[1m]` サフィックス付きの新規エントリは追加しない(Claude 5 世代は 1M context がデフォルト)

## T-02: MODEL_PRICING に新世代 6 モデルの単価行を追加する

- [ ] `src/core/usage/pricing.ts` の `MODEL_PRICING`(46-180 行)に以下 6 行を追加(USD/MTok):
  - `claude-opus-5`: input 5.0 / output 25.0 / cacheRead 0.5 / cacheWrite 6.25
  - `claude-sonnet-5`: input 3.0 / output 15.0 / cacheRead 0.3 / cacheWrite 3.75
  - `claude-fable-5`: input 10.0 / output 50.0 / cacheRead 1.0 / cacheWrite 12.5
  - `gpt-5.6-sol`: input 5.0 / output 30.0 / cacheRead 0.5 / cacheWrite 0
  - `gpt-5.6-terra`: input 2.0 / output 12.0 / cacheRead 0.2 / cacheWrite 0
  - `gpt-5.6-luna`: input 0.2 / output 1.2 / cacheRead 0.02 / cacheWrite 0
- [ ] anthropic 新行は既存 Claude 行と同じ配置(anthropic 群)に、openai 新行は OpenAI 群に置く
- [ ] `claude-sonnet-5` 行に次のコメントを付す:「2026-08-31 まで introductory 価格 $2/$10 が
  適用されるため、期間中の SDK 実測 probe は本表と乖離する(本表は 2026-09-01 以降の定価)」
- [ ] 各新行に出典コメントを付す(Anthropic は実測則 cacheRead=0.1×input / cacheWrite=1.25×input、
  OpenAI は公表値 2026-08-09、gpt-5.6-luna は 2026-07-30 改定後)
- [ ] 既存の pricing 行(o3 / gpt-5.1 / gpt-5.2-codex / gpt-5.3-codex / gpt-5.4 / gpt-5.4-mini /
  gpt-5.3-codex-spark / 全 Claude 行)は本タスクでは変更しない

**Acceptance Criteria**:
- `MODEL_PRICING` に上記 6 キーが request 記載の単価どおりに存在する
- `lookupPricing` が 6 モデルすべてで非 null を返す
- pricing.test.ts の drift guard(全 registry エントリが pricing を持つ)が green のまま

## T-03: gpt-5.5 の pricing 行を実価に修正する

- [ ] `src/core/usage/pricing.ts` の `gpt-5.5` 行(157-163 行付近)を修正:
  input 10.0 → 5.0、output 40.0 → 30.0、cacheRead 2.5 → 0.5(cacheWrite は 0 のまま)
- [ ] 「approximate using o3 tier (no separate published price as of ...)」コメントを削除し、
  出典を「OpenAI 公表値(2026-08-09 確認)」に更新する
- [ ] gpt-5.5 以外の OpenAI 近似行のコメント・値は変更しない

**Acceptance Criteria**:
- `MODEL_PRICING["gpt-5.5"]` が `{ input: 5.0, output: 30.0, cacheRead: 0.5, cacheWrite: 0 }`
- gpt-5.5 行のコメントに「o3 tier」の文言が残っていない
- 他の OpenAI 行(gpt-5.4 系 / o3 等)が無変更

## T-04: PROVIDER_DEFAULTS.openai を公式後継に更新する

- [ ] `src/config/model-registry.ts` の `PROVIDER_DEFAULTS.openai`(53-56 行)を
  `{ defaultModel: "gpt-5.6-luna", designModel: "gpt-5.6-sol" }` に更新する
- [ ] `PROVIDER_DEFAULTS.anthropic` は無変更(defaultModel: claude-sonnet-4-6、designModel なし)
- [ ] init.ts の scaffold 書き込み経路(111-121 行)は変更しない — データ駆動で新値が自動的に流れる

**Acceptance Criteria**:
- `PROVIDER_DEFAULTS.openai` が `{ defaultModel: "gpt-5.6-luna", designModel: "gpt-5.6-sol" }`
- `PROVIDER_DEFAULTS.anthropic` が無変更
- `runInit({ provider: "openai" })` が生成する config の `steps.defaults.model` = gpt-5.6-luna、
  `steps.design.model` = gpt-5.6-sol

## T-05: types.ts のコメントを現状に合わせる

- [ ] `src/core/usage/types.ts:50-54` のコメントを更新する。「claude-opus-5 / claude-sonnet-5 /
  claude-fable-5 は pricing 表に無いので computeCostUsd は null」という記述は、これら 3 モデルが
  表に載った現状では誤り。「表に無いモデルでは computeCostUsd が null を返す」という一般則の記述は
  残し、具体例を実際に未収載のケースに置き換えるか、具体例(3 モデル名)を削除する
- [ ] `totalCostUsd` フィールドの説明としての整合性を保つ(挙動記述は変えない)

**Acceptance Criteria**:
- コメントに「claude-opus-5 / claude-sonnet-5 / claude-fable-5 が pricing 表に無い」という
  現状と矛盾する記述が残っていない
- computeCostUsd の挙動記述(表に無ければ null)の一般則は保持されている
- コードの挙動は変わらない(コメントのみの変更)

## T-06: 変更対象値を pin する既存 2 テストを新値に更新する

D4 で PROVIDER_DEFAULTS.openai の値を意図的に変えるため、旧値を直接 pin する既存 2 テストを
新値に更新する(意図的挙動変更に伴う正当な更新)。**この 2 箇所以外の既存テストは一切変更しない。**

- [ ] `tests/config/model-registry.test.ts` の TC-009(104-110 行):
  - `it("openai.defaultModel is gpt-5.4-mini")` → 期待値と it 名を `gpt-5.6-luna` に更新
  - `it("openai.designModel is gpt-5.5")` → 期待値と it 名を `gpt-5.6-sol` に更新
- [ ] `tests/init.test.ts` の openai scaffold テスト(470-486 行):
  - `expect(config.steps?.defaults?.model).toBe("gpt-5.4-mini")` → `"gpt-5.6-luna"`
  - `expect(config.steps?.design?.model).toBe("gpt-5.5")` → `"gpt-5.6-sol"`
  - it 名の文字列(「generates config with gpt-5.4-mini ... gpt-5.5 ...」)も新モデル名に追随
- [ ] 上記以外の `gpt-5.5` / `gpt-5.4-mini` 参照(config-source-metadata / step-config-trace /
  config-effective / codex adapter tests)は変更しない — これらは gpt-5.5 を任意の config fixture
  文字列として使うだけで、gpt-5.5 は registry に存続するため無影響

**Acceptance Criteria**:
- model-registry.test.ts TC-009 が gpt-5.6-luna / gpt-5.6-sol を assert して green
- init.test.ts の openai scaffold テストが gpt-5.6-luna / gpt-5.6-sol を assert して green
- 変更した 2 テスト以外の既存テストが無変更で green

## T-07: 追加・変更値を固定する新規テストを書く

test-materialize が spec から生成するテストに加え、受け入れ基準を満たす回帰固定テストを追加する
(既存テストファイルに追記可)。

- [ ] `tests/config/model-registry.test.ts` に、追加 6 モデルそれぞれについて
  `resolveProvider(name, mergeModelRegistry(makeConfig()))` が正しい provider(anthropic 3 /
  openai 3)を返すことを assert するテストを追加
- [ ] `tests/config/model-registry.test.ts` に、`PROVIDER_DEFAULTS.openai` が
  `{ defaultModel: "gpt-5.6-luna", designModel: "gpt-5.6-sol" }` であることを assert するテストを追加
  (T-06 の TC-009 更新でカバーされる場合は重複を避けてよい)
- [ ] `tests/core/usage/pricing.test.ts` に、追加 6 モデルおよび修正後 gpt-5.5 について
  `computeCostUsd` が spec.md の期待 USD(claude-opus-5=36.75 / claude-sonnet-5=22.05 /
  claude-fable-5=73.5 / gpt-5.6-sol=35.5 / gpt-5.6-terra=14.2 / gpt-5.6-luna=1.42 /
  gpt-5.5=35.5、usage は 4 カテゴリ各 1,000,000 tokens)を返すことを assert するテストを追加
- [ ] gpt-5.5 の回帰テストは修正後の 35.5 を assert し、旧近似の 52.5 でないことを担保する

**Acceptance Criteria**:
- 追加 6 モデルの resolveProvider テストが green
- 追加 6 モデル + 修正後 gpt-5.5 の computeCostUsd テストが期待 USD で green
- PROVIDER_DEFAULTS.openai の値を固定するテストが green
- `bun run typecheck && bun run test` が green(全既存テスト + 新規テスト)
