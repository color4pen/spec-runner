# Cross-Boundary Invariants Review Evidence — Iteration 13

## Review scope

- `git diff main...HEAD --stat` で 206 files / 16481 insertions / 1038 deletionsを確認した。
- `design.md`、`tasks.md`、`spec.md`、operator 裁定、iteration 12 report を現在の branch head に対して読み直した。
- 前周 findings の ports→domain DSM edge と full `PipelineDeps` consumer contract を再検証し、さらに production composition、LocalRuntime の per-build state ownership、ManagedRuntime の no-op/unavailable semantics、terminal publication、step finalize、parallel-round git ownershipを変更外コードの前提まで追跡した。
- `verification-result.md` を既存 verification の正本として参照し、同一の build / typecheck / test / lint は再実行していない。

## Confirmed invariant-preserving paths

iteration 12 の ports→domain DSM finding は解消済みである。`RuntimeStrategy` port は domain `PipelineDeps` を import せず `buildDeps` も宣言しない。typed assembly は domain-owned `PipelineDepsBuilder` に移り、composition root の `CommandRunner` が `RuntimeStrategy & PipelineDepsBuilder` を要求するため、call-site cast なしで concrete runtime の builder を使う。追加されていた DSM allowlist entry も削除され、変更外の delete-only ratchetを迂回していない。

iteration 12 の full aggregate finding も解消済みである。`StepExecutor` と step collaborators は `StepExecutionDeps`、`ParallelReviewRound.run` は `ParallelReviewRoundDeps`、`Pipeline.run` と内部 orchestration は `PipelineOrchestrationDeps` を受ける。step contract から `terminalState` / `roundGitEffects`、round contract から `terminalState` が除外され、`PipelineDeps` は cast なしで各 structural subset に渡せる。

四つの production-required mutation capability は `PipelineDeps` で required のままであり、Local/Managed の両 `buildDeps` がすべて注入する。Local step finalize は config/request/store root を build ごとの immutable closure に捕捉し、別 job の `buildDeps` 呼び出しによる cross-job contamination を避ける。cleanup-before-commit、synthesized OID の persist-before-push、terminal commit の explicit cwd fallback、parallel round の inspect-before-scoped-commitも既存 ownership/orderを維持している。

Managed runtime は required capability の明示実装として、HEAD/guard unavailable の `null`、artifact digest の null hash、changed-files unavailable、worktree inspection の empty success、step/terminal/round mutation の no-opという既存差異を concrete runtime 内に閉じている。consumer 側に runtime-kind 分岐は追加されていない。

## Findings

なし。

## Observations

なし。

## Evidence referenced

- `src/core/port/runtime-strategy.ts:21,319`: `buildDeps` の port 外移動と domain import 不在。
- `src/core/types.ts:155-300`: required capability fields、`PipelineDepsBuilder`、三つの structural consumer composite。
- `src/core/command/runner.ts:90,222,322`: composition-root intersection、cast-free assembly、terminal cwd fallback。
- `tests/unit/architecture/arch-allowlist.ts`: iteration 12 で存在した DSM exception の削除。
- `src/core/step/executor.ts:128-256`, `src/core/step/step-context-builder.ts`, `src/core/step/step-completion.ts`, `src/core/step/commit-orchestrator.ts`: step-owned narrow contract の伝播。
- `src/core/pipeline/parallel-review-round.ts:88-491`: round-owned narrow contract、HEAD snapshot、worktree inspection、scoped commit ordering。
- `src/core/pipeline/pipeline.ts:136-212,648-736`: pipeline orchestration contract と terminal publication path。
- `src/core/runtime/local.ts:599-689,776-835`: capability injection と per-build immutable closure、persist-before-push。
- `src/core/runtime/managed.ts:317-345,566-652`: required capability injection と Managed semantics。
- `src/core/step/noop-capabilities.ts`: test-only explicit no-op contracts。
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/verification-result.md`:既存 verification の green 証跡。

## Unverified

なし。
