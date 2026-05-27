# Code Review Feedback — login-scope-verification — iter 1

## Summary

- **verdict**: approved
- **date**: 2026-05-27
- **reviewer**: code-reviewer

---

## Scope

| File | Change |
|------|--------|
| `src/cli/login.ts` | `logWarn` import 追加、`result.scopes.includes("repo")` チェックと warning 表示を `saveCredentials` 前に挿入 |
| `tests/unit/cli/login.test.ts` | 新規テストファイル: TC-LOGIN-SCOPE-001〜004 |
| `tests/unit/step/requires-commit-flags.test.ts` | `CodeFixerStep.requiresCommit` の期待値を `true` → `false` に修正（スコープ外） |

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| F-01 | LOW | scope-creep | `tests/unit/step/requires-commit-flags.test.ts` | `CodeFixerStep.requiresCommit` の期待値変更がこのリクエストのスコープ外。ただし main ブランチで `code-fixer.ts` が既に `requiresCommit: false` であり、旧テストは事実上 broken だった。変更内容自体は正しい | 内容は正しいため accept 可。次回以降はスコープ外修正を別 issue/request として分離すること | no |
| F-02 | MEDIUM | test-coverage | `tests/unit/cli/login.test.ts` | TC-07（must-priority）「`runDeviceFlow()` が例外をスローした場合 → scope チェックをスキップ・saveCredentials 呼ばれない・exit 1」のテストが欠落。実装の catch block は正しく動作するが、将来の regression に対するガードがない | TC-07 に対応するテストを追加する（コードスニペットは Required Fix セクション参照） | yes |
| F-03 | LOW | test-coverage | `tests/unit/cli/login.test.ts` | TC-03 の warning メッセージ検証が `toContain("repo")` のみ。test-cases.md TC-03 の THEN 条件には `"specrunner doctor"` への言及確認も含まれる（TC-10 も同趣旨）。実装メッセージには両方含まれている | `expect(...).toContain("specrunner doctor")` を TC-03 に追加する | no |
| F-04 | LOW | test-coverage | `tests/unit/cli/login.test.ts` | TC-05（must-priority）「logWarn の呼び出し順序が saveCredentials より前」の明示的 ordering テストがない。実装は構造的に正しくリスクは低い | `vi.fn()` の `mock.invocationCallOrder` を使って ordering を明示的に検証することを推奨 | no |

---

## Must Scenario Coverage

| TC-ID | Priority | Description | Covered by |
|-------|----------|-------------|------------|
| TC-01 | must | scopes=["repo"] → warning なし、exit 0、token 保存 | TC-LOGIN-SCOPE-001 ✅ |
| TC-02 | must | scopes=["repo","read:org"] → warning なし、exit 0 | TC-LOGIN-SCOPE-002 ✅ |
| TC-03 | must | scopes=["read:org"] → warning あり ("repo" + "specrunner doctor")、token 保存、exit 0 | TC-LOGIN-SCOPE-003 ⚠️ ("repo" のみ検証、"specrunner doctor" 未検証) |
| TC-04 | must | scopes=[] → warning あり、token 保存、exit 0 | TC-LOGIN-SCOPE-004 ✅ |
| TC-05 | must | logWarn が saveCredentials より前に呼ばれる | 実装構造から自明だが明示的テストなし ⚠️ |
| TC-06 | must | fallback 時（scopes=["repo"]）→ warning なし、token 保存 | TC-LOGIN-SCOPE-001 が同一シナリオを検証 ✅ |
| TC-07 | must | runDeviceFlow() 例外 → scope チェックスキップ、saveCredentials 呼ばれない、exit 1 | テストなし ❌ |
| TC-08 | must | typecheck green | verification-result.md で確認済み ✅ |
| TC-09 | must | github-device.ts / doctor/ に変更なし | git diff main...HEAD で差分 0 確認 ✅ |

---

## Implementation Correctness

### src/cli/login.ts

- **`logWarn` import**: `logInfo, logSuccess, logWarn` として正しく追加 ✅
- **scope チェックの配置**: `saveConfig` 後・`loadCredentials` 前に挿入。TC-05 の順序要件を満たす ✅
- **判定ロジック**: `result.scopes.includes("repo")` — Device Flow fallback（`github-device.ts:96`）により GitHub が scope を返さない場合でも scopes は `["repo"]` になるため false positive なし ✅
- **token 保存**: scope 不足時も `saveCredentials` を実行。token は常に保存される ✅
- **warning メッセージ**: `"repo"` と `"specrunner doctor"` の両方を含む ✅
- **スコープ外ファイル変更なし**: `src/auth/github-device.ts` および `src/core/doctor/` に変更なし ✅

### verification

`bun run typecheck && bun run test && bun run build && eslint`: 全フェーズ green ✅

---

## Required Fix

**F-02（MEDIUM / must-priority テスト欠落）** への対応を推奨:

```typescript
it("TC-LOGIN-SCOPE-007: runDeviceFlow() throws → no scope check, no saveCredentials, exit 1", async () => {
  vi.mocked(runDeviceFlow).mockRejectedValue(new Error("expired_token"));

  const exitCode = await runLogin();

  expect(exitCode).toBe(1);
  expect(logWarn).not.toHaveBeenCalled();
  expect(saveCredentials).not.toHaveBeenCalled();
});
```

F-03・F-04 は LOW レベルであり、追加対応は任意。

---

## Verdict

- **verdict**: approved
