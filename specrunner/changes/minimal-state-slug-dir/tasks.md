# Tasks: job state の event journal / projection / liveness 分離と slug ディレクトリ branch 同伴

段1（T-01〜T-05）は in-place・挙動不変。段1 の受け入れ基準が green になってから段2（T-06〜T-19）へ進む。

## T-01: event journal レコードスキーマと fold モジュール

- [x] `events.jsonl` のレコードを tagged union として定義する: step-attempt record（種別タグ + `step` 名 + `StepRun` 等価フィールド: `outcome`{`verdict`/`findingsPath`/`error`/`toolResult?`/`followUpAttempts?`}・`sessionId`・`startedAt`・`endedAt`、段1 は `modelUsage` を含む）と transition record（`HistoryEntry` 等価: `ts`/`step`/`status`/`message`）。
- [x] fold 関数を実装する: 行単位で読み、不完全な末尾行を 1 行無視し、それ以前を parse する。step-attempt record を出現順に `step` でグルーピングし index+1 を `attempt` に割り当て `steps: Record<string, StepRun[]>` を構成する。transition record を出現順に `history: HistoryEntry[]` とする。
- [x] append 関数を実装する: `fs.appendFile` で 1 レコード 1 行を追記する（全体 rewrite しない）。
- [x] fold が現行 `validateJobState` / `normalizeSteps` の正規化結果と等価な `steps` / `history` を返すことを保証する。

**Acceptance Criteria**:
- fold が末尾 partial 行を無視し、それ以前の step-attempt / transition を全件復元する。
- fold 結果の `steps[step]` の `attempt` が 1-origin 連番で、現行 `pushStepResult` と同値。
- append は `fs.appendFile` のみを使い、既存行を書き換えない。

## T-02: JobStateStore を分割レイアウトの読み書きへ改める（段1）

- [x] `create`: `.specrunner/jobs/<jobId>/state.json`（cursor/descriptor + 段1 では machine-local も）と `.specrunner/jobs/<jobId>/events.jsonl`（init transition record）を生成する。戻り値の `JobState` 形は維持。
- [x] `load`: `state.json` を読み、`events.jsonl` を fold して `steps` / `history` を合成し `NormalizedJobState` を返す。fold の実行行数と `state.json` の件数カウンタを比較し、カウンタが実行行数より小さい場合は fold 行数でカウンタをリセット（冪等リカバリ）してから以降の delta 計算を行う。
- [x] `appendStepRun(state, step, run)`: step-attempt record を 1 行 append し、cursor（`step`）を更新して返す。`attempt` は既存 fold 長 +1。
- [x] `appendHistory(state, entry)`: transition record を 1 行 append して返す。
- [x] `persist(state)` / `update(state, patch)`: `state` の `history` / `steps` の journal 未記録分（delta）のみ append し、続けて `state.json` を `atomicWriteJson` で overwrite する。delta は `state.json` に保持する件数カウンタで判定する。
- [x] `list`: `.specrunner/jobs/<jobId>/` サブディレクトリ層を走査し、各 dir を load して `JobState[]` を返す。
- [x] `resolveId`: 既存セマンティクス（full UUID はそのまま、prefix は list から解決、0/1/2+ 件の扱い）を維持する。
- [x] `delete`: `.specrunner/jobs/<jobId>/` ディレクトリを ENOENT 冪等に削除する。
- [x] `getJobsDir` / `getJobStatePath`（`src/util/xdg.ts`）をサブディレクトリ層に合わせて調整する（events.jsonl / state.json のパス helper を追加）。

**Acceptance Criteria**:
- `create` / `load` / `persist` / `update` / `appendStepRun` / `appendHistory` / `list` / `resolveId` / `delete` の外部契約（戻り値・解決セマンティクス）が不変。
- `transitionJob(...) + persist(...)` と `pushStepResult(...) + persist(...)` の呼び出し点を変更せずに journal 追記が成立する。
- `state.json` は cursor/descriptor のみ overwrite され、`events.jsonl` は append のみ。

## T-03: event 追記と cursor rewrite の分離 — crash-safety 回帰テスト（段1）

- [x] `events.jsonl` の append が `state.json` の overwrite と別ファイル操作であることをテストする。
- [x] `state.json` 書き込み中の crash を模した状況（cursor 不整合 / tmp 残留）で、`events.jsonl` の既存 event が全件残り、再 load で fold 復元できることをテストする。
- [x] `events.jsonl` 末尾を partial 行に破損させ、fold がそれ以前を全復元することをテストする。

**Acceptance Criteria**:
- cursor 書き込み中 crash 相当で既存 event が 1 件も失われない回帰テストが green。
- partial 末尾行を無視して全復元する回帰テストが green。

