# git 書き込み副作用の失敗を typed halt 化する（`commitAndPush` / `commitScopedPaths` の silent fail-open を StepHalt へ）

## Meta

- **type**: spec-change
- **slug**: git-effect-failure-typed-halt
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

<!-- adr: 既存 D2（失敗遷移の単一適用 = StepHalt、B-14）の適用範囲に、現在 silent-return している git 書き込み副作用の失敗site を含める refine。routing 先（makeCommitFailHalt / CommitOrchestrator）も error factory pattern（errors.ts）も既存。新しい port/pattern/halt kind の導入ではない。§4 昇格 / ADR の要否は design step が評価する（escalation 可）。 -->

## 背景

step の commit 経路（`finalizeStepArtifacts` → `commitAndPush`、round の `commitRoundScoped` → `commitScopedPaths`）は、git 書き込み副作用の失敗を **silent に成功扱いする** fail-open を持つ。「本当に変更がない（正当 no-op）」と「git 操作が失敗した」が区別されず、後者が no-op として素通りするか、失敗を無視して push へ進む。

一方、この経路には既に **throw → typed halt の仕組みが通っている**: `commitAndPush` が throw すると executor の catch が受け、`makeCommitFailHalt`（`src/core/step/step-halt.ts:305`、code `COMMIT_AND_PUSH_FAILED`、kind `failed`）で StepHalt を構築し、CommitOrchestrator が単一適用点で persist / 遷移 / rethrow する（B-13 / B-14）。現状この経路に乗っているのは `pushOnly` の `pushFailedError` だけ。add / diff-error / commit の失敗が silent-return するため、この既存の halt 経路に到達しない。

`commitAndPush` は **local runtime 専用**（managed agent は自前で commit する。`src/adapter/managed-agent/agent-runner.ts:629`）＝常に git worktree 上で走る。よって「非 git repo なので正当に no-op」は実在せず、`git add` 失敗を silent skip する現挙動は operational failure（index lock・disk・corruption 等）をバグとして隠す。

本 request は「正当 no-op」と「git 操作失敗」を分離し、後者を既存の typed halt 経路へ流して fail-closed 化する。

## 現状コードの前提

- `commitAndPush`（`src/core/step/commit-push.ts:33-76`）:
  - `git add -A` exit≠0 → silent return（44-50。「not a git repo」と framing）。
  - `git diff --cached --quiet`: `hasChanges = (exit === 1)`（54-55）。exit 0＝staged 変更なし、exit 1＝あり、**exit≥2＝git エラーだが `hasChanges=false` として no-op 扱い**（57-68）。
  - `git commit`（72）は `gitExec`（`src/util/git-exec.ts:39`、失敗時 `null` を返し throw しない）で結果未チェック → 失敗しても `pushOnly`（75）へ進む。
- `commitScopedPaths`（`commit-push.ts:155-182`）: 同型（add 166-169 / diff 173-175 / commit 178）。round-owned scoped staging（D3）。
- `pushOnly`（`commit-push.ts:189-207`）: push 2 回失敗で `pushFailedError` を throw（唯一 halt 経路に乗る失敗）。
- caller と halt 経路: `commitAndPush` は `local.ts:643`（`finalizeStepArtifacts` 内）、`commitScopedPaths` は `local.ts:791`（`commitRoundScoped`）。throw は executor catch へ伝播（`runtime-strategy.ts:300`「commitAndPush errors are re-thrown; the executor's .catch()」）→ `makeCommitFailHalt` → CommitOrchestrator。
- `git diff --cached --quiet` exit 0 かつ HEAD 前進（agent 自己 commit）→ `pushOnly`（60-65）。これは正当経路。
- error factory: `src/errors.ts` に `pushFailedError(stepName, branch, detail)` 等の `SpecRunnerError` factory 群。`notGitRepoError()` / `noCommitDetectedError(stepName, branch)` も既存。
- `commitFinalState`（`commit-push.ts:91-131`、`pipeline.ts:370` から D5 で呼ぶ）は run 完了後の best-effort finalize で、commit 失敗は warn・push 失敗は warn（throw しない）。run が既に awaiting-archive で state は branch 上に回収可能なため、throw しないのが設計。

## 要件

1. `commitAndPush` と `commitScopedPaths` で「git 操作失敗」を「正当 no-op」から分離する:
   - `git add` exit≠0 → typed `SpecRunnerError` を throw（silent return を廃止）。executor catch → `makeCommitFailHalt` → StepHalt(`failed`)。
   - `git diff --cached --quiet` exit≥2（git エラー）→ typed error を throw。exit 0 → staged 変更なし（no-op 経路）。exit 1 → staged 変更あり（commit へ）。
   - `git commit` exit≠0 → typed error を throw し、**push へ進まない**（結果無視を廃止）。commit の exit code を検査する（`gitExec` は null を返すので exit code を取る呼び方に変える）。
