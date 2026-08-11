# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 差分スコープ
`git diff main...HEAD --stat` で 31 ファイル変更（+3,368 行）を確認。  
新規ソース: `resolve-pid.ts`, `query-abort-hub.ts`, `query-abort.ts`（port）。  
変更: `pid-kill.ts`, `cancel/runner.ts`, `agent-runner.ts`, `local.ts`, `cancel.ts`。  
新規テスト: 7 ファイル（unit + 1 integration）。

### T-01: 共有 pid resolver
- `src/core/liveness/resolve-pid.ts` を精読。`readLivenessSidecar`（fs あり）と `resolveJobPid`（pure）に分離されている。
- `statePid != null` → state 優先、`sidecar.jobId === expectedJobId` 条件付きで sidecar 採用。jobId gate は正確。
- `tests/unit/core/liveness/resolve-pid.test.ts` で TC-013/014/015 が pure テストで固定されている。

### T-02: process-death-gate
- `src/core/cancel/runner.ts` の kill ブロック（旧: status gate）を精読。`state.status === "running"` 条件が削除され、`resolveJobPid` の結果（pid が null か否か）でゲートされている。
- `tests/unit/core/cancel/runner-process-gate.test.ts` で TC-001〜005, 011, 012 が網羅。TC-004 に 破壊確認コメントあり（status gate 復元で assertion が失敗する）。

### T-03: group reap
- `src/core/cancel/pid-kill.ts` の `reapGroup` 関数と SIGKILL 昇格ブロックを精読。
- `isGroupLeader` は optional → default `() => false`。既存テストの `makeDeps` が `isGroupLeader` を省略しても green を維持。
- `kill(-pid, "SIGKILL")` のエラー（EPERM/ESRCH）は catch されて `groupKilled=false` に倒す（best-effort）。pid-level kill result には影響しない。
- TC-006, TC-007, TC-016 で leader/非-leader/EPERM を固定。

**観察事項（低リスク）**: `reapGroup` は SIGKILL 昇格時だけでなく、SIGTERM ポーリング中に pid が死んだ場合（`isAlive=false` または ESRCH throw）にも呼ばれる。spec は「SIGKILL 昇格時」と言及するが、実装の挙動は安全かつ正しい（leader が SIGTERM で死んだ後に孤立した子を回収する）。ただし `isGroupLeader=true` + SIGTERM 死亡パスのテストが不在。

### T-04: cancel 出力
- pid 解決失敗 → `"Warning: no PID recorded for job, skipping process kill."` に `no PID recorded` が含まれる。
- `killResult.groupKilled === true` → `info.push("Process group -<pid> reaped ...")` を確認。
- 既存テスト "continues with warning when pid is null" は `no PID recorded` substring を検査しており互換性あり。

### T-05: QueryAbortHub
- `src/core/lifecycle/query-abort-hub.ts` を精読。`register`/`abortActive`/`drain` の実装が純粋で fs 依存なし。
- `drain` は poll 間隔 50ms で最大 `timeoutMs` まで待機し、set が空になれば即 resolve。ponytail コメントで上限制約を明記。
- TC-017/018/019 が全ケースを固定。

### T-06: agent-runner AbortController 登録
- `src/adapter/claude-code/agent-runner.ts` の `run()` 内で `abortController` 生成直後に `this.queryAbortHub?.register(abortController)` を呼び出し。
- `finally` ブロックで `deregisterFromHub?.()` を確認（成功・失敗・throw の全経路）。
- `queryAbortHub` が absent の場合は `?.` optional chaining でスキップ → 既存テスト互換。
- TC-020 で register×1 / deregister×1 と同一 controller であることを固定。

