# Tasks: run / resume の終端を機械可読な --json 契約で出す

## T-01: 終端契約モジュールと写像純粋関数を新設する

- [x] `src/core/command/run-result.ts` を新規作成する。
  - [x] 種別 union `RunResultKind = "pr-created" | "awaiting-human" | "failed"` を定義する。
  - [x] 契約 interface `RunResultContract` を定義する（D3 のスキーマ）:
        `schemaVersion: 1`・`result: RunResultKind`・`slug: string`・`jobId: string`・`step: string`・
        `prUrl: string | null`・`reason: { code: string | null; message: string } | null`。
  - [x] 純粋関数 `buildRunResult(state: JobState, slug: string): RunResultContract` を実装する（D5 の写像表）。
    - [x] `state.status === "awaiting-archive"` → `result: "pr-created"`、`step: state.step`、`reason: null`、
          `prUrl: state.pullRequest?.url ?? null`。
    - [x] `state.status === "awaiting-resume"` → `result: "awaiting-human"`、
          `step: state.resumePoint?.step ?? state.step`、
          `reason: { code: state.error?.code ?? null, message: state.resumePoint?.reason ?? state.error?.message ?? <既定文言> }`、
          `prUrl: state.pullRequest?.url ?? null`。
    - [x] それ以外（`failed` 等）→ `result: "failed"`、`step: state.step`、
          `reason: { code: state.error?.code ?? null, message: state.error?.message ?? <既定文言> }`、
          `prUrl: state.pullRequest?.url ?? null`。
    - [x] `jobId: state.jobId`、`slug` は引数の slug、`schemaVersion: 1`。
  - [x] JSON 文字列化ヘルパー `formatRunResultJson(contract: RunResultContract): string` を実装する
        （`JSON.stringify(contract, null, 2) + "\n"`。`doctor` / `request review` の出力形式に合わせる）。
- [x] 写像ロジックはこのモジュールにのみ置く（他ファイルに status → 種別 の分岐を書かない）。

**Acceptance Criteria**:
- `buildRunResult` が `awaiting-archive` / `awaiting-resume` / `failed` の各 state を D5 のとおり写像する。
- `prUrl` は PR 不在時 `null`、`reason` は pr-created で `null`。
- 純粋関数で副作用が無い（I/O・logger 呼び出しを含まない）。
- `bun run typecheck` が green。

## T-02: --json フラグを registry と各コマンド経路に配線する

- [x] `src/cli/command-registry.ts` の `run`（alias）エントリの `flags` に `json: { type: "boolean" }` を追加し、
      handler で `runRun(requestMdPath, { logLevel, json: !!parsed.flags["json"] })` を渡す。
- [x] `src/cli/command-registry.ts` の `job.subcommands.start`（canonical）エントリの `flags` に
      `json: { type: "boolean" }` を追加し、handler で `runRun(... , { logLevel, json })` を渡す。
- [x] `src/cli/command-registry.ts` の `job.subcommands.resume` エントリの `flags` に
      `json: { type: "boolean" }` を追加し、handler で `runResume(... , { ..., json })` を渡す。
- [x] `src/cli/run.ts`: `runRunCore` / `runRun` の options 型に `json?: boolean` を追加し、
      `PipelineRunCommand` に渡す options へ伝播する。
- [x] `src/cli/resume.ts`: `ResumeOptions` に `json?: boolean` を追加し、`ResumeCommand` へ伝播する。
- [x] `src/core/command/pipeline-run.ts`: `PipelineRunOptions` に `json?: boolean` を追加し、
      `prepare()` の返す `PrepareResult` に `json: this.options.json ?? false` を設定する。
- [x] `src/core/command/resume.ts`: `ResumeOptions` に `json?: boolean` を追加し、
      `prepare()` の返す `PrepareResult` に `json: this.options.json ?? false` を設定する。
- [x] `src/core/command/runner.ts`: `PrepareResult` interface に `json?: boolean` を追加する。

**Acceptance Criteria**:
- `run --json` / `job start --json` / `resume --json` が `Unknown flag` で落ちない（両 registry エントリに定義済み）。
- `json` フラグの値が CLI → command options → `PrepareResult.json` → `execute()` まで届く。
- `--json` 未指定時は `json` が `false` として扱われる。
- `bun run typecheck` が green。

## T-03: execute の各終端で --json 時に契約 JSON を stdout に出力する

