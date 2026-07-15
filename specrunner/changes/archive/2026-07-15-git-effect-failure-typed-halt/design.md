# Design: git 書き込み副作用の失敗を typed halt 化する（`commitAndPush` / `commitScopedPaths` の silent fail-open を StepHalt へ）

## Context

step / round の commit 経路は、git 書き込み副作用の失敗を **silent に成功扱いする** fail-open を持つ。「本当に変更がない（正当 no-op）」と「git 操作が失敗した（index lock / disk / corruption 等の operational failure）」が区別されず、後者が no-op として素通りするか、失敗を無視して push へ進む。

`commitAndPush` は **local runtime 専用**（managed agent は自前で commit+push する — `src/adapter/managed-agent/agent-runner.ts:629`）＝常に git worktree 上で走る。よって「非 git repo なので正当に no-op」は実在せず、`git add` 失敗を「not a git repo」と framing して silent skip する現挙動は、operational failure をバグとして隠す。

### 現状の構造

`src/core/step/commit-push.ts`:

- **`commitAndPush`（33-76）**:
  - `git add -A`（`gitExecExitCode`）exit≠0 → **silent return**（44-50、「not a git repo」と framing）。
  - `git diff --cached --quiet`（`gitExecExitCode`）: `hasChanges = (exit === 1)`（54-55）。exit 0＝staged 変更なし、exit 1＝あり、**exit≥2＝git エラーだが `hasChanges=false` として no-op 扱い**（57-68）。
  - `git commit`（72）は `gitExec`（`src/util/git-exec.ts:39-51`、失敗時 `null` を返し throw しない）で結果未チェック → 失敗しても `pushOnly`（75）へ進む。
- **`commitScopedPaths`（155-182）**: round-owned scoped staging（B-15）。同型（empty 162 / add 165-169 / diff 173-175 / commit 178 / pushOnly 181）。`git add -A -- <paths>` で宣言 path に限定して stage する点のみ `commitAndPush` と異なる。
- **`pushOnly`（189-207）**: push 2 回失敗で `pushFailedError` を throw（現状この経路で唯一 typed halt に乗る失敗）。
- **`commitFinalState`（91-131）**: run 完了後の best-effort finalize（D5、`pipeline.ts` から呼ぶ）。commit 失敗は warn・push 失敗は warn（throw しない）。run が既に awaiting-archive で state は branch 上に回収可能なため、throw しないのが意図的な設計。**本 request のスコープ外**。

### 既存の 2 つの halt 適用点（重要 — request の framing の精緻化）

request 本文は失敗を「throw → executor catch → `makeCommitFailHalt` → CommitOrchestrator」の**単一経路**として記述するが、2 つの caller はそれぞれ**別々の既存 halt 適用点**に乗っている。コードを追うと以下のとおり非対称であり、この非対称は本 request で新設するものではなく、**現状 `pushFailedError` が既にこの非対称を体現している**：

- **Path A — `commitAndPush`（sequential）**: `LocalRuntime.finalizeStepArtifacts`（`local.ts:633-645`、`commitAndPush` は 643）が throw → `StepExecutor` の finalize `.catch()`（`executor.ts:442-443`）が捕捉 → `makeCommitFailHalt`（`executor.ts:449`、`step-halt.ts:305-316`、code default `COMMIT_AND_PUSH_FAILED` / kind `failed`）→ `{kind:"halt"}` を返す → `CommitOrchestrator.apply` → `commitHalt`（`commit-orchestrator.ts:377-413`）→ `store.fail`（terminal **failed**）→ `attachStateAndRethrow`。**これが request の記述する経路**（B-13 / B-14 / D2）。
- **Path B — `commitScopedPaths`（round）**: `LocalRuntime.commitRoundArtifacts`（`local.ts:781-792`、`commitScopedPaths` は 791）を `ParallelReviewRound.run` が**直接 await**（`parallel-review-round.ts:282`）で呼ぶ。この呼び出しには **try/catch が無い**。throw は `run()` を素通りし、`pipeline.ts:259` の `this.round!.run(...)`（**こちらも try/catch 無し** — 279 の try/catch は非 coordinator step 専用）を素通りし、`Pipeline.run()` の**外側 catch（`pipeline.ts:145-183`）＝ last-resort safety net** に落ちる。state が `running` のままなら `awaiting-resume` へ遷移（error code `PIPELINE_UNHANDLED_ERROR`、原因は `resumePoint.reason` / `error.message` に保存）。**現状 `commitScopedPaths → pushOnly` が投げる `pushFailedError` は既にこの safety net 経由で awaiting-resume に落ちている**。

