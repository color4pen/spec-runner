# モデルカタログ更新: Claude 5 / GPT-5.6 世代の registry・pricing 追加と openai scaffold 既定の後継移行

## Meta

- **type**: spec-change
- **slug**: model-catalog-refresh
- **base-branch**: main
- **adr**: false

## 背景

プロバイダー両社で新世代モデルが利用可能になった。Anthropic は Claude 5 世代(claude-opus-5 / claude-sonnet-5 / claude-fable-5)、OpenAI は GPT-5.6 世代(gpt-5.6-sol / gpt-5.6-terra / gpt-5.6-luna)。いずれも built-in registry に無いため、config で指定すると `CONFIG_INVALID: Unknown model` で弾かれる。

また OpenAI は gpt-5.4 / gpt-5.4-mini を 2026-08-31 に Codex(ChatGPT アカウント認証)から引退させる。本プロジェクトの Codex 利用は ChatGPT アカウント認証であり(docs/model-evaluation.md 参照)、`specrunner init` が scaffold する openai 既定(gpt-5.4-mini / gpt-5.5)のうち gpt-5.4-mini は期限後に新規利用不能になるため、公式後継への移行が必要。

あわせて、pricing 表の OpenAI 行が全て「o3 tier 近似」のままで、gpt-5.5 は実勢($5/$30)の 2 倍($10/$40)で計上されており、usage レポートのコストが過大表示になっている。

## 現状コードの前提

- src/config/model-registry.ts:13-27 — `BUILTIN_MODEL_REGISTRY` は anthropic 9 エントリ(claude-opus-4-8 / 同[1m] / 4-7 / 4-6 / 同[1m] / 4-5、sonnet-4-6 / 4-5、haiku-4-5)+ openai 4 エントリ(gpt-5.5 / 5.4 / 5.4-mini / 5.3-codex-spark)
- src/config/model-registry.ts:49-57 — `PROVIDER_DEFAULTS.openai = { defaultModel: "gpt-5.4-mini", designModel: "gpt-5.5" }`
- src/config/model-registry.ts:77-86 — `resolveProvider` は merged registry に無いモデル名を `CONFIG_INVALID` で throw
- src/core/usage/pricing.ts:46-180 — `MODEL_PRICING`。OpenAI 行は全て「approximate using o3 tier」のコメント付き近似値(gpt-5.5 = input 10.0 / output 40.0 / cacheRead 2.5 / cacheWrite 0)
- src/core/usage/types.ts:50-54 — コメントが「claude-opus-5, claude-sonnet-5, claude-fable-5 は pricing 表に無いので computeCostUsd は null」と注記
- src/cli/init.ts:111-121 — scaffold は `PROVIDER_DEFAULTS` の defaultModel を `steps.defaults.model` に、designModel(定義時のみ)を `steps.design.model` に書く
- src/core/usage/pricing.ts:194-206 — `normalizeModelKey` は `-YYYYMMDD` サフィックスを除去、`[1m]` は別 SKU として保持

## 要件

1. `BUILTIN_MODEL_REGISTRY` に以下 6 モデルを追加する(既存エントリは全て現役のため削除・変更しない):
   - anthropic: `claude-opus-5`、`claude-sonnet-5`、`claude-fable-5`
   - openai: `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`
2. `MODEL_PRICING` に以下 6 行を追加する(USD/MTok。数値は本 request 記載値を正とする — 「外部事実」節参照):

   | key | input | output | cacheRead | cacheWrite |
   |---|---|---|---|---|
   | claude-opus-5 | 5.0 | 25.0 | 0.5 | 6.25 |
   | claude-sonnet-5 | 3.0 | 15.0 | 0.3 | 3.75 |
   | claude-fable-5 | 10.0 | 50.0 | 1.0 | 12.5 |
   | gpt-5.6-sol | 5.0 | 30.0 | 0.5 | 0 |
   | gpt-5.6-terra | 2.0 | 12.0 | 0.2 | 0 |
   | gpt-5.6-luna | 0.2 | 1.2 | 0.02 | 0 |

   claude-sonnet-5 行には「2026-08-31 まで introductory 価格 $2/$10 が適用されるため、期間中の SDK 実測 probe は本表と乖離する(本表は 2026-09-01 以降の定価)」とコメントを付す。