2. 正当経路を保存する:
   - `git add` 成功 かつ `git diff --cached --quiet` exit 0 かつ HEAD 前進なし → silent no-op（従来どおり。tool 完了で file 書き込みが無い場合）。
   - exit 0 かつ HEAD 前進（agent 自己 commit）→ `pushOnly`（従来どおり）。
   - `pushOnly` の `pushFailedError` は不変。
3. 失敗は**既存の halt 経路のみ**で流す: throw → executor catch → `makeCommitFailHalt`（`COMMIT_AND_PUSH_FAILED` / kind `failed`）→ CommitOrchestrator（B-13 / B-14）。新しい StepHalt kind や適用点を作らない。stage / commit 失敗用の typed error は `errors.ts` に `pushFailedError` と同型で追加（or 既存 factory を再利用）。
4. 現在 fail-open を固定しているテスト（非 git dir / commit 失敗で silent no-op を期待するもの。`tests/unit/step/commit-and-push.test.ts`、`tests/unit/step/executor.commit.test.ts` 等）を、throw → halt を期待する形に更新する。
5. `git-exec.ts` の `gitExecExitCode` が spawn error 時に `1`（＝「変更あり」相当）を返す conflation が、diff 判定に残余 fail を生まないか design step が確認する（必要なら diff は exit code とspawn 成否を分離）。

## スコープ外

- `commitFinalState`（run 完了後の best-effort finalize、D5）。throw しない設計は意図的（state は branch 上に回収可能）。本 request では触れない。
- changed-files **読み取り**経路（`listChangedFiles` の fail-open）— 別 request で着地済み。
- 新しい StepHalt kind の追加（既存 `makeCommitFailHalt` の `failed` を再利用）。
- push retry / `pushFailedError` の挙動（不変）。
- managed runtime の commit 経路（managed agent 自前 commit。`commitAndPush` は local 専用）。

## 受け入れ基準

- [ ] `commitAndPush` で `git add` exit≠0 → throw され、step が halt（`COMMIT_AND_PUSH_FAILED` / `failed`）する（silent no-op しない）ことをテストで固定。
- [ ] `git diff --cached --quiet` exit≥2 → throw され halt することをテストで固定（「変更なし」扱いしない）。
- [ ] `git commit` 失敗 → throw され halt し、**push が呼ばれない**ことをテストで固定（結果無視で push へ進まない）。
- [ ] 正当 no-op（add 成功 ＋ diff exit 0 ＋ HEAD 前進なし）は従来どおり silent no-op（throw も commit もしない）ことをテストで固定。
- [ ] agent 自己 commit（diff exit 0 ＋ HEAD 前進）は従来どおり `pushOnly` することをテストで固定。
- [ ] `commitScopedPaths`（round-owned）も同じ分離（失敗 → throw / 正当 no-op 保存）をテストで固定。
- [ ] 失敗が新経路でなく既存 `makeCommitFailHalt` → CommitOrchestrator で適用されることを確認（新 halt 機構を足さない）。
- [ ] `commitFinalState` の挙動が不変（best-effort warn、throw しない）。
- [ ] `typecheck && test` green。

## architect 評価済みの設計判断

- **採用**: 失敗を throw して **既存の `makeCommitFailHalt` 経路**へ流す。routing・適用点（CommitOrchestrator）・error factory pattern が既にあるため、新機構ゼロで D2（StepHalt 単一適用）の適用範囲を git 副作用失敗 site へ広げる位置づけ。
- **採用**: `git commit` は exit code を検査する呼び方（`gitExec` の null 返しでは失敗を検知できない）。
- **採用**: 「正当 no-op」と「操作失敗」の分離軸は `git diff --cached --quiet` の exit（0＝no-op / 1＝commit / ≥2＝error→throw）と add / commit の exit≠0。
- **却下**: `git add` exit≠0 を「非 git repo なので no-op」として silent skip する現挙動の維持。`commitAndPush` は local 専用で常に worktree 上、非 git repo は実在せず operational failure を隠す。fail-closed（throw → halt）へ。
- **却下**: `commitFinalState` も同時に fail-closed 化。run 完了後の finalize で throw は不適切（state は branch 回収可能）。別軸として据え置き。
- **却下**: 新しい StepHalt kind（例: git-effect 専用）。`makeCommitFailHalt` の `failed` で十分（infra 失敗は human note で resume 不能な terminal）。
- **design step へ委譲**: (a) stage / commit 失敗用 error factory を新設するか既存（`notGitRepoError` / `noCommitDetectedError` 等）を再利用するか。(b) `gitExecExitCode` の spawn-error=1 conflation が diff 判定に残余を生まないかの確認と対処要否。(c) D2 適用範囲拡大が §4 / conformance の note を要するか。
