# Test Cases: dsm-runtime-strategy-demote

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 21
- **Manual**: 2
- **Priority**: must: 18, should: 4, could: 1

---

### TC-001: `core/port/runtime-strategy.ts` が存在し RuntimeStrategy + 支援型を export する

**Category**: integration  
**Priority**: must  
**Source**: T-01 AC, request 要件1

**GIVEN** composition-root に `src/core/runtime/strategy.ts` が存在する状態でリファクタリングを適用したとき  
**WHEN** `src/core/port/runtime-strategy.ts` の内容を確認する  
**THEN**
- ファイルが存在する
- `RuntimeStrategy` interface が export されている
- `QueryOptions`, `WorkspaceOptions`, `WorkspaceContext`, `CleanupHandle` の 4 支援型が export されている

---

### TC-002: `core/port/index.ts` が RuntimeStrategy 型群を re-export している

**Category**: integration  
**Priority**: must  
**Source**: T-01 AC

**GIVEN** `src/core/port/runtime-strategy.ts` が新設されたとき  
**WHEN** `src/core/port/index.ts` の内容を確認する  
**THEN**
- `export type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./runtime-strategy.js"` 行が存在する

---

### TC-003: `core/port/runtime-prereqs.ts` が存在し 3 つの型を export する

**Category**: integration  
**Priority**: must  
**Source**: T-02 AC, design D2

**GIVEN** B-8 の制約により `prereqs.ts` を domain に移設できない状態で DI 化を適用したとき  
**WHEN** `src/core/port/runtime-prereqs.ts` の内容を確認する  
**THEN**
- ファイルが存在する
- `RuntimeCredentials` interface が export されている
- `RuntimePrereqChecker` interface が export されており、`check(cfg, env): Promise<{ field: string; hint: string } | null>` シグネチャを持つ
- `RuntimeCredentialsResolver` interface が export されており、`resolve(cfg, env): Promise<RuntimeCredentials>` シグネチャを持つ

---

### TC-004: `core/port/index.ts` が RuntimePrereqs 型群を re-export している

**Category**: integration  
**Priority**: must  
**Source**: T-02 AC

**GIVEN** `src/core/port/runtime-prereqs.ts` が新設されたとき  
**WHEN** `src/core/port/index.ts` の内容を確認する  
**THEN**
- `export type { RuntimeCredentials, RuntimePrereqChecker, RuntimeCredentialsResolver } from "./runtime-prereqs.js"` 行が存在する

---

### TC-005: `core/runtime/prereqs.ts` が削除されていない

**Category**: integration  
**Priority**: must  
**Source**: T-02 AC, T-04 AC, design D2

**GIVEN** DI 方式への移行が完了したとき  
**WHEN** `src/core/runtime/prereqs.ts` の存在と内容を確認する  
**THEN**
- ファイルが存在する（削除されていない）
- `checkRuntimePrereqs` 関数が export されている
- `resolveRuntimeCredentials` 関数が export されている
- `RuntimeCredentials` の定義は削除され `../port/runtime-prereqs.js` からの re-export に切り替わっている

---

### TC-006: `core/runtime/strategy.ts` が削除されている

**Category**: integration  
**Priority**: must  
**Source**: T-04 AC, design D3

**GIVEN** `src/core/port/runtime-strategy.ts` に全内容が移設されたとき  
**WHEN** `src/core/runtime/strategy.ts` の存在を確認する  
**THEN**
- ファイルが存在しない（削除済み）

---

### TC-007: domain 層が `runtime/strategy.js` を直接 import していない（4 ファイル解消）

**Category**: integration  
**Priority**: must  
**Source**: T-03 AC, request 要件3

**GIVEN** domain import site の張り替えが完了したとき  
**WHEN** `src/core/` 配下（`core/runtime/` を除く）で `runtime/strategy.js` への import を検索する  
**THEN**
- マッチが 0 件である
- 個別ファイル確認: `src/core/types.ts`, `src/core/command/runner.ts`, `src/core/command/resume.ts`, `src/core/command/pipeline-run.ts` のいずれにも `runtime/strategy.js` import がない

---

### TC-008: `preflight.ts` が `runtime/prereqs.js` を直接 import していない

**Category**: integration  
**Priority**: must  
**Source**: T-02 AC, T-03 AC

**GIVEN** `preflight.ts` の DI 化が完了したとき  
**WHEN** `src/core/preflight.ts` の import 文を確認する  
**THEN**
- `runtime/prereqs.js` への import が 0 件
- `./port/runtime-prereqs.js` からの import が存在する

---

### TC-009: `runPreflight` シグネチャに `deps` 引数が追加され DI 経由で呼び出されている

**Category**: integration  
**Priority**: must  
**Source**: T-02 AC, design D2

