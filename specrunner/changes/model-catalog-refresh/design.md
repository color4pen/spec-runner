# Design: モデルカタログ更新 (Claude 5 / GPT-5.6)

## Context

プロバイダー両社の新世代モデルが built-in registry に無いため、config で指定すると
`resolveProvider` が `CONFIG_INVALID: Unknown model` で弾く。あわせて (a) OpenAI が
gpt-5.4 / gpt-5.4-mini を 2026-08-31 に Codex(ChatGPT アカウント認証)から引退させ、
本プロジェクトの Codex 利用は ChatGPT アカウント認証のため `specrunner init` の openai
scaffold 既定 (gpt-5.4-mini) が期限後に新規利用不能になる。(b) `MODEL_PRICING` の
OpenAI 行が全て「o3 tier 近似」のままで、gpt-5.5 が実勢の 2 倍で計上され usage レポートの
コストが過大表示になっている。

対象コード(先行 request-review により attestation 済み、hash 一致):

- `src/config/model-registry.ts:13-27` — `BUILTIN_MODEL_REGISTRY`(anthropic 9 + openai 4)
- `src/config/model-registry.ts:49-57` — `PROVIDER_DEFAULTS.openai = { defaultModel: "gpt-5.4-mini", designModel: "gpt-5.5" }`
- `src/config/model-registry.ts:77-86` — `resolveProvider` は未知モデルを `CONFIG_INVALID` で throw
- `src/core/usage/pricing.ts:46-180` — `MODEL_PRICING`(gpt-5.5 行 = input 10 / output 40 / cacheRead 2.5 / cacheWrite 0、「approximate using o3 tier」コメント)
- `src/core/usage/types.ts:50-54` — Claude 5 世代が pricing 表に無いと注記するコメント
- `src/cli/init.ts:111-121` — scaffold が `PROVIDER_DEFAULTS.defaultModel` を `steps.defaults.model` に、`designModel`(定義時のみ)を `steps.design.model` に書く

本 change は data-table 更新(registry エントリ / pricing 行 / provider 既定)と 1 箇所の
コメント修正のみ。関数シグネチャ・制御フロー・型は一切変えない。

**外部事実の権威**: 単価・後継マッピング・引退日はコードベース外の情報であり pipeline では
再検証不能。本 change は request.md「外部事実」節の記載値を唯一の正とし、レビューは
再検証を試みず request 記載値との一致のみを確認する(request.md 指示に従う)。

## Goals / Non-Goals

**Goals**:

- Claude 5 世代(claude-opus-5 / claude-sonnet-5 / claude-fable-5)と GPT-5.6 世代
  (gpt-5.6-sol / gpt-5.6-terra / gpt-5.6-luna)を `BUILTIN_MODEL_REGISTRY` に追加し、
  config で指定可能にする。
- 追加 6 モデルの単価を `MODEL_PRICING` に追加し、`computeCostUsd` が正しいコストを返す。
- gpt-5.5 の pricing 行を実価(input 5 / output 30 / cacheRead 0.5)に修正し、コスト過大表示を解消する。
- `PROVIDER_DEFAULTS.openai` を公式後継(defaultModel: gpt-5.6-luna、designModel: gpt-5.6-sol)に更新する。
- `src/core/usage/types.ts` のコメントを現状(Claude 5 世代が pricing 表に載る)に合わせる。
- 追加・変更した値をテストで固定する。

**Non-Goals**(request スコープ外を厳守):

- Anthropic 側 step 既定モデル(`*_AGENT_MODEL` 定数、design.ts の claude-opus-4-6[1m] 等)の世代更新 — 別 request。
- `DEFAULT_ONE_SHOT_MODEL`(claude-sonnet-4-5)の変更 — 現役のため据え置き。
- 新モデルの `[1m]` SKU 追加 — Claude 5 世代は 1M context がデフォルトで別 SKU が存在しない。
- `claude-mythos-5` の追加 — 一般利用不可。
- gpt-5.4 / gpt-5.4-mini / gpt-5.3-codex-spark の既存 pricing 近似行の修正 — 公表単価未確認、偽精度回避のため据え置き。
- registry からの既存モデル削除 — API key 認証では 2026-08-31 以降も利用可能。
- `docs/model-evaluation.md` の更新 — 実測評価を伴うため対象外。

