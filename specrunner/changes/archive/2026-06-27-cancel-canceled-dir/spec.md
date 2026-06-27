# Spec: job cancel — change-folder を canceled/ へ退避

## Requirements

### Requirement: cancel は change-folder を canceled/<slug>-<jobId8>/ へ退避し、worktree 撤去後も記録を残す

`specrunner job cancel <jobId>`（status: running / awaiting-resume / failed / terminated /
awaiting-archive[--force]）は、worktree を撤去する **前に** ジョブの change-folder
（state.json / events.jsonl / request.md / design・spec・tasks・各 result アーティファクト）を
main space の `specrunner/changes/canceled/<slug>-<jobId8>/` へ退避し、退避先 state に
`error.code = USER_CANCELED` / `canceledAt` / キャンセル理由を記録 SHALL。
退避先への記録書き込みは worktree 撤去より前に完了し、worktree-only state の local job でも
記録が消失してはならない（MUST NOT）。`<jobId8>` は `state.jobId` の先頭8桁とする。

#### Scenario: worktree-only state の job を cancel すると退避先に USER_CANCELED が残る

**Given** state が worktree 内 `specrunner/changes/<slug>/` にのみ存在する local job（canonical 不在）
**When** ユーザーが `specrunner job cancel <jobId>` を実行する
**Then** `specrunner/changes/canceled/<slug>-<jobId8>/state.json` が存在し、その status は `canceled`、
`error.code` は `USER_CANCELED`、`canceledAt` が設定されている

#### Scenario: 記録は worktree 撤去の後も残る

**Given** cancel 中に worktree が撤去される job
**When** cancel が完了する
**Then** 撤去された worktree ではなく `canceled/<slug>-<jobId8>/` に state.json が残り、
`USER_CANCELED` / `canceledAt` を保持している

### Requirement: 退避先ディレクトリ名は jobId で一意化される

退避先ディレクトリ名は `<slug>-<jobId8>` 形式とし、同名 slug を同日に複数回 cancel しても
互いに衝突してはならない（MUST NOT）。

#### Scenario: 同名 slug を複数回 cancel しても衝突しない

**Given** 同一 slug を持つが jobId が異なる 2 つの job
**When** 両方を同日に `specrunner job cancel` する
**Then** `canceled/<slug>-<jobId8a>/` と `canceled/<slug>-<jobId8b>/` の 2 つが独立して存在し、
一方が他方を上書きしない

### Requirement: cancel は退避を move（copy でなく）で行い、元の change-folder を残さない

退避は退避先へコピー後、元の change-folder を削除 SHALL。特に `--no-worktree` モードでは
元が main canonical `specrunner/changes/<slug>/` に存在するため、これを必ず削除し、
退避先 `canceled/<slug>-<jobId8>/` にのみ存在する状態にしなければならない（MUST）。

#### Scenario: --no-worktree モードで元の canonical が残らない

**Given** `--no-worktree` で実行され、state が main canonical `specrunner/changes/<slug>/` にある job
**When** `specrunner job cancel <jobId>` を実行する
**Then** `specrunner/changes/<slug>/` は存在せず、change-folder は `canceled/<slug>-<jobId8>/` にのみ存在する

#### Scenario: 退避済み job は job ls に active として現れない

**Given** cancel 済みで change-folder が `canceled/<slug>-<jobId8>/` に退避された job
**When** `specrunner ps` / `JobStateStore.list()` を実行する
**Then** その job は active なジョブ一覧に重複表示されない

### Requirement: active スキャンは canceled/ を除外する

`JobStateStore.list()` の change-folder 走査は `canceled` ディレクトリを `archive` と同様に
active 候補から除外 SHALL。`canceled` は予約ディレクトリ名として扱う。

#### Scenario: canceled/ 配下は active 一覧に含まれない

**Given** `specrunner/changes/canceled/<slug>-<jobId8>/state.json` が存在する
**When** `JobStateStore.list()`（includeArchived 指定なし）を呼ぶ
**Then** 返される active 一覧に `canceled/` 配下の state は含まれない

### Requirement: cancel は片付け（worktree 撤去 + local/remote branch 削除）を維持する

cancel は退避・記録の後に worktree を撤去し、local / remote branch を削除 SHALL。
branch は残してはならない（MUST NOT）。branch / worktree 削除は best-effort で、失敗時は warning を出して
exit code を変えない。

#### Scenario: cancel 後に worktree と branch が削除される

**Given** worktree と branch を持つ cancellable な job
**When** `specrunner job cancel <jobId>` を実行する
**Then** worktree 撤去（`git worktree remove`）と local branch 削除（`git branch -D <branch>`）、
remote branch 削除（`git push origin --delete <branch>`）が試行される

### Requirement: request.md は canceled/ に保全される

cancel 時、ジョブの request.md は退避により `canceled/<slug>-<jobId8>/request.md` に保全 SHALL。
既定（`--restore-draft` なし）でも request.md が失われてはならない（MUST NOT）。

#### Scenario: request.md が canceled/ に残る

**Given** change-folder に request.md を持つ cancellable な job
**When** `specrunner job cancel <jobId>`（`--restore-draft` なし）を実行する
**Then** `canceled/<slug>-<jobId8>/request.md` が元の内容で存在する

### Requirement: --restore-draft は存置される

`--restore-draft` を渡した場合、cancel は退避の **前** に worktree 内 `changes/<slug>/request.md` を読み、
`specrunner/drafts/<slug>/request.md` へ復元 SHALL（既存挙動）。既存 draft があれば上書きせず warning を出す。
`--restore-draft` なしでは drafts/ を読み書きしない。

#### Scenario: --restore-draft で drafts に復元される

**Given** worktree 内に `changes/<slug>/request.md` を持つ job
**When** `specrunner job cancel <jobId> --restore-draft` を実行する
**Then** `specrunner/drafts/<slug>/request.md` が元の内容で作成され、cancel は exit 0 で完了する

#### Scenario: --restore-draft なしでは drafts を触らない

**Given** cancellable な job
**When** `specrunner job cancel <jobId>`（`--restore-draft` なし）を実行する
**Then** `specrunner/drafts/<slug>/request.md` は作成・変更されない