つまり request の受け入れ基準「失敗が既存 `makeCommitFailHalt` → CommitOrchestrator で適用される（**新 halt 機構を足さない**）」は、Path A では字義どおり成立し、Path B では「`makeCommitFailHalt` ではなく、`pushFailedError` が今日乗っているのと同一の既存 safety net」に乗る、というのが正確な像である。本設計はこの実像に忠実に据える（§ D3）。

### `gitExecExitCode` の spawn-error=1 conflation（要件 5）

`gitExecExitCode`（`git-exec.ts:57-68`）は spawn 例外時に `catch { return 1; }` を返す。diff 判定は `exit 1 = 変更あり` なので、spawn 失敗（git 不在等）が「変更あり」と誤分類され得る。ただし `add` が最初に走り、spawn が壊れていれば `add` の `gitExecExitCode` も 1（≠0）を返して `add` 段で throw するため、**実行順に依存すれば** diff 段に壊れた spawn は到達しない。この「add-first で spawn 失敗を捕捉」という暗黙の実行順不変に依存せず、diff 分類を**明示的に**正しくするため、spawn 成否と exit code を分離する（§ D4）。

## Goals / Non-Goals

**Goals**:

- `commitAndPush` / `commitScopedPaths` で「git 操作失敗」を「正当 no-op」から分離し、失敗を typed `SpecRunnerError` として **throw**（silent return / 結果無視を廃止）する（G1）。
- 分離軸: `git add` exit≠0 → throw、`git diff --cached --quiet` exit 0＝no-op / exit 1＝commit / **exit≥2（or spawn 失敗）→ throw**、`git commit` exit≠0 → throw（push へ進まない）（G2）。
- 正当経路を保存する: add 成功＋diff exit 0＋HEAD 前進なし → silent no-op、diff exit 0＋HEAD 前進 → `pushOnly`、`pushOnly` の `pushFailedError` は不変（G3）。
- 失敗は **既存の halt 適用点のみ**で流す。Path A は `makeCommitFailHalt`（既存）、Path B は `pushFailedError` が今日乗っているのと同一の既存 safety net（既存）。新しい StepHalt kind / 新しい適用点 / 新しい routing を作らない（G4）。
- 現在 fail-open を固定しているテストを、throw / halt を期待する形へ更新する。git 副作用失敗を throw に変える差分の回帰安全性を test で固定する（G5）。

**Non-Goals**:

- `commitFinalState`（run 完了後 best-effort finalize、D5）の fail-closed 化。throw しない設計は意図的（state は branch 回収可能）。本 request では触れない。
- changed-files **読み取り**経路（`listChangedFiles` の fail-open）— 別 request で着地済み。
- 新しい StepHalt kind の追加。既存 `makeCommitFailHalt` の `failed`（infra 失敗は human note で resume 不能な terminal）を再利用。
- push retry / `pushFailedError` の**挙動**（不変）。`pushOnly` の retry 回数・throw する error は変えない。
- managed runtime の commit 経路（managed agent 自前 commit。`commitAndPush` は local 専用）。
- `architecture/`（`model.md` §4 / `conformance.md` / `core-invariants.test.ts`）の変更（§ D5 で不要と判断）。`specrunner/adr/` の追加（adr: false）。

## Decisions

### D1 — stage / diff / commit 失敗用の error factory を `errors.ts` に新設する（既存を再利用しない）（G1）

`src/errors.ts` に error code と factory を追加する:

- `ERROR_CODES.COMMIT_AND_PUSH_FAILED = "COMMIT_AND_PUSH_FAILED"`。
- factory `commitEffectFailedError(label: string, branch: string, operation: "stage" | "diff" | "commit", detail: string): SpecRunnerError`。code は `COMMIT_AND_PUSH_FAILED`、message に `label` / `operation` / `branch` / `detail` を含め、hint は index.lock / disk / worktree 破損の点検と `specrunner job resume` を促す（`pushFailedError` と同型）。

`label` は Path A では `step.name`、Path B では `commitScopedPaths` の `commitMessage`（例 `custom-reviewers: <slug>`）を渡す。これは `pushOnly` が既に `commitMessage` を stepName ラベルとして使っている（`commit-push.ts:181`）のと同じ扱い。

**Rationale — なぜ新設か（既存 factory 却下）**:

- `notGitRepoError()`（`errors.ts:140-146`、code `NOT_GIT_REPO`、exit 2）は「Not a git repository.」を**再主張**する。`commitAndPush` は local 専用で常に worktree 上、非 git repo は実在しない — この framing こそ本 request が却下する対象。再利用は fail-open の framing を error message 側に温存するため却下。
- `noCommitDetectedError(stepName, branch)`（`errors.ts:220-226`、code `NO_COMMIT_DETECTED`）は「agent が staged 変更を produce しなかった」＝**正当 no-op 側**の意味。git 操作失敗ではない。却下。
- `pushFailedError`（`errors.ts:228-234`）は push 専用（不変）。stage / commit には流用しない。

