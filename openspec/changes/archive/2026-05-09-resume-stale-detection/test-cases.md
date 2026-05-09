# Test Cases: resume-stale-detection

Generated from proposal.md, design.md, tasks.md.

## Legend

| Field | Values |
|-------|--------|
| Priority | **must** = 受け入れ基準に直結、**should** = 設計判断の検証、**could** = 境界値・エッジケース |
| Category | unit / integration / e2e |
| Source | tasks.md の該当タスク番号 or 設計決定 (D1-D7) |

---

## TC-01: isProcessAlive — 現在のプロセス PID は alive と判定される

- **Priority**: must
- **Category**: unit
- **Source**: tasks 2.1, AC「stale detection のユニットテストが存在する」

```
GIVEN プロセス自身の PID (process.pid)
WHEN  isProcessAlive(process.pid) を呼ぶ
THEN  true を返す
```

---

## TC-02: isProcessAlive — 存在しない PID は stale と判定される

- **Priority**: must
- **Category**: unit
- **Source**: tasks 2.1, D1

```
GIVEN 存在しない PID (例: 999999)
WHEN  isProcessAlive(999999) を呼ぶ
THEN  false を返す (ESRCH → stale)
```

---

## TC-03: isProcessAlive — EPERM は alive と判定される

- **Priority**: should
- **Category**: unit
- **Source**: tasks 2.1, D1「EPERM は alive」

```
GIVEN process.kill が EPERM エラーをスローするようモックされた PID
WHEN  isProcessAlive(pid) を呼ぶ
THEN  true を返す (プロセスは存在するが権限なし = stale ではない)
```

---

## TC-04: isProcessAlive — 0 以下の無効な PID は false を返す

- **Priority**: could
- **Category**: unit
- **Source**: tasks 2.1 (境界値)

```
GIVEN PID = 0 または負数
WHEN  isProcessAlive(pid) を呼ぶ
THEN  false を返す
```

---

## TC-05: isStaleRunning — status が "running" でなければ常に false

- **Priority**: must
- **Category**: unit
- **Source**: tasks 2.2

```
GIVEN status が "awaiting-resume" / "failed" / "completed" / "terminated" の state
WHEN  isStaleRunning(state) を呼ぶ
THEN  false を返す
```

---

## TC-06: isStaleRunning — running かつ pid が生存プロセス → false

- **Priority**: must
- **Category**: unit
- **Source**: tasks 2.2, AC「orphaned running state から resume で回復できる」

```
GIVEN state.status = "running", state.pid = process.pid (自プロセス、生存中)
WHEN  isStaleRunning(state) を呼ぶ
THEN  false を返す (プロセスが存在するため stale ではない)
```

---

## TC-07: isStaleRunning — running かつ pid が死亡プロセス → true

- **Priority**: must
- **Category**: unit
- **Source**: tasks 2.2, AC「orphaned running state から resume で回復できる」

```
GIVEN state.status = "running", state.pid = 999999 (存在しない PID)
WHEN  isStaleRunning(state) を呼ぶ
THEN  true を返す (プロセスが不在 = stale)
```

---

## TC-08: isStaleRunning — running かつ pid なし かつ updatedAt が 16 分前 → true

- **Priority**: must
- **Category**: unit
- **Source**: tasks 2.2, D2「updatedAt + 15 分閾値フォールバック」

```
GIVEN state.status = "running", state.pid = undefined,
      state.updatedAt = Date.now() - 16 * 60 * 1000 (16 分前)
WHEN  isStaleRunning(state) を呼ぶ
THEN  true を返す (閾値 15 分超過 = stale)
```

---

## TC-09: isStaleRunning — running かつ pid なし かつ updatedAt が 5 分前 → false

- **Priority**: must
- **Category**: unit
- **Source**: tasks 2.2, D2

```
GIVEN state.status = "running", state.pid = undefined,
      state.updatedAt = Date.now() - 5 * 60 * 1000 (5 分前)
WHEN  isStaleRunning(state) を呼ぶ
THEN  false を返す (閾値 15 分未満 = 生存判定)
```

---

## TC-10: isStaleRunning — running かつ pid なし かつ updatedAt がちょうど 15 分 → false（境界値）

- **Priority**: should
- **Category**: unit
- **Source**: tasks 2.2, D2（境界値）

```
GIVEN state.status = "running", state.pid = undefined,
      state.updatedAt = Date.now() - 15 * 60 * 1000 (ちょうど 15 分前)
WHEN  isStaleRunning(state) を呼ぶ
THEN  false を返す (elapsed > threshold なので exactly 15 分は stale ではない)
```

---

