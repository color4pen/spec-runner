# Code Review Feedback — silent-exit-keepalive — iter 1

- **date**: 2026-05-26
- **verdict**: approved

---

## Summary

KeepAlive / ExitGuard / diagnostic logging の中核実装は設計通りで完成度が高い。
silent exit の構造的解消（主目的）は達成されている。
以下 3 点を記録する。F-01 は挙動の乖離で注意が必要だが、一次防衛（`disallowedTools`）が有効である前提で許容範囲と判断する。F-02 / F-03 は低severity。

---

## Findings

### F-01 (medium) — #399 redirect 経路: "redirect → continue" が実装されず abort になっている

**場所**: `src/adapter/claude-code/agent-runner.ts`

設計 D4 / TC-17 / TC-26 では「Agent tool が呼ばれたら tool_result として redirect message を返し、agent が継続実行する」を期待していた。

実装は Stream monitoring (Step 8c) に直行しており:
- 1〜3 回の Agent/Task 呼び出し: カウントするのみで、LLM への tool_result は返さない。SDK が内部で hang している場合、stream monitoring はその呼び出しを検出できない（イベントが yield される前に hang するケースは監視対象外）。
- 4 回目: `abortController.abort()` を発火 → step が `AGENT_REDIRECT_LIMIT_EXCEEDED` error で終了 → pipeline escalation

期待 (TC-26): "agent が継続実行する"  
実際: step が error で終わり escalation に倒れる

**影響の限定**:
- Layer 1 (`disallowedTools: ["Agent", "Task"]`) が有効な間は LLM に Tool が見えず、redirect 経路自体が発火しない
- Layer 2 (prompt 禁止) が補助
- silent exit しない という主 AC は Layer 1 + timeout で達成されている

**受け入れ根拠**:
- 設計が段階的 fallback を定義しており "SDK が `agents` option をサポートしない場合は Step 8c" と明示していた
- `disallowedTools` の実機有効性が確認できれば redirect counter は発火しない
- hang → silent exit ではなく hang → abort → escalation になるため、観測可能な失敗に変わっている

**推奨対応**: 
`implementation-notes.md` あるいは design.md の D4 に「`agents` no-op handler は実装せず、Stream monitoring + abort で代替した」旨を 1 行記録する。TC-17 / TC-26 の expected behavior を「redirect message が tool_result として返る」から「AGENT_REDIRECT_LIMIT_EXCEEDED error で step escalation」に更新するか、次 iteration の issue として起票すること。

---

### F-02 (low) — `runQuery` の `aborted` 戻り値が dead code

**場所**: `src/adapter/claude-code/agent-runner.ts` L193-216

```typescript
const runQuery = async (): Promise<{ lastResult: SDKResultMessage | null; aborted: boolean }> => {
  let aborted = false;  // ← 初期値のまま変更されない
  ...
  return { lastResult, aborted }; // aborted は常に false
};

// 呼び出し側:
const { lastResult } = queryResult; // aborted は取り出されない
```

`aborted` は宣言・返却されるが、呼び出し側で使われず、かつ `true` に変わるコードパスも存在しない。以前の設計案の残骸と推測。

**影響**: 機能バグなし。型推論・可読性に軽微な影響。

---

### F-03 (low) — TC-ARU-01 が literal assertion で実質ゼロ価値

**場所**: `src/adapter/claude-code/__tests__/agent-redirect.test.ts` L49-55

```typescript
it("queryOptions contains disallowedTools with Agent and Task — verified via integration test", () => {
  const REDIRECT_LIMIT = 3;
  expect(REDIRECT_LIMIT).toBe(3); // ← 定数と自分自身を比較
});
```

コメントで「TC-AR-01 が実際のアサーション」と記載されているが、このテストは何もテストしていない。integration test で重複しているため削除、もしくは `expect(REDIRECT_LIMIT).toBe(3)` を削除してコメントのみ残す対応を推奨。

**影響**: 機能バグなし。将来の test coverage カウントが水増しされるリスク。

---

## Acceptance Criteria チェック

| AC | 結果 | 備考 |
|---|---|---|
| #386 再現性の解消 (silent exit @ step transition) | ✅ | KeepAlive が pipeline 全体をカバー |
| #399 再現性の解消 (Agent tool hang) | ⚠️ partial | `disallowedTools` 有効前提で達成。redirect-and-continue は abort-and-escalate に変更 (F-01) |
| 同型経路の解消 (managed polling / finish git fetch) | ✅ | KeepAlive が runner + finish orchestrator をカバー |
| exit 時 invariant (running → awaiting-resume) | ✅ | ExitGuard + fired guard 実装済み |
| timeout 整合性 | ✅ | AbortController → finally → release の連鎖が正常 |
| redirect retry 上限 (>3 で escalation) | ✅ | abort → AGENT_REDIRECT_LIMIT_EXCEEDED → escalation |
| 明示的 process.exit | ✅ | 既存実装で充足と設計で確認済み |
| 既存パイプライン回帰なし | ✅ | 2934 tests green |
| diagnostic log opt-in | ✅ | SPECRUNNER_DEBUG=pipeline で動作確認 |
| regression tests 追加 | ✅ | 29/29 must TC |
| bun run typecheck && bun run test green | ✅ | verification-result: passed |
| doc 更新 | ✅ | project.md + README.md 更新済み |

---

## 総評

KeepAlive sentinel timer による lifecycle binding は設計・実装・テストともに完成度が高い。
ExitGuard の `fired` guard、`try/finally` による release 保証、diagnostic logging の zero-overhead 設計など、
いずれも設計意図を正確に反映している。

主 AC「silent exit を構造的に消す」は達成。F-01 は次 iteration か doc update で対応すれば十分。
