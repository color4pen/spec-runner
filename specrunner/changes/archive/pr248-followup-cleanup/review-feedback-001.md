# Code Review: pr248-followup-cleanup — iter 1

## Summary

機能変更なし、dead code 削除と test/コメント品質改善のみ。すべての受け入れ基準を満たしており、build / typecheck / test 全 green。

---

## Findings

### NIT-001: TC-041 インラインコメントが describe text と不一致

**File**: `tests/unit/config/runtime-config.test.ts:341`  
**Severity**: NIT

describe テキスト（line 344）は正しく更新されているが、その直上のインラインコメント（line 341）が `// TC-041: --runtime local accepts missing apiKey` のまま旧記述になっている。describe text との乖離が小さい混乱を残す。

```
// TC-041: --runtime local accepts missing apiKey   ← 旧記述のまま
describe("TC-041: checkConfigComplete always returns null ...", () => {   // ← 更新済み
```

**Impact**: ゼロ（ランタイム影響なし）。

---

## Acceptance Criteria チェック

| 基準 | 結果 |
|------|------|
| `grep -r "runGhPrCreate" src/ tests/` 0 hit | ✅ 確認済み |
| `GhPrCreateInput` / `GhPrCreateResult` 0 hit | ✅ 確認済み |
| `createRuntime` / `ManagedRuntime` の signature に `= ""` なし | ✅ `githubToken: string` のみ |
| production caller (run.ts:50, bootstrap.ts:40) が明示的に渡している | ✅ 確認済み |
| TC-041 description が新挙動を語っている | ✅ |
| TC-CRED-004 が `expect(stat.mode & 0o777).toBe(0o600)` を assert | ✅ `saveCredentials` 直後、`loadCredentials` 前 |
| `loadCredentials` catch コメントが `resolveGitHubToken` 経路を説明 | ✅ |
| build / typecheck / test green | ✅ 161 files / 1901 tests |

---

## Verdict

- **verdict**: approved
