# Regression Gate Result — Iteration 003

## Ledger verification

### [MEDIUM] bounded drain タイムアウトパスの scenario 欠落
**Status: FIXED**

`spec.md` の "Requirement: The runner aborts in-flight agent queries on SIGINT/SIGTERM before exit" に "Scenario: drain timeout does not block awaiting-resume persist and exit" が追加されている（lines 120–127）。drain がタイムアウトした後も `awaiting-resume` persist と exit が行われることが spec に anchor された。さらに `runner-abort-hub.test.ts` の TC-010 がこのシナリオを機械的に固定している。

---

### [LOW] group kill エラー時の動作に normative 記述がない
**Status: FIXED**

`spec.md` の同 Requirement に "A group-signal error (EPERM/ESRCH) SHALL be treated as best-effort and MUST NOT affect the pid-kill outcome (i.e., MUST NOT flip the `killed` field of the result)." が追加されている。group kill 失敗時の規範的な記述が spec に存在する。

---

### [LOW] reapGroup が SIGTERM ポーリング死亡パスでも呼ばれるが、isGroupLeader=true のケースがテストされていない
**Status: FIXED**

- `tests/unit/core/cancel/pid-kill.test.ts` に "poll-death + leader: group SIGKILL sent when pid dies during SIGTERM poll (isAlive=false)" が追加された（line 162）。`isAlive → false` かつ `isGroupLeader=true` のケースを固定。
- `tests/unit/core/cancel/pid-kill-group.test.ts` にも同等のテスト "leader dies during SIGTERM poll (isAlive=false) — group signal is sent, groupKilled=true" が存在する（line 134）。

---

### [LOW] getJobSlug(state) が cancelSingleJob 内で 2 回呼ばれる（slugForKill / slugForMarker）
**Status: FIXED**

`src/core/cancel/runner.ts` の grep 結果で、`cancelSingleJob` 内の `getJobSlug` 呼び出しは line 361 の `const slug = getJobSlug(state);` の 1 回のみ。line 451 では同変数 `slug` を再利用しており、重複呼び出しは解消されている。

---

### [LOW] TC-016 implicit structural assumption changed: first await is now hub.drain(), not store.load()
**Status: FIXED**

- `src/core/runtime/__tests__/signal-handler-order.test.ts` のファイル先頭コメント（lines 1–21）に新しい ordering contract が明示され、「The drain → store.load ordering is separately pinned in runner-abort-hub.test.ts.」と文書化された。
- `tests/unit/core/runtime/runner-abort-hub.test.ts` の "hub.drain() completes before store.load() is called in signalCleanup" テスト（line 154）が drain → store.load の順序を直接固定している。TC-016 が検証できなくなった不変条件が別テストで anchor された。

---

### [MEDIUM] Poll-death ESRCH branch untested for group-leader: production isAlive throws ESRCH, all tests use returning-false isAlive
**Status: FIXED**

`tests/unit/core/cancel/pid-kill.test.ts` の line 144 に "ESRCH poll-death + leader: group SIGKILL sent when isAlive throws ESRCH and isGroupLeader=true" が追加された。`isAlive` が ESRCH を throw し、`isGroupLeader=true` のケースで `kill(-8888, "SIGKILL")` が呼ばれることと `result.groupKilled === true` を固定している。本テストは ESRCH ブランチと `!alive` ブランチの両方に `reapGroup` が呼ばれていることを観測可能な形で固定しており、一方を除去すれば失敗する。

---

## Summary

全 6 件の findings が現在のコードで修正済みであることを確認した。regression（修正の後退）なし。
