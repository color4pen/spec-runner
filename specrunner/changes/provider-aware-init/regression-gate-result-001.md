# Regression Gate Result — Iteration 1

- **verdict**: approved

## Findings Checked

### [HIGH] pricing.ts を編集（scope 違反）
- **File**: `src/core/usage/pricing.ts`
- **Status**: fixed — verified
- **Evidence**: `git diff main...HEAD -- src/core/usage/pricing.ts` に出力なし。`pricing.ts` は変更ファイル一覧に含まれていない。近似値エントリ (`gpt-5.4-mini`, `gpt-5.3-codex-spark`) の混入は解消されている。

## Summary

Ledger 1 件の修正が現在のコードで維持されていることを確認。リグレッションなし。
