# Design: approvedAtCommit を「reviewed source revision」として contract で固定し、round invalidation から pipeline 管理 path を除外する

## Context

並列 custom reviewer は round 単位で fan-out される（`ParallelReviewRound.run`、`src/core/pipeline/parallel-review-round.ts`）。member が approve すると、その member の `approvedAtCommit` に round completion 時点の `headSha` が保存される（`applyRoundResults`、`src/core/pipeline/reviewer-status.ts:106-136`）。次 round の冒頭で、approved な各 member について `listChangedFiles(approvedAtCommit, cwd, branch)` を取り、`computeInvalidations` で「fixer が reviewer の activation path を触ったか」を判定して invalidation（approved → pending）を決める（`parallel-review-round.ts:106-128`）。

### 現状の構造

- **approvedAtCommit の保存**: `applyRoundResults` が approved verdict の member に `approvedAtCommit = headSha` を書く（`reviewer-status.ts:115-121`）。
- **headSha の capture 位置**: fan-out（member 実行）**後**・round findings commit（`commitRoundArtifacts`）**前**に capture される（`parallel-review-round.ts:187-189` の `captureHeadSha` → L217-281 の git effects → L290-292 の `applyRoundResults`）。`roundOwnsGitEffects = true` のため member は commit しない。よって capture 時点の HEAD は **member がレビューした source revision に等しい**（de-facto 既に意味 (a)）。ただしこの意味は暗黙で、コード上の契約として固定されていない。
- **invalidation の diff**: `listChangedFiles`（`src/core/runtime/local.ts:695-710`）は `git diff --name-only <approvedAtCommit>...HEAD`。`approvedAtCommit` から現在 HEAD までには **前 round 自身の findings commit（`specrunner/changes/<slug>/...`）が挟まる**ため、この diff には pipeline 管理成果物が含まれる。
- **computeInvalidations の照合**: `evaluateActivation({ paths: activationPaths }, { changedFiles: touchedFiles, requestType })`（`reviewer-status.ts:196-223`）。`activationPaths` が broad（`specrunner/changes/**` や `**` にマッチ）だと、自分の findings commit が `touchedFiles` に現れて **spurious に invalidate** する。
- **always-activate reviewer**: `activationPaths` が undefined の member は、`evaluateActivation` が `changedFiles` を見ずに `activated: true` を返す（`src/core/reviewers/activation.ts:62`）ため、`touchedFiles` の中身に関係なく常に invalidate する。

### 参照可能な既存パターン

- `readSourceRevision`（`src/git/source-revision.ts`）は `git rev-list -1 HEAD -- . :(exclude)specrunner/changes/` で「change folder 外の最新 commit」= source revision を求める。`changesDirRel()`（`src/util/paths.ts:91` → `"specrunner/changes"`）配下を除外して source を切り出す原則が既にある。
- `round-git-scope.ts`（`src/core/pipeline/round-git-scope.ts`）は round-scoped な pure path 関数群（`pipelineManagedPaths` / `partitionRoundChanges`）の置き場で、`util/paths.ts` を import する。ただし `pipelineManagedPaths(slug)` は `state.json` / `events.jsonl` / `usage.json` の **3 ファイル限定**であり、findings（`<name>-result-NNN.md` 等）は含まない。invalidation で必要な除外は `changesDirRel()` **配下全体**であり、これより広い。

### 構造的曖昧さ

`approvedAtCommit` の意味が「reviewed source revision」なのか「round commit revision」なのか、コード上に固定された契約が無い。実装は de-facto (a) だが、invalidation ロジックはその diff に round 自身の findings commit を含めたまま照合しており、broad-activation reviewer が自己成果物で invalidate されうる。意味と実装が一致していない。

## Goals / Non-Goals

**Goals**:

- `approvedAtCommit` の意味を「reviewed source revision（round 自身の findings commit を含まない、review 時点の HEAD）」として **contract test で固定**する（要件 1）。
- round invalidation の `touched` files から pipeline 管理 path（`changesDirRel()` 配下）を除外してから activation 照合する。round 自身の findings commit のみの変更で path-constrained reviewer（broad-activation 含む）が invalidate されないようにする（要件 2 / 本 request の主眼）。
- 真の source 変更（fixer が reviewer の source activation path を触る）では従来どおり invalidate する（要件 3）。always-activate reviewer（`activationPaths` undefined）は従来どおり常に invalidate する（要件 4、挙動保存）。