**GIVEN** `preflight.ts` の DI 化が適用されたとき  
**WHEN** `src/core/preflight.ts` の `runPreflight` 関数定義を確認する  
**THEN**
- `deps: { prereqChecker: RuntimePrereqChecker; credentialsResolver: RuntimeCredentialsResolver }` 引数が含まれている
- 関数本体で `checkRuntimePrereqs(config, env)` を直接呼んでいない（`deps.prereqChecker.check(...)` 経由になっている）
- 関数本体で `resolveRuntimeCredentials(config, env)` を直接呼んでいない（`deps.credentialsResolver.resolve(...)` 経由になっている）

---

### TC-010: `cli/run.ts` が具体的実装を `runPreflight` の `deps` に渡している

**Category**: integration  
**Priority**: must  
**Source**: T-02 AC, design D2

**GIVEN** `runPreflight` の `deps` 引数が追加されたとき  
**WHEN** `src/cli/run.ts` の `runPreflight` 呼び出し箇所を確認する  
**THEN**
- `checkRuntimePrereqs` を `../core/runtime/prereqs.js` から import している
- `resolveRuntimeCredentials` を `../core/runtime/prereqs.js` から import している
- `runPreflight` 呼び出しに `{ prereqChecker: { check: checkRuntimePrereqs }, credentialsResolver: { resolve: resolveRuntimeCredentials } }` が渡されている

---

### TC-011: B-8 invariant が維持されている（domain 層に `config.runtime` 分岐なし）

**Category**: integration  
**Priority**: must  
**Source**: T-02 AC, design D2 Rationale

**GIVEN** preflight.ts の DI 化が完了したとき  
**WHEN** `src/core/` 配下（`core/runtime/` を除く）で `(config|cfg)\.runtime` パターンを検索する  
**THEN**
- マッチが 0 件である
- `config.runtime` / `cfg.runtime` 分岐は `src/core/runtime/prereqs.ts` にのみ存在する

---

### TC-012: allowlist の `DSM-domain-comp-root-*` エントリが 0 件

**Category**: integration  
**Priority**: must  
**Source**: T-05 AC, request 要件4

**GIVEN** 5 件の DSM 違反がすべて解消されたとき  
**WHEN** `tests/unit/architecture/arch-allowlist.ts` を確認する  
**THEN**
- `DSM-domain-comp-root-preflight-prereqs` エントリが存在しない
- `DSM-domain-comp-root-types-strategy` エントリが存在しない
- `DSM-domain-comp-root-resume-strategy` エントリが存在しない
- `DSM-domain-comp-root-runner-strategy` エントリが存在しない
- `DSM-domain-comp-root-pipeline-strategy` エントリが存在しない
- セクションコメント `// ── C) domain → composition-root` も存在しない

---

### TC-013: DSM closure test が green（liveness guard 含む）

**Category**: integration  
**Priority**: must  
**Source**: T-06 AC, request 受け入れ基準

**GIVEN** allowlist の 5 エントリ削除と import site 張り替えが完了したとき  
**WHEN** DSM closure test を実行する  
**THEN**
- テストが pass する（実違反が 5 件減少）
- `forbiddenEdges.length >= dsmEntries.length` の liveness guard も pass する（allowlist 削減後もガードが維持されている）

---

### TC-014: `core-invariants.test.ts` の B-1〜B-9 が無改変で green

**Category**: integration  
**Priority**: must  
**Source**: T-06 AC, request 受け入れ基準

**GIVEN** 全リファクタリングが完了したとき  
**WHEN** `core-invariants.test.ts` を実行する  
**THEN**
- B-1〜B-9 のすべての describe ブロックが pass する
- 特に B-8（`core/runtime/` 外への `config.runtime` 分岐漏れチェック）が fail しない

---

### TC-015: composition-root 内ファイルが新 port path から import している

**Category**: integration  
**Priority**: must  
**Source**: T-04 AC

**GIVEN** `src/core/runtime/strategy.ts` が削除されたとき  
**WHEN** 以下のファイルの import 文を確認する  
**THEN**
- `src/core/runtime/local.ts`: `RuntimeStrategy` 等の import が `../port/runtime-strategy.js` 経由になっている
- `src/core/runtime/managed.ts`: 同様に `../port/runtime-strategy.js` 経由
- `src/core/runtime/factory.ts`: 同様に `../port/runtime-strategy.js` 経由
- `src/core/runtime/index.ts`: 型 re-export が `../port/runtime-strategy.js` からに切り替わっている
- `src/cli/bootstrap.ts`: `RuntimeStrategy` import が `../core/port/runtime-strategy.js` 経由になっている

---

### TC-016: テストファイルの `runtime/strategy.js` import が `port/runtime-strategy.js` に更新されている

