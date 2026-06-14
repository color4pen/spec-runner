# Regression Gate Result — fast-pipeline iteration 1

- **verdict**: needs-fix

## Verified findings

### [HIGH] afterEach コメントが旧世代（'2 entries'）のまま — 未修正（リグレッション）

- **File**: tests/unit/core/command/pipeline-run-gate.test.ts:65
- **Resolution**: fixable
- **Status**: fix NOT present — regression confirmed

**検証結果**:

`git diff main...HEAD` を確認した結果、`afterEach` のコメント（65行目）は変更されていない。

現在の状態:
```ts
afterEach(async () => {
  // Remove fixture descriptor — production registry stays at 2 entries.
```

T-05-5 の section heading コメント（`2 本 → 3 本`）とテスト description（`standard and design-only entries → standard, design-only, and fast entries`）は正しく更新されているが、`afterEach` のインラインコメントは `2 entries` のまま残っている。

**必要な修正**:
```ts
// Remove fixture descriptor — production registry stays at 3 entries.
```
