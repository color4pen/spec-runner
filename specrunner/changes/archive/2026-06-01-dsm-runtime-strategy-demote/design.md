# Design: dsm-runtime-strategy-demote

## Context

`arch-closure-src-wide`（#495）で §3 DSM closure を enforcement し、21 件の既存違反を `arch-allowlist.ts`（invariant `DSM`）に凍結した。本 change はそのうち **domain→composition-root の 5 件** を burn-down する。

現状:
- `RuntimeStrategy` interface と支援型（`QueryOptions`, `WorkspaceOptions`, `WorkspaceContext`, `CleanupHandle`）が `src/core/runtime/strategy.ts`（composition-root）に定義されている
- `checkRuntimePrereqs` / `resolveRuntimeCredentials` が `src/core/runtime/prereqs.ts`（composition-root）に定義されている
- domain 層（`core/types.ts`, `core/command/runner.ts`, `core/command/resume.ts`, `core/command/pipeline-run.ts`, `core/preflight.ts`）がこれらを直接 import → §3 違反（domain → comp-root ✗）

## Goals / Non-Goals

**Goals**:
- `RuntimeStrategy` interface + 支援型を ports 層（`core/port/`）に降格し、domain→ports の legal import にする
- `RuntimePrereqChecker` port interface を `core/port/` に新設し、`preflight.ts` が port 経由で prereq 処理を呼ぶようにして domain→comp-root の import を解消する（実装は `core/runtime/prereqs.ts` に留まる）
- `arch-allowlist.ts` の `DSM-domain-comp-root-*` 5 件を全削除し、DSM closure test を green にする

**Non-Goals**:
- 他 DSM カテゴリ（adapter→domain / ports→domain）の burn-down（並行 `dsm-domain-type-demote` の領分）
- `core/types.ts` の `StepContext` 定義領域の編集（並行 change が編集する区域）
- `architecture/model.md` の編集
- 振る舞い変更

## Decisions

### D1: RuntimeStrategy interface + 支援型を `core/port/runtime-strategy.ts` に新設

`RuntimeStrategy` は interface（runtime 実装の抽象）であり、hexagonal の原則上 port 層に属する。`core/port/` に `runtime-strategy.ts` を新設し、`strategy.ts` の全内容（interface + 支援型 5 つ）をそのまま移設する。

実装クラス（`LocalRuntime`, `ManagedRuntime`）と factory は `core/runtime/` に残留し、降格後の interface を `../port/runtime-strategy.js` から import する。composition-root → ports は §3 で ✓。

**Rationale**: port はインターフェース定義であり、`core/port/` に配置するのが hexagonal の正しい向き。shared-kernel への降格は VO でない interface に対して不適切。

**Alternatives considered**:
- shared-kernel（`src/config/` 等）に配置 → RuntimeStrategy は VO でなく port interface。shared-kernel に port を置くのは層の意味が崩れる。却下。
- `core/runtime/strategy.ts` に据え置き → domain→comp-root 違反が残る。却下。

### D2: `RuntimePrereqChecker` port interface を `core/port/runtime-prereqs.ts` に新設

`checkRuntimePrereqs` と `resolveRuntimeCredentials` は `cfg.runtime === "managed"` / `config.runtime !== "managed"` 分岐を含む（B-8 grep パターン `(config|cfg)\.runtime` にマッチ）。これらを `core/preflight.ts`（domain）にインラインすると、B-8 テストが `src/core/` を `core/runtime/` 除外でスキャンするため即座に 3 件の B-8 違反が生じる。`prereqs.ts` の docstring 自身も「B-8 invariant のため `core/runtime/` に閉じ込めた」と明記しており、domain への移設は B-8 との矛盾になる。

**採用アプローチ**: port interface 経由の dependency injection。

1. `core/port/runtime-prereqs.ts` を新設し以下を定義する:
   - `RuntimePrereqChecker` interface: `check(cfg: SpecRunnerConfig, env: Record<string, string | undefined>): Promise<{ field: string; hint: string } | null>`
   - `RuntimeCredentialsResolver` interface: `resolve(cfg: SpecRunnerConfig, env: Record<string, string | undefined>): Promise<RuntimeCredentials>`
   - `RuntimeCredentials` type（`prereqs.ts` から移設）