## Decisions

### D1: registry には追加のみ、既存エントリは削除・変更しない

新規 6 エントリを `BUILTIN_MODEL_REGISTRY` に追記し、既存 13 エントリは触らない。

- **Rationale**: gpt-5.4 系の引退は Codex(ChatGPT 認証)経路のみで、API key 認証では継続利用可能。
  registry は「指定可能なモデルの台帳」であり、認証方式依存の可用性は registry の関心事にしない
  (architect 評価済み)。
- **Alternatives considered**: 引退モデルを registry から削除する案 → 却下。API key 経路の
  利用者を破壊し、registry の責務(台帳)と可用性(認証依存)を混同する。

### D2: pricing 値は request 記載値を正とし、新規 6 行を追加する

`MODEL_PRICING` に以下 6 行を追加(USD/MTok):

| key | input | output | cacheRead | cacheWrite |
|---|---|---|---|---|
| claude-opus-5 | 5.0 | 25.0 | 0.5 | 6.25 |
| claude-sonnet-5 | 3.0 | 15.0 | 0.3 | 3.75 |
| claude-fable-5 | 10.0 | 50.0 | 1.0 | 12.5 |
| gpt-5.6-sol | 5.0 | 30.0 | 0.5 | 0 |
| gpt-5.6-terra | 2.0 | 12.0 | 0.2 | 0 |
| gpt-5.6-luna | 0.2 | 1.2 | 0.02 | 0 |

claude-sonnet-5 行には「2026-08-31 まで introductory 価格 $2/$10 が適用されるため、期間中の
SDK 実測 probe は本表と乖離する(本表は 2026-09-01 以降の定価)」とコメントを付す。新規行は
出典(Anthropic 実測則 / OpenAI 公表値 2026-08-09、luna は 2026-07-30 改定後)を明記する。

- **Rationale**: Anthropic cache 率は実測則(cacheRead = 0.1×input / cacheWrite = 1.25×input)、
  OpenAI は cached input = 0.1×input / cache write 無課金。表の各値はこの則と request 記載値に一致する。
- **Alternatives considered**: SDK probe で自動導出 → 却下。intro 価格期間中は probe が定価と乖離し、
  外部事実(定価)を正とする方針に反する。

### D3: gpt-5.5 行は in-place 修正し、他の OpenAI 近似行は触らない

gpt-5.5 行を input 10→5 / output 40→30 / cacheRead 2.5→0.5 に修正し、
「approximate using o3 tier」コメントを削除、出典を「OpenAI 公表値(2026-08-09 確認)」に更新する。
cacheWrite は 0 のまま(変更なし)。gpt-5.4 / gpt-5.4-mini / gpt-5.3-codex-spark / o3 /
gpt-5.1 / gpt-5.2-codex / gpt-5.3-codex の近似行は据え置く。

- **Rationale**: 同一表の 1 行修正であり、分割するとレビュー文脈が分断される(architect 評価済み)。
  他の OpenAI 近似行は公表単価未確認のため、偽精度を避けて触らない。
- **Alternatives considered**: gpt-5.5 修正を別 request に分離 → 却下(文脈分断)。
  全 OpenAI 行を一括で実価化 → 却下(未確認値で偽精度を生む)。

### D4: scaffold の openai 既定を gpt-5.6-luna / gpt-5.6-sol に更新する

`PROVIDER_DEFAULTS.openai = { defaultModel: "gpt-5.6-luna", designModel: "gpt-5.6-sol" }`。
init scaffold の書き込み経路(init.ts:111-121)はデータ駆動で不変 —
defaultModel が `steps.defaults.model` に、designModel が `steps.design.model` に流れる。

