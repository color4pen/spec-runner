# approvedAtCommit を「レビュー対象 source revision」として contract test で固定し、round invalidation から pipeline 管理 path を除外する

## Meta

- **type**: spec-change
- **slug**: round-invalidation-source-scoped
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

<!-- adr: 既存 round invalidation の挙動を refine する範囲であり、新しい port/pattern の導入ではないため false。approvedAtCommit の意味は ADR-20260713 の teeth/contract 分担で contract が守る（architecture invariant でない）。 -->

## 背景

並列 round では、reviewer 実行後・round 成果物 commit 前の HEAD を `approvedAtCommit` として保存し、次回 round の invalidation で `approvedAtCommit..HEAD` の変更ファイルが reviewer の activation path に触れたかを見る。

しかしこの diff には **round 自身が作った findings commit（`specrunner/changes/<slug>/...` などの pipeline 管理成果物）が含まれ得る**。activation path が広い reviewer は、自分の成果物 commit を「変更」として観測し、spurious に invalidate されうる。不具合と断定するほどではないが、`approvedAtCommit` の意味が曖昧なまま invalidation ロジックが依存している。

本 request は `approvedAtCommit` の意味を **「レビュー対象の source revision」** として contract test で固定し、invalidation の対象から pipeline 管理 path を除外して意味と実装を一致させる。

## 現状コードの前提

- `approvedAtCommit` は approve 時に `headSha` を保存する（`src/core/pipeline/reviewer-status.ts:119`）。
- `headSha` は members 実行後・round findings commit 前に capture される（`src/core/pipeline/parallel-review-round.ts:187-189`）。`roundOwnsGitEffects` で member は commit しないため、この値は **review 対象の source revision に等しい**（de-facto 既に意味(a)）。
- 次 round の invalidation: 各 approved member について `listChangedFiles(approvedAtCommit, cwd, branch)` → `computeInvalidations`（`src/core/pipeline/parallel-review-round.ts:112-127`）。
- `listChangedFiles`（`src/core/runtime/local.ts:695-699`）は `git diff --name-only <approvedAtCommit>...HEAD` で、**pipeline 管理 path を除外しない** → `touched` に round 自身の findings commit（`specrunner/changes/...`）が含まれる。
- `computeInvalidations`（`src/core/pipeline/reviewer-status.ts:196-223`）: `evaluateActivation({paths: activationPaths}, {changedFiles: touchedFiles, requestType})`。activationPaths が broad（`specrunner/changes/` にマッチ）だと自分の findings commit で spurious invalidate する。**always-activate reviewer（activationPaths undefined）は touchedFiles に関係なく常に invalidate する**（`reviewer-status.ts:184-189`）。
- `listChangedFiles` は `src/core/pipeline/scope.ts` / `src/core/pipeline/runtime-capability-gate.ts` も consume する（seam のグローバル変更は不可）。`computeInvalidations` は `parallel-review-round.ts` のみが呼ぶ（invalidation は round 限定）。
- `changesDirRel()`（`src/util/paths.ts:91`）= `"specrunner/changes"`（pipeline 管理 path の rel prefix）。

## 要件

1. `approvedAtCommit` の意味を「レビュー対象の source revision（round 自身の findings commit を含まない、review 時点の HEAD）」として **contract test で固定**する。
2. round invalidation の `touched` files から pipeline 管理 path（`changesDirRel()` 配下）を除外してから activation 照合する。round 自身の findings commit のみの変更で path-constrained reviewer（broad-activation 含む）が invalidate されないようにする。filter は invalidation site（`parallel-review-round.ts`）に置き、`listChangedFiles` seam は変えない。
3. 真の source 変更（fixer が reviewer の source activation path を触る）では従来どおり invalidate する。always-activate reviewer（activationPaths undefined）は従来どおり常に invalidate する（touchedFiles 非依存）。

## スコープ外

- `listChangedFiles` seam 自体の変更（`scope.ts` / `runtime-capability-gate.ts` の consumer に副作用）。invalidation 固有の除外は invalidation site で閉じる。
- 逐次経路（invalidation は round 限定）。
- managed runtime の parallel custom reviewer（Non-Goal。`listChangedFiles` が `[]` を返し invalidation 不発になる挙動は不変）。
- `architecture/` § 4 への昇格。本件は contract/behavior test であり architecture invariant ではない（ADR-20260713 の teeth/contract 分担どおり — `approvedAtCommit` の意味は contract が守る）。

## 受け入れ基準

- [ ] `approvedAtCommit` が round findings commit を含まない reviewed source revision であることを contract test で固定する。
- [ ] pipeline 管理 path（`specrunner/changes/` 配下）**のみ**が変更された場合、path-constrained reviewer（broad-activation 含む）が invalidate されないことをテストで固定する（本 request の主眼）。
- [ ] 真の source 変更（reviewer の activation source path を fixer が触る）では従来どおり invalidate することをテストで固定する。
- [ ] always-activate reviewer（activationPaths undefined）が従来どおり常に invalidate することをテストで固定する（挙動保存）。
- [ ] `listChangedFiles` seam の挙動が不変で、scope-check 系の既存テストが無変更で green。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **採用**: 意味 (a)「reviewed source revision」。`headSha` が findings commit 前に capture され member も commit しない（`roundOwnsGitEffects`）ため de-facto 既にこの意味。曖昧さを contract test で固定する。
- **採用**: invalidation diff から pipeline 管理 path を除外する（`changesDirRel()` 再利用、`attestation-source-binding` の `:(exclude)specrunner/changes/` と同一原則）。filter は engine invalidation site（`parallel-review-round.ts`）に置き、`listChangedFiles` seam は変えない（`scope.ts` / `runtime-capability-gate.ts` consumer に副作用を出さない）。
- **却下**: 意味 (b)「round commit revision」。round 自身の findings commit を「変更」に含め、broad-activation reviewer を自己 invalidate させる曖昧さが残る。
- **却下**: `listChangedFiles` にグローバルな exclude を足す案。`scope.ts` / `runtime-capability-gate.ts` consumer の挙動を変える blast radius。invalidation 固有の関心は invalidation site で閉じる。