**Non-Goals**:

- `listChangedFiles` seam 自体の変更。`src/core/pipeline/scope.ts` / `src/core/pipeline/runtime-capability-gate.ts` の consumer に副作用を出さない。invalidation 固有の除外は invalidation site に閉じる。
- 逐次経路の変更（invalidation は round 限定。`computeInvalidations` の呼び出し元は `parallel-review-round.ts` のみ）。
- managed runtime の並列 custom reviewer 対応（既知 Non-Goal。`listChangedFiles` が `[]` を返し invalidation 不発になる挙動は不変）。
- `architecture/` § 4 への昇格。本件は contract/behavior test であり architecture invariant ではない（ADR-20260713 の teeth/contract 分担 — `approvedAtCommit` の意味は contract が守る）。`computeInvalidations` / `evaluateActivation` / `applyRoundResults` のロジックは変更しない。

## Decisions

### D1 — `approvedAtCommit` = reviewed source revision を contract test で固定する（意味 (a) の採用）

`approvedAtCommit` に保存される `headSha` は、fan-out 後・findings commit 前に capture される（現状の capture 位置は不変）。`roundOwnsGitEffects` で member は commit しないため、この値は review 時点の source revision に等しい。この de-facto 挙動を **contract test で固定**する:

- round が member を新規 approve するとき、保存される `approvedAtCommit` は round 自身の findings commit **より前**の HEAD であること（= その round の findings commit を含まないこと）を、observable な事実で検証する。
- 具体的には、`captureHeadSha` が返す HEAD を stateful に進める fake（`commitRoundArtifacts` が呼ばれた時点で HEAD が「round-commit revision」に進む）を用意し、`applyRoundResults` が保存した `approvedAtCommit` が **commit 前の revision** であって「round-commit revision」ではないことを固定する。

**Rationale**: 意味を固定するのは「値がどこで capture されるか（findings commit の前）」という順序契約であり、これを observable にすれば、将来 capture 位置が findings commit 後へ移る（意味 (b) 化する）回帰を機械が検出できる。実装変更を伴わず、既存挙動を契約として彫り込むのが最小。

**Alternatives considered**:

- *意味 (b)「round commit revision」を採用し、findings commit 後に capture する*: round 自身の findings commit を「変更」に含め、broad-activation reviewer を自己 invalidate させる曖昧さが残る（本 request が消したい欠陥そのもの）。却下。
- *`applyRoundResults` / capture 位置を書き換えて意味を再定義する*: 現状が既に (a) であり、書き換えは挙動変更（回帰リスク）を導入する。契約 test で現状を固定するだけで足りる。却下。

### D2 — invalidation site で `touched` から `changesDirRel()` 配下を除外する pure filter を追加する

`parallel-review-round.ts` の invalidation ループ（L112-126）で、`listChangedFiles(approvedAtCommit, ...)` の結果を `computeInvalidations` へ渡す **前** に、pipeline 管理 path（`changesDirRel()` 配下）を除外する pure filter を通す:

```
touched = listChangedFiles(approvedAtCommit, cwd, branch)
sourceTouched = <filter: changesDirRel() 配下を除外>
computeInvalidations([s], sourceTouched, requestType, currentHeadSha)
```

filter は pure function として `round-git-scope.ts` に追加する（`pipelineManagedPaths` / `partitionRoundChanges` と同じ round-scoped pure module。`util/paths.ts` の `changesDirRel()` を再利用）。除外条件は「path が `changesDirRel()` 自身、または `changesDirRel() + "/"` を prefix に持つ」= change folder（active / archive / canceled すべて）配下。

`listChangedFiles`（seam）と `computeInvalidations`（照合ロジック）は **変えない**。除外は invalidation site（`parallel-review-round.ts`）でのみ適用され、他の `listChangedFiles` consumer（`scope.ts` / `runtime-capability-gate.ts`）には波及しない。

**Rationale**: `readSourceRevision` の `:(exclude)specrunner/changes/` と同一原則（「source = change folder 外」）を invalidation diff にも適用する。除外を pure function に切り出すことで git / executor 非依存で intended-invariant を固定でき、`computeInvalidations` の既存契約（`touchedFiles` は source-scoped 済という前提）を保ったまま照合の入力だけを正す。`pipelineManagedPaths(slug)`（3 ファイル限定）ではなく `changesDirRel()` prefix を使うのは、findings（`<name>-result-NNN.md` 等）を含む change folder 全体を除外する必要があるため。