- [x] `src/core/command/runner.ts` の `handleResult` シグネチャに `json: boolean` を追加し、
      `execute()` から `prepared.json ?? false` を渡す。
  - [x] `handleResult` 内で `json` が true のとき、`buildRunResult(finalState, slug)` →
        `stdoutWrite(formatRunResultJson(contract))` で stdout に 1 回出力する。
  - [x] 既存の人間向け出力（`logInfo` / `logError` / `stderrWrite`）はすべて現状のまま残す。
  - [x] `SPEC_REVIEW_RESULT_NOT_FOUND` 早期 return 経路（`runner.ts:245`）でも `json` 時に `failed` JSON を出す。
- [x] `execute()` の setupWorkspace 失敗終端（`runner.ts:120`）で、`prepared.json` 時に `failed` 契約を出力する
      （`store.fail` 後の disk/in-memory state、または合成 failed 入力を `buildRunResult` に渡す）。
- [x] `execute()` の buildDeps/registerCleanup 失敗終端（`runner.ts:171`）で、`prepared.json` 時に `failed` 契約を出力する。
- [x] `execute()` の pipeline throw（crash）終端（`runner.ts:189`）で、`prepared.json` 時に `failed` 契約を出力する
      （in-memory `jobState.step` と thrown error の code/message から D5 の `failed` 写像で組み立てる）。
- [x] `json` が false のときは、いずれの終端でも stdout に一切書かない。
- [x] exit code（0 / 1）の決定ロジックは現状のまま変えない。

**Acceptance Criteria**:
- `--json` 時、4 終端（setupWorkspace 失敗 / init 失敗 / crash / handleResult）で stdout に単一の有効な JSON が出る。
- `--json` 未指定時、4 終端いずれでも stdout に終端 JSON が出ない。
- 人間向け stderr 出力が baseline から不変。
- exit code が baseline（pr-created=0 / awaiting-human=1 / failed=1）から不変。
- `bun run typecheck` が green。

## T-04: テストを追加・更新する

- [x] `tests/unit/core/command/run-result.test.ts` を新規作成し、`buildRunResult` の写像を決定的に検証する。
  - [x] `awaiting-archive`（PR あり / なし）→ `pr-created`、`prUrl` 正、`reason` null。
  - [x] `awaiting-resume`（escalation：`resumePoint.reason` あり）→ `awaiting-human`、`step`=resumePoint.step、`reason` 正。
  - [x] `awaiting-resume`（loop 枯渇：`resumePoint.iterationsExhausted` 上限）→ `awaiting-human`。
  - [x] `failed`（`error.code` / `error.message` あり）→ `failed`、`reason.code`/`reason.message` 正、`prUrl` null。
  - [x] すべての種別で `schemaVersion` / `slug` / `jobId` / `step` が埋まることを assert。
- [x] `tests/unit/core/command/runner.test.ts` に `--json` ケースを追加する（既存 TC-CR-001〜011 は維持）。
  - [x] `json: true` + `awaiting-archive` → stdout が単一の有効 JSON で `result: "pr-created"`、exit 0。
  - [x] `json: true` + `awaiting-resume` → stdout の `result: "awaiting-human"`、exit 1。
  - [x] `json: true` + pipeline throw（crash）→ stdout の `result: "failed"`、exit 1。
  - [x] `json: false` → stdout に終端 JSON が出ない（既存 human-output assertion は不変）。
- [x] CLI レベルで両 registry エントリの flag 受理を検証する（`run --json` / `job start --json` / `resume --json` が
      `Unknown flag` にならない）。既存の CLI テストファイル（例: `tests/unit/cli/job-start-file-path.test.ts` /
      `tests/unit/cli/resume.test.ts`）の方式に合わせる。
- [x] すべて決定的・LLM 不要。

**Acceptance Criteria**:
- 4 種別 × prUrl/reason の有無に対する `buildRunResult` の出力が決定的に検証されている。
- `--json` on/off の stdout 差分（JSON 出力の有無）と exit code 不変が検証されている。
- 両 registry エントリ（alias / canonical）と resume の `--json` 受理が検証されている。
- `bun run test` が green。

## T-05: 不変条件を確認し検証ゲートを通す

- [x] `--json` 未指定時の stderr 人間向け出力が baseline から不変であることを確認する。
- [x] exit code 写像（pr-created=0 / awaiting-human=1 / failed=1、job 生成前失敗=1/2）が不変であることを確認する。
- [x] status → 種別 の写像が `src/core/command/run-result.ts` の 1 関数にのみ存在することを確認する。
- [x] `bun run typecheck && bun run test` を実行する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- 人間向け出力・exit code が baseline から変更されていない。
- 写像ロジックの重複（他ファイルへの status → 種別 分岐の散在）が無い。
