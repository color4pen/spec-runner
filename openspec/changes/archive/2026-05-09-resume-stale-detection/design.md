## Context

#75 Phase 1 で `transitionJob` / `canTransition` / `VALID_TRANSITIONS` が導入された（`src/state/lifecycle.ts`）。しかし `resume.ts` はまだこれらを使用せず、独自の status gate で `running` を hard reject し、`awaiting-resume` 以外を `--force` 必須にしている。

`VALID_TRANSITIONS` では `failed` / `terminated` → `running` が許可されているため、`resume` が `canTransition` を使えば自然にこれらの status からも再開可能になる。

`ManagedRuntime.registerCleanup()` は no-op で、graceful shutdown でも state が `running` のまま残る。`LocalRuntime` は SIGINT/SIGTERM で `awaiting-resume` に遷移するハンドラを持っている（local.ts:292-312）。

## Goals / Non-Goals

**Goals:**

- `JobState` に `pid` フィールドを追加し、`running` プロセスの生死を判定可能にする
- `resume` で orphaned `running` state を自動回復する（stale detection）
- `resume` の status gate を `canTransition` に統一し、`failed` / `terminated` からの再開を可能にする
- `ManagedRuntime` に SIGINT/SIGTERM ハンドラを実装する

**Non-Goals:**

- pipeline.ts の遷移を `transitionJob` に移行する（Phase 2a）
- finish の Phase 4 順序入れ替え（Phase 2b）
- 永続化の一元化（Phase 3）
- `ps` コマンドでの reconciliation（Phase 4）
- `--force` フラグによる stale detection バイパス

## Decisions

**D1: PID チェックは `process.kill(pid, 0)` で実装する**

- **Decision**: `process.kill(pid, 0)` はシグナルを送らずにプロセスの存在を確認する POSIX 標準手法。ESRCH → stale（プロセス不在）、EPERM → alive（権限不足だがプロセスは存在）
- **Rationale**: 外部依存なし。Node.js 標準 API。cross-platform（macOS/Linux）で動作

**D2: `pid` が存在しない場合は `updatedAt` + 15 分閾値でフォールバック**

- **Decision**: `state.pid` が undefined/null の場合、`updatedAt` が 15 分以上古ければ stale と判定する
- **Rationale**: 既存の state ファイル（`pid` フィールドなし）との後方互換性。step 実行中は `updatedAt` が step 完了時にしか更新されないため、閾値を短くすると false positive になる。15 分は最長ステップ（implementer）の実行時間を考慮した保守的な値

**D3: stale 判定後は `transitionJob` で `awaiting-resume` に遷移してから resume を続行する**

- **Decision**: `transitionJob(state, "awaiting-resume", { trigger: "stale-detection", reason: "Process not running" })` → `updateJobState` で永続化 → 通常の resume フローに合流
- **Rationale**: `transitionJob` を使うことで遷移の妥当性が検証され、history に記録される。Phase 1 の設計意図に沿う

**D4: `resume` の status gate を `canTransition(state.status, "running")` に置換する**

- **Decision**: 現行の `status === "awaiting-resume"` チェック + `--force` ガードを、`canTransition(state.status, "running")` の結果に基づく判定に置き換える
- **Rationale**: `VALID_TRANSITIONS` が `failed` / `terminated` → `running` を許可しているため、resume が自然にこれらの status からも動作する。遷移ルールの真実の源が `lifecycle.ts` に一元化される

**D5: ManagedRuntime のシグナルハンドラは LocalRuntime と同等の state 更新のみ**

- **Decision**: `transitionJob` で `running` → `awaiting-resume` に遷移し、`updateJobState` で永続化し、`process.exit(130)` で終了する。サーバー側 session の制御は行わない
- **Rationale**: Managed Agent のセッションはサーバー側で独立して動作する。クライアント側のシグナルハンドラが制御すべきは job state のみ

**D6: `pid` フィールドは `running` への遷移時に `process.pid` を記録し、それ以外への遷移時に null にする**

- **Decision**: `resume.ts` の `running` 遷移と `createJobState` の初期状態で `pid: process.pid` を設定する。`transitionJob` の `patch` で `pid: null` を渡す
- **Rationale**: `pid` は `running` 状態でのみ意味を持つ。他の状態に遷移した時点で古い PID 情報は不要

**D7: `isProcessAlive` ユーティリティを `safety.ts` に追加する**

- **Decision**: PID 存在確認ロジックを `isProcessAlive(pid: number): boolean` として `src/core/resume/safety.ts` に配置する
- **Rationale**: stale detection ロジックの一部だが、独立してテスト可能にするため関数として分離する。`safety.ts` は既に resume の安全性チェックを担当している

## Risks / Trade-offs

- **PID 再利用リスク**: Linux の PID 空間は 32768+ で、短時間での再利用確率は極めて低い。SIGKILL/OOM 後の再起動では全 PID が無効になる。実務上無視可能
- **15 分閾値の false positive**: 極端に長いステップ（implementer で 20 分以上）では false positive の可能性がある。ただし `pid` フィールドが存在する新しい state ファイルでは PID チェックが優先されるため、フォールバック閾値の影響は限定的
- **ManagedRuntime シグナルハンドラの不完全性**: サーバー側セッションは停止しないため、クライアント再起動後に古いセッションが残る可能性がある。これは Phase 4 の reconciliation で対処する
