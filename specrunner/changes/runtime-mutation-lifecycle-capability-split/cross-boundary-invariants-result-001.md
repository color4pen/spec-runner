# Cross-Boundary Invariants Review Evidence — Iteration 1

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## Review scope

- `git diff main...HEAD --stat` で 99 files / 6256 insertions / 697 deletions を確認した。
- reviewer 定義、`design.md`、`tasks.md`、request の lifecycle requirements、operator 裁定を確認した。
- verification は `verification-result.md` を正本として参照し、同一 test / lint / typecheck は再実行していない。
- diff の直接変更だけでなく、呼び出し先の未変更機構（store factory、egress ledger、commit/push primitive、step context、round result application）まで追跡した。

## 新しい経路と隣接不変条件

### 1. CommandRunner → typed buildDeps → terminal publication

実行列を `assertProviderReadiness → prepare/duplicate guard/bootstrap → setupWorkspace → reload（new run のみ）→ buildDeps → registerCleanup → pipeline → teardown` の順に確認した。変更は `buildDeps` の返却 cast 除去と terminal capability の呼び出し形だけであり、未変更の `JobStateStore`、cleanup handle、signal handling に入る順序は変わっていない。

production の `LocalRuntime.buildDeps` / `ManagedRuntime.buildDeps` は workspace の `cwd` と capability 群を同じ object construction で注入する。このため pipeline と gate-halt の `terminalState.commitFinalState(cwd, slug, state)` は、従来 facade が受け取った同じ workspace / slug / state に到達する。canonical persist は引き続き terminal publication より前であり、publication failure の best-effort 境界も維持される。

### 2. StepExecutor → stepArtifact / stepIo / changedFiles

次の実行列を確認した。

1. required-input validation
2. main-checkout guard before snapshot
3. pre-step HEAD capture
4. output template prepare
5. agent execution
6. main-checkout guard after snapshot
7. output validation
8. serialized finalize（output template cleanup → scoped commit → ledger persist → push）
9. post-finalize HEAD capture / no-op detection

capability 分割は各 call target を置換しているが、`commitMutex`、`roundOwnsGitEffects` guard、guard の fail-open null、output gate の halt 境界は移動していない。`roundOwnsGitEffects=true` の member は従来どおり finalize に入らず、coordinator 所有の dirty worktree を残す。

`CommitPushInfra.pushCapability` は executor から finalize へ明示的に運ばれ、未変更の Layer 2 unpushable-path check が従来の `PipelineDeps.pushCapability` と同じ値を読む。synthesis commit OID の `persistBeforePush` は commit 後・push 前に設定され、push failure 後の resume が egress ledger で拒否されない不変条件も維持される。

### 3. LocalRuntime finalize → StepDeps → commitAndPush

`commitAndPush` が実際に読む context は `cwd`、`slug`、`config` のみであることを確認した。LocalRuntime が組み立てる narrow context はこの集合を満たし、request は StepContext の required contract を満たすため併記されている。staging exclusions、file/byte limits、write-scope check は同じ config instance を参照する。

`LocalRuntime` の config/request fields は `buildDeps` で設定される。production 呼び出しは `CommandRunner` の単一 execute 内で buildDeps 後にだけ finalize へ到達し、同一 runtime instance 上で別 job の buildDeps が割り込む経路は存在しないため、未変更コードの job isolation 前提を破る実行列は構成できなかった。

### 4. ParallelReviewRound → roundGitEffects

次の round 列を確認した。

1. canonical document digest
2. baseline HEAD capture / member invalidation lookup
3. member fan-out
4. after-fan-out HEAD guard
5. worktree inspection
6. declared outputs と pipeline-managed paths の交差だけを stage
7. scoped commit
8. HEAD advancement 確認後のみ round commit OID を ledger に記録
9. round results application

単一 capability の presence guard に統合されたが、production の Local/Managed runtime は capability の全 required methods を一括注入するため、旧 optional-method の部分実装に依存する経路はない。`listChangedFiles` の unavailable、inspection unavailable、HEAD null の fail-closed/fallback 分岐は維持される。`stagingExcludePatterns` と push capability は `RoundEgressParams` から同じ `commitScopedPaths` 引数へ渡される。

### 5. Managed runtime semantics

Managed runtime も capability object を注入するが、各 method は従来 facade 上の実装と同じ意味を保持する。

- HEAD capture: `null`
- artifact digest: all-null hash
- worktree inspection: success / empty paths
- step prepare/finalize、terminal publication、round commit: no-op
- changed-file derivation: unavailable declarationによる fail-closed
- commit inspection / revision content:既存の unavailable semantics

したがって capability presence 自体が local git access を意味すると誤認する未変更 consumer 経路はなく、各 consumer は従来と同じ method result で分岐する。

### 6. Read-only consumers and lookup cardinality

`adr-gen.ts`、`custom-reviewer.ts`、`spec-review.ts` は `CommitInspectionCapability | undefined` を直接受け、`step-completion.ts` と `commit-orchestrator.ts` も個別 capability を参照する。R2a leaf consumer が facade に戻る経路はない。

今回の変更は step 名、reviewer status 配列、transition table、Map key、store lookup key を追加・変更していない。一対一 lookup や宣言順の前提に新しい多対一関係は持ち込まれていない。

## Executable evidence referenced

- `tests/unit/step/executor-lifecycle-ordering.test.ts`: prepare / validation / execution / finalize、round ownership、terminal publication の順序
- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts`: Local capability binding と buildDeps injection
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`: Managed capability binding と no-op/unavailable contract
- `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`: inspection、scoped commit、HEAD/OID ownership
- `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts`: per-member invalidation と unavailable behavior
- `tests/unit/core/runtime/local.test.ts`: terminal state publication behavior
- `verification-result.md`: build / typecheck / test / lint green の既存証跡

## Findings

typed finding はない。変更していないコードの不変条件を新経路が破る具体的な step-by-step scenario は確認されなかった。

## 検証できなかった項目

なし。
