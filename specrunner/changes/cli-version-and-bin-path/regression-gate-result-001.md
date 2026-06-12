# Regression Gate Result — Iteration 001

- **verdict**: needs-fix

## Findings

### [HIGH] TC-004 / TC-007 の自動テスト欠損（回帰）

- **File**: tests/unit/cli/version.test.ts
- **Resolution**: fixable
- **Rationale**: version.test.ts には TC-VERSION-01/02/03 のみ存在し、TC-004（bin 値 `dist/specrunner.js` の検証）と TC-007（exports["."] が `./dist/specrunner.js` のまま）に対応するテストが追加されていない。いずれも test-cases.md が must/unit に分類しており、修正済みとして登録されていたが現コードに存在しない。

### [HIGH] TC-006 の自動テスト欠損（回帰）

- **File**: tests/unit/cli/version.test.ts
- **Resolution**: fixable
- **Rationale**: version.test.ts に TC-006（package.json の version フィールドが string でない場合に throw する）に対応するテストが存在しない。src/cli/version.ts の実装は正しく throw するが、テストによる固定がない。修正済みとして登録されていたが現コードに存在しない。

## Verification Summary

| TC | 実装 | テスト |
|----|------|--------|
| TC-004: bin 値 `dist/specrunner.js` | ✅ package.json で確認 | ❌ テストなし |
| TC-006: version not string → throw | ✅ src/cli/version.ts で確認 | ❌ テストなし |
| TC-007: exports["."] = `./dist/specrunner.js` | ✅ package.json で確認 | ❌ テストなし |
