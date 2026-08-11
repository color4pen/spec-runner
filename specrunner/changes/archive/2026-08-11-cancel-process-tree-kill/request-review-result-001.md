# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーションの実地確認

request.md に記載された以下のファイル・行番号を全て実読して検証した。

| アサーション | 検証結果 |
|---|---|
| `src/core/cancel/runner.ts:348-361` — kill block が `state.status === "running"` でゲートされ `state.pid` が null なら警告のみ | ✓ 一致。`if (state.status === "running")` の中で `state.pid != null` のみ kill |
| `src/core/cancel/pid-kill.ts:31-94` — `gracefulKill` は単一 pid への SIGTERM → poll → SIGKILL のみ | ✓ 一致。group 送出（`process.kill(-pid)`）はコードベース全体に存在しない |
| `src/util/spawn.ts:118-122` — `opts.detached` が true のとき `detached: true` を spawnOpts に追加 | ✓ 一致 |
| `src/core/command/detach.ts:119-124` — `spawnFn(... { detached: true, ... })` | ✓ 一致 |
| `src/core/runtime/local.ts:1518-1550` — SIGINT/SIGTERM handler が interruption 記録 + awaiting-resume persist + `releasePowerAssertion()` + `process.exit(130)` のみ | ✓ 一致。子プロセス終了処理なし |
| `src/core/runtime/local.ts:1432` — `writeLivenessSidecar` が `{ pid, session, worktreePath, jobId }` を書く | ✓ 一致。SidecarRecord 型は `{ jobId, worktreePath, pid, session }` |
| `src/adapter/claude-code/agent-runner.ts:515-520` — `AbortController` が wall-clock timeout 用にローカルスコープで生成される | ✓ 一致。local.ts の signal handler から到達する seam はない（local.ts に AbortController 参照ゼロ） |
| `src/cli/job-wait.ts:209-218` — pid 解決連鎖: state.pid → sidecar → last-known | ✓ 一致 |
| `src/cli/cancel.ts:104-122` — `cancelSingleJob` 呼び出し、CancelDeps に sidecar 読み取り関数なし | ✓ 一致。`CancelDeps` インターフェースに sidecar fallback は存在しない |
| `src/core/runtime/power-assertion.ts:64-70` — caffeinate が `-i -w <pid>` で spawn | ✓ 一致 |

### 既存テストファイルの存在確認

受け入れ基準が「原則無変更で green」を要求している 4 ファイルが全て存在することを確認した:

- `tests/unit/core/cancel/runner.test.ts` ✓
- `tests/unit/cli/cancel.test.ts` ✓
- `tests/unit/core/cancel/sidecar-teardown.test.ts` ✓
- `src/core/cancel/__tests__/runner-branch-delete.test.ts` ✓

### 追加調査

- `job-wait.ts` の `realReadSidecarPid` は sidecar 読み取り時に **jobId を検証しない**（pid のみを返す）。request が要求する "jobId 一致時のみ採用" は cancel に追加する新しい安全ガードであり、既存 job-wait ロジックとの差分になる。要件・受け入れ基準の記述は正確。
- "leader 判定の実装手段は design で確定する" — POSIX 上での PGID 取得（`getpgid(pid) === pid` の確認）は Node.js/Bun の組み込み API では不可能。設計では `ps -o pgid= -p <pid>` またはサイドカーへの `isGroupLeader` フラグ追記など、platform-specific なアプローチを選択する必要がある。request はこれを意図的に design に委ねており、問題の認識と委ねの構造は適切。

## 検証できなかった項目

None — 全コードアサーションを実読した。

## Findings 詳細

None — ブロッカーとなる誤記・整合性問題は見当たらない。以下は観察事項（要対応なし）。

**観察1**: request の「cancel の pid 解決を job wait と同じ連鎖に揃える」という表現は、現状 job-wait に jobId 検証がない点で厳密には「揃える」でなく「より安全な jobId-validated 版を cancel に実装する」が正確。受け入れ基準の内容は正しいため実装に支障はない。

**観察2**: 受け入れ基準の統合テスト（「process group に属するプロセスが残らない」）は実プロセスの spawn を要する。CI 環境での信頼性を設計・実装で考慮すること。