**なぜ code を `COMMIT_AND_PUSH_FAILED` に統一するか**:

- `makeCommitFailHalt` は `err.code ?? "COMMIT_AND_PUSH_FAILED"`（`step-halt.ts:311`）。thrown `SpecRunnerError` は必ず code を持つため、halt code = factory の code になる。受け入れ基準は「`git add` exit≠0 → halt（`COMMIT_AND_PUSH_FAILED` / `failed`）」と code を**名指し**しているので、factory の code を `COMMIT_AND_PUSH_FAILED` に統一すれば字義どおり満たせる。stage / diff / commit の区別は `operation` を含む **message** が担う（code の粒度は上げない）。
- `COMMIT_AND_PUSH_FAILED` は現状 ERROR_CODES に未登録の「`makeCommitFailHalt` の default 文字列」だが、既に test（`executor-commit-mutex.test.ts:259`）が halt code として使う実績がある。ERROR_CODES へ正式登録して magic string を解消する。

**Alternatives considered**:

- *operation ごとに別 code（`GIT_STAGE_FAILED` / `GIT_COMMIT_FAILED` 等）*: halt code が site ごとに変わり、受け入れ基準の `COMMIT_AND_PUSH_FAILED` 名指しと齟齬。診断粒度は message で足りる。却下。
- *3 つの独立 factory（`stageFailedError` / `diffFailedError` / `commitFailedError`）*: `pushFailedError と同型`の単一 parameterized factory の方が DRY で test も一本化できる。単一 factory + `operation` 引数を採用。

### D2 — `commitAndPush` で git 操作失敗を throw、正当 no-op / self-commit を保存する（G2 / G3）

`commit-push.ts` `commitAndPush`（33-76）を次の分岐に変える（正当経路の観測挙動は不変、失敗経路のみ silent → throw）:

- `git add -A`: 失敗（spawn 失敗 or exit≠0）→ `commitEffectFailedError(step.name, branch, "stage", …)` を **throw**（44-50 の silent return を廃止）。
- `git diff --cached --quiet`: **spawn 失敗 or exit≥2 → `commitEffectFailedError(step.name, branch, "diff", …)` を throw**。exit 0 → staged 変更なし（下の no-op / self-commit 判定へ）。exit 1 → staged 変更あり（commit へ）。
- 変更なし（diff exit 0）分岐（57-68）は**不変**: HEAD 前進あり（agent 自己 commit）→ `pushOnly`、HEAD 前進なし → silent no-op（return）。
- `git commit`: **exit code を検査**する呼び方に変える（`gitExec` は null 返しで失敗を検知できない）。失敗（spawn 失敗 or exit≠0）→ `commitEffectFailedError(step.name, branch, "commit", …)` を **throw**し、`pushOnly` を**呼ばない**（72 の結果無視を廃止）。成功時のみ `pushOnly`（75、不変）。

throw は Path A（`finalizeStepArtifacts` の `.catch` → `makeCommitFailHalt` → `commitHalt` → **failed**）で適用される。

**Rationale**: 「正当 no-op」と「操作失敗」の唯一の分離軸は diff の exit（0 / 1 / ≥2）と add / commit の exit≠0。commit は exit code を取らないと失敗を無視して push へ進む現バグが消えない。既存の HEAD 前進判定（self-commit → pushOnly）と silent no-op（tool 完了で file 書き込み無し）は観測挙動を変えず保存する（refactor-preserve-behavior）。

**Alternatives considered**:

- *`git add` exit≠0 を「非 git repo なので no-op」として silent skip 維持*: architect 却下済み。local 専用 = 常に worktree 上、operational failure を隠す。fail-closed へ。

### D3 — `commitScopedPaths` も同じ分離。round では既存 safety net に相乗りする（try/catch を新設しない）（G2 / G3 / G4）

`commit-push.ts` `commitScopedPaths`（155-182）を D2 と同型に変える:

- empty（162）→ 不変（no-op）。
- `git add -A -- <paths>`: 失敗 → `commitEffectFailedError(commitMessage, branch, "stage", …)` を throw（166-169 の silent return 廃止。scoped `git add -A -- <paths>` 自体は不変 = B-15 保持）。
- `git diff --cached --quiet`: spawn 失敗 or exit≥2 → `"diff"` throw。exit 0 → no-op（return、不変）。exit 1 → commit。
- `git commit`: exit code 検査。失敗 → `"commit"` throw（`pushOnly` を呼ばない）。成功時のみ `pushOnly`（181、不変）。

