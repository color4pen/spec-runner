# Cross-Boundary Invariants Review Evidence — Iteration 3

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## Review scope

- `git diff main...HEAD --stat` で 114 files / 9222 insertions / 718 deletionsを確認した。
- reviewer 定義、`design.md`、`tasks.md`、iteration 2 report、operator 裁定を確認した。
- 前周指摘後に変更された `pipeline.ts`、`runner.ts`、`pipeline-capability.ts`、`local.ts` の現在内容を読み直した。
- capability の新経路から、未変更の `StepContext` cwd contract、commit/push、store/egress ledger、round result application までを追跡した。
- `verification-result.md` を既存検証の正本として参照し、同じ test / lint / typecheck は再実行していない。

## Confirmed invariant-preserving paths

### Command and dependency lifecycle

provider readiness → prepare、duplicate guard → bootstrap、workspace setup → initial persist/reload、typed `buildDeps` → push capability detection → cleanup registration の順序は維持されている。capability injection は factory/provider selection や cleanup ownershipへ新しい分岐を持ち込んでいない。

### Step lifecycle and egress ledger

prepare template → input validation → agent → output validation → finalize の順序、main-checkout guard の before/after、round member の finalize skip、sequential finalize mutex は維持されている。`pushCapability` は executor から `CommitPushInfra` へ明示的に渡され、template cleanup 後の scoped commit、persist-before-push、push failure 後の ledger semantics も旧経路と一致する。

### Parallel round

capability presence を単一 guard として HEAD capture、worktree inspection、declared-output scoped stage/commit、HEAD advancement、round OID 記録へ進む。required methods 化により部分的 capability の暗黙分岐はなく、Local/Managed の success/unavailable/no-op の意味、member ordering、status lookup cardinality は変わっていない。

## Finding

### CBI-003-001: terminal publication の fallback は依然として StepContext contract と異なる

- **Severity**: medium
- **Resolution**: fixable
- **File**: `src/core/runtime/local.ts`
- **Line**: 791

前周指摘後、pipeline/runner は `deps.cwd` をそのまま渡し、Local terminal adapter は `cwd ?? this.cwd` を使うよう変更された。しかし未変更の `StepContext` contract は、optional な `cwd` が absent のとき consumer が `process.cwd()` に fall back すると明記しており、旧 `LocalRuntime.commitFinalState` も `deps.cwd ?? process.cwd()` を実行していた。`LocalRuntime.cwd` は constructor 入力であって `process.cwd()` と同値である制約はなく、今回追加された capability コメントだけで既存 contract を置き換えることはできない。

具体的な破壊列:

1. backward-compatible caller が `cwd` を省略できる既存 `PipelineDeps` contract に従い、`new LocalRuntime({ cwd: repoA, ... })` から terminal capability を注入する。
2. caller は process cwd を repoB にして pipeline を実行する。これは constructor cwd と process cwd の一致を要求しない既存 API で許される。
3. pipeline が terminal state を canonical store に persist した後、`commitFinalState(undefined, slug, state)` を呼ぶ。
4. 旧経路なら repoB (`process.cwd()`) で terminal managed paths を stage/commit するが、新経路は repoA (`this.cwd`) で実行する。
5. repoA に対象 change folder がなければ best-effort/no-throw 境界に吸収され、pipeline は terminal result を返す一方、repoB の checkpoint/finalize commit だけが欠落する。対象 path が repoA にも存在すれば、誤った checkout の同名 job state を publish し得る。

したがって前周修正は空文字列問題を除いたものの、指摘の根である documented fallback を復元していない。call sites で `deps.cwd ?? process.cwd()` を渡すか、adapter で undefined を `process.cwd()` に解決し、constructor cwd と process cwd が異なる executable case を追加する必要がある。もし `LocalRuntime.cwd` を新しい正典にするなら、これは capability split を越える contract change なので `StepContext` と全 consumer の fallback 方針を明示的に変更する判断が必要になる。

## Evidence referenced

- `src/core/port/step-context.ts:10-20`: optional cwd と `process.cwd()` fallback の既存 contract
- `main:src/core/runtime/local.ts:752-755`: 旧 terminal implementation の fallback
- `src/core/pipeline/pipeline.ts:390-400,616-624`: terminal publication の2経路
- `src/core/command/runner.ts:313-324`: fidelity-gate halt publication
- `src/core/pipeline/pipeline-capability.ts:54-65`: 新 capability が runtime-owned cwd fallback を宣言する箇所
- `src/core/runtime/local.ts:790-826`: 現在の fallback と terminal commit 呼び出し
- `verification-result.md`: 既存 verification green の証跡

## Unverified

なし。
