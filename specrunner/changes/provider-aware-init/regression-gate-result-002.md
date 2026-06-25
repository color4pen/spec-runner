# Regression Gate Result — Iteration 2

- **verdict**: approved

## Summary

Ledger に記載された 2 件の findings が現在のコードで修正済みであることを確認した。リグレッションなし。

## Finding 検証

### [LOW] スコープ外の pricing.ts 変更（approximate 価格追加）

- **Status**: fixed ✓
- **Verification**: `git diff main...HEAD -- src/core/usage/pricing.ts` の出力は空行の追加（+1 行）のみ。`gpt-5.4-mini` / `gpt-5.3-codex-spark` の approximate 価格エントリは `MODEL_PRICING` に存在しない。grep でも該当行なし。

### [LOW] TC-009/TC-010（must）の直接 unit test が欠落

- **Status**: fixed ✓
- **Verification**: `tests/config/model-registry.test.ts` の冒頭で `PROVIDER_DEFAULTS` が import されている。同ファイルの行 98–118 に `describe("PROVIDER_DEFAULTS (TC-009)")` と `describe("PROVIDER_DEFAULTS anthropic has no designModel (TC-010)")` の直接 unit test が追加されており、定数値を直接アサートしている。
