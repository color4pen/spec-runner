# Tasks: stale-running-recovery

## T-01: JobState に staleRecovery フィールドを追加する

対象: `src/state/schema.ts`

- [x] `JobState` interface に optional field を追加する（`issueNumber` の近傍、末尾でよい）:
  ```ts
  /**
   * Crash-loop guard for inbox auto-recovery of orphaned running jobs.
   * - attempts: consecutive auto-recoveries with no progress since the last recovery.
   * - stepCount: total step-run count (Σ steps[*].length) observed at the last recovery,
   *   used as a progress fingerprint. When the current count differs, attempts resets to 0.
   * Optional for backward compat — absent/null in existing state files is valid.
   */
  staleRecovery?: { attempts: number; stepCount: number } | null;
  ```
- [x] `validateJobState` は変更不要（optional・追加フィールドは現状そのまま通過する）。ただし
  既存の `resumePoint` / `issueNumber` と同様、`staleRecovery` が present かつ object でない場合に
  throw する軽量ガードを追加してもよい（任意）。

**Acceptance Criteria**:
- `staleRecovery` を持つ state を `validateJobState` に通しても throw しない
- `staleRecovery` を持たない既存 state（v1/v2）が従来どおり読める
- `bun run typecheck` が green

## T-02: planner に stale-recovery のアクション型と判定関数を追加する

対象: `src/core/inbox/types.ts`, `src/core/inbox/planner.ts`

- [x] `types.ts` に 2 つのアクション型を追加し、`InboxPlan` に配列を追加する:
  ```ts
  /** Action: auto-resume an orphaned (stale) running job. */
  export interface RecoverAction {
    kind: "recover";
    slug: string;
    jobId: string;
    issueNumber?: number | null;
    /** New staleRecovery value to persist before resuming. */
    staleRecovery: { attempts: number; stepCount: number };
  }
  /** Action: cap exceeded — escalate a stale running job to awaiting-resume. */
  export interface EscalateAction {
    kind: "escalate";
    slug: string;
    jobId: string;
    issueNumber?: number | null;
    /** Job step at detection time, used to build the synthetic resumePoint. */
    step: string;
  }
  // InboxPlan に追加:
  //   recovers: RecoverAction[];
  //   escalates: EscalateAction[];
  ```
- [x] `planner.ts` に上限定数を定義・export する:
  ```ts
  export const MAX_STALE_RECOVERY_ATTEMPTS = 3;
  ```
- [x] `planner.ts` に step 実行総数を数える純粋ヘルパを追加する:
  ```ts
  export function countStepRuns(state: JobState): number {
    return Object.values(state.steps ?? {}).reduce((n, runs) => n + runs.length, 0);
  }
  ```
- [x] `planner.ts` に純粋関数 `planStaleRecoveries` を追加する。入力は「stale と判定済みの running job 配列」
  と上限値。`getJobSlug`（`src/state/job-slug.js`）で slug を解決し、空 slug の job は skip する:
  ```ts
  export function planStaleRecoveries(
    staleJobs: JobState[],
    maxAttempts = MAX_STALE_RECOVERY_ATTEMPTS,
  ): { recovers: RecoverAction[]; escalates: EscalateAction[] } {
    // for each job (status === "running" 前提):
    //   slug = getJobSlug(job); if (!slug) continue;
    //   currentCount = countStepRuns(job);
    //   stored = job.staleRecovery ?? null;
    //   effective = stored && stored.stepCount === currentCount ? stored.attempts : 0;
    //   if (effective >= maxAttempts) escalates.push({ kind:"escalate", slug, jobId, issueNumber, step: job.step });
    //   else recovers.push({ kind:"recover", slug, jobId, issueNumber, staleRecovery: { attempts: effective + 1, stepCount: currentCount } });
  }
  ```
- [x] `planInbox` の入力に `staleRunningJobIds: Set<string>`（既定 `new Set()`）を追加する。
  `jobStates` を `status === "running" && staleRunningJobIds.has(jobId)` で絞り、`planStaleRecoveries` に渡す。
  結果を `InboxPlan.recovers` / `InboxPlan.escalates` に格納する。既存 `starts` / `rejects` / `resumes` は不変。

