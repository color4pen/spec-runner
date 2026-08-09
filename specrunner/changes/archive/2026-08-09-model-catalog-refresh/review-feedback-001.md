# Code Review Feedback — model-catalog-refresh — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル

- `src/config/model-registry.ts` — registry 追加・PROVIDER_DEFAULTS 更新の全 diff
- `src/core/usage/pricing.ts` — pricing 追加・gpt-5.5 修正の全 diff
- `src/core/usage/types.ts` — コメント修正の diff
- `tests/config/model-registry.test.ts` — 新規テスト(TC-001/002/003/007/010) + TC-009 更新
- `tests/core/usage/pricing.test.ts` — 新規テスト(TC-004/005/006) + drift guard
- `tests/init.test.ts` — TC-008/009 + openai scaffold テスト更新
- `tests/unit/core/command/job-stats-metrics.test.ts` — UNKNOWN_MODEL 定数変更の diff
- `specrunner/changes/model-catalog-refresh/verification-result.md` — 全フェーズ通過確認

### 確認内容

**registry 追加(T-01)**:
- anthropic 3 エントリ(claude-opus-5 / sonnet-5 / fable-5)を `provider: "anthropic"` で追加 ✓
- openai 3 エントリ(gpt-5.6-sol / terra / luna)を `provider: "openai"` で追加 ✓
- `[1m]` SKU なし ✓
- 既存 13 エントリ無変更(削除・値変更なし) ✓

**pricing 追加(T-02) — 値の正確性**:

| モデル | request 記載(input/output/cacheRead/cacheWrite) | 実装値 | 合計(1M×4) |
|---|---|---|---|
| claude-opus-5 | 5/25/0.5/6.25 | 5.0/25.0/0.5/6.25 | 36.75 ✓ |
| claude-sonnet-5 | 3/15/0.3/3.75 | 3.0/15.0/0.3/3.75 | 22.05 ✓ |
| claude-fable-5 | 10/50/1.0/12.5 | 10.0/50.0/1.0/12.5 | 73.5 ✓ |
| gpt-5.6-sol | 5/30/0.5/0 | 5.0/30.0/0.5/0 | 35.5 ✓ |
| gpt-5.6-terra | 2/12/0.2/0 | 2.0/12.0/0.2/0 | 14.2 ✓ |
| gpt-5.6-luna | 0.2/1.2/0.02/0 | 0.2/1.2/0.02/0 | 1.42 ✓ |

Anthropic 実測則 (`cacheRead = input×0.1 / cacheWrite = input×1.25`)、
OpenAI 則 (`cacheRead = input×0.1 / cacheWrite = 0`) を全行で確認。

claude-sonnet-5 行の introductory 価格コメント
「2026-08-31 まで $2/$10 … 本表は 2026-09-01 以降の定価」が存在することを確認。

**gpt-5.5 修正(T-03)**:
- `input: 10.0 → 5.0` ✓
- `output: 40.0 → 30.0` ✓
- `cacheRead: 2.5 → 0.5` ✓
- `cacheWrite: 0` のまま ✓
- 「approximate using o3 tier」コメント削除 ✓
- 「OpenAI 公表値(2026-08-09 確認)」に更新 ✓
- 他の OpenAI 近似行(`gpt-5.4` / `gpt-5.4-mini` / `gpt-5.3-codex-spark` 等)無変更 ✓

**PROVIDER_DEFAULTS 更新(T-04)**:
- `defaultModel: "gpt-5.6-luna"` ✓
- `designModel: "gpt-5.6-sol"` ✓
- `PROVIDER_DEFAULTS.anthropic` 無変更 ✓

**types.ts コメント修正(T-05)**:
- 旧: 「claude-opus-5 / claude-sonnet-5 / claude-fable-5 は pricing 表に無い」という誤記
- 新: 「for models absent from the pricing table, computeCostUsd returns null」
- 「表に無ければ null」という一般則は保持 ✓

**テスト(T-06/T-07)**:
- TC-001 〜 TC-003 (resolveProvider) ✓
- TC-004 (computeCostUsd 新 6 モデル, 1M×4 tokens で期待 USD) ✓
- TC-005 (gpt-5.5 修正後 35.5 / 旧 52.5 でないことの否定) ✓
- TC-006 / drift guard (全 registry エントリが pricing を持つ) ✓
- TC-007 / TC-009 model-registry (PROVIDER_DEFAULTS.openai 値) ✓
- TC-008 init.test.ts (openai scaffold: gpt-5.6-luna / gpt-5.6-sol) ✓
- TC-010 ([1m] SKU なし) ✓

**verification**: 739 files / 11046 tests passed, typecheck passed, lint passed ✓

## 検証できなかった項目

- TC-011 / TC-012 / TC-013 は test-cases.md で `could` / `manual` に分類されており、
  目視確認は上記「T-03 / T-05」の欄で代替実施。機械テストは存在しない。
- pricing の絶対値(外部事実 — 公式ドキュメント上の単価)は request.md 記載値を正とする
  規約に従い再検証を行っていない。

## Findings 詳細

### job-stats-metrics.test.ts の変更について

`tests/unit/core/command/job-stats-metrics.test.ts` で
`UNKNOWN_MODEL = "claude-opus-5"` → `"totally-unknown-model-xyz"` に変更されている。

design.md の許容 2 件(model-registry.test.ts TC-009 / init.test.ts)には含まれていないが、
この変更は機械的に必須であった:
`claude-opus-5` が pricing 表に追加されたため、`computeCostUsd(UNKNOWN_MODEL, ...) === null`
の assertion が fail する。変更内容は妥当(真に未収載のダミーキーに置き換え)であり、
テスト意図の弱体化はない。設計の Risk セクションに記載されなかったエッジケースを
実装者が正しく補足した。
