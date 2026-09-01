# Cross-Boundary Invariants Review Evidence — Iteration 9

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## Review scope

- `git diff main...HEAD --stat` で 147 files / 14036 insertions / 877 deletionsを確認した。
- reviewer 定義、`design.md`、`tasks.md`、operator 裁定、iteration 6 report を確認した。
- capability の導出元と注入先から、変更されていない store、egress ledger、attach/resume、step completion、reviewer activation の前提まで呼び出しを追跡した。
- command lifecycle、step lifecycle、terminal publication、parallel-round git effects の新しい capability 経路を列挙し、既存の順序・失敗境界・optional context contract と照合した。
- `verification-result.md` を検証の正本として参照し、同じ build / typecheck / test / lint は再実行していない。

## Confirmed invariant-preserving paths

### Command lifecycle and dependency assembly

provider readiness → `prepare()`、duplicate-job guard → `bootstrapJob`、workspace setup → initial persist/reload、typed `buildDeps` → cleanup registration の順序は変わっていない。`LocalRuntime` / `ManagedRuntime` の `buildDeps` は各 capability を同じ runtime instance から bind しており、provider selection、canonical store authority、cleanup ownership、setup/teardown 回数に新しい分岐を導入していない。

### Step lifecycle and cross-step state

output template prepare → required-input validation → agent execution → output validation → finalize の順序、main-checkout guard の fail-open、sequential finalize mutex、round-owned member の finalize skip は維持されている。`pushCapability` は executor から typed `CommitPushInfra` に明示的に渡され、template cleanup 後の commit、synthesized commit の persist-before-push、push failure 後の resume ledger の前提も旧経路と一致する。

`stepIo`、`stepArtifact`、`changedFiles`、`revisionContent` の分離後も、finding verification、lineage digest、finding recency、reviewer activation はそれぞれ従来と同じ capability availability と fail-open/fail-closed 条件で実行される。複数 capability を連続して使う spec-review → finding recency → fixer / custom-reviewer 経路にも、状態初期化や lookup cardinality の変更はない。

### Terminal publication and attach/resume closure

awaiting-archive、awaiting-resume、fidelity-gate halt の3 publication seam は、canonical store persist 後に `TerminalStateCapability` を呼ぶ。前回指摘された optional `cwd` 境界は全3箇所で `deps.cwd ?? process.cwd()` に統一され、未変更の `StepContext` contract と旧 `LocalRuntime` fallback を維持している。checkpoint/finalize の管理対象 path、message、best-effort/no-throw、remote checkpoint を attach/resume が読む前提は変わっていない。

### Parallel review round

`roundGitEffects` の presence を単一の capability availability として、canon digest、baseline HEAD、per-member invalidation、fan-out 後の HEAD guard、worktree inspection、declared-output scoped commit、round OID 記録へ進む。required-method contract により部分実装は production に入らず、Local の fail-closed inspection / scoped stage と Managed の既存 null/unavailable/no-op semantics は維持される。HEAD の before/after が双方 non-null の場合だけ synthesized ledger に OID を記録するため、既存 egress verification の一対一対応も崩していない。

## Findings

なし。

## Evidence referenced

- `src/core/command/runner.ts`: typed `buildDeps` と fidelity-gate terminal publication。
- `src/core/port/step-context.ts`: optional `cwd` と `process.cwd()` fallback contract。
- `src/core/types.ts`: facade service locator を除去した capability injection surface。
- `src/core/step/step-capability.ts`: step artifact / I/O required contracts と bound derive helpers。
- `src/core/pipeline/pipeline-capability.ts`: terminal / round git effects required contracts。
- `src/core/runtime/local.ts`, `src/core/runtime/managed.ts`: concrete capability semantics と composition-root injection。
- `src/core/step/executor.ts`, `src/core/step/step-completion.ts`, `src/core/step/commit-orchestrator.ts`: step ordering、lineage、finding recency、egress ledger handoff。
- `src/core/pipeline/pipeline.ts`, `src/core/pipeline/parallel-review-round.ts`: terminal transition と round-owned git effects。
- `verification-result.md`: build / typecheck / test / lint / changed-line-coverage passed の既存証跡。

## Unverified

なし。
