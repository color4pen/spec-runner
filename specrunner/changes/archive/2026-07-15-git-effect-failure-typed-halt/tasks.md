# Tasks: git 書き込み副作用の失敗を typed halt 化する

> 実装順の原則: まず T-01（error factory）と T-02（git-exec helper）で interface を確定させ、
> T-03 / T-04 で `commit-push.ts` の 2 経路を fail-closed へ配線し、T-05 で fail-open を
> 固定している既存 test を throw / halt 期待へ更新する。interface 確定前に behavior test を書かない。
> `parallel-review-round.ts` には手を入れない（round の throw は既存 safety net に相乗り = D3）。
> `commitFinalState`（D5）・`architecture/`・`specrunner/adr/` は変更しない（スコープ外 / D5）。
> 正当経路（no-op / agent 自己 commit / pushOnly）の観測挙動は不変（refactor-preserve-behavior）。

## T-01: stage / diff / commit 失敗用 error factory を新設する（D1）

- [x] `src/errors.ts` に error code を追加する:
  - `ERROR_CODES.COMMIT_AND_PUSH_FAILED = "COMMIT_AND_PUSH_FAILED"`（`makeCommitFailHalt` の default 文字列を正式登録し magic string を解消）。
- [x] factory `commitEffectFailedError(label: string, branch: string, operation: "stage" | "diff" | "commit", detail: string): SpecRunnerError` を追加する（`pushFailedError` と同型）:
  - code は `ERROR_CODES.COMMIT_AND_PUSH_FAILED`。
  - message は `label` / `operation` / `branch` / `detail` を含む（例: `${label}: git ${operation} failed on branch '${branch}': ${detail}`）。
  - hint は index.lock / disk / worktree 破損の点検と `specrunner job resume` を促す。
- [x] 既存 factory（`notGitRepoError` / `noCommitDetectedError` / `pushFailedError`）は**再利用しない**（それぞれ意味が異なる — design D1 参照）。EXIT_CODE_MAP には追加しない（未登録 = GENERAL_ERROR、`pushFailedError` と同じ）。

**Acceptance Criteria**:
- `commitEffectFailedError(...)` が code `COMMIT_AND_PUSH_FAILED` の `SpecRunnerError` を返す。
- message に `operation`（stage / diff / commit）と `branch` と `detail` が含まれる。
- `ERROR_CODES.COMMIT_AND_PUSH_FAILED` が定義され、`makeCommitFailHalt` の default（`step-halt.ts:311`）と一致する。

## T-02: spawn 成否と exit code を分離する git-exec helper を追加する（D4）

- [x] `src/util/git-exec.ts` に `gitExecResult(spawnFn, cwd, args): Promise<{ ok: boolean; exitCode: number }>` を追加する:
  - `runSubprocess` を try/catch し、成功 → `{ ok: true, exitCode }`、spawn 例外 → `{ ok: false, exitCode: -1 }`。throw しない。
- [x] 既存 `gitExec`（string|null 返し）/ `gitExecExitCode`（number 返し、spawn 例外→1）のシグネチャ・挙動・既存 caller は**変更しない**（additive のみ）。

**Acceptance Criteria**:
- `gitExecResult` が spawn 成功時 `{ ok:true, exitCode }`、spawn 例外時 `{ ok:false, exitCode:-1 }` を返し、throw しない。
- `gitExec` / `gitExecExitCode` のシグネチャと既存挙動が不変。

## T-03: `commitAndPush` を fail-closed へ配線する（D2）

- [x] `src/core/step/commit-push.ts` `commitAndPush`（33-76）:
  - `git add -A` を `gitExecResult` で実行。`!ok || exitCode !== 0` → `commitEffectFailedError(step.name, branch, "stage", …)` を **throw**（44-50 の silent return を削除）。
  - `git diff --cached --quiet` を `gitExecResult` で実行。`!ok || exitCode >= 2` → `commitEffectFailedError(step.name, branch, "diff", …)` を **throw**。`hasChanges = (exitCode === 1)`（exit 0 → no-op 分岐、exit 1 → commit）。
  - 変更なし（diff exit 0）分岐（57-68）は**不変**: HEAD 前進あり → `pushOnly`（+ 既存の stderr 検出ログ）、HEAD 前進なし → silent return。`rev-parse HEAD` は `gitExec` のまま。
  - `git commit` を `gitExecResult` で実行（`gitExec` の null 返しから変更）。`!ok || exitCode !== 0` → `commitEffectFailedError(step.name, branch, "commit", …)` を **throw**し、`pushOnly` を**呼ばない**（72 の結果無視を削除）。成功時のみ `pushOnly`（75、不変）。
- [x] `pushOnly`（189-207）は**不変**（retry / `pushFailedError` を変えない）。

**Acceptance Criteria**:
- add 失敗（spawn / exit≠0）→ throw（silent return しない）。
- diff spawn 失敗 / exit≥2 → throw。exit 0 → no-op / self-commit 判定、exit 1 → commit。
- commit 失敗（spawn / exit≠0）→ throw し push を呼ばない。commit 成功時のみ push。
- 正当 no-op（add 成功 + diff exit 0 + HEAD 前進なし）と agent 自己 commit（diff exit 0 + HEAD 前進 → pushOnly）の観測挙動が不変。

## T-04: `commitScopedPaths` を fail-closed へ配線する（D3）

