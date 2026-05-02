## MODIFIED Requirements

### Requirement: store module functions SHALL be the Sole Persistence Authority

`src/state/store.ts` で公開される free functions が job state ファイルに対する唯一の永続化 API で **MUST** ある。コード経路は以下 4 関数を経由する以外、直接の `fs.readFile` / `fs.writeFile` / `fs.rename` を **SHALL NOT** 使用してはならない。

> **Note**: 既存 `job-state-store` spec の "JobStateStore is the Sole Persistence Authority" Requirement（`load` / `persist` / `appendHistory` / `appendStepRun` メソッドを持つ class）は **実装上存在しない**。実際の `src/state/store.ts` は `createJobState` / `listJobStates` の free function のみを持ち、`JobStateStore` class は生成されていない。本 delta は free-function 設計を canonical として正規化する。

- `createJobState(params)` — 新規 state file を atomic write で作成する
- `listJobStates()` — `jobs/` ディレクトリを走査し全 state を返す
- `loadJobState(jobId: string): Promise<JobState>` — id 指定で state を読み出す（ENOENT → `JOB_NOT_FOUND` エラー、parse failure → `STATE_FILE_INVALID` エラー）
- `updateJobState(jobId: string, mutator: (state: JobState) => JobState): Promise<JobState>` — read-then-mutate-then-atomicWrite で state を更新する

`JobStateStore` class は MUST NOT 新設してはならない。`StepExecutor` が in-pipeline 更新を担う既存の責務分担（`src/state/store.ts:42` 参照）は変更しない。`specrunner finish` は `loadJobState` / `updateJobState` を使用する。

#### Scenario: finish が updateJobState 経由で archive 完了を反映

- **WHEN** `specrunner finish` が PR merge / archive / dir mv をすべて完了し、最終的に state を `archived` に遷移させる
- **THEN** `updateJobState(jobId, mutator)` を呼び出し、内部で `loadJobState` → mutate → `atomicWriteJson` の順に処理される。直接の `fs.writeFile` / `fs.rename` 呼び出しは発生しない

#### Scenario: 直接 fs 呼び出しの不在を grep で検出可能

- **WHEN** ソースツリー全体で `fs.writeFile` / `fs.rename` / `atomicWriteJson` を grep する
- **THEN** state file (`~/.local/share/specrunner/jobs/<id>.json`) を書き換える呼び出しは `src/state/store.ts` 内（および `src/util/atomic-write.ts` 経由）にのみ存在し、他のモジュールから直接呼び出されていない

## ADDED Requirements

### Requirement: `JobStatus` 型は `archived` を terminal 状態として定義する

`JobStatus` 型は MUST `archived` を新たな terminal 状態として SHALL 含む。`archived` は `specrunner finish` が PR merge / openspec archive / requests dir 移送 / archive PR auto-merge をすべて完了した時点で書き込まれる。`success` から `archived` への遷移のみが許可され、その他の状態（`running` / `failed` 等）からの直接遷移は禁止する。

#### Scenario: success から archived への遷移

- **WHEN** state.status が `success` の job に対し `specrunner finish` が全ステップ成功で完了する
- **THEN** state.status が `archived` に更新され、history に `step="finish", status="ok"` の entry が 1 件 append される

#### Scenario: running 状態からの finish 実行を拒否

- **WHEN** state.status が `running` の job に対し `specrunner finish` を実行する
- **THEN** `Job is still running (status=running). Wait for completion before finish.` を stderr に出し exit code 1 で停止する。state は変更されない

### Requirement: `archived` を含む `JobStatus` は既存 state file と後方互換である

`JobStatus` 型の拡張（`archived` 追加）は MUST 既存の state file（`status` が `running` / `success` / `failed` 等）の読み出しを破壊しては SHALL ならない。`archived` は新規 finish 完了時のみ書き込まれ、既存ファイルには影響しない。enumeration（`specrunner ps`）は `archived` を `success` と同様の終了状態として扱い、`active` フィルタからは除外する。

#### Scenario: 既存 state file の読み出し

- **WHEN** `archived` 追加前に作成された `status="success"` の state file を `specrunner ps` が読む
- **THEN** 通常通り表示され、JSON パースエラーや schema 検証エラーは発生しない

#### Scenario: archived は active から除外

- **WHEN** `specrunner ps --active` を実行する（`active` は `running` のみを表示）
- **THEN** `archived` 状態の job は出力に含まれない