**round 側（`parallel-review-round.ts:282`）には手を入れない**。`commitScopedPaths` の throw は現状 `pushFailedError` が乗っているのと**同一の既存経路**（`run()` を素通り → `pipeline.ts:259` を素通り → `Pipeline.run()` 外側 safety net → `awaiting-resume`）に乗る。

**Rationale — なぜ round に try/catch を足さないか（新機構ゼロ）**:

- Path B の commit（`commitRoundArtifacts`）は executor の `finalizeStepArtifacts` の**外**にあるため `makeCommitFailHalt` には構造的に到達しない。round の単一書き込みは `CommitOrchestrator.commitRound`（batch）であり、`commitHalt`（single step 用）を round に混ぜるのは B-13/B-15 の round 所有モデルに対する**新パターン**になる。
- round に try/catch を足して `roundError` escalation（`ROUND_INSPECTION_UNAVAILABLE` 型）へ写像する案（下記 Alt）は、**`commitScopedPaths → pushOnly` の `pushFailedError` も同時に捕捉**してしまい、その round 着地を safety net から roundError escalation へ**変えてしまう**。これは「`pushFailedError` の挙動不変」に抵触する。code で選別 rethrow するのは code smell。
- 何もしない（safety net 相乗り）と、round の 4 つの git 副作用失敗（add / diff / commit / push）が**すべて同一経路**に落ち、対称かつ挙動保存的。request の「新 halt 機構を足さない」を最小に満たす。

**帰結（正直な非対称）**: Path A の git 副作用失敗は **failed**（terminal）、Path B は **awaiting-resume**（safety net、`PIPELINE_UNHANDLED_ERROR`、原因文字列は保存）に落ちる。この非対称は本 request で新設するものではなく、`pushFailedError` が既に体現している現状。round の member 結果は commit 前 throw で persist されない（`pushFailedError` の round 着地と同じ）が、resume で fan-out が再実行され再現される（冪等）。

**Alternatives considered**:

- *`parallel-review-round.ts:282` を try/catch で包み、catch → `aggregateVerdictResult="escalation"` + `roundError = {code:"COMMIT_AND_PUSH_FAILED", …}` + `inspectionEscalated=true`（member を pending 保持）→ `commitRound` で persist*: `round-inspection-fail-closed`（D4）の blessed pattern と一貫し、member 結果を persist でき、git 固有 code で escalation できる利点がある。**しかし** `pushFailedError` も捕捉して挙動を変えるため（scope 外）却下。この案は本 request の scope を超える bounded follow-up として Open Questions に残す。

### D4 — spawn 成否と exit code を分離する helper を `git-exec.ts` に追加する（要件 5）（G2）

`src/util/git-exec.ts` に追加:

- `gitExecResult(spawnFn, cwd, args): Promise<{ ok: boolean; exitCode: number }>`。`runSubprocess`（spawn 例外で reject）を try/catch し、成功 → `{ ok:true, exitCode }`、spawn 例外 → `{ ok:false, exitCode:-1 }`。throw しない。

`commit-push.ts` の add / diff / commit の判定は `gitExecResult` を使う:

- add / commit: `const r = …; if (!r.ok || r.exitCode !== 0) throw commitEffectFailedError(…)`。
- diff: `if (!r.ok || r.exitCode >= 2) throw …("diff",…); const hasChanges = r.exitCode === 1;`（exit 0 → no-op）。

`pushOnly`（push）は `gitExecExitCode`（spawn 失敗→1＝push 失敗扱い→retry→`pushFailedError`）**のまま不変**。`rev-parse HEAD`（HEAD 前進判定、`commit-push.ts:59`）は `gitExec`（null 返し）**のまま不変**。`gitExecExitCode` / `gitExec` 自体のシグネチャ・既存 caller は変更しない（churn ゼロ）。

**Rationale**: diff の「exit≥2＝git エラー」判定を、spawn 失敗（`gitExecExitCode` では 1＝「変更あり」に潰れる）から明示的に分離する。add-first の実行順に依存せず、各 site が spawn 失敗を「その操作の失敗」として正しく throw する。新 helper は additive で既存 helper・test を壊さない。

**Alternatives considered**:

- *diff だけ helper を変え、add/commit は `gitExecExitCode`（exit≠0 で spawn 失敗も 1 として捕捉）*: 機能上は add-first 順で足りるが、site ごとに helper が不揃いで読みにくい。3 site 一律 `gitExecResult` が明快。
- *`gitExecExitCode` を `{ok,exitCode}` 返しに改造*: 既存 caller（push 等）と test を巻き込む破壊的変更。additive な新 helper を採る。

