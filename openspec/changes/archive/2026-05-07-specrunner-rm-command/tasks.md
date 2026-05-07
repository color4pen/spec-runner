## 1. State store 拡張

- [x] 1.1 `src/state/store.ts` に `deleteJobState(jobId: string): Promise<void>` を追加する。`fs.unlink(getJobStatePath(jobId))` を実行し、ENOENT は無視（冪等）、それ以外の error は throw する

## 2. SDK wrapper 追加

- [x] 2.1 `src/adapter/managed-agent/sdk/sessions.ts` に `deleteSession(client: Anthropic, sessionId: string): Promise<void>` を追加する。`client.beta.sessions.delete(sessionId)` を呼び出す

## 3. rm runner 実装

- [x] 3.1 `src/core/rm/runner.ts` を新規作成する。以下の関数を export する:
  - `removeSingleJob(opts: { jobId: string; force: boolean; config: SpecRunnerConfig; anthropicClient?: Anthropic }): Promise<RmResult>` — 単一 job の削除
  - `removeAllTerminated(opts: { yes: boolean; config: SpecRunnerConfig; anthropicClient?: Anthropic; stdin?: NodeJS.ReadableStream }): Promise<RmResult>` — 一括削除
- [x] 3.2 `removeSingleJob` の status gate を実装する: `failed` / `terminated` / `archived` は許可、`running` は `"Job is still running. Use --force to override."` で拒否、`awaiting-merge` は `"Job has a pending PR. Use 'specrunner finish' or --force."` で拒否。`--force` で全 status 許可
- [x] 3.3 managed mode の session cleanup を実装する: `config.runtime !== "local"` かつ `state.session?.id` が存在する場合に `deleteSession(anthropicClient, state.session.id)` を try-catch で呼び出す。失敗時は stderr に warning を出力して続行
- [x] 3.4 `removeAllTerminated` を実装する: `listJobStates()` で全 job を取得し、status が `failed` / `terminated` / `archived` のものをフィルタ。対象件数を表示し、`--yes` なしなら stdin から `y/N` 確認を読む。非 TTY で `--yes` なしの場合は拒否。各 job で session cleanup + `deleteJobState()` を実行。成功件数を stdout に表示
- [x] 3.5 `RmResult` 型を定義する: `{ exitCode: 0 | 1 | 2; removed: number; message?: string }`

## 4. CLI entry point

- [x] 4.1 `src/cli/rm.ts` を新規作成する。`runRm(opts: RunRmOptions): Promise<number>` を export する。引数から `jobId` / `--force` / `--all-terminated` / `--yes` を受け取り、runner を呼び出して exit code を返す
- [x] 4.2 managed mode の場合に Anthropic client を生成して runner に渡す（`run.ts` の既存パターンに従う）

## 5. CLI 統合

- [x] 5.1 `bin/specrunner.ts` の USAGE 文字列に `rm` コマンドの説明を追加する: `rm <jobId>           Remove a job (state file + cloud session)`
- [x] 5.2 `bin/specrunner.ts` の USAGE の Options セクションに Rm Options を追加する: `--force`, `--all-terminated`, `--yes`
- [x] 5.3 `bin/specrunner.ts` の switch-case に `case "rm"` を追加する。`import { runRm } from "../src/cli/rm.js"` を追加。flag parsing は `finish` と同じパターン（`--force`, `--all-terminated`, `--yes`, 位置引数 jobId）

## 6. テスト

- [x] 6.1 `tests/rm.test.ts` を新規作成する。以下をテストする:
  - `deleteJobState`: 正常削除 / ENOENT 冪等 / 他エラー throw
  - `removeSingleJob`: failed job 削除成功 / running 拒否 / running + force 許可 / awaiting-merge 拒否 / awaiting-merge + force 許可
  - `removeSingleJob` managed mode: session cleanup 成功 / session cleanup 失敗で warning + state 削除続行
  - `removeAllTerminated`: 対象 job フィルタ / yes skip 確認 / 0 件で early return
- [x] 6.2 `bun run typecheck` が pass することを確認する
- [x] 6.3 `bun test` が全テスト green であることを確認する
