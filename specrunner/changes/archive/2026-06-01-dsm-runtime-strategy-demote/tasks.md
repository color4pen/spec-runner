# Tasks: dsm-runtime-strategy-demote

## T-01: RuntimeStrategy interface + 支援型を `core/port/runtime-strategy.ts` に新設

- [x] `src/core/port/runtime-strategy.ts` を新規作成し、`src/core/runtime/strategy.ts` の全内容（import 文含む）をコピーする
  - `QueryOptions`, `WorkspaceOptions`, `WorkspaceContext`, `CleanupHandle` type, `RuntimeStrategy` interface
  - import 文は移設先のパスに合わせて調整する（例: `../port/agent-runner.js` → `./agent-runner.js`, `../types.js` → `../types.js` そのまま）
- [x] `src/core/port/index.ts` に `runtime-strategy.ts` の型 re-export を追加する:
  ```
  export type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./runtime-strategy.js";
  ```

**Acceptance Criteria**:
- `src/core/port/runtime-strategy.ts` が存在し、`RuntimeStrategy` interface + 支援型 4 つが export されている
- `src/core/port/index.ts` が新型を re-export している
- `bun run typecheck` が pass する（この時点では旧ファイルも並存で OK）

## T-02: `RuntimePrereqChecker` port interface を `core/port/runtime-prereqs.ts` に新設し DI 化

`checkRuntimePrereqs` / `resolveRuntimeCredentials` は `cfg.runtime === "managed"` 分岐を含むため、domain 層（`core/preflight.ts`）にインラインすると B-8 違反が発生する（B-8: `src/core/` の `core/runtime/` 以外に `(config|cfg)\.runtime` パターン禁止）。port interface 経由の DI に切り替え、実装を `core/runtime/prereqs.ts` に留める。

- [x] `src/core/port/runtime-prereqs.ts` を新規作成し以下を定義する:
  ```ts
  import type { SpecRunnerConfig } from "../../config/schema.js";

  export interface RuntimeCredentials {
    specRunnerApiKey?: string;
    specRunnerApiKeySource?: "credentials" | "env";
  }

  export interface RuntimePrereqChecker {
    check(
      cfg: SpecRunnerConfig,
      env: Record<string, string | undefined>,
    ): Promise<{ field: string; hint: string } | null>;
  }

  export interface RuntimeCredentialsResolver {
    resolve(
      cfg: SpecRunnerConfig,
      env: Record<string, string | undefined>,
    ): Promise<RuntimeCredentials>;
  }
  ```
- [x] `src/core/port/index.ts` に新 port 型を re-export 追加:
  ```ts
  export type { RuntimeCredentials, RuntimePrereqChecker, RuntimeCredentialsResolver } from "./runtime-prereqs.js";
  ```
- [x] `src/core/runtime/prereqs.ts` の `RuntimeCredentials` interface 定義を削除し、`core/port/runtime-prereqs.js` からの re-export に切り替える:
  ```ts
  export type { RuntimeCredentials } from "../port/runtime-prereqs.js";
  ```
  （`checkRuntimePrereqs` / `resolveRuntimeCredentials` 関数は `core/runtime/prereqs.ts` に留まる — B-8 維持）
- [x] `src/core/preflight.ts` を以下のように変更する:
  - `import { checkRuntimePrereqs, resolveRuntimeCredentials } from "./runtime/prereqs.js"` 行を削除
  - `export { checkRuntimePrereqs } from "./runtime/prereqs.js"` re-export 行を削除
  - `import type { RuntimePrereqChecker, RuntimeCredentialsResolver, RuntimeCredentials } from "./port/runtime-prereqs.js"` を追加
  - `runPreflight` シグネチャに `deps: { prereqChecker: RuntimePrereqChecker; credentialsResolver: RuntimeCredentialsResolver }` 引数を追加
  - 内部呼び出し: `checkRuntimePrereqs(config, env)` → `deps.prereqChecker.check(config, env)`
  - 内部呼び出し: `resolveRuntimeCredentials(config, env)` → `deps.credentialsResolver.resolve(config, env)`
- [x] `src/cli/run.ts` を以下のように変更する:
  - `import { checkRuntimePrereqs, resolveRuntimeCredentials } from "../core/runtime/prereqs.js"` を追加
  - `runPreflight(absolutePath, cwd, env)` 呼び出しを変更し `deps` を渡す:
    ```ts
    runPreflight(absolutePath, cwd, env, {
      prereqChecker: { check: checkRuntimePrereqs },
      credentialsResolver: { resolve: resolveRuntimeCredentials },
    })
    ```

**Acceptance Criteria**:
- `src/core/port/runtime-prereqs.ts` が存在し、`RuntimeCredentials`, `RuntimePrereqChecker`, `RuntimeCredentialsResolver` が export されている
- `src/core/runtime/prereqs.ts` が存在する（削除しない）
- `src/core/preflight.ts` に `runtime/prereqs.js` への直接 import が 0 件
- `src/core/` 配下（`core/runtime/` を除く）に `(config|cfg)\.runtime` パターンが 0 件（B-8 維持）
- `bun run typecheck` が pass する

## T-03: domain import site を新 path に張り替え（5 件 — DSM 違反解消）

