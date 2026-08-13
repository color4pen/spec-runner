# Regression Gate Result — agent-inactivity-timeout (iteration 1)

## Evidence Summary

- **Checked**: 6 findings
- **Skipped**: 0
- **Unverified**: 0

## Per-Finding Verification

### [HIGH] 出力修復ループの catch が watchdog abort を飲み込む(claude-code)
**File**: src/adapter/claude-code/agent-runner.ts

**Status**: FIXED ✅

`catch {}` が `catch (err)` に変更され、冒頭に `if (abortController.signal.aborted) throw err;` が追加されている（diff 確認済み、line 1037-1039 付近）。watchdog 発火による abort が outer catch に届く経路が開通している。

---

### [HIGH] 出力修復ループの catch が watchdog abort を飲み込む(codex)
**File**: src/adapter/codex/agent-runner.ts

**Status**: FIXED ✅

codex adapter も同様に `catch (err)` + `if (abortController.signal.aborted) throw err;` が追加されている（line 701-703）。tasks.md T-03 の該当チェックボックスも `[x]` 済み。

---

### [MEDIUM] output-repair 中の無活動発火テストが受け入れ基準に欠落（claude-code T-04）
**File**: specrunner/changes/agent-inactivity-timeout/tasks.md

**Status**: FIXED ✅

T-04 に「output-repair 中の発火」項目（line 116-119）と、Acceptance Criteria（line 122-124 に output-repair 中の watchdog 発火を含む 5 項目列挙）が追加されている。

---

### [MEDIUM] T-05（codex）に output-repair 中の watchdog 発火テストが欠落
**File**: specrunner/changes/agent-inactivity-timeout/tasks.md

**Status**: FIXED ✅

T-05 に「output-repair 中の発火」項目（line 135-138）と、Acceptance Criteria（line 141-143 に output-repair 中の watchdog 発火を列挙）が追加されている。

---

### [MEDIUM] 既存テスト assertion 弱化が design.md に未記載
**File**: src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts:389

**Status**: FIXED ✅

- `expect(callCount).toBeLessThanOrEqual(1)` に変更済み（line 389 確認済み）。
- design.md Risks 節に「衝突は 1 件のみ。`agent-runner-transient-retry.test.ts` の `expect(callCount).toBe(1)` を `expect(callCount).toBeLessThanOrEqual(1)` に更新した」と明示されている（line 152-155 確認済み）。受け入れ基準の enumeration 要件を満たしている。

---

### [MEDIUM] SpecRunnerError が timeout 結果に変換される新パス（claude-code outer catch 順序）
**File**: src/adapter/claude-code/agent-runner.ts:1113

**Status**: NOT FIXED ❌ — REGRESSION PRESENT

現在のコード（line 1112-1133）:

```ts
} catch (err) {
  if (abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired)) {
    // ...timeout handling — returns completionReason: "timeout"
    return { ... };
  }
  if (err instanceof SpecRunnerError) throw err;  // ← line 1133: 後置
```

`SpecRunnerError` 再送出ガードが timeout 判定の**後**に置かれている。watchdog 発火後に `loadSdkFn` が `SpecRunnerError` を投げた場合、timeout ブランチに飲まれ `completionReason: "timeout"` が返る。

codex adapter（line 759-761）は正しい順序:

```ts
} catch (err) {
  if (err instanceof SpecRunnerError) throw err;  // ← 先頭
  if (abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired)) {
```

修正指示（レビュー記載のまま）: `claude-code outer catch` 先頭に `if (err instanceof SpecRunnerError) throw err;` を移動して codex と順序を揃える。

