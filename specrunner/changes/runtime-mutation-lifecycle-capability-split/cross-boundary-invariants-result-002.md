# Cross-Boundary Invariants Review Evidence — Iteration 2

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## Review scope

- `git diff main...HEAD --stat` で 103 files / 7238 insertions / 707 deletions を確認した。
- reviewer 定義、`design.md`、`tasks.md`、前周 report、operator 裁定を確認した。
- iteration 1 後の変更（特に typed `buildDeps`、`CommitPushInfra.pushCapability`、terminal capability call）を現在の file 内容で再確認した。
- verification は `verification-result.md` を正本として参照し、同一 test / lint / typecheck は再実行していない。
- diff 周辺の未変更 contract として `StepContext` の cwd fallback、store/publish 順序、egress ledger、round result application を追跡した。

## Confirmed invariant-preserving paths

### Typed buildDeps and command lifecycle

`RuntimeStrategy.buildDeps` は `PipelineDeps` を返し、runner の cast は除去された。provider readiness、duplicate guard、bootstrap、workspace setup、new-run reload、buildDeps、push capability detection、cleanup registration の順序は維持されている。type-only cycle は runtime module cycle を作らない。

### Step finalize and egress ledger

executor は `deps.pushCapability` を `CommitPushInfra` に明示的に載せて finalize へ渡す。LocalRuntime は config/request の stable context とこの infra を使い、template cleanup → scoped commit → persist-before-push → push の順序を維持する。`roundOwnsGitEffects` member は finalize を呼ばず、sequential finalize の mutex も維持される。

### Parallel round

round capability の required-method contract により、presence guard 後の HEAD capture、worktree inspection、declared-output scoped commit、HEAD advancement 判定、OID record は一括して利用可能である。Local/Managed の result semantics は既存分岐と整合し、lookup cardinality、member ordering、transition table に新しい関係は導入されていない。

## Finding

### CBI-002-001: terminal capability が未変更の cwd fallback contract を破る

- **Severity**: medium
- **Resolution**: fixable
- **File**: `src/core/pipeline/pipeline.ts`
- **Line**: 399

`PipelineDeps` が継承する未変更の `StepContext` contract は、`cwd` を backward compatibility のため optional とし、「absent のとき consumer は `process.cwd()` に fall back する」と明記している (`src/core/port/step-context.ts:14-20`)。旧 `LocalRuntime.commitFinalState(deps, state)` も実際に `deps.cwd ?? process.cwd()` を使用していた。一方、capability split 後の terminal call は pipeline の awaiting-archive path (line 399)、awaiting-resume path (line 623)、runner の fidelity-gate halt path (`src/core/command/runner.ts:322`) のすべてで `deps.cwd ?? ""` を渡す。

具体的な破壊列は次のとおり。

1. backward-compatible な caller/test harness が、許可されたとおり `cwd` を省略した `PipelineDeps` と Local terminal capability を組み立てる。
2. pipeline が正常終了または controlled escalation に入り、canonical state を store に persist する。
3. terminal call が旧来の `process.cwd()` ではなく空文字列を capability に渡す。
4. Local terminal publisher の git operation は空の cwd で失敗し、best-effort/no-throw 境界によって pipeline result 自体は成功または awaiting-resume のまま返る。
5. canonical checkpoint/finalize commit が feature branch に publish されず、remote attach/resume が期待する terminal state closure だけが欠落する。

production の `LocalRuntime.buildDeps` が通常 `workspace.cwd` を設定することは、この明示された optional/backward-compatible contract を消さない。さらに lifecycle test (`tests/unit/step/executor-lifecycle-ordering.test.ts`) は production と同じ `deps.cwd ?? ""` を複製しており、fallback contract の regression を検出できない。3 call site を `deps.cwd ?? process.cwd()` に揃えるか、terminal adapter の入力側で同等の fallback を復元し、cwd omitted の executable case を追加する必要がある。

## Evidence referenced

- `src/core/port/step-context.ts:11-20`: optional cwd と required fallback contract
- `main:src/core/runtime/local.ts:752-755`: 旧 terminal implementation の `process.cwd()` fallback
- `src/core/pipeline/pipeline.ts:390-400, 616-624`: terminal publication paths
- `src/core/command/runner.ts:312-323`: issue-fidelity gate halt publication path
- `src/core/runtime/local.ts:790+`: typed Local terminal implementation
- `tests/unit/step/executor-lifecycle-ordering.test.ts:232`: empty-string fallback を複製する test
- `verification-result.md`:既存 verification green の証跡

## Unverified

なし。