scan で全件確定し、`implementation-notes.md` に記録すること。以下は背景列挙（scan 結果が authoritative）。

- [x] `src/core/types.ts` line 9: `import type { RuntimeStrategy } from "./runtime/strategy.js"` → `import type { RuntimeStrategy } from "./port/runtime-strategy.js"`
- [x] `src/core/command/runner.ts` line 35: `import type { CleanupHandle, RuntimeStrategy, WorkspaceOptions } from "../runtime/strategy.js"` → `import type { CleanupHandle, RuntimeStrategy, WorkspaceOptions } from "../port/runtime-strategy.js"`
- [x] `src/core/command/resume.ts` line 21: `import type { RuntimeStrategy } from "../runtime/strategy.js"` → `import type { RuntimeStrategy } from "../port/runtime-strategy.js"`
- [x] `src/core/command/pipeline-run.ts` line 12: `import type { RuntimeStrategy } from "../runtime/strategy.js"` → `import type { RuntimeStrategy } from "../port/runtime-strategy.js"`
- [x] （preflight.ts は T-02 で解消済み — runtime/prereqs.js import の削除）

**Acceptance Criteria**:
- `src/core/` 配下（`core/runtime/` を除く）から `runtime/strategy.js` への import が 0 件
- `src/core/preflight.ts` から `runtime/prereqs.js` への import が 0 件
- `bun run typecheck` が pass する

## T-04: composition-root 内部 import を新 path に更新 + 旧ファイル削除

- [x] `src/core/runtime/local.ts` line 33: `import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./strategy.js"` → `from "../port/runtime-strategy.js"`
- [x] `src/core/runtime/managed.ts` line 24: `import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./strategy.js"` → `from "../port/runtime-strategy.js"`
- [x] `src/core/runtime/factory.ts` line 14: `import type { RuntimeStrategy } from "./strategy.js"` → `from "../port/runtime-strategy.js"`
- [x] `src/core/runtime/index.ts`: barrel re-export を更新
  - 型 re-export 行を `export type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "../port/runtime-strategy.js";` に変更
  - prereqs 関連の re-export 行（`checkRuntimePrereqs`, `resolveRuntimeCredentials`, `RuntimeCredentials`）は **削除しない**（`prereqs.ts` は `core/runtime/` に留まるため barrel からの export は有効なまま）
- [x] `src/cli/bootstrap.ts` line 19: `import type { RuntimeStrategy } from "../core/runtime/strategy.js"` → `from "../core/port/runtime-strategy.js"`
- [x] `src/core/runtime/strategy.ts` を削除する
- [x] テストファイルの import path を更新する（scan で全件確定）:
  - `tests/pipeline-integration.test.ts`: `from "../src/core/runtime/strategy.js"` → `from "../src/core/port/runtime-strategy.js"`
  - `tests/unit/core/command/runner.test.ts`: `from "../../../../src/core/runtime/strategy.js"` → `from "../../../../src/core/port/runtime-strategy.js"`
  - `tests/unit/core/command/resume.test.ts`: `from "../../../../src/core/runtime/strategy.js"` → `from "../../../../src/core/port/runtime-strategy.js"`
  - `tests/unit/step/commit-and-push.test.ts`: `from "../../../src/core/runtime/strategy.js"` → `from "../../../src/core/port/runtime-strategy.js"`
  - `tests/unit/step/executor.commit.test.ts`: `from "../../../src/core/runtime/strategy.js"` → `from "../../../src/core/port/runtime-strategy.js"`

**Acceptance Criteria**:
- `src/core/runtime/strategy.ts` が存在しない
- `src/core/runtime/prereqs.ts` が存在する（T-02 では削除しない）
- プロジェクト全体で `runtime/strategy.js` への import が 0 件（`core/runtime/index.ts` の re-export を除く — barrel は port からの re-export に切り替え済み）
- `bun run typecheck` が pass する

## T-05: allowlist エントリ削除 + scan 結果記録

- [x] `tests/unit/architecture/arch-allowlist.ts` から以下の 5 エントリを削除する:
  - `DSM-domain-comp-root-preflight-prereqs`
  - `DSM-domain-comp-root-types-strategy`
  - `DSM-domain-comp-root-resume-strategy`
  - `DSM-domain-comp-root-runner-strategy`
  - `DSM-domain-comp-root-pipeline-strategy`
- [x] セクションコメント `// ── C) domain → composition-root` も実体が 0 件になるため削除する
- [x] `implementation-notes.md` を作成し、scan 結果（対象ファイル一覧 + 変更前後の import path）を記録する

**Acceptance Criteria**:
- `arch-allowlist.ts` に `DSM-domain-comp-root` を含むエントリが 0 件
- `implementation-notes.md` に scan 結果が記載されている

## T-06: 全体 verification

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` が green
- [x] DSM closure test が green（実違反が 5 件減少、liveness guard `forbiddenEdges.length >= dsmEntries.length` も維持）
- [x] `core-invariants.test.ts` の既存 invariant test（B-1〜B-9）が無改変で green

**Acceptance Criteria**:
- プロジェクト標準 verification が全 green
- DSM closure test が pass し、allowlist に `DSM-domain-comp-root-*` が残っていない
