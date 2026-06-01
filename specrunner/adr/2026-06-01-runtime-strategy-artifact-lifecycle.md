# RuntimeStrategy に step artifact lifecycle を委譲して B-8 invariant を完成させる

**Date**: 2026-06-01
**Status**: accepted

## Context

`architecture/model.md` §4 B-8 invariant「runtime（local / managed）の分岐は `createRuntime` factory に集約。domain / CLI に `config.runtime` の分岐を散らさない」に対し、以下 7 箇所で違反が残り `arch-allowlist.ts` に凍結されていた。

**executor.ts（4 箇所）** — すべて `deps.config.runtime === "local"` ガード:
1. `headBeforeStep` — agent 実行前の HEAD SHA 取得（`gitExec("rev-parse", "HEAD")`）
2. `writeOutputTemplates()` — step 実行前の output テンプレート配置
3. `cleanupOutputTemplates()` — B-group テンプレートの commit 前削除
4. `commitAndPush()` — agent 完了後の stage + commit + push

**preflight.ts（3 箇所）**:
5. `requirementsFor(cfg.runtime ?? "local")` — runtime 別 credential 要件取得
6. `if (cfg.runtime === "managed")` — agents/environment config 存在チェック
7. `if (config.runtime === "managed")` — Anthropic API key 解決

これらの分岐が domain（executor）と preflight に散在し、3 つ目の runtime を追加する際の影響が 1 点に閉じていなかった。先行 change（agent-runner-port-and-local-runtime, 2026-05-05）で `AgentRunner` port を切り出し executor を `runner.run(ctx)` 1 呼び出しに縮約したが、artifact lifecycle（HEAD 取得・テンプレート配置・commit+push）と preflight の runtime 分岐が executor / preflight に残ったままだった。

## Decision

### D1: `RuntimeStrategy` interface に step artifact lifecycle の 3 メソッドを追加する

```typescript
interface RuntimeStrategy {
  // 既存メソッド ...

  // 新規追加
  captureHeadSha(cwd: string): Promise<string | null>;
  prepareStepArtifacts(cwd: string, slug: string, stepName: string, state: JobState): Promise<void>;
  finalizeStepArtifacts(
    step: Step, state: JobState, deps: PipelineDeps,
    headBeforeStep: string | null, commitPushInfra: CommitPushInfra
  ): Promise<void>;
}
```

`executor.ts` の 4 つの `config.runtime === "local"` 分岐を 3 つの関心（HEAD 取得 / テンプレート準備 / テンプレート後処理+commit）に分類し、それぞれを strategy メソッドに移す。executor は `deps.runtimeStrategy?.method()` を呼ぶだけとなり runtime を知らない。

| メソッド | LocalRuntime | ManagedRuntime |
|---------|-------------|----------------|
| `captureHeadSha(cwd)` | `gitExec("rev-parse", "HEAD")` | `null` を返す（no-op） |
| `prepareStepArtifacts(...)` | `writeOutputTemplates()` 呼出 | no-op |
| `finalizeStepArtifacts(...)` | `cleanupOutputTemplates()` → `commitAndPush()` | no-op |

`captureHeadSha` を `prepareStepArtifacts` に含めず独立メソッドとした理由: HEAD SHA は return value として executor に渡す必要があり（`commitAndPush` の引数）、`Promise<void>` シグネチャの `prepareStepArtifacts` とは分離が自然。

### D2: `PipelineDeps.runtimeStrategy?: RuntimeStrategy` 経由で executor に注入する

```typescript
interface PipelineDeps {
  // 既存フィールド ...
  runtimeStrategy?: RuntimeStrategy;  // 追加
}
```

executor が `deps.config.runtime` を見る代わりに `deps.runtimeStrategy` を使う。注入は `RuntimeStrategy.buildDeps()` が担う。`runtimeStrategy` は optional とし `undefined` のとき artifact 操作は全 no-op（`?.` optional chaining + `?? Promise.resolve()`）とすることで、strategy 未注入のテストが壊れない。error handling（`recordFailedStepResult` → `attachStateAndRethrow`）は executor 側に残し、strategy の throw を executor が受け取る構造を維持する。

### D3: `preflight.ts` の runtime 分岐を `src/core/runtime/prereqs.ts` に移動する

```
src/core/runtime/prereqs.ts （新設）
  ├── checkRuntimePrereqs(cfg)    ← preflight.ts から移動
  └── resolveRuntimeCredentials(config, env)  ← 新設（API key 解決の分岐を包含）
```

B-8 enforcement の scope は `src/core/` **excluding** `src/core/runtime/`。runtime 分岐ロジックを `core/runtime/` に移動することで scope 外となり allowlist 不要になる。`preflight.ts` は `checkRuntimePrereqs` と `resolveRuntimeCredentials` を import して呼ぶだけとなり `config.runtime` / `cfg.runtime` の分岐を持たない。

### D4: `arch-allowlist.ts` の B-8 エントリ（4 件）を全件削除する

D1–D3 の適用後、`src/core/`（`runtime/` 除く）に `config.runtime` 分岐が存在しなくなるため allowlist エントリを削除して B-8 enforcement を完全にする。ratchet の機械的完全性により、以降 `core/` に分岐が混入すれば即座に B-8 test が red になる（zero-day regression 保証）。

## Alternatives Considered

### Alternative 1: `AgentRunner` port に artifact lifecycle メソッドを追加する

