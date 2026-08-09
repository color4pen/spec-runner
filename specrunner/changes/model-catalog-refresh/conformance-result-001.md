# Conformance Result — model-catalog-refresh — iter 1

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証した項目

### tasks.md — 全チェックボックス完了確認

T-01〜T-07 の全チェックボックスが `[x]` であることを確認した。

### Judgment 1 — Spec 要件 (SHALL / MUST)

**Req: registry SHALL recognize Claude 5 and GPT-5.6 models**

`src/config/model-registry.ts` の `BUILTIN_MODEL_REGISTRY`（lines 13–33）を直接読んで検証:
- anthropic 新規 3 エントリ: `claude-opus-5`、`claude-sonnet-5`、`claude-fable-5` — 存在・provider "anthropic" ✅
- openai 新規 3 エントリ: `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna` — 存在・provider "openai" ✅
- 既存 13 エントリ（anthropic 9 + openai 4）が順序・値ともに無変更 ✅
- `[1m]` SKU がいずれも追加されていない（TC-010 もテストで保証）✅

**Req: cost computation SHALL use request-specified rates**

`src/core/usage/pricing.ts` の `MODEL_PRICING`（lines 111–235）を直接読んで検証:

| key | input | output | cacheRead | cacheWrite | request.md との一致 |
|---|---|---|---|---|---|
| claude-opus-5 | 5.0 | 25.0 | 0.5 | 6.25 | ✅ |
| claude-sonnet-5 | 3.0 | 15.0 | 0.3 | 3.75 | ✅ |
| claude-fable-5 | 10.0 | 50.0 | 1.0 | 12.5 | ✅ |
| gpt-5.6-sol | 5.0 | 30.0 | 0.5 | 0 | ✅ |
| gpt-5.6-terra | 2.0 | 12.0 | 0.2 | 0 | ✅ |
| gpt-5.6-luna | 0.2 | 1.2 | 0.02 | 0 | ✅ |
| gpt-5.5 (corrected) | 5.0 | 30.0 | 0.5 | 0 | ✅ |

`gpt-5.5` の "approximate using o3 tier" コメント削除・"OpenAI 公表値(2026-08-09 確認)" に更新済み ✅  
`claude-sonnet-5` に introductory 価格コメント（2026-08-31 まで $2/$10、本表は定価）付与済み ✅

**Req: openai scaffold defaults SHALL migrate to GPT-5.6 successors**

`src/config/model-registry.ts` lines 55–63 を直接読んで検証:
- `PROVIDER_DEFAULTS.openai = { defaultModel: "gpt-5.6-luna", designModel: "gpt-5.6-sol" }` ✅
- `PROVIDER_DEFAULTS.anthropic = { defaultModel: "claude-sonnet-4-6" }`（designModel 無し、変更なし）✅

### Judgment 2 — Design Decisions (D1–D6)

- **D1** (registry add-only): 6 新規追加、13 既存エントリ保持 ✅
- **D2** (pricing = request 記載値): 全 6 行の数値が request.md 表と一致 ✅
- **D3** (gpt-5.5 in-place 修正、他 OpenAI 近似行は据え置き): gpt-5.4 / gpt-5.4-mini / gpt-5.3-codex-spark / o3-tier 行は無変更 ✅
- **D4** (PROVIDER_DEFAULTS.openai 更新): 正しい値 ✅
- **D5** (既存 2 テスト更新): model-registry.test.ts TC-009 と init.test.ts scaffold テストが新値を assert ✅（F-001 参照：3 本目の変更あり）
- **D6** (types.ts コメント修正): 旧来の「claude-opus-5 / sonnet-5 / fable-5 は pricing 表に無い」記述が削除され、一般則（表に無いモデルは null）が保持されている ✅

### Judgment 3 — 受け入れ基準

| 基準 | 確認方法 | 結果 |
|---|---|---|
| 追加 6 モデルの resolveProvider テスト | model-registry.test.ts TC-001/TC-002 (lines 125–159) | ✅ |
| computeCostUsd テスト（6 モデル + gpt-5.5）| pricing.test.ts TC-004/TC-005 (lines 287–341)、expected USD: 36.75/22.05/73.5/35.5/14.2/1.42/35.5 | ✅ |
| PROVIDER_DEFAULTS.openai テスト | model-registry.test.ts lines 99–111 | ✅ |
| typecheck && test green | verification-result.md: 739 test files / 11045 tests passed | ✅ |
| 既存テスト 2 本のみ更新 | F-001 参照（3 本目の更新あり） | ⚠️ |

### Judgment 4 — スコープ遵守

diff stat で変更ファイルを確認した:
- `src/config/model-registry.ts` ✅（想定内）
- `src/core/usage/pricing.ts` ✅（想定内）
- `src/core/usage/types.ts` ✅（想定内）
- `tests/config/model-registry.test.ts` ✅（想定内）
- `tests/core/usage/pricing.test.ts` ✅（想定内）
- `tests/init.test.ts` ✅（想定内）
- `tests/unit/core/command/job-stats-metrics.test.ts` ⚠️（F-001 参照）

スコープ外未変更を確認:
- `src/core/step/*.ts` の `*_AGENT_MODEL` 定数 — 変更なし ✅
- `DEFAULT_ONE_SHOT_MODEL`（claude-sonnet-4-5）— 変更なし ✅
- Claude 5 世代の `[1m]` SKU — 追加なし ✅
- `claude-mythos-5` — 追加なし ✅
- gpt-5.4 系の既存 pricing 近似行 — 変更なし ✅
- 既存モデルの registry 削除 — なし ✅
- `docs/model-evaluation.md` — 変更なし ✅

## 検証できなかった項目

None. 外部事実（pricing 単価・後継マッピング）は request.md が正典と指定しているため再検証対象外。
コードベース内の全変更項目は確認済み。

## Findings 詳細

### F-001: 3 本目のテスト変更（D5 の "2 本のみ" 制約との乖離）

**File**: `tests/unit/core/command/job-stats-metrics.test.ts` line 57  
**変更**: `const UNKNOWN_MODEL = "claude-opus-5"` → `"totally-unknown-model-xyz"`

このファイルは tasks.md T-06 や受け入れ基準の "2 テスト...のみ" に記載されていない 3 本目の変更。

**背景**: このテストは `claude-opus-5` を「pricing 表に存在しないモデル」のセンチネルとして使用していた。本 change で `claude-opus-5` を pricing 表に追加した結果、センチネルが機能しなくなり、テストが fail する状態だった。実装者はセンチネルを `"totally-unknown-model-xyz"` に更新して green を維持した。

変更は 1 行・正確・必要なもの。`typecheck && test が green` の受け入れ基準を満たすために不可欠だった。しかし tasks.md T-06 の「この 2 箇所以外の既存テストは一切変更しない」という制約に文言上抵触する。

**評価**: spec/tasks が pricing 追加によるセンチネル無効化を考慮していなかったため生じた派生変更。実装として正しいが、spec 側での事前記述漏れ。