- **Rationale**: OpenAI 公式の後継指定が gpt-5.4-mini → gpt-5.6-luna。「scaffold 既定は最安ライン、
  品質が必要な step は designModel と user config で上書き」という現行構造(gpt-5.4-mini / gpt-5.5 の
  関係)をそのまま踏襲する(architect 評価済み)。
- **Alternatives considered**: defaultModel に gpt-5.6-terra を採用 → 却下。既定コスト水準を現行方針から
  変える判断は本 request の目的(カタログ追随)を超える。

### D5: 既存 2 テストの「旧既定値」assertion を新値に更新する(意図的挙動変更)

D4 で PROVIDER_DEFAULTS.openai の値を意図的に変えるため、旧値を pin している既存 2 テストは
新値に更新する:

- `tests/config/model-registry.test.ts:104-110` (TC-009): `openai.defaultModel` = gpt-5.4-mini →
  gpt-5.6-luna、`openai.designModel` = gpt-5.5 → gpt-5.6-sol。
- `tests/init.test.ts:471-485`: scaffold の `steps.defaults.model` = gpt-5.4-mini → gpt-5.6-luna、
  `steps.design.model` = gpt-5.5 → gpt-5.6-sol(テスト名の文字列も追随)。

- **Rationale**: これは refactor(挙動保存)ではなく意図的な挙動変更であり、変更対象の値を直接 pin する
  テストの更新は正当。受け入れ基準「既存テスト無変更で green」は、変更対象の値そのものを固定している
  この 2 テストには文字通りには成立しない — 更新が正しい行動。
- **Alternatives considered**: 旧値テストを残す → 却下(実行で fail し `typecheck && test` green を
  満たせない)。この 2 テスト以外は無変更を厳守する。

### D6: types.ts コメントを現状に合わせる(ドキュメント修正のみ)

`src/core/usage/types.ts:50-54` の「claude-opus-5 / claude-sonnet-5 / claude-fable-5 は pricing 表に
無いので computeCostUsd は null」という記述を、これら 3 モデルが表に載った現状に合わせて修正する。
`computeCostUsd` が「表に無いモデルでは null を返す」という一般則の記述は残し、具体例を実際に未収載の
ケースに置き換えるか、具体例を落とす。

- **Rationale**: コメントと実装の食い違いを残さない。挙動変更なしのドキュメント修正のためテスト不要。
- **Alternatives considered**: コメント放置 → 却下(正典と実装の乖離)。

## Risks / Trade-offs

- [Risk] 受け入れ基準「既存テスト無変更で green」と要件 4(既定値変更)が衝突する。旧既定値を pin する
  2 テスト(D5)は変更しないと fail する。
  → Mitigation: D5 の 2 箇所のみ新値に更新し、それ以外の既存テストは一切変更しない。他の `gpt-5.5`
  参照(config-source-metadata / step-config-trace / config-effective / codex adapter tests)は
  gpt-5.5 を任意の config fixture 文字列として使うだけで、gpt-5.5 は registry に存続するため無影響。

- [Risk] pricing.test.ts の drift guard(全 BUILTIN_MODEL_REGISTRY エントリが非 null な lookupPricing
  を持つことを検証)が、registry にモデルを追加して pricing 行を忘れると fail する。
  → Mitigation: registry 追加(T-01)と pricing 追加(T-02)を同一 change 内で必ずペアにする。
  この既存 guard は追加漏れを機械的に検出する既存の歯として機能する。

- [Risk] claude-sonnet-5 の intro 価格($2/$10、2026-08-31 まで)期間中は SDK 実測 probe が本表の
  定価($3/$15)と乖離する。
  → Mitigation: 表には定価を記載し、コメントで intro 期間の乖離を明記(D2)。本表は 2026-09-01 以降の
  定価を正とする。

## Open Questions

- なし。D5 の「既存テスト更新」は受け入れ基準との文言上の緊張を含むが、意図的挙動変更に伴う正当な更新
  として解決済み。レビュー時はこの 2 テスト更新が挙動変更に限定され、他テストが無変更であることを確認されたい。