3. `MODEL_PRICING` の `gpt-5.5` 行を実価に修正する: input 10.0 → 5.0、output 40.0 → 30.0、cacheRead 2.5 → 0.5。「approximate using o3 tier」コメントを削除し、出典を「OpenAI 公表値(2026-08-09 確認)」に更新する。
4. `PROVIDER_DEFAULTS.openai` を公式後継に更新する: `defaultModel: "gpt-5.6-luna"`、`designModel: "gpt-5.6-sol"`。
5. src/core/usage/types.ts:50-54 のコメントを現状(Claude 5 世代も pricing 表に載る)に合わせて更新する。
6. 追加・変更した registry エントリ / pricing 行 / PROVIDER_DEFAULTS の値をテストで固定する。

## スコープ外

- Anthropic 側 step 既定モデル(src/core/step/*.ts の `*_AGENT_MODEL` 定数、design.ts の claude-opus-4-6[1m] 等)の世代更新 — 別 request で行う
- `DEFAULT_ONE_SHOT_MODEL`(claude-sonnet-4-5)の変更 — 現役モデルのため据え置き
- 新モデルの `[1m]` SKU 追加 — claude-opus-5 / sonnet-5 / fable-5 は 1M context がデフォルトのため `[1m]` の区別が存在しない
- `claude-mythos-5` の追加 — Project Glasswing 限定で一般利用不可
- gpt-5.4 / gpt-5.4-mini / gpt-5.3-codex-spark の既存 pricing 近似行の修正 — 公表単価が未確認のため、偽精度を避けて据え置き
- registry からの既存モデル削除 — gpt-5.4 系は API key 認証では 2026-08-31 以降も利用可能
- docs/model-evaluation.md の更新 — 実測評価を伴うため本 request の対象外

## 受け入れ基準

- [ ] 追加 6 モデルそれぞれについて `resolveProvider(name, mergeModelRegistry(config))` が正しい provider を返すことをテストで固定する
- [ ] `computeCostUsd` が追加 6 モデルおよび修正後 gpt-5.5 について本 request 記載の単価に基づく期待値を返すことをテストで固定する
- [ ] `PROVIDER_DEFAULTS.openai` が `{ defaultModel: "gpt-5.6-luna", designModel: "gpt-5.6-sol" }` であることをテストで固定する
- [ ] 既存テスト無変更で green
- [ ] `typecheck && test` が green

## 外部事実(本 request が正とする値 — コードベース外の情報のため pipeline では検証不能)

以下は 2026-08-09 に公式ドキュメント・公表価格から確認済み。レビューはこれらの値の再検証を試みず、本 request 記載値との一致を確認すること。

- Anthropic 定価(USD/MTok): claude-opus-5 $5/$25(opus-4-8 と同額)、claude-sonnet-5 $3/$15(2026-08-31 まで intro $2/$10)、claude-fable-5 $10/$50。cache 率は実測則どおり cacheRead = 0.1×input / cacheWrite = 1.25×input
- claude-opus-5 / sonnet-5 / fable-5 は 1M context window がデフォルト(別 SKU なし)
- OpenAI 定価(USD/MTok): gpt-5.6-sol $5/$30、gpt-5.6-terra $2/$12、gpt-5.6-luna $0.20/$1.20(2026-07-30 改定後)、gpt-5.5 $5/$30。cached input はいずれも input の 10%。cache write は無課金
- OpenAI 公式後継マッピング: gpt-5.4 → gpt-5.6-terra、gpt-5.4-mini → gpt-5.6-luna。gpt-5.4 / 5.4-mini は 2026-08-31 に Codex(ChatGPT アカウント認証)から引退(API key 認証は継続)
- gpt-5.3-codex-spark は research preview として存続

## architect 評価済みの設計判断

- **scaffold の defaultModel は gpt-5.6-luna(terra ではなく)**: OpenAI 公式の gpt-5.4-mini 後継指定が luna であり、「scaffold 既定は最安ライン、品質が必要な step は designModel と user config で上書き」という現行構造(gpt-5.4-mini / gpt-5.5 の関係)をそのまま踏襲する。terra を既定にする案は却下 — 既定コスト水準を現行方針から変える判断は本 request の目的(カタログ追随)を超える。
- **gpt-5.5 行の実価修正を本 request に含める**: 同一表の 1 行修正であり、分割するとレビュー文脈が分断される。他の OpenAI 近似行(gpt-5.4 系)は公表単価未確認のため触らない。
- **既存モデルの削除はしない**: 引退は Codex(ChatGPT 認証)経路のみで、API key 経路では継続利用可能。registry は「指定可能なモデルの台帳」であり、認証方式依存の可用性は registry の関心事にしない。
