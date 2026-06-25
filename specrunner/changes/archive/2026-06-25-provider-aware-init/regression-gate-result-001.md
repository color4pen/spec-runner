# Regression Gate Result — provider-aware-init — Iteration 1

- **verdict**: needs-fix
- **checked-at**: 2026-06-25

---

## Finding 1: スコープ外の pricing.ts 変更（approximate 価格追加）

- **severity**: low
- **resolution**: fixable
- **status**: REGRESSION — fix not present

`src/core/usage/pricing.ts` に `gpt-5.4-mini`（lines 157–163）と `gpt-5.3-codex-spark`（lines 165–171）の approximate 価格エントリが依然として追加されたままである。`git diff main...HEAD -- src/core/usage/pricing.ts` で確認済み。

design.md Non-Goals および tasks.md T-03 が「本 request では触らない」と明示した `MODEL_PRICING` への変更が残っている。設計が "$?" 表示を許容した理由（未公表価格）が失われており、誤った価格をユーザーに表示するリスクがある。

**対処**: `MODEL_PRICING` から `"gpt-5.4-mini"` と `"gpt-5.3-codex-spark"` のエントリを削除する。pricing.ts はこの request のスコープ外。

---

## Finding 2: TC-009/TC-010（must）の直接 unit test が欠落

- **severity**: low
- **resolution**: fixable
- **status**: REGRESSION — fix not present

`tests/config/model-registry.test.ts` は `PROVIDER_DEFAULTS` を import しておらず、TC-009/TC-010 で要求される定数値の直接検証テストが存在しない。`git diff main...HEAD -- tests/config/model-registry.test.ts` で確認済み。

test-cases.md TC-009/TC-010 の仕様:
- TC-009: `PROVIDER_DEFAULTS.anthropic.defaultModel === "claude-sonnet-4-6"` かつ `PROVIDER_DEFAULTS.openai.defaultModel === "gpt-5.4-mini"` かつ `PROVIDER_DEFAULTS.openai.designModel === "gpt-5.5"`
- TC-010: `PROVIDER_DEFAULTS.anthropic.designModel === undefined`

`PROVIDER_DEFAULTS` は `src/config/model-registry.ts` に正しく実装されているが、model-registry.test.ts での unit test が追加されていない。

**対処**: `tests/config/model-registry.test.ts` に `PROVIDER_DEFAULTS` の import と TC-009/TC-010 に対応する describe ブロックを追加する。