### T-07: LocalRuntime への hub 組み込み
- `src/core/runtime/local.ts` で `private readonly hub = new QueryAbortHub()` を確認。
- `createAgentRunner()` で `queryAbortHub: this.hub` を渡していることを確認。
- `signalCleanup` 内のシーケンス: `markSignalHandlerFired()` （同期）→ `hub.abortActive()` → `hub.drain(2000ms, ...)` → persist awaiting-resume → `process.exit(130)` の順序を確認。
- `ABORT_DRAIN_BOUND_MS = 2000` < `GRACEFUL_KILL_TIMEOUT_MS = 5000` で timing が成立している。
- TC-008 で 破壊確認、TC-009 で awaiting-resume persist、TC-010 で drain timeout 後の persist を固定。
- TC-016 invariant（`markSignalHandlerFired` が最初の await より前）が保持されていることも確認。

### T-08: 統合テスト
- `tests/cancel-process-group-integration.test.ts` で実プロセスを spawn して group 回収を確認。
- `win32` でスキップ（POSIX のみ実行）。
- 破壊確認: `isGroupLeader: () => false` に差し替えると child が残りテストが失敗する別ケースで固定。
- `afterEach` で survivors の best-effort kill を実施。

### 既存テスト互換性
4 つの pinned テストスイートを git diff で確認：
- `tests/unit/core/cancel/runner.test.ts` — **変更なし**（`makeDeps` に `isGroupLeader` なし、optional なので green 維持）
- `tests/unit/cli/cancel.test.ts` — **追記のみ**（`isGroupLeader` probe の両ブランチを新規テストで固定）
- `tests/unit/core/cancel/sidecar-teardown.test.ts` — **変更なし**
- `src/core/cancel/__tests__/runner-branch-delete.test.ts` — **変更なし**
- `tests/unit/core/cancel/pid-kill.test.ts` — **変更なし**（`makeDeps` は `isGroupLeader` なし、optional なので既存ケースに影響なし）

### Verification
verification-result.md を確認:  
- `bun run typecheck` passed（tsc --noEmit 0）  
- `bun run test` passed（750 test files, 11185 passed, 1 skipped — win32 skip expected）  
- lint passed（ESLint 0 warnings）  
- changed-line-coverage passed

## 検証できなかった項目

- Windows 環境での `isGroupLeader` probe 挙動（設計スコープ外として明示されている）。
- `ABORT_DRAIN_BOUND_MS = 2000` の実運用での適切性（2s は合理的だが実測値ではない）。

## Findings 詳細

### F-001（LOW）: `reapGroup` が SIGKILL 昇格以外でも呼ばれるパスが未テスト

**場所**: `src/core/cancel/pid-kill.ts` lines 103, 110

`reapGroup` はポーリング中に `isAlive=false`（SIGTERM で死亡）または ESRCH throw のケースでも呼ばれる。spec は「SIGKILL 昇格時」と記述するが、実装はそれより広い範囲をカバーしている。安全性の担保（`isGroupLeader` gate）は全パスに存在する。

問題: `isGroupLeader=true` かつ SIGTERM ポーリング中死亡のケースがテストされていない。現在の `pid-kill-group.test.ts` は `makeDepsAlwaysAlive`（isAlive=true）で SIGKILL 昇格を強制するテストと `isAlive=false` + `isGroupLeader=false` のリグレッションテストのみ。

fix: `isGroupLeader: vi.fn().mockReturnValue(true)` かつ `isAlive: vi.fn().mockReturnValue(false)` のテストケースを追加して、SIGTERM 死亡 + leader でも group signal が送出されることを固定する（または、意図的に SIGKILL 昇格時のみ group kill する設計ならその旨を comment + テストで明示する）。

実害: なし（behavior は安全かつ正しい）。テスト密度の問題。

### F-002（LOW）: `getJobSlug(state)` が `cancelSingleJob` 内で 2 回呼ばれる

**場所**: `src/core/cancel/runner.ts` lines 361 (`slugForKill`) and 451 (`slugForMarker`)

同じ `state` オブジェクトに対して `getJobSlug` を 2 回呼んでいる。`getJobSlug` は pure なので結果は同じ。変数名が `slugForKill` / `slugForMarker` と意味的に分かれているため可読性は悪くないが、共通変数 1 つにまとめられる。

fix: 最初の呼び出し前に `const slug = getJobSlug(state)` を 1 回だけ呼び、以降は `slug` を参照する。
