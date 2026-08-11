# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md — コード前提の正確性

request.md が主張するすべてのファイル参照を実ファイルで突合した。

| 主張 | 検証結果 |
|------|----------|
| `src/core/cancel/runner.ts:348-361` — kill block が `state.status === "running"` でゲートされる | ✓ 確認。L348 が正確に該当行 |
| `src/core/cancel/pid-kill.ts:31-94` — gracefulKill は単一 pid への SIGTERM → poll → SIGKILL のみ | ✓ 確認。SIGKILL 昇格後に process group への送出なし |
| `src/util/spawn.ts:118-122` / `src/core/command/detach.ts:119-124` — `detached: true` で spawn | ✓ 確認。detach.ts L121 に `detached: true` |
| `src/core/runtime/local.ts:1518-1550` — SIGTERM handler が interruption persist + exit(130) のみ | ✓ 確認。agent subprocess 終了処理なし |
| `src/adapter/claude-code/agent-runner.ts:515-520` — per-call AbortController | ✓ 確認。L516 `new AbortController()` |
| `src/cli/job-wait.ts:209-218` — state.pid → sidecar → last-known の連鎖 | ✓ 確認。`statePid ?? sidecarPid ?? lastKnownPid` |
| `src/core/runtime/local.ts:1432` — `writeLivenessSidecar` default `process.pid` | ✓ 確認。`pid: number \| null = process.pid` |
| `cancel.ts` — `state.pid` のみで pid 解決、sidecar fallback なし | ✓ 確認。L348-361 に sidecar 参照なし |

### 2. design.md — 4 決定の論理検証

**D1（pid 解決連鎖）**: `src/core/cancel/runner.ts:88-104` に同一の jobId チェックパターン（worktree パス解決用）が既存しており、設計の整合性が取れている。`job wait` の `readSidecarPid` は jobId チェックなし（pid だけを返す）だが、design は「wait は last-known tail を持つ別目的」と明記しており矛盾なし。

**D2（process-death-gate）**: `gracefulKill` は ESRCH を成功扱いするため、pid が既に死んでいれば SIGTERM が不発になる。status を見ずに解決済み pid があれば kill する方針と整合。pid 再利用リスクは design の Risks 節に記載済み。

**D3（leader 判定 + group kill）**: `kill(-pid, 0)` による leader 判定の根拠が正確 — foreground job は shell の pgid を持ち process group `pid` は存在しないため ESRCH になる。detach 子は pgid == pid なので成功する。safety bias（throw → non-leader）が foreground group への誤送出を防止する。`process.kill` が負数 pid を受け付ける（型 `number`）ことを確認。

**D4（QueryAbortHub）**: TC-016（signal-handler-order.test.ts）が `markSignalHandlerFired()` → 最初の await の順序を pin している。設計は `markSignalHandlerFired()`（同期）→ `hub.abortActive()`（同期）→ `await hub.drain(...)` の順で挿入する。`store.load()` は 2 番目の await に移るが、TC-016 は「`store.load()` 呼び出し時に flag が true か」を検証するため引き続き green になる。adapter → core/port 境界は既存 `src/core/port/` パターンを踏襲。

### 3. spec.md — Requirement / Scenario の完全性

| Requirement | SHALL/MUST | Scenario | 評価 |
|-------------|-----------|----------|------|
| Cancel resolves pid from state → sidecar | ✓ | 3（state wins / sidecar match / foreign reject） | ✓ |
| Cancel gates kill on process liveness | ✓ | 2（awaiting-resume + live pid / no pid warns） | ✓ |
| Graceful kill reaps group on SIGKILL escalation (leader only) | ✓ | 2（leader reaps / non-leader skips） | ✓ |
| Runner aborts in-flight queries on signal | ✓ | 2（abort fires / awaiting-resume persisted） | ⚠ gap（F-01） |
| Cancel output distinguishes skipped from group reap | ✓ | 2（group reported / skip reported） | ✓ |

### 4. tasks.md — 受け入れ基準の網羅性

