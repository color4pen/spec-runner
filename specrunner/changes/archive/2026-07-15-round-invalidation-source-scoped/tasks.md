# Tasks: approvedAtCommit を reviewed source revision として固定し、round invalidation から pipeline 管理 path を除外する

> 実装順の原則: 中核契約（source-scoped 除外）は interface-stable な pure function なので、
> まず T-01 でその intended-invariant を固定する。除外を invalidation site へ配線（T-02）してから、
> 配線後の挙動に依存する contract / behavior test（T-03 / T-04）を置く。
> `listChangedFiles` seam・`computeInvalidations` / `evaluateActivation` のロジックは変更しない。
> `architecture/` 配下・`specrunner/adr/` 配下は変更しない（スコープ外）。

## T-01: change folder 除外の pure filter を追加し intended-invariant として固定する（D2）

- [x] `src/core/pipeline/round-git-scope.ts` に pure function を追加する（I/O なし、`util/paths.ts` の `changesDirRel()` を再利用）:
  - `excludeChangeFolderPaths(files: string[]): string[]` — `files` から change folder 配下の path を除外して返す。
  - 除外条件: `file === changesDirRel()`（= `"specrunner/changes"`）または `file.startsWith(`${changesDirRel()}/`)`。それ以外は保持する。
  - `pipelineManagedPaths(slug)`（3 ファイル限定）とは別関数とする。invalidation では findings（`<name>-result-NNN.md` 等）を含む change folder 全体を除外する必要があるため。
- [x] `src/core/pipeline/__tests__/round-git-scope.test.ts` に describe を追加して以下を固定する:
  - change folder 配下（`specrunner/changes/<slug>/<name>-result-001.md`、`specrunner/changes/<slug>/review-feedback-001.md`、`specrunner/changes/<slug>/state.json`）がすべて除外される。
  - change folder 外（`src/foo.ts`、`specrunner/reviewers/x.md`、`specrunner/project.md`）がすべて保持される。
  - 境界: 同 prefix 別ディレクトリ（`specrunner/changes-not-a-child/file.ts`）は **保持**される（誤除外しない）。
  - 空配列 → 空配列。全て change folder 配下 → `[]`。全て source → 入力と同一（順序保持）。

**Acceptance Criteria**:
- `excludeChangeFolderPaths` が `changesDirRel()` 配下のみを除外し、同 prefix 別ディレクトリを誤除外しない。
- test は git / executor に依存しない（pure function だけを駆動する）。
- `pipelineManagedPaths` / `partitionRoundChanges` の既存挙動は不変。

## T-02: invalidation site で touched を source-scoped にしてから照合する（D2 / D3）

- [x] `src/core/pipeline/parallel-review-round.ts` の invalidation ループ（L112-126）で、`listChangedFiles(s.approvedAtCommit, cwd, state.branch ?? null)` の結果を `computeInvalidations` へ渡す **前** に `excludeChangeFolderPaths(touched)` を通す:
  - `const touched = await deps.runtimeStrategy.listChangedFiles(...)`
  - `const sourceTouched = excludeChangeFolderPaths(touched)`
  - `const [invalidated] = computeInvalidations([s], sourceTouched, requestType, currentHeadSha)`
- [x] `round-git-scope.ts` からの import を追加する（既に `partitionRoundChanges` を import 済）。
- [x] `computeInvalidations`（`reviewer-status.ts`）・`evaluateActivation`（`activation.ts`）・`listChangedFiles`（`local.ts` / `runtime-strategy.ts`）は **変更しない**。除外は invalidation site のみに適用する。
- [x] `headSha` の capture 位置（`parallel-review-round.ts:187-189`、fan-out 後・`commitRoundArtifacts` 前）と `applyRoundResults` への受け渡しは **変更しない**（意味 (a) を維持）。

**Acceptance Criteria**:
- invalidation の照合入力が `changesDirRel()` 配下を含まない source-scoped な file list になる。
- `listChangedFiles` seam・`computeInvalidations` の signature / ロジックが不変で、`scope.ts` / `runtime-capability-gate.ts` の consumer に波及しない。
- `roundOwnsGitEffects` / `headSha` capture / `applyRoundResults` の呼び出し順が不変。

## T-03: approvedAtCommit = reviewed source revision の contract test（D1、要件 1）

