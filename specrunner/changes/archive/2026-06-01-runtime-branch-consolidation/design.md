# Design: config.runtime 分岐を createRuntime / RuntimeStrategy に集約する（B-8）

## Context

`architecture/model.md` §4 B-8 は「runtime（local / managed）の分岐は `createRuntime` factory に集約。domain / CLI に `config.runtime` の分岐を散らさない」と定義している。しかし以下の 7 箇所で違反が残り、arch-allowlist に凍結されている:

**executor.ts（4 箇所）** — すべて `deps.config.runtime === "local"` ガード:
1. L203: `headBeforeStep` = `gitExec("rev-parse", "HEAD")` — agent 自己 commit 検出用の HEAD SHA 取得
2. L208: `writeOutputTemplates()` — step 実行前にテンプレートを配置
3. L287: `cleanupOutputTemplates()` — B-group テンプレートを commit 前に削除
4. L295: `commitAndPush()` — agent 完了後の stage + commit + push

**preflight.ts（3 箇所）**:
5. L43: `requirementsFor(cfg.runtime ?? "local")` — runtime 別の credential 要件取得
6. L59: `if (cfg.runtime === "managed")` — agents/environment config 存在チェック
7. L133: `if (config.runtime === "managed")` — Anthropic API key 解決

これらの分岐が domain（executor）・preflight に散在し、3 つ目の runtime を追加する際に 1 点に閉じず影響が拡散する。

## Goals / Non-Goals

**Goals**:

- executor.ts の 4 箇所の runtime 分岐を `RuntimeStrategy` seam のメソッドに委譲し、executor を runtime-agnostic にする
- preflight.ts の 3 箇所の runtime 分岐を factory / strategy seam に移動する
- `arch-allowlist.ts` の B-8 エントリ（4 件）を全件削除し、B-8 enforcement を完全にする
- local / managed 両 runtime の pipeline 挙動は不変（分岐の置き場を移すのみ）

**Non-Goals**:

- B-6（env seam）等の他 invariant 修正
- runtime の振る舞い変更
- 第 3 の runtime 追加
- executor 以外のドメインコード（pipeline, command 等）の変更

## Decisions

### D1: executor の local-only 操作を RuntimeStrategy の 3 メソッドに委譲

**選択**: `RuntimeStrategy` interface に以下の 3 メソッドを追加し、executor が `deps.config.runtime` を見る代わりに strategy を呼ぶ:

| メソッド | 責務 | LocalRuntime | ManagedRuntime |
|---------|------|-------------|----------------|
| `captureHeadSha(cwd)` | agent 実行前の HEAD SHA を取得 | `gitExec("rev-parse", "HEAD")` | `null` を返す（no-op） |
| `prepareStepArtifacts(cwd, slug, stepName, state)` | step 実行前に output テンプレートを配置 | `writeOutputTemplates()` 呼出 | no-op |
| `finalizeStepArtifacts(step, state, deps, headBeforeStep, commitPushInfra)` | テンプレート cleanup + commit & push | `cleanupOutputTemplates()` → `commitAndPush()` | no-op |

**根拠**: executor の 4 つの `config.runtime === "local"` 分岐は 3 つの関心（HEAD 取得 / テンプレート準備 / テンプレート後処理+commit）に分類される。それぞれを strategy メソッドにすると executor は runtime を知らずに策略を呼ぶだけになる。メソッド数は 2 つに圧縮可能（`captureHeadSha` を `prepareStepArtifacts` に含める）だが、HEAD SHA は return value として executor に渡す必要がある（`commitAndPush` の引数）ため独立メソッドが自然。

**代替案**:
- **AgentRunner port に追加**: AgentRunner は「agent session の実行」に特化した port であり、commit/push やテンプレート操作は session lifecycle の外。seam の責務を超える。
- **executor に StepLifecycleHooks を注入**: フック点が増えると executor のインターフェースが肥大化する。RuntimeStrategy は既に workspace 管理等の infra を持つため、ここに寄せるのが一貫性がある。

### D2: RuntimeStrategy を executor に注入する経路

**選択**: `PipelineDeps` に `runtimeStrategy: RuntimeStrategy` フィールドを追加し、`RuntimeStrategy.buildDeps()` で注入する。executor は `deps.runtimeStrategy` 経由で strategy メソッドを呼ぶ。

**根拠**: executor は現在 `PipelineDeps` 経由で `config`・`runner`・`storeFactory` 等を受け取っている。同じパターンで `runtimeStrategy` を渡すのが最も低侵襲。executor の constructor を変更する案は、既存の `StepExecutor` 構築箇所すべてに影響する。

**代替案**:
- **StepExecutor constructor に RuntimeStrategy を注入**: runner と同列で渡す案。ただし `runner` は `PipelineDeps.runner` に移行済み（D8 by runtime-selection）であり、`runtimeStrategy` も同パターンで deps に入れるのが一貫。
- **executor 内で `deps.config.runtime` から strategy を逆引き**: これは B-8 違反そのものなので不可。

### D3: preflight の runtime 分岐を factory / helper に移動

**選択**: `checkRuntimePrereqs` 内の分岐ロジックをそのまま維持するが、関数自体を `src/core/runtime/` 配下に移動する。preflight.ts からは移動後の関数を呼ぶだけにする。`runPreflight` 内の `config.runtime === "managed"` 分岐（API key 解決）も同様に runtime module の helper に移す。

具体的には:
- `checkRuntimePrereqs` を `src/core/runtime/prereqs.ts` に移動
- `resolveRuntimeCredentials(config, env)` を `src/core/runtime/prereqs.ts` に新設（API key 解決の runtime 分岐を包含）
- `preflight.ts` はこれらを import して呼ぶだけ（`config.runtime` / `cfg.runtime` の分岐を持たない）

**根拠**: B-8 の scope は `src/core/` EXCLUDING `src/core/runtime/`。runtime 分岐ロジックを `core/runtime/` に移動すれば、B-8 enforcement の scope 外になり allowlist 不要。preflight 自体は runtime-agnostic になる。

**代替案**:
- **RuntimeStrategy interface にメソッド追加**: preflight は pipeline 実行前に走るため、RuntimeStrategy instance がまだ存在しない。factory で strategy を作る前に prereq check が必要なので、strategy のメソッドにはできない。
- **factory.ts に checkRuntimePrereqs を同居**: factory.ts は strategy 構築の単一責務。prereq check は別関心なので独立ファイルが妥当。

### D4: commitPushInfra の strategy 渡し

**選択**: `finalizeStepArtifacts` は `CommitPushInfra`（spawnFn, sleepFn, events）を引数で受け取る。LocalRuntime はこれを使って `commitAndPush` を呼び、ManagedRuntime は no-op。

**根拠**: `CommitPushInfra` は executor が constructor で組み立てる infra オブジェクト。strategy に executor の内部状態を渡すのではなく、必要な infra だけを引数で明示的に渡す。

## Risks / Trade-offs

- **[Risk] PipelineDeps の肥大化** → `runtimeStrategy` は 1 フィールド追加のみ。既存パターン（`runner`, `storeFactory`）と同列であり、型安全性も維持される。
- **[Risk] ManagedRuntime の no-op メソッド増加** → 3 メソッドが no-op だが、interface 準拠のための明示的 no-op は意図的設計（第 3 runtime で実装が必要になる可能性がある）。
- **[Risk] テスト既存依存の破壊** → executor test が `deps.config.runtime` を設定して分岐をテストしている場合、strategy mock に置き換える必要がある。影響範囲を T-03 で確認。

## Open Questions

なし（architect 評価済みの設計判断に基づく）。
