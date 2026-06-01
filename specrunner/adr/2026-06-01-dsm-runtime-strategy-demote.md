# RuntimeStrategy / prereqs を ports 層へ降格し domain→comp-root の DSM 違反 5 件を解消する

**Date**: 2026-06-01
**Status**: accepted

## Context

`arch-closure-src-wide`（#495）が §3 DSM closure を src 全体に拡張し、21 件の既存 §3 違反を `arch-allowlist.ts`（invariant `DSM`）に凍結した。うち **domain→composition-root** カテゴリの 5 件は以下の理由で生じていた:

- `RuntimeStrategy` interface（runtime 実装の抽象）が `src/core/runtime/strategy.ts`（composition-root 層）に定義されており、domain 層の `core/types.ts` / `core/command/{runner,resume,pipeline-run}.ts` が直接 import していた。
- `checkRuntimePrereqs` / `resolveRuntimeCredentials` が `src/core/runtime/prereqs.ts`（composition-root）に定義されており、`core/preflight.ts`（domain）が直接 import していた。

§3 では **domain → composition-root は ✗**。`RuntimeStrategy` は interface（port semantics）であるから、hexagonal の原則どおり `core/port/` に置き、実装 (`LocalRuntime`, `ManagedRuntime`) を `core/runtime/` に残すのが正しい向きである。

`prereqs` の扱いは B-8 invariant と交差するため非自明だった。`checkRuntimePrereqs` は `cfg.runtime === "managed"` 分岐を含み、B-8 は `config.runtime` パターンが `src/core/runtime/` の外に漏れないことを要求する。これを domain にインラインすると B-8 が即座に失敗する。

## Decision

### D1: `RuntimeStrategy` interface + 支援型を `core/port/runtime-strategy.ts` に移設

`src/core/runtime/strategy.ts` を削除し、全内容（`RuntimeStrategy` interface・`QueryOptions`・`WorkspaceOptions`・`WorkspaceContext`・`CleanupHandle` 型）を `src/core/port/runtime-strategy.ts` に新設して移設する。

- `core/runtime/{local,managed,factory}.ts` は `../port/runtime-strategy.js` から import する（composition-root → ports は §3 ✓）。
- domain 側の全 import site（`core/types.ts`・`core/command/runner.ts`・`core/command/resume.ts`・`core/command/pipeline-run.ts`）は `../port/runtime-strategy.js` または `../../core/port/runtime-strategy.js` に張り替える（domain → ports は §3 ✓）。
- re-export shim（旧ファイルに `export * from` だけ残す）は不採用。dead code を残すと将来の grep が混乱する。

**Rationale**: port はインターフェース定義であり、`core/port/` に配置するのが hexagonal の正しい向き。comp-root に interface が置かれていたのは層の誤分類だった。

### D2: `RuntimePrereqChecker` / `RuntimeCredentialsResolver` port interface を `core/port/runtime-prereqs.ts` に新設し、DI で解決する

`checkRuntimePrereqs` を domain にインラインせず、port interface 経由の dependency injection を採用する。

1. `core/port/runtime-prereqs.ts` を新設し以下を定義する:
   - `RuntimePrereqChecker` interface: `check(cfg, env): Promise<{ field: string; hint: string } | null>`
   - `RuntimeCredentialsResolver` interface: `resolve(cfg, env): Promise<RuntimeCredentials>`
   - `RuntimeCredentials` type（`prereqs.ts` から移設）
2. `core/preflight.ts` の `runPreflight` シグネチャに `deps: { prereqChecker: RuntimePrereqChecker; credentialsResolver: RuntimeCredentialsResolver }` を追加し、`./runtime/prereqs.js` への直接 import を除去する。`./port/runtime-prereqs.js` から interface を import（domain → ports ✓）。
3. `core/runtime/prereqs.ts` は `core/runtime/` に留まる。`config.runtime` 分岐が domain 層に漏れず、B-8 違反はゼロを維持する。
4. `cli/run.ts`（composition-root）が具体実装オブジェクトを `runPreflight` に渡す（composition-root → ports ✓、composition-root → domain ✓）。

**Rationale**: B-8 と DSM の二律背反を port interface + DI で解消できる。インライン回収は `config.runtime` 分岐を domain に持ち込み B-8 が即座に 3 件失敗するため却下。

