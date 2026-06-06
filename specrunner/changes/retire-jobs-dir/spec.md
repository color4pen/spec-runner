# Spec: `.specrunner/jobs/` を完全撤去する

## Requirements

### Requirement: コードベースに `.specrunner/jobs/` への読み書き参照が残らない

`src/` 配下に `.specrunner/jobs/` への読み書き、および jobId-store path helper（`getJobsDir` / `getJobStatePath` / `getJobDir` / `getJobStateJsonPath` / `getJobEventsPath`）の定義・使用が残っては**ならない（MUST NOT）**。`JobStateStore` は slug-mode（`slug` + `stateRoot`）または `changeDir` seam のいずれかでのみ path を解決する MUST。jobId-only モード（`new JobStateStore(jobId, repoRoot)` で slug / changeDir を伴わない構成）での read / write は提供しては**ならない（MUST NOT）**。

#### Scenario: jobs-dir path helper が定義も使用も無い

**Given** 本変更適用後のリポジトリ
**When** `getJobsDir` / `getJobStatePath` / `getJobStateJsonPath` / `getJobEventsPath` / `getJobDir` を `src/` で grep する
**Then** 定義も使用も 1 件も見つからない

#### Scenario: jobs-dir への書き込みが起きない

**Given** local / managed いずれかの runtime で `specrunner run` を実行する
**When** bootstrap → setupWorkspace → step persist → 終端が完了する
**Then** `.specrunner/jobs/` ディレクトリは作成・更新されない（state は slug 正本または `.specrunner/local/<slug>/` のみに書かれる）

### Requirement: jobId からの state 読み取りは sidecar → slug 起点のみを経由する

`loadStateByJobId()` は sidecar（liveness / marker）から slug を解決し、slug 正本（local）または `.specrunner/local/<slug>/`（managed）から state を読む MUST。jobs-dir への fallback 読み取りを行っては**ならない（MUST NOT）**。sidecar 解決が尽きて state を特定できない場合は、`.specrunner/jobs/` を読まずに `JOB_NOT_FOUND` 相当のエラーを throw する MUST。

#### Scenario: 解決できない jobId はエラーになる（jobs-dir を読まない）

**Given** sidecar（liveness / marker）にも slug 正本にも該当しない jobId
**When** `loadStateByJobId()` を呼ぶ
**Then** `.specrunner/jobs/` を読まずに JOB_NOT_FOUND 相当のエラーが throw され、`job show` / `cancel` は「Job not found」相当で終了する（exit 1）

#### Scenario: sidecar を持つ jobId は slug 起点で読める

**Given** liveness（local）または marker（managed）を持つ active job の jobId
**When** `loadStateByJobId()` で state を読む
**Then** slug 正本（local）または `.specrunner/local/<slug>/`（managed）から正しい state が得られ、jobs-dir は参照されない

### Requirement: jobId からの書き込みストア解決は jobs-dir に着地しない

`resolveStateStoreByJobId()` は sidecar → slug 起点で書き込み可能ストアを解決する MUST。解決できない場合は jobs-dir ストアを返しては**ならず（MUST NOT）**、`null` を返す MUST。呼び出し側（resume / cancel / exit-guard）は `null` を degraded skip として扱い、persist を行わず処理を継続する MUST。

#### Scenario: 書き込み先が無い場合は null で skip される

**Given** sidecar を持たない、または worktree / canonical state dir が存在しない jobId
**When** `resolveStateStoreByJobId()` を呼ぶ
**Then** `null` が返り、呼び出し側は persist をスキップして処理を続行する（jobs-dir には書かれない）

### Requirement: 旧 `.specrunner/jobs/` データが存在してもコマンドが壊れない

旧 `.specrunner/jobs/<jobId>(.json|/)` データが残存している環境でも、`job ls` / `job show` / `cancel` / `resume` / `archive` は local / managed 両 runtime で例外なく完了する SHALL。これらのコマンドは旧データを active な state ソースとして読み込んでは**ならない（MUST NOT）**。

#### Scenario: 旧データ残存下で job ls が壊れない

**Given** `.specrunner/jobs/` に旧 state ファイルが残り、かつ slug 正本 / sidecar に有効な job が存在する
**When** `job ls`（`JobStateStore.list()`）を実行する
**Then** slug 正本 / sidecar 由来の job が一覧され、旧 jobs-dir データは読まれず、コマンドは正常終了する

#### Scenario: 旧データ残存下で cancel / resume が壊れない

**Given** `.specrunner/jobs/` に旧データが残る環境で sidecar を持つ active job を操作する
**When** `cancel` / `resume` を実行する
**Then** sidecar → slug 起点で state が解決され、コマンドは正常に完了する（jobs-dir は参照されない）

### Requirement: cancel の purge は machine-local slug state を削除する

`cancelSingleJob` の `--purge` および `cancelAllTerminated` は、物理削除の対象を `.specrunner/local/<slug>/`（machine-local state）とする MUST。`.specrunner/jobs/` の削除を行っては**ならない（MUST NOT）**。slug を特定できない job は物理削除を skip する MUST。local の slug 正本（commit 済 change folder）は purge で削除しては**ならない（MUST NOT）**。

#### Scenario: 一括 purge が新 layout の terminal state を削除する

**Given** terminal（failed / terminated / canceled）な managed job が `.specrunner/local/<slug>/` に state を持つ
**When** `cancelAllTerminated` を実行する
**Then** 当該 `.specrunner/local/<slug>/` が削除され、`.specrunner/jobs/` には触れられない

### Requirement: doctor が旧 `.specrunner/jobs/` を検出し手動削除を促す

`specrunner doctor` は `.specrunner/jobs/` が存在する場合に `warn` を返し、手動削除を促す hint を提示する MUST。`.specrunner/jobs/` が存在しない場合は `pass` を返す MUST。storage の writable チェックは machine-local sidecar root（`.specrunner/local/`）を対象とし、`.specrunner/jobs/` を対象にしては**ならない（MUST NOT）**。

#### Scenario: 旧 jobs-dir が存在すると warn になる

**Given** `.specrunner/jobs/` が存在する環境
**When** `specrunner doctor` を実行する
**Then** legacy 検出チェックが `warn` を返し、手動削除（`rm -rf .specrunner/jobs`）を促す hint が表示される

#### Scenario: 旧 jobs-dir が無ければ pass になる

**Given** `.specrunner/jobs/` が存在しない環境
**When** `specrunner doctor` を実行する
**Then** legacy 検出チェックは `pass` を返す

#### Scenario: writable チェックが sidecar root を対象にする

**Given** doctor の storage writable チェックが走る
**When** チェックが検査対象ディレクトリを決定する
**Then** 検査対象は `.specrunner/local/`（machine-local sidecar root）であり、`.specrunner/jobs/` ではない

### Requirement: 検証が green

`bun run typecheck && bun run test` が green になる SHALL。

#### Scenario: typecheck と test が green

**Given** 本変更適用後
**When** `bun run typecheck && bun run test` を実行する
**Then** いずれも green になる