## T-04: fold 同値テスト（resume routing / transition 判定）

- [x] `resolveResumeStep`（`src/core/resume/resolve-step.ts`）Tier 2a 用に、fold 結果の loop step 最終 attempt `outcome.verdict` と fixer attempt 数が従来同値であることをテストする。
- [x] transition `when` 節（`src/core/pipeline/types.ts`）が読む `outcome.toolResult`（`CodeReviewReportResult.fixableCount`）が fold 結果で保持されることをテストする。
- [x] code-review approved + fixableCount>0 の routing と fixer-empty 検出の再開が従来どおり動くことをテストする。

**Acceptance Criteria**:
- 上記 routing / 判定の golden テストが fold 経由で従来同値を示す。

## T-05: history 永続 truncation の撤廃と表示 cap への移行

- [x] `appendHistoryEntry`（`src/state/schema.ts`）の `MAX_HISTORY_SIZE` 永続 truncation を撤廃し、journal を完全保持にする（D3 の delta カウンタ整合のため配列長 = journal 行数）。
- [x] `job show`（`src/cli/job-show.ts`）等の表示層で必要なら直近 N 件に cap し、観測可能出力の parity を保つ。

**Acceptance Criteria**:
- 永続層で history が truncate されず、`job show` の出力が段1 適用前と同等。

## T-06: change folder / local sidecar の path helper（段2）

- [x] `src/util/paths.ts` に `changes/<slug>/{events.jsonl,state.json}` の relative path helper を追加する（`usageJsonPath` は既存）。
- [x] `.specrunner/local/<slug>/` の path helper を追加する（liveness sidecar・managed marker・session log・per-attempt sessionId）。`src/util/gitignore.ts` の `.specrunner/*` ignore 規約で `.specrunner/local/` が gitignore 対象であることを確認する。
- [x] `JobStateStore` を「配置キー = slug、置き場 = `changes/<slug>/`（branch 上）」へ切り替えられるよう、slug ベースのコンストラクタ／解決経路を用意する。

**Acceptance Criteria**:
- `changes/<slug>/` と `.specrunner/local/<slug>/` の path が helper 経由で一意に解決される。
- `.specrunner/local/` が gitignore される。

## T-07: state を change folder へ移し step commit/push に同梱（段2）

- [x] `events.jsonl` / `state.json` / `usage.json` を `changes/<slug>/` に書く。
- [x] `commitAndPush`（`src/core/step/commit-push.ts`）の `git add -A` 対象にこれらが含まれ、step ごとの commit/push に同梱されることを確認する（既に `add -A` のため挙動上含まれるが、change folder 配下に確実に出力されること）。
- [x] local runtime（`src/core/runtime/local.ts`）の `setupWorkspace` / state 更新が worktree 内 `changes/<slug>/` を指すよう調整する。

**Acceptance Criteria**:
- 新規 job の journal / cursor / usage が `changes/<slug>/` に作られ、step ごとの commit に含まれる。
- 同一 branch を checkout し直した状態から resume が成立する（CI 再実行相当）。

## T-08: 導出可能フィールドと fileContent / modelUsage の除去（段2）

- [x] `JobState.request` から `slug` / `path` を除き、slug はディレクトリ名、request.md は `changes/<slug>/request.md` 規約から解決する（`getJobSlug` を location ベースへ寄せる）。（slug-based state.json に保存されない。load 時に convention から injection する）
- [x] `StepOutcome.fileContent` を除去し、結果ファイル（実ファイル）を真実とする消費経路へ寄せる（`pushStepResult` / `recordFailedStepResult` / `executor.finalizeStep` の `fileContent` 受け渡しを削除）。
- [x] `StepRun.modelUsage` を除去する（T-10 と同時に行う）。
- [x] `validateJobState` / `normalizeSteps`（`src/state/schema.ts`）の後方互換ハンドリングを新形式に合わせて調整する。

**Acceptance Criteria**:
- `changes/<slug>/state.json` / `events.jsonl` に `request.slug` / `request.path` / `fileContent` / `modelUsage` が含まれない。
- slug / request.md path が location・規約から解決される。

## T-09: machine-local を sidecar に分離し worktreePath を再導出（段2）

- [x] `worktreePath` / `pid` / `session` を branch 同伴 state から外し、`.specrunner/local/<slug>/` に置く。resume 時に再生成する。（slug-mode state.json から strip、liveness.json に書く）
- [x] worktreePath を読む 3 経路を sidecar 参照 → `buildWorktreePath(repoRoot, slug, jobId)`（`src/core/worktree/manager.ts`）規約からの再導出の 2 段に変える:
  - archive（`src/core/archive/orchestrator.ts` Phase 2）
  - cancel（`src/core/cancel/runner.ts` `cleanupJobResources`）
  - resume の request-path 解決（`src/core/resume/resolve-request-path.ts`）