### D3: `arch-allowlist.ts` の `DSM-domain-comp-root-*` 5 エントリを削除

ratchet 規約（削除のみ許容）に従い、5 件のエントリを削除する。liveness guard（`forbiddenEdges.length >= dsmEntries.length`）が維持されることをテストで確認する。

## Alternatives Considered

### Alternative 1: `RuntimeStrategy` を shared-kernel に配置（D1 の対抗案）

- **Pros**: `src/config/` 等と同じ層に置けば domain・ports・comp-root いずれからも import 可能。
- **Cons**: `RuntimeStrategy` は Value Object でなく port interface。shared-kernel に port を置くと層の意味が崩れる。shared-kernel は「import ゼロ原則」の `src/kernel/` とも異なり、port を置く適切な場所ではない。
- **Why not**: port interface は `core/port/` に属する。却下。

### Alternative 2: `prereqs` をインライン回収して domain に移設（旧 D2 案）

- **Pros**: ファイル数が増えない。DI 配線が不要。
- **Cons**: `config.runtime === "managed"` 分岐が `src/core/` に入り、B-8 invariant（`src/core/runtime/` 以外に `config.runtime` 分岐を持たせない）が即座に 3 件失敗する。`prereqs.ts` の docstring 自身も「B-8 のため `core/runtime/` に閉じ込めた」と明記。
- **Why not**: B-8 との二律背反。却下。

### Alternative 3: `prereqs` 関数を runtime-agnostic に再設計

- **Pros**: domain に持ち込んでも B-8 に違反しない。
- **Cons**: `requirementsFor(cfg.runtime)` と managed 固有チェックの分離が必要であり、本 change の scope を大幅に超える。リスク増大。
- **Why not**: scope 超過。別 change として評価する。

### Alternative 4: `core/runtime/strategy.ts` に re-export shim を残す

- **Pros**: 外部 import の後方互換を維持できる。
- **Cons**: dead code が残り、将来の grep / import 解析が混乱する。移設先と旧ファイルの 2 箇所を更新し続けるメンテナンスコストが生じる。
- **Why not**: import site を一括張り替えする方がクリーン。却下。

## Consequences

### Positive

- `arch-allowlist.ts` の `DSM-domain-comp-root-*` エントリが 5 件から 0 件になる。domain→comp-root カテゴリが allowlist から消える。
- `RuntimeStrategy` が ports 層に正しく配置され、hexagonal 原則との整合性が回復する。
- `runPreflight` が port interface に依存するようになり、テストでモック注入が可能になる（testability 向上）。
- B-8 invariant が維持された状態で DSM violation を解消するパターンが確立される：「B-8 と DSM が交差する場合は port interface + DI で解決する」。

### Negative

- `runPreflight(requestMdPath, cwd, env)` → `runPreflight(requestMdPath, cwd, env, deps)` のシグネチャ変更により、呼び出し元（`cli/run.ts`）と全テストファイルの更新が必要になる。
- port ファイルが 2 件（`runtime-strategy.ts`・`runtime-prereqs.ts`）追加され、`core/port/` の管理ファイル数が増える。

### Known Debt

- **残存 DSM 違反 16 件**: adapter→domain 12 件・ports→domain 4 件が引き続き allowlist に残る。後続 burn-down change（`dsm-domain-type-demote` 等）で対応予定。
- **`RuntimeCredentials` 型の二重定義移行**: `prereqs.ts` が `core/port/runtime-prereqs.js` から re-import する形になる。将来 `prereqs.ts` を大幅リファクタする際に整理する。

## References

- Request: `specrunner/changes/dsm-runtime-strategy-demote/request.md`
- Design: `specrunner/changes/dsm-runtime-strategy-demote/design.md`
- Review: `specrunner/changes/dsm-runtime-strategy-demote/review-feedback-001.md`
- Implementation: `src/core/port/runtime-strategy.ts`・`src/core/port/runtime-prereqs.ts`・`src/core/preflight.ts`・`tests/unit/architecture/arch-allowlist.ts`
- 前 ADR: `specrunner/adr/2026-06-01-dsm-closure-src-wide.md`（DSM closure 検査確立・21 件凍結）
- 前 ADR: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（ratchet 機構の確立）
- 参照: `architecture/model.md` §2 層 mapping・§3 DSM matrix・§4 B-8 invariant