T-01〜T-09 全タスクの AC を確認。

- 破壊確認が T-02（disk-lag 経路）、T-07（abort 発火）、T-08（group kill）の各所で明記されている。
- 既存テスト 4 suite の変更ルール（status-gate を pin する it のみ許容）が明示されている。
- `isGroupLeader` が optional フィールドとして追加されるため、`runner-branch-delete.test.ts` の `makeDeps` は型チェックを通過する（`FAKE_REPO_ROOT="/repo"` に sidecar なし → pid null → kill 不発 → green 維持）。
- `sidecar-teardown.test.ts` の `writeForeignSidecar` は `pid: null` を書き込むため、新 resolver は null を返し kill しない（既存挙動と同一）。

### 5. セキュリティ観点（OWASP Top 10 適用範囲）

- **A01 Broken Access Control（kill scope 逸脱）**: D3 の leader gate が group kill を detach 子のみに限定する。safety bias（例外 → non-leader 扱い）が foreground job への誤送出を防止する。
- **A03 Injection**: kill path に流入する pid は内部生成値（`process.pid`）または machine-local sidecar ファイルから。sidecar は jobId でゲートされ、外部ユーザー入力が pid に直接流入しない。
- **Sidecar trust model**: `.specrunner/local/<slug>/liveness.json` に整合性保護はないが、既存 `job wait` も同様であり本変更による regression はない。ローカル fs 書き込みアクセスを前提とする脅威モデル外の攻撃。

---

## 検証できなかった項目

- **T-08 統合テストの実行可能性**: POSIX 環境での integration test が実際に green になるかは実行環境依存。設計は妥当だが runtime での動作確認は実行前に不能。
- **`hub.drain()` の poll interval**: 設計は bounded poll とのみ述べ interval 値を決定していない。production で drain が過剰に長引く可能性の定量評価は実装段階での確認事項。
- **Windows fallback 挙動**: `kill(-pid, ...)` の Windows での動作は POSIX 以外で未検証（スコープ外として明記済み）。

---

## Findings 詳細

### F-01 (medium): spec.md — "bounded drain" タイムアウトパスの scenario 欠落

**対象ファイル**: `specrunner/changes/cancel-process-tree-kill/spec.md`

**対象 Requirement**: "The runner aborts in-flight agent queries on SIGINT/SIGTERM before exit"

Requirement 本文に「The wait for abort completion MUST be bounded」と MUST で記述されているが、drain がタイムアウトするパス（AbortController が deregister されないまま bound を超過する場合）の scenario がない。現在の 2 Scenario は happy-path（drain 即解消）と persist 順序のみ。

T-05 ユニットテストが hub レベルで timeout 挙動をカバーするが、spec には「drain がタイムアウトしても awaiting-resume は persist され exit する」という normative な scenario がない。実装者が timeout 後の persist / exit を省略しても spec レベルでは検出できない。

**修正案（spec.md への追記）**:

```
#### Scenario: drain times out and the handler still persists awaiting-resume

**Given** an in-flight agent query whose AbortController is registered but not
deregistered within the bounded drain wait
**When** the drain bound elapses during the signal handler
**Then** the job state is still persisted as `awaiting-resume` and the process exits
```

---

### F-02 (low): spec.md — group kill エラー時の動作に normative 記述がない

**対象ファイル**: `specrunner/changes/cancel-process-tree-kill/spec.md`

**対象 Requirement**: "Graceful kill reaps the process group on SIGKILL escalation only for group leaders"

Requirement 本文は group SIGKILL を送出することを述べるが、group kill 自体が EPERM / ESRCH で失敗した場合の動作が spec に記述されていない。design.md D3 に「Group-signal errors are best-effort and MUST NOT flip `killed`」と明記されているが、spec に対応する normative statement がない。実装者が group kill 失敗を pid kill 失敗として扱っても spec レベルの違反にならない。

**修正案（Requirement 本文への追記）**:

```
A group-signal error (EPERM, ESRCH) MUST NOT affect the kill result of the
target pid; group-signal delivery is best-effort.
```
