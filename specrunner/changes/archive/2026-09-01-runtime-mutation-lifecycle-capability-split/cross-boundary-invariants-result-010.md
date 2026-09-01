# Cross-Boundary Invariants Review Evidence — Iteration 10

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## Review scope

- `git diff main...HEAD --stat` で 190 files / 15283 insertions / 879 deletionsを確認した。
- reviewer 定義、`design.md`、`tasks.md`、operator 裁定、iteration 9 report を読み直した。
- capability の型、composition root の注入、各 consumer の guard から、変更されていない input/output validation、main-checkout guard、egress ledger、canonical store の前提まで追跡した。
- `verification-result.md` を検証の正本として参照し、同じ build / typecheck / test / lint は再実行していない。

## Confirmed invariant-preserving paths

provider readiness、duplicate guard、bootstrap、workspace setup、initial persist/reload、dependency assembly、cleanup registration の順序は維持されている。step の prepare → input validation → agent → output validation → finalize、round-owned member の finalize skip、terminal publication の persist-before-publish、parallel round の inspect-before-scoped-commit も従来の順序を保っている。

`LocalRuntime.buildStepArtifactCapability` が `config` と `request` を build ごとの closure に捕捉するようになり、iteration 9 時点の last-built config/request の上書き問題は解消している。terminal publication の optional cwd は全 call site で `process.cwd()` fallback を維持している。

## Findings

### [high][fixable] Production-required safety capabilities can still be injected as undefined

- File: `src/core/types.ts`
- Line: 97

`stepArtifact`、`stepIo`、`terminalState`、`roundGitEffects` は property 自体を required にしたものの、型がすべて `Capability | undefined` のままである。さらに `snapshotMainCheckoutGuard` も `StepArtifactLifecycleCapability` 上で optional のままであり、consumer は optional chaining / presence guard で処理を黙って省略する。

Local/Managed の与 runtime が全 capability と main-checkout guard（unavailable は `null` で表現）を実装・注入する現在の production contract には capability-absent state がない。それにもかかわらず composition root の欠落が型検査を通り、input/output validation、step commit/push、terminal checkpoint publication、parallel-round HEAD/worktree inspection、main-checkout drift detection のいずれも green test のまま fail-open になり得る。これは、未変更の resume/egress/guard 機構が「これらの safety effect は production で必ず実行される」とする前提を破る。

Resolution: production の consumer-owned deps では4 capability を非 nullable required field とし、`snapshotMainCheckoutGuard` も required method にして unavailable を既存どおり `null` で表す。能力不在を検証する test は production deps を弱めず、明示的な test-only contract または no-op/unavailable capability を用いる。

### [medium][fixable] Per-build artifact capability still resolves ledger persistence through mutable last workspace state

- File: `src/core/runtime/local.ts`
- Line: 781

`buildStepArtifactCapability(A)` は A の config/request を closure に捕捉したが、finalize 時の `doFinalizeStepArtifacts` は `this.slugStoreOpts()` を呼び、そこでは mutable な `this.workspace` / `this.currentSlug` を参照する。したがって A の deps を構築した後に同じ runtime で workspace/setup + buildDeps(B) を行い、その後 A の capability を finalize すると、commit 自体は明示引数の A cwd/slug で行われる一方、synthesized commit の persist-before-push は B の canonical store options を使う。

その結果、A の commit OID が A の ledger に記録されず resume 時に `EGRESS_UNKNOWN_COMMIT` になり得るほか、B の store に A の jobId を組み合わせた load/persist が失敗して A の finalize/push を止め得る。新しい capability object が build ごとに安定した依存を保持するという境界と、未変更の egress ledger が commit と同一 job store へ persist されるという不変条件が一致していない。

Resolution: capability 構築時に A の `{ slug, stateRoot }`（または workspace）も immutable に捕捉し、`doFinalizeStepArtifacts` の persist callback へ明示的に渡す。finalize 経路から `this.slugStoreOpts()` による last-workspace lookup を除去し、A→B→finalize(A) の contract test で store ownership を固定する。

## Evidence referenced

- `src/core/types.ts`: production capability injection surface と undefined contract。
- `src/core/step/step-capability.ts`: optional main-checkout guard と finalize capability source。
- `src/core/step/executor.ts`: validation/finalize/guard の presence-based silent skip。
- `src/core/pipeline/pipeline.ts`, `src/core/pipeline/parallel-review-round.ts`, `src/core/command/runner.ts`: terminal / round safety effect の presence guards。
- `src/core/runtime/local.ts`: per-build closure、mutable workspace/currentSlug、persist-before-push ledger callback。
- `src/core/runtime/managed.ts`: production の capability/no-op injection。
- `src/core/step/commit-push.ts`: synthesized commit ledger と push ordering。
- `verification-result.md`:既存 verification の green 証跡。

## Unverified

なし。
