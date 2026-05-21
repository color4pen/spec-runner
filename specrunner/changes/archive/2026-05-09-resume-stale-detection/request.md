# resume に stale detection を追加し ManagedRuntime にシグナルハンドラを実装する

## Meta

- **type**: bug-fix
- **slug**: resume-stale-detection
- **base-branch**: main

## 背景

SIGKILL / OOM / マシン再起動後、job state が `running` のまま残る。`resume` は `running` を hard reject するため、ユーザーは state ファイルを手動編集する以外に回復手段がない。

加えて ManagedRuntime の `registerCleanup()` は完全 no-op で、SIGINT/SIGTERM でも state が `running` のまま残る。

#75 Phase 1 で導入された `transitionJob` を使って、orphaned `running` の自動回復と ManagedRuntime のシグナルハンドラを実装する。

## 要件

1. `JobState` の schema に `pid?: number` フィールドを追加する
   - `running` への遷移時に `process.pid` を `patch` 経由で記録
   - `running` 以外への遷移時に `null` に戻す
2. `resume` コマンドの `running` gate（resume.ts:95-101）に stale detection を組み込む
   - `state.pid` が存在し、`process.kill(pid, 0)` で例外が発生すれば stale と判定
   - `state.pid` が存在しない場合は `updatedAt` + 閾値（15 分）で stale 判定にフォールバック
   - stale と判定された場合、`transitionJob(state, "awaiting-resume", { trigger: "stale-detection", reason: "Process not running" })` を実行して永続化し、resume を続行
   - stale でない場合は現行通り reject
3. `ManagedRuntime` にシグナルハンドラを実装する（managed.ts:158-165）
   - `LocalRuntime` と同等の SIGINT/SIGTERM ハンドラ
   - `transitionJob(state, "awaiting-resume", { trigger: "signal-handler", reason: "Interrupted by signal" })` → persist → exit
4. `resume` コマンドの status gate を `canTransition(state.status, "running")` に置換する
   - `VALID_TRANSITIONS` で `failed` / `terminated` → `running` も許可されているため、`resume` が自然にこれらの status からも再開可能になる

## スコープ外

- pipeline.ts の遷移移行（Phase 2a）
- finish の Phase 4 順序入れ替え（Phase 2b）
- 永続化の一元化（Phase 3）
- ps 時の reconciliation（Phase 4）
- `--force` フラグによる stale detection バイパス

## 受け入れ基準

- [ ] `JobState` schema に `pid` フィールドが追加されている
- [ ] `running` への遷移時に `pid` が記録される
- [ ] orphaned `running` state（プロセス死亡後）から `resume` で回復できる
- [ ] ManagedRuntime で SIGINT を受けると `awaiting-resume` に遷移して終了する
- [ ] `resume` が `failed` / `terminated` の job も再開できる
- [ ] stale detection のユニットテストが存在する（PID 存在/不在、updatedAt フォールバック）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- PID チェックは `process.kill(pid, 0)` で実装。EPERM は「プロセス存在するが権限なし」→ stale ではない。ESRCH は「プロセス不在」→ stale
- `updatedAt` フォールバックの閾値は 15 分。step 実行中は `updatedAt` が step 完了時にしか更新されないため、短すぎると false positive になる
- ManagedRuntime のシグナルハンドラは state 更新のみ。サーバー側 session の制御は行わない（session はサーバー側で独立して動き続ける）
- PID 再利用リスクは実務上無視可能（Linux の PID 空間は 32768+、再起動後は全て無効）


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/resume-stale-detection.md` by `merged-to-archive-consolidation`.
