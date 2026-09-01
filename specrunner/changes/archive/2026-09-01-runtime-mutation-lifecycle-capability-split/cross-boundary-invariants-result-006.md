# Cross-Boundary Invariants Review Evidence — Iteration 6

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## Review scope

- `git diff main...HEAD --stat` で 140 files / 12923 insertions / 874 deletionsを確認した。
- reviewer 定義、`design.md`、`tasks.md`、iteration 5 report、operator 裁定を確認した。
- 前周指摘の対象である `src/core/pipeline/pipeline.ts`、`src/core/command/runner.ts`、`src/core/runtime/local.ts`、`tests/core/pipeline/pipeline.test.ts` の現在内容を読み直した。
- capability 経路から、未変更の optional `StepContext.cwd` contract、canonical store persist、terminal checkpoint/finalize publication、attach/resume の remote checkpoint 前提までを追跡した。
- command lifecycle、step lifecycle、parallel-round lifecycle の capability presence と既存の failure boundary を静的に照合した。
- `verification-result.md` を既存検証の正本として参照し、同じ test / lint / typecheck は再実行していない。

## Confirmed invariant-preserving paths

### Command and dependency lifecycle

provider readiness → prepare、duplicate guard → bootstrap、workspace setup → initial persist/reload、typed `buildDeps` → cleanup registration の順序は維持されている。capability injection は provider selection、setup/teardown の回数、cleanup ownershipへ新しい分岐を持ち込んでいない。

### Step lifecycle and egress ledger

output template prepare → required-input validation → agent execution → output validation → finalize の順序、main-checkout guard、round member の finalize skip、sequential finalize mutex は維持されている。`pushCapability` は `CommitPushInfra` に明示的に運ばれ、template cleanup 後の commit、persist-before-push、push failure 後の ledger semantics も旧経路と一致する。

### Parallel round

`roundGitEffects` の presence を単一 guard として HEAD capture、worktree inspection、declared-output scoped stage/commit、HEAD advancement、round OID 記録へ進む。required methods 化は部分 capability を排除し、Local/Managed の既存 success/unavailable/no-op semantics、member ordering、status lookup cardinalityを変えていない。

## Finding

### CBI-006-001: optional cwd の terminal publication が fallback せず完全に欠落する

- **Severity**: medium
- **Resolution**: fixable
- **File**: `src/core/pipeline/pipeline.ts`
- **Line**: 400

iteration 5 の同一指摘に対し、operator は `TerminalStateCapability.commitFinalState(cwd: string, ...)` を採用し、`pipeline.ts` の2箇所と `runner.ts` の1箇所を `deps.cwd ?? process.cwd()` に更新すると明示的に裁定している。現在のファイルを再読したが、3箇所はいずれも依然として `if (deps.terminalState && deps.cwd)` で呼び出し自体を抑止しており、裁定された fallback は実装されていない。最新の code-fixer commit `f21aeed8` 後もこの状態である。さらに `tests/core/pipeline/pipeline.test.ts:758-783` は「cwd omitted なら publish しない」という裁定と逆の挙動を明示的に固定しているため、green test でもこの境界破壊を検出できない。

具体的な破壊列:

1. 既存の `PipelineDeps` / `StepContext` contract に従う caller が optional な `cwd` を省略し、`terminalState` capability と canonical `storeFactory` を注入して pipeline を実行する。
2. pipeline が完了または controlled escalation に到達し、canonical store には `awaiting-archive` / `awaiting-resume` state が persist される。
3. `pipeline.ts:400-402` または `pipeline.ts:627-629` の guard が false になり、`commitFinalState` は呼ばれない。fidelity-gate halt でも `runner.ts:323-325` で同じことが起きる。
4. 旧実装と `StepContext` contract が指定する `process.cwd()` checkout では checkpoint/finalize commit が作られず、remote checkpoint が欠落する一方、pipeline は terminal result を正常に返す。
5. attach/resume 側は最新 terminal state を remote から取得できず、local canonical state と remote publication が黙って乖離する。

前周修正が不十分な理由は、裁定された fallback を追加せず、production では常に cwd があるという新しい前提をコメントと test に置いただけで、public な optional contract を変更していないためである。修正は operator 裁定どおり3 call siteを `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` にすること。omitted-cwd test も「`process.cwd()` で1回呼ばれる」を固定する必要がある。

## Evidence referenced

- `src/core/port/step-context.ts:11-20`: `PipelineDeps` が継承する `cwd` は optional で、absent 時は `process.cwd()` fallback と明記されている。
- `main:src/core/runtime/local.ts:752-755`: 旧 terminal implementation は `deps.cwd ?? process.cwd()` を使用する。
- `src/core/pipeline/pipeline-capability.ts:54-65`: terminal adapter は解決済みの required `cwd: string` を受け取る。
- `src/core/pipeline/pipeline.ts:390-402,619-629`: awaiting-archive / awaiting-resume publication paths。
- `src/core/command/runner.ts:313-327`: fidelity-gate halt publication path。
- `src/core/runtime/local.ts:790-834`: 渡された cwd を publication checkout としてそのまま使う terminal adapter。
- `tests/core/pipeline/pipeline.test.ts:758-783`: omitted-cwd 時に非呼び出しを期待する現在の逆向き test。
- operator 裁定: 3 call site を `deps.cwd ?? process.cwd()` に更新し omitted-cwd terminal publication test を追加する決定。
- `verification-result.md`: 既存 verification green の証跡。

## Unverified

なし。
