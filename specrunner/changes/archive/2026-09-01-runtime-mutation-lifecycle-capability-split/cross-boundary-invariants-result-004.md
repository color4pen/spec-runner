# Cross-Boundary Invariants Review Evidence — Iteration 4

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## Review scope

- `git diff main...HEAD --stat` で 121 files / 10722 insertions / 719 deletionsを確認した。
- reviewer 定義、`design.md`、`tasks.md`、iteration 3 report、operator 裁定を確認した。
- 前周指摘後に変更された `runner.ts`、`pipeline.ts`、`pipeline-capability.ts`、`local.ts` と terminal capability contract tests の現在内容を読み直した。
- capability の新経路から、未変更の optional `PipelineDeps.cwd` contract、canonical store persist、terminal checkpoint/finalize publication までを追跡した。
- `verification-result.md` を既存検証の正本として参照し、同じ test / lint / typecheck は再実行していない。

## Confirmed invariant-preserving paths

### Command and dependency lifecycle

provider readiness → prepare、duplicate guard → bootstrap、workspace setup → initial persist/reload、typed `buildDeps` → cleanup registration の順序は維持されている。capability injection は provider selection、setup/teardown の回数、cleanup ownershipへ新しい分岐を持ち込んでいない。

### Step lifecycle and egress ledger

output template prepare → required-input validation → agent execution → output validation → finalize の順序、main-checkout guard、round member の finalize skip、sequential finalize mutex は維持されている。`pushCapability` は `CommitPushInfra` に明示的に運ばれ、template cleanup 後の commit、persist-before-push、push failure 後の ledger semantics も旧経路と一致する。

### Parallel round

`roundGitEffects` の presence を単一 guard として HEAD capture、worktree inspection、declared-output scoped stage/commit、HEAD advancement、round OID 記録へ進む。required methods 化は部分 capability を排除し、Local/Managed の既存 success/unavailable/no-op semantics、member ordering、status lookup cardinalityを変えていない。

## Finding

### CBI-004-001: optional cwd の terminal publication が fallback せず完全に欠落する

- **Severity**: medium
- **Resolution**: fixable
- **File**: `src/core/pipeline/pipeline.ts`
- **Line**: 399

iteration 3 の指摘に対し、operator は `TerminalStateCapability.commitFinalState(cwd: string, ...)` を採用し、`pipeline.ts` の2箇所と `runner.ts` の1箇所で `deps.cwd ?? process.cwd()` を渡すと明示的に裁定した。現在のファイルを読み直すと、3箇所はいずれも `if (deps.cwd)` で呼び出し自体を抑止しており、裁定された fallback は実装されていない。さらに `tests/core/pipeline/pipeline.test.ts:758-783` は「cwd omitted なら publish しない」という裁定と逆の挙動を固定しているため、green test でもこの境界破壊を検出できない。

具体的な破壊列:

1. 既存の `PipelineDeps` contract に従う caller が optional な `cwd` を省略し、`terminalState` capability と canonical `storeFactory` を注入して pipeline を実行する。
2. pipeline が完了または controlled escalation に到達し、canonical store には `awaiting-archive` / `awaiting-resume` state が persist される。
3. `pipeline.ts:399-401` または `pipeline.ts:624-626` の `if (deps.cwd)` が false になり、`commitFinalState` は呼ばれない。fidelity-gate halt でも `runner.ts:322-324` で同じことが起きる。
4. caller が従来の contract どおり期待する `process.cwd()` checkout では checkpoint/finalize commit が作られず、remote checkpoint が欠落する一方、pipeline は terminal result を正常に返す。
5. その remote checkpoint を前提とする attach/resume 側からは最新 terminal state を取得できず、local canonical state と remote publication が黙って乖離する。

これは前周の「誤った fallback 先」よりも強い欠落であり、修正は operator 裁定どおり3 call siteを `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` にすること。omitted-cwd test も「`process.cwd()` で1回呼ばれる」を固定する必要がある。

## Evidence referenced

- `src/core/types.ts:34-43`: `PipelineDeps.cwd` が optional である現行 contract
- `src/core/pipeline/pipeline-capability.ts:58-65`: call site が resolved cwd を渡す required contract
- `src/core/pipeline/pipeline.ts:390-401,618-626`: awaiting-archive / awaiting-resume publication paths
- `src/core/command/runner.ts:313-326`: fidelity-gate halt publication path
- `src/core/runtime/local.ts:790-825`: resolved cwd をそのまま使用する terminal adapter
- `tests/core/pipeline/pipeline.test.ts:758-783`: 現在の誤った omitted-cwd expectation
- operator 裁定: 3 call site を `deps.cwd ?? process.cwd()` に更新し omitted-cwd terminal publication test を追加する決定
- `verification-result.md`: 既存 verification green の証跡

## Unverified

なし。
