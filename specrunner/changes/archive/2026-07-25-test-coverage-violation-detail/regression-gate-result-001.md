# Regression Gate Result — iteration 001

## 検証対象

Findings Ledger 1 件の修正が現コードで維持されているかを検証した。

---

## Finding: [LOW] test-cases.md 不在の violation が follow-up policy になり無効 repair attempt が発生しうる

**対象ファイル**: `src/core/runtime/local.ts:1325`

### 検証手順

1. `git diff main...HEAD -- src/core/runtime/local.ts` を確認

```diff
@@ -1329,7 +1329,16 @@
         const result = await evaluateTestCoverage(content, cwd);
         if (result.status === "failed") {
           const detail = [...result.missingTcIds, ...result.assertionlessTcIds];
-          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail });
+          violations.push({
+            kind: contract.kind,
+            path: contract.path,
+            policy: contract.policy,
+            detail,
+            coverage: {
+              missingTcIds: result.missingTcIds,
+              assertionlessTcIds: result.assertionlessTcIds,
+            },
+          });
         }
```

2. `src/core/runtime/local.ts` line 1325 の現状を読んだ結果:

```typescript
violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: ["test-cases.md not found"] });
```

### 判定

**修正なし（regression）**

- diff は test-coverage 評価成功時（line 1329–1342）の `coverage` フィールド追加のみ。
- test-cases.md 不在パス（catch ブロック, line 1325）は `policy: contract.policy` のまま変更されていない。
- `test-materialize.ts` は `policy: "follow-up"` に変更済みのため、`contract.policy` は "follow-up" を返す。
- 結果として test-cases.md が不在の場合に `policy: "follow-up"` の violation が push され、`OUTPUT_FOLLOWUP_MAX_ATTEMPTS` 回の無効な follow-up attempt が発生しうる。
- 修正は `policy: contract.policy` → `policy: "halt"` の 1 行変更。
