## 1. ドメインロジック（src/core/resume/）

- [x] 1.1 `src/core/resume/resolve-step.ts` を作成。`--from` 値（`critic` / `fixer` / `creator` / undefined）と `ResumePoint | null` から具体的な開始 step を返す `resolveResumeStep(from: string | undefined, resumePoint: ResumePoint | null): StepName` を実装する。phase 判定は Design D2 の mapping table に従う。`resumePoint` が null の場合は `state.step`（呼び出し元が渡す）から phase を推論し、判定不能な場合は code phase をデフォルトとする（この関数が null + from 未指定で呼ばれることはない — task 2.5 のガードが先に制御する）
- [x] 1.2 `src/core/resume/safety.ts` を作成。連続 escalation 検出 `checkConsecutiveEscalations(state, stepName, threshold=3): boolean` を実装。`state.steps[stepName]` の末尾 N 件を走査し全 verdict が `escalation` or `error` なら `true`
- [x] 1.3 同ファイルに stale state 検出 `checkStaleState(state, thresholdMs=86400000): boolean` を実装。`Date.now() - new Date(state.updatedAt).getTime() > thresholdMs` で判定
- [x] 1.4 `src/core/resume/resolve-job.ts` を作成。`resolveJobStateBySlug(slug: string): Promise<JobState | null>` を実装する。`listJobStates()` + `getJobSlug()` でスラグを照合し、複数マッチ時は `updatedAt` が最新の `JobState` を返す。見つからない場合は `null` を返す。`resolveBySlug()`（finish 用）は PR 情報が必須のため resume では使用不可

## 2. CLI コマンド（src/cli/resume.ts）

- [x] 2.1 `src/cli/resume.ts` を作成。`runResumeCore(slug, options): Promise<number>` を実装。exit code を返す（0=成功, 1=失敗, 2=引数エラー）
- [x] 2.2 slug → jobState 解決: `resolveJobStateBySlug(slug)` を使用して `JobState` を直接取得する。`resolveBySlug()`（finish 用）は使用しない（`awaiting-resume` job は pr-create 前に停止しており PR 情報がないため `buildResolvedTarget` で必ず失敗する）。見つからない場合は exit code 2
- [x] 2.3 status gate: `state.status !== "awaiting-resume"` の場合はエラー出力して exit code 1。`--force` 時は `running` 以外を許容
- [x] 2.4 安全チェック: `checkConsecutiveEscalations()` が true なら拒否（`--force` で override）。`checkStaleState()` が true なら warning 出力（block しない）
- [x] 2.5 resumePoint guard + resume step 解決: `state.resumePoint` が null かつ `options.from` が未指定の場合はエラーメッセージ（"再開位置が不明です。`--from` で再開 step を指定してください"）を出力して exit code 1。`state.resumePoint` が null かつ `options.from` が指定済みの場合は `state.step`（最後に記録された step）から spec/code phase を推論し fallback する（判定不能な場合は code phase をデフォルト）。その後 `resolveResumeStep(options.from, state.resumePoint)` で開始 step を決定する
- [x] 2.6 state 準備: `status` を `"running"` に、`error` を `null` に、`resumePoint` を `null` にリセット。`state.steps` と `history` は保持
- [x] 2.7 worktree 管理: `state.worktreePath` がディスク上に存在すれば再利用。なければ `WorktreeManager.create()` で新規作成し state を更新
- [x] 2.8 deps 構築: `loadConfig()` で設定を取得 → runtime 判定（managed / local）→ runtime に応じた `client`（managed のみ）と `runner` を生成 → `PipelineDeps` を組み立てる。`repo` は `state.repository` から取得（git remote 再検出は不要）。`request` は `state.request` から取得。`preflight`（request.md の存在チェック等）は resume では不要のため skip する
- [x] 2.9 pipeline 実行: `runPipeline(updatedState, deps, events)` ではなく、`Pipeline` を直接構築して `pipeline.run(startStep, updatedState, deps)` を呼ぶ。`runPipeline()` は常に `"propose"` から開始するため使えない
- [x] 2.10 post-pipeline 処理: `handlePostPipelineState()` を `run.ts` から export して再利用。signal handler と worktree cleanup も `run.ts` と同じパターンで設定
- [x] 2.11 `runResume(slug, options)` entry point を追加（`runResumeCore` を呼び `process.exit`）

## 3. CLI 統合（bin/specrunner.ts）

- [x] 3.1 `bin/specrunner.ts` の switch-case に `resume` を追加。引数: `specrunner resume <slug> [--from=critic|fixer|creator] [--force] [--verbose]`
- [x] 3.2 `--from` フラグのパース: `--from=<value>` 形式。値は `critic`, `fixer`, `creator` のいずれか。不正値は exit code 2
- [x] 3.3 `USAGE` 文字列に resume コマンドの説明を追加
- [x] 3.4 `import { runResume } from "../src/cli/resume.js"` を追加

## 4. pipeline 構築の共有化

- [x] 4.1 `runPipeline()` 内の Pipeline 構築ロジック（steps Map, transitions, maxIterations, executor, events）を `createStandardPipeline(deps, events): Pipeline` として export する（`src/core/pipeline/run.ts`）。`runPipeline()` 自身もこれを使うよう refactor
- [x] 4.2 `resume.ts` は `createStandardPipeline()` で Pipeline を構築し、任意の startStep で `pipeline.run()` を呼ぶ

## 5. 共有ユーティリティの export

- [x] 5.1 `handlePostPipelineState()` を `src/cli/run.ts` から export する（既に function として定義済み。export keyword を追加するだけ）
- [x] 5.2 `resolveJobStateBySlug()` は `src/core/resume/resolve-job.ts` に定義する（task 1.4 参照）。`resolveBySlug()`（`src/core/finish/resolve-target.ts`）は PR 情報が必須のため resume では使用しない

## 6. テスト

- [x] 6.1 `resolve-step.test.ts`: phase 判定と `--from` mapping の全パターン（spec phase × 3 roles + code phase × 3 roles + default）
- [x] 6.2 `safety.test.ts`: 連続 escalation 検出（境界値: 0, 1, 2, 3 件）、stale state 検出（閾値前後）
- [x] 6.3 `resume.test.ts`: status gate（`awaiting-resume` 以外の拒否、`--force` override）、worktree 再利用 / 新規作成、pipeline 呼び出しの startStep 検証
- [x] 6.4 `bin/specrunner.ts` の resume case: 引数パースの正常系・異常系
- [x] 6.5 `resolve-job.test.ts`: `resolveJobStateBySlug()` の正常系（一致あり）、複数マッチ時（最新 updatedAt を選択）、一致なし（null 返却）

## 7. 検証

- [x] 7.1 `bun run typecheck` が green
- [x] 7.2 `bun run test` が green（既存テスト含む）