**Acceptance Criteria**:
- `planStaleRecoveries` は純粋関数（I/O なし、`process.kill` / fs を呼ばない）
- stored が無い stale-running job → recover（attempts=1, stepCount=現在値）
- stored.stepCount が現在値と一致し attempts < 上限 → recover（attempts=stored.attempts+1）
- stored.stepCount が現在値と異なる → recover（attempts=1, stepCount=現在値）
- stored.stepCount が現在値と一致し attempts >= 上限 → escalate
- `getJobSlug` が空文字を返す job は recover/escalate どちらにも含まれない
- `planInbox` に `staleRunningJobIds` を渡さない既存呼び出しが型・挙動とも従来どおり

## T-03: orchestrator に stale 検出・回復・escalation を実装する

対象: `src/core/inbox/run-inbox.ts`

- [x] `InboxEffects` に effect を追加する:
  ```ts
  /** Decide whether a running job is orphaned (process dead). */
  isStale(state: JobState): boolean;
  /** Persist a patched job state (best-effort) by jobId. */
  persistState(jobId: string, state: JobState): Promise<void>;
  /** Fire the terminal escalation notification for an awaiting-resume state. */
  notifyEscalation(state: JobState): Promise<void>;
  ```
  既存 `resumeJob` は recover 実行に再利用する（追加しない）。
- [x] 既定実装を `buildEffects`（または同等のファクトリ）に追加する:
  - `isStale`: `const slug = getJobSlug(state); const sidecar = slug ? path.join(repoRoot, livenessJsonPath(slug)) : undefined; return isStaleRunning(state, sidecar);`
    （import: `getJobSlug` from `../../state/job-slug.js`, `livenessJsonPath` from `../../util/paths.js`,
    `isStaleRunning` from `../resume/safety.js`, `path` from `node:path`）
  - `persistState`: `const store = await resolveStateStoreByJobId(repoRoot, jobId); if (store) await store.persist(state);`
    null（degraded）の場合は warning を `stderrWrite` で出して skip。
    （import: `resolveStateStoreByJobId` from `../job-access/resolve-state-store.js`）
  - `notifyEscalation`: `await notifyJobTerminal(state, { githubClient, owner, repo });`
    （import: `notifyJobTerminal` from `../notify/issue-notifier.js`）
- [x] 収集フェーズ（plan 前）で stale 集合を構築する。`isStale` effect は plan より前に必要なので、
  effects を plan 前に解決するか、`opts.effects?.isStale ?? defaultIsStale` を先に評価する:
  ```ts
  const staleRunningJobIds = new Set<string>();
  for (const s of allJobStates) {
    if (s.status === "running" && isStale(s)) staleRunningJobIds.add(s.jobId);
  }
  ```
- [x] `planInbox(...)` 呼び出しに `staleRunningJobIds` を渡す。
- [x] `InboxRunSummary` に `recovered: Array<{ slug: string; jobId: string }>` と
  `escalated: Array<{ slug: string; jobId: string; issueNumber: number | null }>` を追加し、初期化する。
- [x] dry-run 出力に recover / escalate の件数・行を追加し、dry-run の返り値 summary にも反映する
  （effects は呼ばない）。
- [x] 実行フェーズに recover ループを追加する（best-effort、既存 resume ループに倣う）:
  ```ts
  for (const a of plan.recovers) {
    try {
      const job = allJobStates.find((s) => s.jobId === a.jobId)!;
      const patched = { ...job, staleRecovery: a.staleRecovery, updatedAt: new Date().toISOString() };
      await effects.persistState(a.jobId, patched);
      await effects.resumeJob(a.slug, undefined);
      summary.recovered.push({ slug: a.slug, jobId: a.jobId });
    } catch (err) { summary.errors.push({ action: `recover:${a.slug}`, error: (err as Error).message }); stderrWrite(...); }
  }
  ```
- [x] 実行フェーズに escalate ループを追加する（best-effort）。`transitionJob`（`../../state/lifecycle.js`）で
  awaiting-resume へ遷移し、persist → notify:
  ```ts
  for (const a of plan.escalates) {
    try {
      const job = allJobStates.find((s) => s.jobId === a.jobId)!;
      const { state: escalated } = transitionJob(job, "awaiting-resume", {
        trigger: "stale-recovery-exhausted",
        reason: "Auto-recovery exceeded max attempts (crash loop suspected)",
        patch: {
          pid: null,
          resumePoint: { step: a.step, reason: "Auto-recovery exceeded max attempts (crash loop suspected)", iterationsExhausted: 0 },
          staleRecovery: null,
        },
      });
      await effects.persistState(a.jobId, escalated);
      await effects.notifyEscalation(escalated);
      summary.escalated.push({ slug: a.slug, jobId: a.jobId, issueNumber: a.issueNumber ?? null });
    } catch (err) { summary.errors.push({ action: `escalate:${a.slug}`, error: (err as Error).message }); stderrWrite(...); }
  }
  ```