## TC-11: resume — running かつ stale (dead PID) の場合は awaiting-resume に遷移して続行

- **Priority**: must
- **Category**: unit / integration
- **Source**: tasks 3.4, AC「orphaned running state から resume で回復できる」, D3

```
GIVEN job state.status = "running", state.pid = 999999 (dead PID)
WHEN  resume コマンドを実行する
THEN  - state が awaiting-resume に遷移して永続化される
      - state.pid が null になる
      - history に trigger="stale-detection" のエントリが記録される
      - resume フローが続行される (エラーにならない)
      - stderr に "Recovering" を含む Warning が出力される
```

---

## TC-12: resume — running かつ alive PID の場合は reject される

- **Priority**: must
- **Category**: unit / integration
- **Source**: tasks 3.4, AC「orphaned running state から resume で回復できる」

```
GIVEN job state.status = "running", state.pid = process.pid (生存中のプロセス)
WHEN  resume コマンドを実行する
THEN  PrepareError がスローされ "Job is running" というメッセージが含まれる
      state は変更されない
```

---

## TC-13: resume — running かつ pid なし かつ updatedAt > 15 分 → stale 回復して続行

- **Priority**: must
- **Category**: unit / integration
- **Source**: tasks 3.4, D2「pid が存在しない場合は updatedAt フォールバック」

```
GIVEN job state.status = "running", state.pid = undefined,
      state.updatedAt = Date.now() - 20 * 60 * 1000 (20 分前、旧形式 state ファイル)
WHEN  resume コマンドを実行する
THEN  state が awaiting-resume に遷移して永続化される
      resume フローが続行される
```

---

## TC-14: resume — running かつ pid なし かつ updatedAt < 15 分 → reject される

- **Priority**: should
- **Category**: unit / integration
- **Source**: tasks 3.4, D2

```
GIVEN job state.status = "running", state.pid = undefined,
      state.updatedAt = Date.now() - 5 * 60 * 1000 (5 分前)
WHEN  resume コマンドを実行する
THEN  PrepareError がスローされ "Job is running" というメッセージが含まれる
      state は変更されない
```

---

## TC-15: resume — failed 状態の job を再開できる

- **Priority**: must
- **Category**: unit / integration
- **Source**: tasks 3.4, AC「resume が failed / terminated の job も再開できる」, D4

```
GIVEN job state.status = "failed"
WHEN  resume コマンドを実行する
THEN  canTransition("failed", "running") が true を返し
      resume フローが続行される (PrepareError がスローされない)
```

---

## TC-16: resume — terminated 状態の job を再開できる

- **Priority**: must
- **Category**: unit / integration
- **Source**: tasks 3.4, AC「resume が failed / terminated の job も再開できる」, D4

```
GIVEN job state.status = "terminated"
WHEN  resume コマンドを実行する
THEN  canTransition("terminated", "running") が true を返し
      resume フローが続行される
```

---

## TC-17: resume — completed 状態の job は再開できない

- **Priority**: should
- **Category**: unit / integration
- **Source**: tasks 3.4, D4（VALID_TRANSITIONS で completed → running は未定義）

```
GIVEN job state.status = "completed"
WHEN  resume コマンドを実行する
THEN  canTransition("completed", "running") が false を返し
      PrepareError がスローされ "Cannot resume from status 'completed'" というメッセージが含まれる
```

---

## TC-18: resume — running 遷移時に pid が process.pid で記録される

- **Priority**: must
- **Category**: unit / integration
- **Source**: tasks 3.5, 1.2, AC「running への遷移時に pid が記録される」, D6

```
GIVEN job state.status = "awaiting-resume"
WHEN  resume コマンドが running へ遷移して state を永続化する
THEN  永続化された state.pid === process.pid
      transitionJob の patch に pid: process.pid が含まれる
```

---

## TC-19: ManagedRuntime.registerCleanup — SIGINT リスナーが登録される

- **Priority**: must
- **Category**: unit
- **Source**: tasks 4.2, AC「ManagedRuntime で SIGINT を受けると awaiting-resume に遷移して終了する」

```
GIVEN ManagedRuntime インスタンス
WHEN  registerCleanup(jobId, startStep) を呼ぶ
THEN  process.listenerCount("SIGINT") が 1 増加する
      process.listenerCount("SIGTERM") が 1 増加する
```

---

## TC-20: ManagedRuntime.registerCleanup — SIGINT で awaiting-resume に遷移して exit(130)

- **Priority**: must
- **Category**: unit
- **Source**: tasks 4.2, AC「ManagedRuntime で SIGINT を受けると awaiting-resume に遷移して終了する」, D5