2. `core/runtime/prereqs.ts` は `core/runtime/` に留まる。B-8 違反はゼロのまま。`checkRuntimePrereqs` / `resolveRuntimeCredentials` が新 port interfaces を満たすことをコンパイラが検証する。
3. `core/preflight.ts` の `runPreflight` シグネチャに `deps: { prereqChecker: RuntimePrereqChecker; credentialsResolver: RuntimeCredentialsResolver }` を追加し、直接 import していた `./runtime/prereqs.js` を除去する。`./port/runtime-prereqs.js` から interface を import する（domain → ports ✓）。後方互換 re-export（`export { checkRuntimePrereqs } from "./runtime/prereqs.js"`）も除去する。
4. `cli/run.ts`（composition-root）で `core/runtime/prereqs.js` を import し、具体的実装オブジェクトを `runPreflight` に渡す。composition-root → ports ✓、composition-root → domain ✓。

**Rationale**: `prereqs.ts` の `config.runtime` 分岐を `core/runtime/` に閉じ込めたまま（B-8 維持）、DSM 違反（domain→comp-root）を port interface 経由で解消できる。インライン案（旧 D2）は B-8 との二律背反を生じさせるため却下。

**Alternatives considered**:
- インライン回収（旧 D2）→ `config.runtime` 分岐が domain 層に漏れ B-8 が即座に 3 件失敗。却下。
- `core/runtime-prereqs.ts`（domain 直下に別ファイル）→ `config.runtime` 分岐を domain に持つため B-8 違反は同様に発生。却下。
- `prereqs` 関数を runtime-agnostic に再設計 → `requirementsFor(cfg.runtime)` と managed 固有チェックを分離する必要があり、本 change の scope を大幅に超える。却下。

### D3: 原本ファイル処理 + barrel・import path 一括更新

`src/core/runtime/strategy.ts` を削除し、全 import site を新 path に張り替える。

`src/core/runtime/prereqs.ts` は **削除しない**（D2 の port 経由 DI 方式に変更したため）。`RuntimeCredentials` 型を `core/port/runtime-prereqs.ts` に移設するため、`prereqs.ts` の当該 type export は `core/port/runtime-prereqs.js` からの re-import に切り替える。

`core/runtime/index.ts` barrel:
- `RuntimeStrategy` 等は `core/port/runtime-strategy.js` からの re-export に切り替える
- `checkRuntimePrereqs` / `resolveRuntimeCredentials` は引き続き `./prereqs.js` から export（barrel 経由の外部利用がある場合）

re-export shim（旧ファイルに `export * from` だけ残す）は不採用。shim は dead code を残し、将来の grep 混乱の元になる。

## Risks / Trade-offs

- **[Risk] 並行 change との衝突** → `core/types.ts` の編集は line 9（RuntimeStrategy import）と line 105 付近（`runtimeStrategy` フィールドの型注釈）のみ。並行 `dsm-domain-type-demote` は `StepContext` 定義領域（line 20〜36）を編集する distinct region なので 3-way merge で衝突最小。allowlist 削除も DSM サブ領域が異なる（domain-comp-root vs adapter/ports-domain）。
- **[Risk] barrel re-export 変更でビルド壊れ** → `core/runtime/index.ts` を消費するのは `src/cli/bootstrap.ts` と `src/cli/run.ts` のみ（`createRuntime` のみ import）。型 re-export の変更はこれらに影響しない。Mitigation: T-05 で verification を実行。
- **[Risk] `runPreflight` シグネチャ変更** → D2 の port 経由 DI 方式により `runPreflight(requestMdPath, cwd, env)` に `deps` 引数が追加される。呼び出し元は `cli/run.ts`（composition-root）のみであり、具体的実装を渡す変更は限定的。既存テストが `core/preflight.ts` 経由で `checkRuntimePrereqs` を re-export していた backward compat export も除去するため、テスト側の import path 更新が必要か事前に確認する。

## Open Questions

なし。architect 評価済みの設計判断に従い、全決定事項は確定。