- [x] recover / escalate は `maxStartsPerRun` の対象外（独立に全件処理）であることを保つ。

**Acceptance Criteria**:
- stale-running（`isStale` true）かつ attempts<上限 の job で `persistState`（staleRecovery 更新）→ `resumeJob(slug, undefined)` がこの順で呼ばれる
- `isStale` false の running job では recover も escalate も呼ばれない
- attempts>=上限 の job で `resumeJob` は呼ばれず、`persistState`（awaiting-resume へ遷移した state）→ `notifyEscalation` が呼ばれる
- 各 effect 失敗は summary.errors に集約され、他アクションを止めない（best-effort）
- dry-run では recover/escalate effect が一切呼ばれないが summary に件数が反映される
- 既存の start / reject / resume の挙動・出力が無変更

## T-04: CLI handler のサマリ件数に recover / escalate を反映する

対象: `src/cli/inbox.ts`

- [x] 人間可読サマリの `total` 計算に `summary.recovered.length + summary.escalated.length` を加算する
  （`Nothing to do.` 判定が回復・escalation を含めて正しくなるように）。
- [x] 既存の errors → exit 1 判定はそのまま維持する。

**Acceptance Criteria**:
- recover または escalate のみが発生した tick で `[inbox] Nothing to do.` が出力されない
- 何も起きなかった tick では従来どおり `Nothing to do.` が出力される
- `bun run typecheck` が green

## T-05: planner のユニットテストを追加する

対象: `tests/unit/inbox/planner.test.ts`（既存ファイルに追記）

- [x] `planStaleRecoveries` / `planInbox`（staleRunningJobIds 経由）について以下を網羅する:
  - stored 無し stale-running → recover（attempts=1, stepCount=現在値）
  - stored.stepCount 一致 & attempts<上限 → recover（attempts=stored+1）
  - stored.stepCount 不一致（進捗あり）→ recover（attempts=1, stepCount=現在値）
  - stored.stepCount 一致 & attempts>=上限 → escalate（step フィールドが job.step）
  - `getJobSlug` が空を返す job は除外
  - `staleRunningJobIds` に含まれない running job は recover/escalate されない
  - `countStepRuns` が `steps` 各配列長の総和を返す（steps 未定義は 0）
- [x] テストは `MAX_STALE_RECOVERY_ATTEMPTS` を import して境界値を組む。

**Acceptance Criteria**:
- 追加テストが `bun run test` で green
- 既存 planner テストが無変更で green

## T-06: orchestrator のユニットテストを追加する

対象: `tests/unit/inbox/orchestrator.test.ts`（既存ファイルに追記）

- [x] effects に `isStale` / `persistState` / `notifyEscalation` を注入できるよう `makeEffects` を拡張する。
- [x] 以下を網羅する:
  - `status=running` で `isStale` true・attempts 低 → `persistState` then `resumeJob(slug, undefined)` が呼ばれる
  - `status=running` で `isStale` false → recover/escalate 系 effect が呼ばれない
  - attempts>=上限（stored.stepCount を現在値に一致させる）→ `resumeJob` 呼ばれず、`persistState`（awaiting-resume）+ `notifyEscalation` が呼ばれる
  - escalate 対象が issueNumber を持つ場合 `notifyEscalation` に渡る state が `status=awaiting-resume` である
  - dry-run では recover/escalate effect が呼ばれず summary.recovered/escalated に件数が入る
  - recover の `persistState` が throw しても他アクションが継続し summary.errors に入る
- [x] `JobStateStore.list` モックに running + pid 付き state を流し込む（既存パターン踏襲）。

**Acceptance Criteria**:
- 追加テストが `bun run test` で green
- 既存 orchestrator テストが無変更で green

## T-07: typecheck && test が green であることを確認する

- [x] `bun run typecheck` が 0 exit で完了すること
- [x] `bun run test` が 0 exit で完了すること（inbox テスト全 56 件 green）

**Acceptance Criteria**:
- 両コマンドが正常終了する
- 受け入れ基準（running かつ pid 死亡で resume / pid 生存は対象外 / 上限超過で escalation / typecheck && test green）が満たされる