- [x] `LocalRuntime`（`src/core/runtime/local.ts`）の `updateJobState(worktreePath)` 等を sidecar 書き込みへ移す。

**Acceptance Criteria**:
- `worktreePath` / `pid` / `session` が branch 同伴 state に含まれず resume が成立する。
- archive / cancel / resume の worktreePath 経路が sidecar / 規約再導出で動作する。
- sidecar ファイルは design.md D8 のレイアウト（`liveness.json`={pid,session,worktreePath,jobId} / `session-<attempt>.log` / `session-<attempt>.sessionId`）に準拠して読み書きされる。

## T-10: cost を step ごと usage.json へ append し finish 一括派生を廃止（段2）

- [x] step 完了ごとに `changes/<slug>/usage.json` へ usage entry を append し（`src/core/usage/store.ts` `appendInvocation`）step commit に同梱する。
- [x] `deriveAndWriteUsage`（`src/core/finish/derive-usage.ts`）を no-op にする。archive orchestrator（Phase 1）の呼び出しは保持（no-op で skipped）。
- [x] `usage show` / `usage summary`（`src/core/command/usage-{show,summary}.ts`）が `changes/<slug>/` と archive の `usage.json` を読む既存経路のままであることを確認する。

**Acceptance Criteria**:
- cost が step ごとに `usage.json` へ append され、finish 一括派生と `.specrunner/jobs/` 読みが除去されている。
- `usage show` / `summary` が従来どおり動く。

## T-11: 中断事由を interruption event 1 件で記録（段2）

interruption record のスキーマ（TypeScript インターフェース）:

```ts
interface InterruptionRecord {
  type: 'interruption';
  reason: 'timeout' | 'signal' | 'failure' | 'exhaustion';
  errorCode?: string;         // 失敗時のエラーコード（任意）
  exhaustionPhase?: string;   // exhaustion 時のフェーズ名（任意）
  ts: string;                 // ISO 8601 タイムスタンプ
}
```

fold での `resumePoint` 再生成ロジック:
- fold は末尾 interruption record を 1 件探す（複数ある場合は最後のものを使用）。
- 見つかった場合: `resumePoint.reason` = record の `reason`、`resumePoint.exhaustionPhase` = record の `exhaustionPhase`（該当する場合）を materialize する。
- 見つからない場合: `resumePoint` を state.json の cursor から読む（旧形式互換）。

- [x] timeout / signal の中断事由を `events.jsonl` の interruption record 1 件として記録する（`executor.ts` の timeout 経路、`local.ts` の signal handler、`exit-guard.ts`）。
- [x] `resumePoint` を fold から再生成できる rebuildable cache として `state.json` に置く（truth は journal）。上記の fold ロジックで `resumePoint` を materialize する。

**Acceptance Criteria**:
- 中断事由が journal の event 1 件に集約され、`resumePoint` が fold から再生成できる。
- interruption record は上記 `InterruptionRecord` インターフェースに準拠する。

## T-12: 列挙元を worktree 不変量 + dual-read へ組み替え（段2）

- [x] active 列挙を集約する:
  - local active: `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` を列挙（`JobStateStore.list()` に実装済み）。
  - current checkout: `specrunner/changes/*/state.json`（同上）。
  - legacy: `.specrunner/jobs/<jobId>/` split-layout および `.specrunner/jobs/<jobId>.json`（同上）。
  - dedup by jobId (newest updatedAt wins)（同上）。
- [x] `job ls` 既定を active のみ、`--all` で archive を含める（ps.ts 更新は T-12 後半）。
- [x] managed marker の write/clear 責務の実装（別サブタスク）。

**Acceptance Criteria**:
- `job ls` が local（worktree）+ managed（marker）の active を表示し、`--all` で archive を含む。legacy も併せて列挙される。
- jobId からの解決が slug-dir 横断で成立する。
- managed marker は design.md D7 のスキーマ（`marker.json`={slug,jobId,status,createdAt}）に準拠し、managed job 開始時に write、finish / cancel 完了時に clear される。

## T-13: worktree ⟺ 非終端の不変量と exit-guard（段2）