- [x] `src/core/step/commit-push.ts` `commitScopedPaths`（155-182）を T-03 と同型に変える:
  - empty（162）→ 不変（no-op）。
  - `git add -A -- <paths>` を `gitExecResult` で実行。`!ok || exitCode !== 0` → `commitEffectFailedError(commitMessage, branch, "stage", …)` を **throw**（166-169 の silent return を削除）。scoped `git add -A -- <paths>` の pathspec 限定は**不変**（B-15）。
  - `git diff --cached --quiet` を `gitExecResult` で実行。`!ok || exitCode >= 2` → `"diff"` throw。exit 0 → return（no-op、不変）。exit 1 → commit。
  - `git commit` を `gitExecResult` で実行。`!ok || exitCode !== 0` → `"commit"` throw（`pushOnly` を呼ばない）。成功時のみ `pushOnly`（181、不変）。
- [x] `parallel-review-round.ts` は**変更しない**。`commitScopedPaths` の throw は `pushFailedError` と同一の既存 safety net（`Pipeline.run()` 外側 catch → awaiting-resume）に乗る（D3）。
- [x] `src/core/runtime/local.ts` `commitRoundArtifacts`（781-792）の doc comment「Never throws — errors propagate from commitScopedPaths / pushOnly」を、「stage / commit / push 失敗は throw され、pipeline の safety net で awaiting-resume に落ちる」旨へ更新する（挙動記述の整合）。

**Acceptance Criteria**:
- round の add / diff（spawn/≥2）/ commit 失敗 → throw（silent return / 結果無視しない）。
- 正当 no-op（empty stagePaths、または add 成功 + diff exit 0）は throw も commit もせず return。
- scoped `git add -A -- <paths>`（宣言出力限定、bare `git add -A` 不使用）が不変。
- `parallel-review-round.ts` に差分が無い。

## T-05: fail-open を固定している既存 test を更新し、intended-invariant を固定する（G5）

- [x] `tests/unit/step/commit-and-push.test.ts`:
  - **TC-CAP-008 / TC-CAP-009**（`git add` exit 128 → 現状 silent skip 期待）を、`executor.execute(...)` が `COMMIT_AND_PUSH_FAILED` で reject し、commit / push が呼ばれないことを期待する形へ更新する。
  - **新規 TC-CAP-010**: staged 変更あり（diff exit 1）+ `git commit` exit≠0 → `executor.execute` が `COMMIT_AND_PUSH_FAILED` で reject し、**push が呼ばれない**ことを固定する。
  - **新規 TC-CAP-011**: `git diff --cached --quiet` exit≥2（例 128）→ reject し halt することを固定する（「変更なし」扱いしない）。
  - TC-CAP-001〜007（正当経路 / push retry / event / commit message）は green を維持（回帰確認）。
- [x] `src/core/step/__tests__/commit-scoped-paths.test.ts`:
  - **Branch 2**（`git add` exit 128 → 現状 silent return 期待）を、`commitScopedPaths(...)` が throw することを期待する形へ更新する（`-- <paths>` pathspec の確認アサーションは維持）。
  - **新規 Branch 5**: diff exit≥2 → throw を固定する。
  - **新規 Branch 6**: `git commit` exit≠0 → throw（push が呼ばれない）を固定する。
  - Branch 1（empty → no-op）/ Branch 3（add 成功 + diff exit 0 → no commit）/ Branch 4（staged → commit+push）は green を維持。
- [x] `tests/unit/util/git-exec.test.ts`:
  - `gitExecResult` の unit test を追加する（spawn 成功 → `{ok:true, exitCode}`、spawn 例外 → `{ok:false, exitCode:-1}`、throw しない、env stripping 回帰なし）。
- [x] `tests/unit/step/executor.commit.test.ts`:
  - TC-CAP-NEW-001〜008（no-op / agent 自己 commit / push-only / lineage 等の正当経路）が green を維持することを確認する（本変更で挙動不変）。add 失敗 → `executor.execute` reject の halt-path アサーション（TC-CAP-NEW-HALT-001）を 1 件追加した。
- [x] round-level fake test（`src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`）は fake `commitRoundArtifacts` を使い実 `commitScopedPaths` を呼ばないため**影響を受けない**ことを確認する（差分なし）。

**Acceptance Criteria**:
- `commitAndPush`: add 失敗 → halt（`COMMIT_AND_PUSH_FAILED` / `failed`）、diff≥2 → halt、commit 失敗 → halt かつ push 未呼び出し、正当 no-op / agent 自己 commit は不変、が test で固定される。
- `commitScopedPaths`: add / diff≥2 / commit 失敗 → throw、正当 no-op 保存、scoped stage 不変、が test で固定される。
- `gitExecResult` の spawn 成否 / exit code 分離が test で固定される。
- 既存の正当経路 test（commit-and-push / executor.commit / commit-scoped-paths の成功・no-op 分岐）が無改変または最小改変で green。

## T-06: 全体検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（更新 test 含む、既存 commit / round / executor test の regression なし）。503 files, 6969 tests all passed。
- [x] 変更ファイルが `src/errors.ts` / `src/util/git-exec.ts` / `src/core/step/commit-push.ts` / `src/core/runtime/local.ts`（doc comment のみ）と対応 test に限られることを確認する。
- [x] `src/core/pipeline/parallel-review-round.ts` / `architecture/` / `specrunner/adr/` に変更が無いことを確認する（D3 / D5）。
- [x] `commitFinalState`（`commit-push.ts:91-131`）に差分が無いことを確認する（スコープ外、挙動不変）。

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ基準）。
- `parallel-review-round.ts` / `architecture/` / `commitFinalState` が不変。