```
GIVEN registerCleanup(jobId, startStep) が呼ばれた状態
      loadJobState と updateJobState がモックされている
WHEN  SIGINT シグナルを送信する (emit)
THEN  - loadJobState(jobId) が呼ばれる
      - transitionJob(state, "awaiting-resume", { trigger: "signal-handler" }) が呼ばれる
      - 遷移後の state.pid が null
      - updateJobState で永続化される
      - process.exit(130) が呼ばれる
```

---

## TC-21: ManagedRuntime.registerCleanup — SIGTERM でも同様に awaiting-resume に遷移

- **Priority**: must
- **Category**: unit
- **Source**: tasks 4.2, D5

```
GIVEN registerCleanup(jobId, startStep) が呼ばれた状態
WHEN  SIGTERM シグナルを送信する
THEN  state が awaiting-resume に遷移して永続化され
      process.exit(130) が呼ばれる
```

---

## TC-22: ManagedRuntime.teardown — シグナルリスナーが解除される

- **Priority**: must
- **Category**: unit
- **Source**: tasks 4.3

```
GIVEN registerCleanup が返した CleanupHandle
WHEN  teardown(handle, "completed") を呼ぶ
THEN  process.listenerCount("SIGINT") が registerCleanup 前の値に戻る
      process.listenerCount("SIGTERM") が registerCleanup 前の値に戻る
```

---

## TC-23: ManagedRuntime シグナルハンドラ — state 更新失敗でも exit(130) される

- **Priority**: should
- **Category**: unit
- **Source**: tasks 4.2, D5「Best-effort persist」

```
GIVEN registerCleanup が呼ばれ、loadJobState または updateJobState がエラーをスローするようモックされた状態
WHEN  SIGINT を送信する
THEN  エラーがスローされず
      process.exit(130) が呼ばれる (best-effort)
```

---

## TC-24: JobState schema — pid フィールドが optional として定義されている

- **Priority**: must
- **Category**: unit
- **Source**: tasks 1.1, AC「JobState schema に pid フィールドが追加されている」

```
GIVEN JobState 型定義
WHEN  pid フィールドを省略した状態オブジェクトを構築する
THEN  TypeScript コンパイルエラーが発生しない (optional フィールドであるため)
      pid フィールドの型は number | null | undefined
```

---

## TC-25: JobState schema — 既存 state ファイル (pid なし) の後方互換性

- **Priority**: must
- **Category**: unit / integration
- **Source**: tasks 1.1, D2「既存 state ファイルとの後方互換性」

```
GIVEN pid フィールドを含まない既存 state JSON ファイル
WHEN  state をデシリアライズする
THEN  state.pid === undefined として扱われる
      isStaleRunning が updatedAt フォールバックを使用して判定する
```

---

## TC-26: createJobState — 初期状態に pid が記録される

- **Priority**: must
- **Category**: unit
- **Source**: tasks 1.2, AC「running への遷移時に pid が記録される」

```
GIVEN 新規 job を作成する
WHEN  createJobState() を呼ぶ
THEN  返り値の state.pid === process.pid
      state.status === "running"
```

---

## TC-27: pipeline safety net — awaiting-resume への強制遷移時に pid が null になる

- **Priority**: should
- **Category**: unit
- **Source**: tasks 5.1, D6「他の状態に遷移した時点で pid は null」

```
GIVEN pipeline の safety net が発火した状態 (finalState.status === "running")
WHEN  state を awaiting-resume に修正して永続化する
THEN  永続化された state.pid === null
```

---

## TC-28: LocalRuntime シグナルハンドラ — awaiting-resume 遷移時に pid が null

- **Priority**: should
- **Category**: unit
- **Source**: tasks 5.2, D6

```
GIVEN LocalRuntime の SIGINT/SIGTERM ハンドラが発火
WHEN  state を awaiting-resume に更新する
THEN  更新された state.pid === null
```

---

## TC-29: transitionJob — pid patch が正しく適用される

- **Priority**: should
- **Category**: unit
- **Source**: tasks 6.4, lifecycle.test.ts への追記

```
GIVEN state.pid = 1234 を含む JobState
WHEN  transitionJob(state, "awaiting-resume", { patch: { pid: null } }) を呼ぶ
THEN  返り値の state.pid === null
      patch の他フィールドも正しくマージされている
```

---

## TC-30: 全テスト通過 — bun run typecheck && bun run test が green

- **Priority**: must
- **Category**: integration
- **Source**: tasks 6.5, AC「bun run typecheck && bun run test が green」

```
GIVEN 全ての実装変更が完了している
WHEN  bun run typecheck && bun run test を実行する
THEN  型エラー 0 件
      テスト全件 PASS
```