### D5 — `architecture/` は変更しない。ADR も追加しない（要件 c）

本変更は既存 invariant を**違反も新設もしない**ため、`model.md` §4 / `conformance.md` / `core-invariants.test.ts` への反映は不要と判断する:

- **B-13 / B-14**（`StepExecutor` が store mutation / `transitionJob` / `attachStateAndRethrow` を直接呼ばない）: 本変更は throw を `commit-push.ts` に足すだけで、`executor.ts` に store / transition 呼び出しを**足さない**。Path A は既存の `executor.ts:449` `makeCommitFailHalt` 経由、Path B は `pipeline.ts` の safety net 経由。B-13/B-14 の grep 対象（`executor.ts`）は不変。
- **B-15**（round git 副作用の coordinator 所有、scoped stage）: `commitScopedPaths` は `git add -A -- <paths>` を保持。`parallel-review-round.ts` は無改変。B-15 の grep 対象は不変。
- **D2**（失敗遷移の単一適用 = `StepHalt`）: 適用**器**（`makeCommitFailHalt` / safety net）は不変で、適用**対象（失敗 site）**が silent だったものを typed throw に変えるだけ。D2 は「誰が適用するか」の原則であり、失敗 site の列挙を持つ grep 不変ではない。新 kind / 新適用点を作らないため §4 反映は不要。

`round-inspection-fail-closed` は **新** invariant B-15 を提案したため §4 反映を（merge 後 attended に）残したが、本 request は新 invariant を提案しないため、そもそも反映すべき対象が無い。adr: false は妥当。

**Rationale**: trust-root（`architecture/`）を in-loop で触らない原則を保ち、かつ本変更が既存不変の枠内に収まることを明示する。conformance step が異議を示せば escalation で見直すが、design 判断としては不要。

## Risks / Trade-offs

- **[Risk] Path A / Path B の terminal state 非対称**（failed vs awaiting-resume）→ レビューで「片方だけ failed なのは一貫性欠如」と映り得る。**Mitigation**: この非対称は現状 `pushFailedError` が既に体現しており本 request で新設しない。両経路とも「silent 成功扱い」を廃し fail-closed 化する主眼は達成。統一するなら D3 Alt（round→roundError escalation）だが `pushFailedError` scope に抵触するため別 request（Open Questions）。
- **[Risk] round commit throw で member 結果が persist されない** → resume で fan-out 全再実行。**Mitigation**: `pushFailedError` の round 着地と同一挙動で回帰なし。member は冪等再実行され、round は再検査を通らない限り approved 確定しない。
- **[Risk] 一時的 git 失敗（index.lock 競合等）で step / round が止まる** → 頻度が上がり得る。**Mitigation**: 検査できていない / commit できていない状態を silent に success に落とすより、止めて resume で人が確認する方が安全（fail-closed の意図）。`detail` を message に載せ診断可能にする。`pushOnly` の retry は不変。
- **[Trade-off] halt code を `COMMIT_AND_PUSH_FAILED` に統一**（stage/diff/commit を code で区別しない）→ 診断は message の `operation` に依存。受け入れ基準の code 名指しと `makeCommitFailHalt` default との一致を優先した意図的選択。
- **[Risk] fail-open を固定する既存 test の取りこぼし** → throw に変える差分で silent-skip を期待する test が red 化する。**Mitigation**: 対象 test を tasks で名指し列挙（`commit-and-push.test.ts` TC-CAP-008/009、`commit-scoped-paths.test.ts` Branch-2）。round-level fake test（`parallel-review-round-git-effects.test.ts`）は fake `commitRoundArtifacts` を使い実 `commitScopedPaths` を呼ばないため影響なし（確認済み）。

## Open Questions

- **round 失敗の着地を safety net から `roundError` escalation（D3 Alt）へ統一するか**: architect は「既存 `makeCommitFailHalt` 経路へ流す・新機構ゼロ」を採用済み。本 design は Path B について「`pushFailedError` が今日乗る safety net に相乗り（新機構ゼロ）」と解釈した。もし spec-review / conformance が「round の git 副作用失敗も `round-inspection-fail-closed` D4 と同型の `roundError` escalation で受けるべき（terminal state を Path A と揃える）」と判断するなら、それは `pushFailedError` の round 着地も変える bounded follow-up であり、本 request の scope（pushFailedError 不変）を超える。escalation で本 request に取り込むか別 request に切るかを判断する。
