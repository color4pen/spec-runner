# Tasks: login-scope-verification

## T-01: `runLogin()` に scope 検証と warning 表示を追加

**File**: `src/cli/login.ts`

`result = await runDeviceFlow()` 成功後、`saveCredentials` の前に scope チェックを追加する。

```typescript
import { logInfo, logSuccess, logWarn } from "../logger/stdout.js";

// ... runDeviceFlow() 成功後 ...

// Verify repo scope presence
if (!result.scopes.includes("repo")) {
  logWarn(
    "GitHub token does not include 'repo' scope. Some operations may fail. Run 'specrunner doctor' to verify.",
  );
}
```

変更点:
1. `logWarn` を import に追加
2. `saveCredentials` の前に `result.scopes.includes("repo")` チェックを挿入
3. scope 不足時に `logWarn()` で warning を表示
4. token は scope 不足でも保存する（既存の `saveCredentials` はそのまま）

**Acceptance**:
- [x] `logWarn` が import されている
- [x] `result.scopes` に `"repo"` が含まれない場合に warning メッセージが stderr に出力される
- [x] scope に `"repo"` が含まれる場合は warning が出ない
- [x] scope チェックが `saveCredentials` の前に実行される
- [x] token は scope 不足でも保存される（exit code 0）
- [x] `bun run typecheck` が green

---

## T-02: unit test — scope 検証の動作確認

**File**: `tests/unit/cli/login.test.ts` (既存に追加、または新規)

テストケース:
- `result.scopes` が `["repo"]` → warning なし、exit code 0
- `result.scopes` が `["repo", "read:org"]` → warning なし、exit code 0
- `result.scopes` が `["read:org"]` (`repo` なし) → warning あり、exit code 0
- `result.scopes` が `[]` (空) → warning あり、exit code 0

`runDeviceFlow` を mock し、`logWarn` の呼び出しを検証する。

**Acceptance**:
- [x] 全テストケースが green
- [x] `bun run test` が green

---

## T-03: 全体検証

**Command**: `bun run typecheck && bun run test`

**Acceptance**:
- [x] typecheck green
- [x] test green
- [x] `src/auth/github-device.ts` に変更なし
- [x] `src/core/doctor/` に変更なし

---

## Task Dependencies

```
T-01 → T-02 → T-03
```

T-01 が実装、T-02 がテスト、T-03 が全体検証。順次実行。
