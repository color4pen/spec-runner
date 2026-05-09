# Code Review: resume-stale-detection (Iteration 1)

- **iteration**: 1
- **verdict**: approved
- **total-score**: 8.45

## Summary

実装は仕様に忠実で、`transitionJob` / `canTransition` の統合、PID ベースの stale detection、ManagedRuntime シグナルハンドラの全てが正しく動作する。型チェック・全 1487 テスト PASS。CRITICAL / HIGH の指摘なし。テストの Scenario Coverage は unit レベルで十分だが、resume コマンドの stale detection 統合テストと ManagedRuntime シグナルハンドラの遷移挙動テストが must シナリオとして未実装。

## Verification

- `bun run typecheck`: PASS (0 errors)
- `bun run test`: PASS (1487 tests, 138 files)

## Scores

| Category | Score | Weight | Weighted | Rationale |
|----------|-------|--------|----------|-----------|
| correctness | 9 | 0.30 | 2.70 | PID チェック・EPERM/ESRCH 分岐・updatedAt フォールバック・canTransition 統合すべて正しい。境界値（15 分ちょうど）も適切に処理 |
| security | 9 | 0.25 | 2.25 | `process.kill(pid, 0)` はシグナルを送らない安全な手法。PID 再利用リスクは設計で許容済み。入力検証（pid <= 0 ガード）あり |
| architecture | 8 | 0.15 | 1.20 | `transitionJob` を一貫して使用し遷移ルールが lifecycle.ts に一元化されている。isProcessAlive / isStaleRunning の分離はテスタブル。ManagedRuntime の `as unknown as CleanupHandle` は minor な型エスケープ |
| performance | 9 | 0.10 | 0.90 | PID チェックは O(1) syscall。stale detection のオーバーヘッドは無視可能 |
| maintainability | 8 | 0.10 | 0.80 | JSDoc コメント充実。命名が意図を明確に伝える。ManagedRuntime の handle 内部構造（`__signalCleanup`）は convention として acceptable |
| testing | 6 | 0.10 | 0.60 | unit テスト（isProcessAlive, isStaleRunning, transitionJob pid patch）は優良。resume コマンド統合テスト（TC-11〜13）・ManagedRuntime シグナル遷移テスト（TC-20〜21）が must 未実装。18 must 中 11 実装 = 61% |
| **Total** | | | **8.45** | |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/cli/resume.test.ts | must シナリオ TC-11, TC-12, TC-13（resume コマンドの stale detection 統合テスト）が未実装。stale running → 回復、alive running → reject、updatedAt フォールバック → 回復の 3 パスが検証されていない | `makeAwaitingResumeJob` で `status: "running"`, `pid: 999999` / `pid: process.pid` / `pid: undefined, updatedAt: 20分前` の state を作成し、resume の挙動をテストする |
| 2 | MEDIUM | testing | tests/unit/core/runtime/managed.test.ts | must シナリオ TC-20, TC-21（ManagedRuntime シグナルハンドラが実際に awaiting-resume に遷移するか）が未実装。listener count の増減のみ検証されている | `loadJobState` / `updateJobState` / `process.exit` をモックし、`process.emit("SIGINT")` 後に `transitionJob` で `awaiting-resume` に遷移し `pid: null` が設定されることを検証する |
| 3 | LOW | maintainability | src/core/runtime/managed.ts:183 | `{ __signalCleanup: signalCleanup } as unknown as CleanupHandle` は二重キャストによる型エスケープ。LocalRuntime の `makeHandle()` と異なるパターン | CleanupHandle に共通の internal 型を定義するか、`makeHandle` 相当のファクトリを共有する（次リファクタで対応可） |
| 4 | LOW | testing | tests/unit/core/resume/safety.test.ts | should シナリオ TC-03（EPERM → alive 判定）が未実装。`process.kill` をモックして EPERM をスローするケースが検証されていない | `vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error(), { code: "EPERM" }); })` で EPERM パスを検証する |
| 5 | LOW | testing | tests/unit/state/store.test.ts | must シナリオ TC-26（createJobState で pid が process.pid で初期化される）が未実装 | `createJobState` の返り値で `state.pid === process.pid` をアサートするテストを追加する |

## Scenario Coverage

### Must scenarios (18 total)

| TC | Description | Status |
|----|-------------|--------|
| TC-01 | isProcessAlive — current PID alive | Implemented |
| TC-02 | isProcessAlive — dead PID stale | Implemented |
| TC-05 | isStaleRunning — non-running always false | Implemented |
| TC-06 | isStaleRunning — running + alive pid | Implemented |
| TC-07 | isStaleRunning — running + dead pid | Implemented |
| TC-08 | isStaleRunning — no pid + 16m updatedAt | Implemented |
| TC-09 | isStaleRunning — no pid + 5m updatedAt | Implemented |
| TC-11 | resume — stale recovery integration | **NOT implemented** |
| TC-12 | resume — alive reject integration | **NOT implemented** |
| TC-13 | resume — updatedAt fallback integration | **NOT implemented** |
| TC-15 | resume — failed status allowed | Implemented |
| TC-16 | resume — terminated status allowed | Implemented |
| TC-18 | resume — pid recorded on running | **NOT implemented** |
| TC-19 | ManagedRuntime — SIGINT listener added | Implemented |
| TC-20 | ManagedRuntime — SIGINT transition behavior | **NOT implemented** |
| TC-21 | ManagedRuntime — SIGTERM transition behavior | **NOT implemented** |
| TC-22 | ManagedRuntime — teardown removes listeners | Implemented |
| TC-24 | pid field optional (typecheck) | Implemented (implicit) |
| TC-25 | backward compat (no pid) | Implemented (TC-08/09 use pid: undefined) |
| TC-26 | createJobState — pid initialized | **NOT implemented** |

**Coverage**: 13/19 implemented (68%)
