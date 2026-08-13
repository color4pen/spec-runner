# Cross-Boundary Invariants Review — agent-inactivity-timeout (Iteration 1)

**Reviewer**: cross-boundary-invariants  
**Purpose**: 変更が触れていないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないか検出する。  
**Scope**: `src/adapter/claude-code/agent-runner.ts`, `src/adapter/codex/agent-runner.ts`, `src/adapter/shared/inactivity-watchdog.ts` およびそれらと境界を接する既存機構。

---

## Executive Summary

コア実装・テストはいずれも正しく設計に沿っている。検出された問題は 1 件：**`SpecRunnerError` の再送出ガードが claude-code アダプタの外側 catch でタイムアウト判定より後に置かれている**という順序の問題。これは変更前も同じ順序だったが、変更前は `timeoutId !== undefined`（常に false = 全 step が timeoutMs=null）という条件が常に dead code にしていた。今回 `watchdog.fired` が追加されたことで、この順序が実際に発火する新しいコードパスが開いた。

---

## Findings

### F-001: SpecRunnerError が timeout 結果に化ける新パスが開いた（claude-code adapter）

**重要度**: medium  
**分類**: fixable

**観察**:

`src/adapter/claude-code/agent-runner.ts` の外側 catch（line 1112–1149）において、ガードの順序は:

```typescript
// line 1113 — timeout 判定が先
if (abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired)) {
  return { completionReason: "timeout", ... };   // ← SpecRunnerError を飲み込む
}
// line 1133 — SpecRunnerError の再送出は後
if (err instanceof SpecRunnerError) throw err;
```

変更前の条件は `timeoutId !== undefined` のみで、どの step も `timeoutMs` を設定していない(解決チェーンの最終 fallback が null)ため、`timeoutId` は常に undefined → timeout 判定は完全な dead code だった。  
今回 `|| watchdog.fired` が追加されたことで、**watchdog が発火した際にこの分岐が初めて評価される**。

**具体的な侵害経路**:

1. repair turn 内の inner catch（line 1040–1047）は `if (abortController.signal.aborted) throw err;` で、aborted 時は例外の型を問わず無条件に再送出する。
2. repair turn の先頭 `await this.loadSdkFn()` （line 1015）が `SpecRunnerError(PROVIDER_SDK_MISSING)` を投げることがある。
3. watchdog が発火して `abortController.abort()` が呼ばれた後、repair turn が `loadSdkFn()` を呼んでいる最中だった場合、inner catch が SpecRunnerError を outer catch へ再送出する。
4. outer catch で `signal.aborted && watchdog.fired` が true → `completionReason: "timeout"` を返し、SpecRunnerError は消える。パイプラインは PROVIDER_SDK_MISSING を受け取れず、step が awaiting-resume に落ちてオペレーター循環に入る。

**codex adapter との比較**:

codex adapter（line 759–761）は正しい順序:
```typescript
if (err instanceof SpecRunnerError) throw err;   // ← 先に再送出
if (abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired)) {
```

この順序なら SpecRunnerError は timeout 判定に到達しない。

**現実的な発火率**: `loadSdkFn()` は動的 import であり、一度成功するとモジュールキャッシュに乗るため、repair turn で PROVIDER_SDK_MISSING を投げる確率は極めて低い。ただし不変条件の侵害として構造的に存在し、外側 catch の順序を修正するだけで完全に除去できる。

**修正**: claude-code adapter の outer catch（line 1112 以降）の先頭に `if (err instanceof SpecRunnerError) throw err;` を移動し、codex adapter と同じ順序にする。

---

## Observations（非ブロッキング）

### O-001: repair inner catch が「abort 時に任意 error を再送出」する意味論

`src/adapter/claude-code/agent-runner.ts` line 1042 および `src/adapter/codex/agent-runner.ts` line 703 のコメントは "Re-throw abort errors" だが、実装は `if (abortController.signal.aborted) throw err;` と型を問わず再送出する。watchdog による abort が発生した際に、abort エラーでなく別の例外が偶然 fly している場合にも再送出される。F-001 の侵害パスはこの意味論から生じる。  
意図の文書化あるいは AbortError 型チェックへの絞り込みを検討する余地がある（ただし現時点では F-001 の fix で十分）。

### O-002: 前変更時から存在する adapter 間の非対称性

catch における SpecRunnerError ガードの順序が codex（正しい順序）と claude-code（逆順）で非対称だったことは変更前から存在する状態。今回の変更が `watchdog.fired` を有効化するまでは dead code だったため顕在化していなかった。変更の性質上、この非対称性の**活性化**が本変更の外側 catch に対する唯一の cross-boundary 影響。

### O-003: halt message に step 名が二重に現れる

`makeTimeoutHalt` が `${stepName} timed out: ${error.message}` を組み立て、`error.message` 自体が `Step '${stepName}' inactivity timeout: ...` の形式のため、step 名が二重に出力される。wall-clock timeout でも同じパターン（例: `design timed out: Step 'design' timed out after 30000ms`）であり変更の副作用ではない。視認性の問題にとどまる。

---

## Evidence

| # | 検証対象 | 結果 |
|---|---------|------|
| 1 | `src/adapter/shared/inactivity-watchdog.ts` の実装と契約（bump/fire/clear/fired/elapsedMs） | ✅ 仕様通り |
| 2 | claude-code adapter の watchdog 生成・初期 bump タイミング | ✅ 設計 D5 に準拠 |
| 3 | codex adapter の watchdog 生成・initial bump タイミング | ✅ 設計 D5 に準拠 |
| 4 | catch 判定条件 `watchdog.fired` の拡張（D4） | ✅ 両 adapter とも正しく拡張 |
| 5 | repair inner catch の abort 再送出（T-02/T-03） | ✅ 導入済み、意味論は O-001 を参照 |
| 6 | outer catch における SpecRunnerError ガードの順序（claude-code） | ❌ timeout 判定が先 → F-001 |
| 7 | outer catch における SpecRunnerError ガードの順序（codex） | ✅ SpecRunnerError が先 |
| 8 | `watchdog.clear()` が finally で呼ばれる（全 exit path） | ✅ 両 adapter とも finally に配置 |
| 9 | `watchdog.clear()` 後も `watchdog.fired` が読める（catch 後の finally 順序） | ✅ clear は `_fired` を保持する設計 |
| 10 | managed adapter への波及なし | ✅ managed adapter は変更なし・watchdog を import しない |
| 11 | retryWithBackoff 中の watchdog 巻き直し（sleepFn 中にタイマーが走る） | ✅ 15 分以内の backoff sleep は問題なし |
| 12 | `throwIfAborted()` ガードが既存 abort-timeout-bypass テストと衝突 | ✅ build-fixer が `toBeLessThanOrEqual(1)` に緩和済み・意図保存を確認 |
| 13 | executor.ts の `completionReason === "timeout"` → `makeTimeoutHalt` → awaiting-resume 経路 | ✅ 変更なし・整合 |
| 14 | 前変更の `timeoutId !== undefined` が常 false（timeoutMs=null 全 step）だった前提 | ✅ git diff main で確認 |

checked: 14 / skipped: 0 / unverified: 0

---

## Verdict

`mcp__specrunner_report__report_result` で送出する。
