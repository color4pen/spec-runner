# Regression Gate Result — Iteration 2

## Evidence

### Finding: test-cases.md 不在の violation が follow-up policy になり無効 repair attempt が発生しうる

**File**: src/core/runtime/local.ts:1325  
**Verification**: PASS — fix is present

`git diff main...HEAD` で確認。test-cases.md 不在パス（catch ブロック）の violation.policy が `contract.policy`（= "follow-up"）から `"halt"` にハードコードされている。

```diff
-violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: ["test-cases.md not found"] });
+violations.push({ kind: contract.kind, path: contract.path, policy: "halt", detail: ["test-cases.md not found"] });
```

現在のコード（local.ts:1325）:

```typescript
violations.push({ kind: contract.kind, path: contract.path, policy: "halt", detail: ["test-cases.md not found"] });
```

coverage が undefined となる test-cases.md 不在パスにおいて、`policy: "halt"` が固定されており、無効な follow-up attempt は発生しない。回帰なし。

## Summary

- Checked: 1
- Skipped: 0
- Unverified: 0
- Regressions: 0
