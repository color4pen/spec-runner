# Cross-Boundary Invariants Review Evidence — Iteration 12

## Review scope

- `git diff main...HEAD --stat` で 193 files / 15791 insertions / 943 deletionsを確認した。
- `design.md`、`tasks.md`、operator 裁定、iteration 11 report を現在の branch head に対して読み直した。
- capability composition、port/domain dependency、StepExecutor、Pipeline、ParallelReviewRound、LocalRuntime の closure capture を、変更外の DSM delete-only ratchet、main-checkout drift guard、canonical store、egress ledger の前提まで追跡した。
- `verification-result.md` を既存 verification の正本として参照し、同じ build / typecheck / test / lint は再実行していない。

## Confirmed invariant-preserving paths

iteration 11 の main-checkout drift guard finding は解消済みである。`StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` と derive source は required になり、`noopStepArtifact` は `null` を明示的に返し、`StepExecutor` は method-presence で fail-open しない。

`LocalRuntime.buildStepArtifactCapability` は config、request、slug/stateRoot を build ごとの closure に捕捉しており、buildDeps(A) → buildDeps(B) → finalize(A) でも A の canonical store と commit context を使う。terminal publication の persist-before-publish と cwd fallback、step lifecycle、parallel round の inspect-before-scoped-commit も維持されている。

## Findings

### [high][fixable] Typed buildDeps が ports→domain DSM 違反を新しい allowlist で隠している

- File: `src/core/port/runtime-strategy.ts`
- Line: 36

`RuntimeStrategy.buildDeps(): PipelineDeps` を成立させるため、ports 層の `runtime-strategy.ts` が domain 層の `types.ts` を import している。一方 `types.ts` は同じ port から read-only capability 型を import するため、compile-time の相互依存であり、変更外の `architecture/model.md` が定める ports→domain 禁止 edge に該当する。`import type` が runtime SCC を作らないことは、この DSM closure 違反を許可する理由にはならない。実際に `tests/unit/architecture/arch-allowlist.ts` へ新しい `DSM` entry が追加され、delete-only ratchet の「allowlist は縮小のみ」という既存前提と operator item 3 の明示指示を破っている。architecture verification が green なのは edge が適合したためではなく、新規違反を allowlist したためである。

このままでは ports の再利用・移動・依存解析が domain aggregate の存在を暗黙に要求し、今後の R2c でも facade の composition-root 化を妨げる。`buildDeps` を composition-root-owned typed builder/adapter へ移し、port は domain `PipelineDeps` を参照しない構造にした上で、新規 DSM allowlist entry を削除する必要がある。

### [medium][fixable] use-case consumer が依然として全 PipelineDeps を required contract として受け取る

- File: `src/core/step/executor.ts`
- Line: 131

`StepExecutor.produceResult`（および内部メソッド）、`ParallelReviewRound.run` (`parallel-review-round.ts:91`)、`Pipeline.run` (`pipeline.ts:139`) はすべて full `PipelineDeps` を受け続けており、consumer-owned composite required contract が定義されていない。capability を aggregate の field に分けただけなので、StepExecutor は terminal/round capability、ParallelReviewRound は terminal capability、Pipeline は step/round capabilityへ型上到達でき、各 use case を構築する fake/composition も利用しない capability を含む full aggregate を満たす必要がある。

これは単なる公開面積の問題ではない。`ParallelReviewRound` は `{ ...deps, roundOwnsGitEffects: true }` を full `PipelineDeps` として member executor に転送しており、round coordinator と member execution の ownership 境界が型ではなく object spread と boolean convention に依存したままである。将来 full aggregate に追加された lifecycle capability/state が黙って member に伝播し、member code が coordinator-owned effect を呼べるという、今回の分割が除去すべき暗黙前提を残す。operator item 4 が要求した `StepExecutionDeps`、`ParallelReviewRoundDeps`、terminal lifecycle deps 相当へ各 signature を narrow し、境界で明示的に projection する必要がある。

## Observations

なし。

## Evidence referenced

- `src/core/port/runtime-strategy.ts:36`, `src/core/types.ts:7-10`: ports→domain→ports の型依存。
- `tests/unit/architecture/arch-allowlist.ts:286-306`: 今回追加された DSM allowlist と既存 delete-only governance。
- `architecture/model.md`, `architecture/conformance.md`, `architecture/divergence-status.md`: DSM closure と real divergence zero の既存前提。
- `src/core/step/executor.ts:128-132`, `src/core/pipeline/parallel-review-round.ts:88-92`, `src/core/pipeline/pipeline.ts:136-140`: full `PipelineDeps` consumer signatures。
- `src/core/pipeline/parallel-review-round.ts:232`: full aggregate spread による round member injection。
- `src/core/step/step-capability.ts`, `src/core/step/noop-capabilities.ts`, `src/core/step/executor.ts`: iteration 11 drift-guard 修正。
- `src/core/runtime/local.ts`: per-build closure capture と persist-before-push store ownership。
- `verification-result.md`: 既存 verification の green 証跡。

## Unverified

なし。