- [x] `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts`（新規）に、`ParallelReviewRound.run` を fake で駆動する contract test を置く:
  - stateful な fake runtimeStrategy: `captureHeadSha` が現在の `head`（初期値 = source revision）を返し、`commitRoundArtifacts` が呼ばれた時点で `head` を別値（round-commit revision）へ進める。`listWorktreeChanges` は member の宣言出力を返し `commitRoundArtifacts` が実際に呼ばれる（= HEAD が進む）ようにする。
  - pending member を 1 つ用意し、その executor が `approved` を返す（fan-out → approve）。
  - **固定**: 永続化された `reviewerStatuses[member].approvedAtCommit` が **commit 前の source revision** に等しく、round-commit revision では **ない**こと。
- [x] 既存 `parallel-review-round-state-commit.test.ts` の fake 構築（`captureHeadSha` / `listChangedFiles` / `listWorktreeChanges` / `commitRoundArtifacts` を持つ fake、L166-201 付近）を参考に fixture を組む。

**Acceptance Criteria**:
- round が新規 approve した member の `approvedAtCommit` が、その round 自身の findings commit を含まない reviewed source revision であることが test で固定される。
- capture 位置が findings commit 後へ移る（意味 (b) 化する）回帰でこの test が落ちる。

## T-04: round invalidation の source-scoped 挙動 behavior test（D2 / D3、要件 2 / 3 / 4）

- [x] `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` に、`reviewerStatuses` に approved member を持つ base state から round を回す behavior test を置く。各シナリオで fake `listChangedFiles(approvedAtCommit)` の返り値を制御する:
  - **要件 2（主眼）**: approved member の `activationPaths` を broad（`["specrunner/changes/**"]`、および別ケースで `["**"]`）にし、`listChangedFiles` が **change folder path のみ**（例: `specrunner/changes/<slug>/<name>-result-001.md`）を返す → member が `approved` のまま invalidate されず、fan-out で **再実行されない**（pending が空 = all-approved fast path、executor spy が呼ばれない）ことを固定する。
  - **要件 3**: approved member の `activationPaths: ["src/**"]` にし、`listChangedFiles` が source path（`src/foo.ts`）＋ change folder path を返す → member が `pending` に戻り、fan-out で **再実行される**（executor spy が member について呼ばれる）ことを固定する。
  - **要件 4（挙動保存）**: approved member の `activationPaths: undefined`（always-activate）にし、`listChangedFiles` が **change folder path のみ**を返す（source-scoped 後は空）→ member が従来どおり `pending` に戻り、fan-out で **再実行される**ことを固定する。
- [x] 再実行の有無は、pending member を fan-out に流す executor の呼び出し（member 名で呼ばれたか）で観測する。再実行される member の executor 返り値は挙動を安定させるため `needs-fix` 等の固定 verdict を用いてよい（invalidation の観測が主眼）。

**Acceptance Criteria**:
- change folder path のみが変更されたとき、path-constrained reviewer（`specrunner/changes/**` / `**` を含む broad-activation）が invalidate されないことが test で固定される。
- source activation path（`src/**`）が触られたときは従来どおり invalidate されることが test で固定される。
- always-activate reviewer（`activationPaths` undefined）が source-scoped touched が空でも従来どおり invalidate されることが test で固定される。

## T-05: 全体検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（新規・更新 test 含む、既存 `reviewer-status.test.ts` / `round-git-scope.test.ts` / `parallel-review-round-*.test.ts` / scope-check 系 test の regression なし）。
- [x] `listChangedFiles` seam が不変で、scope-check 系（`tests/unit/core/step/scope-escalation.test.ts` / `fast-scope-checkpoint.test.ts` / `tests/unit/runtime/list-changed-files.test.ts` 等）が **無改変で green** であることを確認する。
- [x] 変更ファイルが `src/core/pipeline/round-git-scope.ts` / `src/core/pipeline/parallel-review-round.ts` と対応 test（`round-git-scope.test.ts` / `parallel-review-round-invalidation.test.ts`）に限られることを確認する。
- [x] `architecture/` 配下・`specrunner/adr/` 配下・`src/core/pipeline/reviewer-status.ts` / `src/core/reviewers/activation.ts` / `src/core/runtime/local.ts` / `src/core/pipeline/scope.ts` / `src/core/pipeline/runtime-capability-gate.ts` に変更が無いことを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- `listChangedFiles` seam・`computeInvalidations` / `evaluateActivation` のロジックが不変。
- `architecture/` は不変（trust-root を out-of-loop に保つ）。