**Category**: integration  
**Priority**: must  
**Source**: T-04

**GIVEN** `src/core/runtime/strategy.ts` が削除されたとき  
**WHEN** 以下のテストファイルの import 文を確認する  
**THEN**
- `tests/pipeline-integration.test.ts`: `core/port/runtime-strategy.js` 経由になっている
- `tests/unit/core/command/runner.test.ts`: 同様に更新済み
- `tests/unit/core/command/resume.test.ts`: 同様に更新済み
- `tests/unit/step/commit-and-push.test.ts`: 同様に更新済み
- `tests/unit/step/executor.commit.test.ts`: 同様に更新済み

---

### TC-017: `implementation-notes.md` に scan 結果が記録されている

**Category**: manual  
**Priority**: must  
**Source**: T-05 AC, request 受け入れ基準

**GIVEN** 全 import site の張り替えが完了したとき  
**WHEN** `specrunner/changes/dsm-runtime-strategy-demote/implementation-notes.md` を確認する  
**THEN**
- ファイルが存在する
- scan で確定した対象ファイル一覧が記載されている（`src/core/types.ts`, `src/core/command/runner.ts` 等 5 件以上）
- 変更前後の import path が対象ファイルごとに記録されている

---

### TC-018: プロジェクト標準 verification が全 green

**Category**: integration  
**Priority**: must  
**Source**: T-06 AC, request 受け入れ基準

**GIVEN** 全タスク（T-01〜T-05）が完了したとき  
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を実行する  
**THEN**
- `build` が error なく完了する
- `typecheck` が pass する
- `lint` が pass する
- `test` が全 pass する（DSM closure test + core-invariants test 含む）

---

### TC-019: `core/runtime/index.ts` barrel が prereqs 関連 export を維持している

**Category**: integration  
**Priority**: should  
**Source**: T-04, design D3

**GIVEN** barrel の型 re-export が更新されたとき  
**WHEN** `src/core/runtime/index.ts` を確認する  
**THEN**
- `checkRuntimePrereqs`, `resolveRuntimeCredentials`, `RuntimeCredentials` の re-export が残っている（削除されていない）
- barrel を消費する `src/cli/bootstrap.ts` / `src/cli/run.ts` でビルドエラーが発生しない

---

### TC-020: 並行 change との非干渉（`core/types.ts` の編集領域）

**Category**: manual  
**Priority**: should  
**Source**: request スコープ外, design Risks

**GIVEN** `core/types.ts` において本 change が line 9（RuntimeStrategy import）と `PipelineDeps.runtimeStrategy` フィールド周辺のみを編集したとき  
**WHEN** `core/types.ts` の `StepContext` 定義領域（line 20〜36 付近）を確認する  
**THEN**
- `StepContext` 定義領域が変更されていない（並行 `dsm-domain-type-demote` の編集領域を侵害していない）

---

### TC-021: プロジェクト全体で `runtime/strategy.js` への直接 import が 0 件

**Category**: integration  
**Priority**: should  
**Source**: T-04 AC

**GIVEN** 旧ファイルが削除されたとき  
**WHEN** プロジェクト全体で `runtime/strategy.js` への import を検索する  
**THEN**
- `core/runtime/index.ts` の re-export 含めていかなるファイルにも `./strategy.js` / `runtime/strategy.js` への import が存在しない（barrel も `../port/runtime-strategy.js` 経由に切り替わっている）

---

### TC-022: `RuntimeCredentials` が `core/port/runtime-prereqs.ts` で一元定義されている

**Category**: integration  
**Priority**: should  
**Source**: T-02, design D2

**GIVEN** `RuntimeCredentials` が `core/runtime/prereqs.ts` から `core/port/runtime-prereqs.ts` に移設されたとき  
**WHEN** `core/runtime/prereqs.ts` の `RuntimeCredentials` 関連コードを確認する  
**THEN**
- `RuntimeCredentials` の interface/type 定義が `prereqs.ts` の本体から削除されている
- `export type { RuntimeCredentials } from "../port/runtime-prereqs.js"` の re-export 行が存在する
- `bun run typecheck` で型の二重定義エラーが発生しない

---

### TC-023: T-01 完了直後（旧ファイル並存状態）でも typecheck が pass する

**Category**: integration  
**Priority**: could  
**Source**: T-01 AC

**GIVEN** `core/port/runtime-strategy.ts` が新設されたが `core/runtime/strategy.ts` がまだ削除されていない中間状態のとき  
**WHEN** `bun run typecheck` を実行する  
**THEN**
- 型エラーが発生しない（二重定義による衝突がない）

---

## Result

```yaml
result: completed
total: 23
automated: 21
manual: 2
must: 18
should: 4
could: 1
blocked_reasons: []
```
