# Code Review: fix-worktree-lock-contention

- **reviewer**: code-reviewer (local)
- **date**: 2026-05-13
- **iteration**: 001
- **verdict**: approved

## Summary

`WorktreeManager.create()` に retry loop と `SleepFn` DI を追加する変更。実装は design.md / tasks.md に忠実で、既存呼び出し側（`local.ts` / `finish/orchestrator.ts`）はオプショナル引数なので影響なし。verification は build / typecheck / test 全て pass。

スコープ・型安全性・retry semantics・error 検知ロジック・テスト分離いずれも問題なし。critical / major レベルの指摘なし。

## Findings

### F1: must テストケースの一部がアサートとして実装されていない（minor）

**Severity**: minor
**File**: `tests/core/worktree/manager.test.ts`

test-cases.md の以下 must ケースが、テストコードに明示的なアサートとして反映されていない:

- **TC-WTM-014（must）**: 「`process.stderr` に `"Retrying worktree add: lock contention (attempt 1/3)"` が書き込まれる」を直接 assert していない。実装は `process.stderr.write(...)` を呼ぶが、テストは spy していないため、ログ文字列の regression を検知できない。
- **TC-WTM-021（must）**: 「retries exhausted 時の error message が `"git worktree add failed (exit 128): error: could not lock config file ..."` 形式である」ことを assert していない。TC-WTM-011 は `"git worktree add failed"` substring のみチェック。exit code / stderr 部分の preservation が落ちても検知できない。

verification は通っており実装は正しく動作している（verification log の `Retrying worktree add: lock contention (attempt 1/3)` 出力で確認可能）。テスト網羅性の improvement として記録するに留める。must の coverage gap を厳密に取るなら needs-fix だが、TC-WTM-014/021 は補助的な assertion であり、核となるリトライ semantics（010/011/012）は完備されているため approved とする。

### F2: `MAX_RETRIES` の語義揺れ（info）

**Severity**: info
**File**: `src/core/worktree/manager.ts:79`

`MAX_RETRIES = 3` は実際には「最大 attempts 数」を意味する（= 2 retries）。spec-review-result でも指摘済み。命名としては `MAX_ATTEMPTS` がより正確だが、design.md / tasks.md と一貫しているため修正不要。将来 retry を別文脈で導入する際の参考。

### F3: random jitter の seed 一意性（info）

**Severity**: info
**File**: `src/core/worktree/manager.ts:91`

`Math.random()` ベースの jitter は実用上十分（design.md Risks 節で評価済み）。同一 Node プロセス内の並列呼び出しは別の `Math.random()` 系列なので問題ないが、複数 specrunner プロセスを同時起動した場合の PID 由来 seed 衝突は理論上ありうる。実運用 2-3 並列では問題化しない見込みで、設計判断として妥当。

### F4: 既存呼び出し側の互換性（OK）

`createWorktreeManager` の 3rd 引数は optional なので、`local.ts:64` (`createWorktreeManager()`) と `finish/orchestrator.ts:271` の呼び出しは無変更で動作する。production では `defaultSleep` が使われる。互換性 OK。

### F5: Security / Type Safety / Async（OK）

- 新しい外部入力なし、認証フロー変更なし、攻撃面拡大なし。
- `SleepFn` / `RmFn` 型エイリアスは明示的に定義され、`any` / non-null assertion / 不適切な `as` cast なし。
- retry loop 内の `await spawn(...)` / `await sleep(...)` は逐次 await で正しい（並列化対象でない）。fire-and-forget Promise なし、unhandled rejection リスクなし。

## Test Coverage Summary

| TC ID | Priority | Implemented | Notes |
|-------|----------|-------------|-------|
| TC-WTM-010 | must | yes | retry 成功（2nd attempt） |
| TC-WTM-011 | must | yes | retries exhaust → throws |
| TC-WTM-012 | must | yes | 非 lock-contention は即 throw |
| TC-WTM-013 | must | covered by TC-WTM-001 | 正常パス回帰 |
| TC-WTM-014 | must | partial | ログ文字列を直接 assert していない（F1） |
| TC-WTM-018 | must | yes | typecheck pass |
| TC-WTM-019 | must | yes | 全 suite pass |
| TC-WTM-021 | must | partial | error message format の厳密 assert なし（F1） |
| TC-WTM-015 | should | no | jitter range の assert なし |
| TC-WTM-016 | should | no | 2nd 失敗 → 3rd 成功 |
| TC-WTM-017 | should | no | defaultSleep fallback の直接検証なし |
| TC-WTM-020 | should | covered by TC-WTM-002 | non-retry error message format |
| TC-WTM-022 | could | implicit | substring match は実装で担保 |

must 6 件中 4 件が完全実装、2 件（014/021）が partial（実装は正しく動くが test assertion が弱い）。should の実装率は 0/4（明示的テストなし、ただし一部は既存テストでカバー）。

## Conclusion

bug-fix としての core semantics（retry / no-retry / exhaustion / 正常パス維持）は実装・テスト共に正しい。verification も pass。指摘事項は test assertion 強化の improvement のみで、blocker なし。

**Verdict: approved**

F1 で挙げた must の partial coverage（TC-WTM-014/021）は次回イテレーション以降の test 補強 backlog として記録するのが望ましい。