- **Pros**: 既存 port の拡張であり新規 interface 不要
- **Cons**: `AgentRunner` は「agent session の実行」に特化した port。commit/push やテンプレート操作は session lifecycle の外であり、責務が混在する。agent を呼ばない CliStep（VerificationStep 等）でも `AgentRunner` の artifact メソッドが呼ばれる構造になる
- **Why not**: SRP 違反。`RuntimeStrategy` は workspace 管理等の infra を既に担っており cohesion が高い

### Alternative 2: executor に `StepLifecycleHooks` を注入する

lifecycle の各フック点（before/after）を interface として切り出す案。

- **Pros**: executor の依存が明示的になる
- **Cons**: フック点が増えるたびに executor の constructor と interface が肥大化する。`RuntimeStrategy` は既に workspace / credential 管理等の infra を持っており、step artifact 操作もそこに寄せる方が一貫性がある
- **Why not**: 新規 interface を 1 つ増やすコストに対して得られる分離のメリットが薄い

### Alternative 3: `StepExecutor` constructor に `RuntimeStrategy` を直接注入する

`PipelineDeps` を介さず constructor 引数として渡す案。

- **Pros**: 依存が明示的
- **Cons**: `PipelineDeps` 経由は既存パターン（`runner`, `storeFactory`）と一貫しており、constructor 変更は `StepExecutor` 構築箇所すべてに影響する
- **Why not**: 既存パターンとの一貫性を優先する（D2 の根拠）

### Alternative 4: `preflight.ts` の runtime 分岐を `RuntimeStrategy` のメソッドにする

preflight も strategy 経由にする案。

- **Pros**: 分岐が strategy に完全集約される
- **Cons**: preflight は pipeline 実行前（strategy instance 生成前）に走るため、strategy の instance をまだ持てない。factory で strategy を作る前に prereq check が必要という time-ordering 制約がある
- **Why not**: instance lifecycle の制約で実現不可。`core/runtime/prereqs.ts` への移動が唯一の実行可能案

### Alternative 5: `checkRuntimePrereqs` を `factory.ts` に同居させる

`prereqs.ts` を独立ファイルとして切り出す代わりに、`createRuntime` factory に prereq check を組み込む案。

- **Pros**: runtime 関連のロジックが factory に集約され、ファイル数が増えない
- **Cons**: `factory.ts` は strategy 構築の単一責務を持つ。prereq check は「構築前の前提条件確認」であり別関心。factory に混在すると SRP に反する
- **Why not**: 独立ファイル（`prereqs.ts`）にすることで factory の責務を「runtime instance の構築」に限定できる。prereq check の呼び出しサイトも `preflight.ts` に明示的に残り、可読性が高い

## Consequences

### Positive

- `src/core/`（`runtime/` 除く）から `config.runtime` / `cfg.runtime` 分岐がゼロになり、B-8 invariant が完全に満たされる
- `arch-allowlist.ts` の B-8 エントリ 4 件が削除され、以降 core に分岐が混入すれば即座に CI red（regression zero-day 保証）
- 3 つ目の runtime を追加する際の変更範囲が `src/core/runtime/` と新 adapter に閉じる。executor / preflight への変更が不要になる
- `runtimeStrategy` optional 設計により既存テスト（strategy 未注入）が壊れない。後方互換維持

### Negative

- `ManagedRuntime` に no-op メソッドが 3 つ追加される。明示的 no-op は意図的設計だが、interface を implements する実装が増えるたびに no-op の実装コストが発生する
- `PipelineDeps` に 1 フィールド追加される。既存パターンとの一貫性を保っているが、deps の肥大化傾向は継続する
- `finalizeStepArtifacts` のシグネチャが `CommitPushInfra`（executor の内部 infra）を引数に持つため、strategy が executor の実装詳細に依存する形になる

### Known Debt

- `LocalRuntime` の 3 新メソッド（`captureHeadSha` / `prepareStepArtifacts` / `finalizeStepArtifacts`）の直接単体テストが存在しない（review-feedback-001 finding #3）。executor test の mock strategy が間接的にカバーするが、LocalRuntime 本体の regression リスクが残る。次の request で単体テストを補完することを推奨する
- `resolveRuntimeCredentials` の単体テストが存在しない（review-feedback-001 finding #2）。`preflight.test.ts` が `checkRuntimePrereqs` を import して間接カバーするが、credential 解決パスは未テスト
- `arch-allowlist.ts` の B-6 allowlist コメントが stale（`resolveSpecRunnerApiKey` → `resolveRuntimeCredentials` への参照更新が未実施、review-feedback-001 finding #5）

## References

- Request: `specrunner/changes/runtime-branch-consolidation/request.md`
- Design: `specrunner/changes/runtime-branch-consolidation/design.md`
- Delta specs: `specrunner/changes/runtime-branch-consolidation/specs/`
- Review feedback: `specrunner/changes/runtime-branch-consolidation/review-feedback-001.md`
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（AgentRunner port 設計・B-8 の前提）
- Related: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（ratchet 機構・allowlist 起点）
- Related: `specrunner/adr/2026-06-01-runtime-sdk-to-adapter.md`（同日 B-2 封じ込め完成）
- `architecture/model.md` — §4 B-8 invariant・§5 divergence 台帳
- Implementation: `src/core/runtime/strategy.ts`・`src/core/runtime/local.ts`・`src/core/runtime/managed.ts`・`src/core/runtime/prereqs.ts`・`src/core/step/executor.ts`・`src/core/preflight.ts`・`src/core/types.ts`