- [x] exit-guard（`src/core/lifecycle/exit-guard.ts`）を per-job モードへ拡張する。`createExitGuardHandler(repoRoot, jobId)` のシグネチャで jobId を受け取り、自 job のみを遷移させる。jobId なしは従来のグローバルスキャン。
- [x] ハード crash で status が stale な場合に備え、sidecar の pid 突き合わせで liveness を判定する経路を用意する（`src/core/resume/safety.ts` `isStaleRunning` を sidecarPath ベースへ）。
- [x] worktree 存在 ⟺ 非終端の不変量を列挙・cleanup の前提として揃える。

**Acceptance Criteria**:
- exit-guard が自 worktree の branch state に `awaiting-resume` を記録し、worktree 存在 + branch status から resume が成立する。
- guard が jobId を受け取り（`createExitGuardHandler(repoRoot, jobId)`）、自 job のみを遷移させる（他 job に副作用を与えない）。
- stale running を pid 突き合わせで判定できる。

## T-14: 再 run の非破壊性と複数 attempt の個別片付け（段2）

- [x] 再 run が新 jobId / 新 branch / 新 worktree を生やし、旧 attempt の push 済み branch に触れない（force-push / 上書きしない）ことを保証する。
- [x] 同一 slug の複数 attempt が併存できるようにし、`job ls`（`formatJobRow`）に jobId で区別表示する。
- [x] `job cancel <jobId>`（`src/cli/cancel.ts` / `src/core/cancel/runner.ts`）が対象 attempt の worktree / branch のみを片付けるようにする（再 run 時の自動 supersede はしない）。

**Acceptance Criteria**:
- 再 run が旧 branch を破壊しない。
- 複数 attempt が `job ls` に jobId で区別表示され、`job cancel <jobId>` で個別に片付けられる。

## T-15: 旧 full state からの非破壊移行（段2）

- [x] `.specrunner/jobs/<jobId>.json`（旧 full state）を読んで新形式（journal + cursor）へ移行し resume できる経路を実装する。
- [x] 移行後も旧 `.specrunner/jobs/<jobId>.json` を削除せず残す（非破壊）。
- [x] 新規書き込みは新形式のみとする。

**Acceptance Criteria**:
- 旧 full state から移行して resume でき、移行後も旧ファイルが残る。

## T-16: pullRequest の materialize と読み手（段2）

- [x] pr-create event から `pullRequest`（url / number / createdAt）を `state.json` に materialize する（`executor.finalizeStep` の `parsed.pullRequest` 反映を cursor 書き込みへ）。
- [x] merge / archive / finish / `job ls` の読み手（`src/core/finish/resolve-target.ts` `buildResolvedTarget`、`src/cli/ps.ts` `checkPrMerged`、archive orchestrator）が `state.json` の `pullRequest` を読んで動作することを確認する。

**Acceptance Criteria**:
- `pullRequest` が `state.json` に保持され、merge / archive / finish / `job ls` の読み手が動作する。

## T-17: archive で痩せた state を strip せず取り込む（段2）

- [x] archive（`src/core/archive/orchestrator.ts` / `src/core/finish/archive-change-folder.ts`）が `changes/<slug>/` を main へ移す際、`state.json` / `events.jsonl` / `usage.json` を含める。
- [x] `job ls --all` が archive の state から cost / 来歴を表示できることを確認する。

**Acceptance Criteria**:
- archive 後、main の `changes/archive/<dated-slug>/` に `state.json` / `events.jsonl` / `usage.json` が含まれる。

## T-18: doctor storage checks / path helper の調整（段2）

- [x] doctor storage checks（`src/core/doctor/checks/storage/{jobs-writable,old-state-files}.ts`）を新レイアウト（`changes/<slug>/` + `.specrunner/local/<slug>/` + legacy `.specrunner/jobs/`）に合わせて更新する。
- [x] `src/util/xdg.ts` の path helper（`getJobsDir` / `getJobStatePath` / `getAgentLogDir` / `getVerboseLogPath`）と doctor の参照パスを整合させる。
- [x] `src/core/doctor/doctor.ts` の storage 関連メッセージを新レイアウトに合わせる。

**Acceptance Criteria**:
- doctor storage checks が新レイアウトを正しく診断する。

## T-19: 検証

- [x] 関連テストを新形式に更新する（`tests/store/job-state-store.test.ts`、`tests/unit/cli/ps-filter.test.ts`、`tests/unit/core/resume/*`、`tests/finish-*`、`tests/unit/core/runtime/*`、`tests/core/worktree/*`、`tests/unit/core/cancel/*`、`tests/unit/core/archive/*` 等）。
- [x] pipeline 実行・画面出力・PR 生成が不変であることを統合テストで確認する。
- [x] `bun run typecheck && bun run test` を green にする。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- pipeline 実行・画面出力・PR 生成が不変。