**Alternatives considered**:

- *`listChangedFiles` にグローバルな exclude（`:(exclude)specrunner/changes/`）を足す*: `scope.ts` / `runtime-capability-gate.ts` の consumer の挙動を変える blast radius。scope-check 系は「宣言範囲逸脱」を change folder 込みで見ており、そこから pipeline 管理 path を隠すと別の判定が壊れうる。invalidation 固有の関心は invalidation site で閉じる。却下。
- *`computeInvalidations` 内部で除外する*: `computeInvalidations` は「engine が diff を取得し、pure に照合する」責務分担（`reviewer-status.ts:178-185` のコメント）で、diff 取得は engine 側。除外も engine 側（invalidation site）に置くのが責務分担に沿う。加えて `computeInvalidations` の既存 unit test を無改変に保てる。却下。
- *`pipelineManagedPaths(slug)` を流用する*: 対象が 3 ファイルに限定され、findings（`<name>-result-NNN.md`）を除外できない。`changesDirRel()` prefix が必要。却下。

### D3 — `computeInvalidations` / `evaluateActivation` / always-activate 挙動は不変に保つ

除外は「照合入力（`touchedFiles`）を source-scoped にする」ことに閉じ、照合ロジック（`computeInvalidations` / `evaluateActivation`）は一切変えない。帰結:

- **真の source 変更**（fixer が `src/**` 等 reviewer の activation source path を触る）: その path は `changesDirRel()` 配下ではないので filter を通過し、従来どおり match → invalidate（要件 3）。
- **always-activate reviewer**（`activationPaths` undefined）: `evaluateActivation` が `changedFiles` を見ずに `activated: true` を返すため、filter で `sourceTouched` が `[]` になっても従来どおり invalidate（要件 4、挙動保存）。
- **broad-activation reviewer**（`activationPaths` が `specrunner/changes/**` / `**` 等）で **findings のみ変更**: filter 後 `sourceTouched` から change folder path が消え、match するものが無くなる → invalidate されない（要件 2）。source 変更が別途あればその path で従来どおり match → invalidate。

**Rationale**: 挙動保存（要件 4）と主眼（要件 2）を両立させる最小の切り分けは「照合入力を正す」ことであり、`evaluateActivation` の always-activate 分岐（`activation.ts:61-64`）を変えないことで挙動保存が自動的に成立する。

**Alternatives considered**:

- *always-activate を「source 変更が無ければ invalidate しない」に変える*: 要件 4（挙動保存）に反する。always-activate は「常に再レビュー」の意図であり、本 request の対象外。却下。

## Risks / Trade-offs

- **[Risk] 除外 prefix の境界誤り** → `changesDirRel()` は `"specrunner/changes"`（trailing slash なし）。単純な `startsWith("specrunner/changes")` は `specrunner/changes-other/...` のような同 prefix 別ディレクトリを誤除外しうる。→ **Mitigation**: 除外条件を「`file === changesDirRel()` または `file.startsWith(changesDirRel() + "/")`」とし、pure filter の unit test で境界（`specrunner/changes-not-a-child/...` は保持）を固定する。
- **[Risk] source が `specrunner/changes/` 配下に居るケースの誤除外** → reviewer の source activation path が `specrunner/changes/` 配下を指すと、その変更まで除外され invalidation が漏れる。→ **Mitigation**: `specrunner/changes/` 配下は定義上すべて pipeline 管理成果物（findings / state / request.md）であり、review 対象 source は `src/` や `specrunner/{reviewers,rules,project.md}` 等、change folder 外に存在する。`readSourceRevision` も同じ前提で source を切り出しており、原則は一貫。
- **[Risk] 挙動保存の見落とし（always-activate の回帰）** → filter 追加により always-activate reviewer が invalidate されなくなる回帰。→ **Mitigation**: 要件 4 を明示的な behavior test（`sourceTouched = []` でも always-activate は invalidate）で固定する。
- **[Trade-off] contract test が capture 位置に依存** → D1 の contract test は「findings commit 前に capture」という順序に依存する。capture 位置を将来動かすと test が落ちるが、それは意味 (a) を守るための意図した歯であり許容する。

## Open Questions

なし（architect 評価済みの設計判断で確定。意味 (a) 採用・invalidation site での `changesDirRel()` 除外・`listChangedFiles` seam 不変が確定事項）。
