# Regression Gate Result — Iteration 2

- **verdict**: approved

## Finding Verification

### TC-018: PRODUCER_REPORT_TOOL に observations がないことを検証するテスト

- **Status**: Fixed ✅
- **Evidence**: `tests/adapter/codex/strict-schema.test.ts` lines 156–164, describe `toOpenAIStrictSchema — PRODUCER_REPORT_TOOL` ブロック内に以下の 2 テストが存在する。
  - `"observations is NOT in required (producer tools have no observations channel)"` — `required` 配列に `observations` が含まれないことを assert
  - `"observations property is NOT present in schema properties"` — `properties` オブジェクトに `observations` キーが存在しないことを assert
- **Regression**: なし

### TC-015: parseObservations が line: null を拒否しない

- **Status**: Fixed ✅
- **Evidence**:
  - `src/core/port/report-result.ts` line 191: `o["line"] !== null` ガードを追加済み。`line: null` の場合は reject されず、`typeof null !== "number"` により `observation.line` は未設定で返る。
  - `tests/unit/core/port/report-result-observations.test.ts` lines 80–86: `"parses observation with line: null (treated as absent)"` テストが `ok: true` かつ `line` プロパティ不在を assert。
- **Regression**: なし

## Summary

Findings Ledger の 2 件はいずれも現在のコードで修正済みのまま保たれており、回帰は検出されなかった。
