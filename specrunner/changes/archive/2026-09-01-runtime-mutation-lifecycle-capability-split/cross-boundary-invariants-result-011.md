# Cross-Boundary Invariants Review Evidence — Iteration 11

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## Review scope

- `git diff main...HEAD --stat` で 192 files / 15635 insertions / 921 deletionsを確認した。
- reviewer 定義、`design.md`、`tasks.md`、operator 裁定、iteration 10 report を現在の branch head に対して読み直した。
- capability の型と composition、StepExecutor の main-checkout guard、LocalRuntime の per-build store binding、terminal publication、parallel-round git effects を、それぞれ変更外の drift detection、egress ledger、canonical store の前提まで追跡した。
- `verification-result.md` を既存 verification の正本として参照し、同じ build / typecheck / test / lint は再実行していない。

## Confirmed invariant-preserving paths

provider readiness → duplicate guard → bootstrap → workspace setup → initial persist/reload → dependency assembly → cleanup registration の順序は維持されている。step の prepare → input validation → agent → output validation → finalize、round-owned member の finalize skip、terminal state の persist-before-publish、parallel round の inspect-before-scoped-commit も従来の順序を保っている。

iteration 10 の `LocalRuntime` finding は解消済みである。`buildStepArtifactCapability` は config/request に加えて `{ slug, stateRoot }` も build ごとの closure に捕捉し、finalize の synthesized-commit persist callback は `this.slugStoreOpts()` を参照しない。したがって buildDeps(A) → buildDeps(B) → finalize(A) でも A の canonical store ownership が維持される。

## Findings

### [high][fixable] Main-checkout drift guard is still optional inside a production-required capability

- File: `src/core/step/step-capability.ts`
- Line: 81

前回指摘の4 capability field は non-nullable required に修正されたが、`snapshotMainCheckoutGuard` は capability interface と derive source の双方で optional のままであり、`noopStepArtifact` も method を持たない。修正はこの安全 capability について不十分である。

具体的な破壊列は次のとおり: (1) composition/test adapter が型どおり `snapshotMainCheckoutGuard` を省略した `StepArtifactLifecycleCapability` を注入する、(2) agent step が main checkout の guarded path を変更する、(3) `StepExecutor` の before snapshot は method presence check により `null` になる、(4) after snapshot/diff も実行されず、既存の `makeDriftHalt` 経路へ入らない、(5) step は output validation/finalize へ進む。変更外の main-checkout protection は「guard unavailable は method の戻り値 `null` で表現し、production composition では guard 呼び出し自体が存在する」という前提を置くが、新契約は composition omission と runtime-level unavailable を同じ fail-open に潰している。Local/Managed の双方が既に method を実装し `null` で unavailable を表せるため、optional method にする production 上の必要性はない。

Resolution: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` と `StepArtifactSource` の method を required にし、derive helper と `StepExecutor` から presence check を除去する。no-op/test capability は `async () => null` を明示し、contract test で method presence を固定する。

## Observations

### [medium] Use-case consumers still accept the full PipelineDeps aggregate

- Files: `src/core/step/executor.ts:128`, `src/core/pipeline/parallel-review-round.ts:88`, `src/core/pipeline/pipeline.ts:136`

`StepExecutor`、`ParallelReviewRound`、`Pipeline` の public execution signatures は現在も `PipelineDeps` を受け、consumer-owned composite deps は定義されていない。このため各 consumer から他 use case の capability に型上到達でき、operator の item 4 と request の最小 required contract は未完了である。ただし現行 body が不要 capability を実際に呼ぶ経路や、変更外機構の不変条件を破る具体的実行列は確認できなかったため、このレンズでは typed finding ではなく observation とした。

## Evidence referenced

- `src/core/types.ts`: four production capability fields are now required/non-nullable。
- `src/core/step/step-capability.ts`, `src/core/step/noop-capabilities.ts`: optional guard contract と method-absent no-op capability。
- `src/core/step/executor.ts`: before/after snapshot の presence-based fail-open と broad `PipelineDeps` signatures。
- `src/core/runtime/local.ts`, `src/core/runtime/managed.ts`: production guard implementation と Local per-build `{ slug, stateRoot }` capture。
- `src/core/pipeline/pipeline.ts`, `src/core/command/runner.ts`: terminal persist-before-publish と cwd fallback。
- `src/core/pipeline/parallel-review-round.ts`: required round effects と inspect-before-commit ordering。
- `src/core/step/commit-push.ts`, `src/store/job-state-store.ts`: synthesized commit ledger と slug/stateRoot store ownership。
- `verification-result.md`:既存 verification の green 証跡。

## Unverified

なし。
