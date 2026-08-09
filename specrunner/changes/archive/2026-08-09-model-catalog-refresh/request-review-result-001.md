# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 読んだファイル

- `src/config/model-registry.ts` — BUILTIN_MODEL_REGISTRY 全エントリ、PROVIDER_DEFAULTS、resolveProvider を目視確認
- `src/core/usage/pricing.ts` — MODEL_PRICING 全エントリ、normalizeModelKey、computeCostUsd を確認
- `src/core/usage/types.ts` — lines 50-54 のコメント（Claude 5 world pricing 不在注記）を確認
- `src/cli/init.ts` — scaffold ロジック（defaultModel → steps.defaults.model、designModel → steps.design.model）を確認

### コードアサーション検証結果

| アサーション | 実コード | 判定 |
|---|---|---|
| `model-registry.ts:13-27` — anthropic 9 + openai 4 エントリ | Lines 14-26: 9 + 4 = 13 エントリ ✓ | ✓ |
| `model-registry.ts:49-57` — `PROVIDER_DEFAULTS.openai = { defaultModel: "gpt-5.4-mini", designModel: "gpt-5.5" }` | Lines 53-56: 完全一致 ✓ | ✓ |
| `model-registry.ts:77-86` — `resolveProvider` は CONFIG_INVALID で throw | Lines 77-86: `throw Object.assign(new Error("CONFIG_INVALID: Unknown model..."), { code: "CONFIG_INVALID" })` ✓ | ✓ |
| `pricing.ts:46-180` — MODEL_PRICING 全体。gpt-5.5 = input 10.0 / output 40.0 / cacheRead 2.5 / cacheWrite 0、コメント「approximate using o3 tier」付き | Lines 157-163: 一致 ✓ | ✓ |
| `types.ts:50-54` — Claude 5 世代は pricing 表に無いので computeCostUsd は null とコメント | Lines 50-52: "Note: for models absent from the pricing table (e.g. claude-opus-5, claude-sonnet-5, claude-fable-5), computeCostUsd returns null" ✓ | ✓ |
| `init.ts:111-121` — scaffold は defaultModel を steps.defaults.model に、designModel (定義時のみ) を steps.design.model に書く | Line 111: `model: defaults.defaultModel`; Lines 119-121: `if (defaults.designModel !== undefined) { steps["design"] = { model: defaults.designModel }; }` ✓ | ✓ |
| `pricing.ts:194-206` — normalizeModelKey は `-YYYYMMDD` を除去、`[1m]` は保持 | Lines 194-196: `return raw.replace(/-\d{8}$/, "")` ✓ | ✓ |

### 価格値の内部整合性確認

新規 6 モデルおよび gpt-5.5 修正値について、キャッシュ比率を確認:

| モデル | input | cacheRead | 比率 | cacheWrite | 比率 | 判定 |
|---|---|---|---|---|---|---|
| claude-opus-5 | 5.0 | 0.5 | 10% ✓ | 6.25 | 125% ✓ | ✓ |
| claude-sonnet-5 | 3.0 | 0.3 | 10% ✓ | 3.75 | 125% ✓ | ✓ |
| claude-fable-5 | 10.0 | 1.0 | 10% ✓ | 12.5 | 125% ✓ | ✓ |
| gpt-5.6-sol | 5.0 | 0.5 | 10% ✓ | 0 | — ✓ | ✓ |
| gpt-5.6-terra | 2.0 | 0.2 | 10% ✓ | 0 | — ✓ | ✓ |
| gpt-5.6-luna | 0.2 | 0.02 | 10% ✓ | 0 | — ✓ | ✓ |
| gpt-5.5 (修正後) | 5.0 | 0.5 | 10% ✓ | 0 | — ✓ | ✓ |

すべて既存コードのキャッシュ比率則（Anthropic: cacheRead = input × 0.1、cacheWrite = input × 1.25；OpenAI: cacheRead = input × 0.1、cacheWrite = 0）と一致。

### 既存テスト状況

`grep` で確認した結果、`model-registry` / `MODEL_PRICING` / `PROVIDER_DEFAULTS` / `resolveProvider` / `computeCostUsd` に対する既存テストは存在しない。要件 6 で新規テスト追加が求められており、既存テストへの影響はない（変更はすべて additive）。

## 検証できなかった項目

**外部事実（本 request が正とする値）**: 以下は本 request が「外部事実」として明示し、「pipeline では検証不能」と宣言しているため、再検証を試みない。

- Anthropic 定価: claude-opus-5 $5/$25、claude-sonnet-5 $3/$15(intro $2/$10)、claude-fable-5 $10/$50
- OpenAI 定価: gpt-5.6-sol $5/$30、gpt-5.6-terra $2/$12、gpt-5.6-luna $0.20/$1.20、gpt-5.5 $5/$30
- OpenAI 後継マッピング: gpt-5.4-mini → gpt-5.6-luna
- claude-opus-5 / sonnet-5 / fable-5 の 1M context デフォルト（別 SKU なし）
- gpt-5.4 / 5.4-mini の 2026-08-31 Codex 引退

## Findings 詳細

指摘なし。

すべてのコードアサーションが実コードと一致し、要件・受け入れ基準・スコープ外定義に曖昧さはない。価格値の内部整合性も確認済み。
