# DSM burn-down 2: adapter / port の domain 直参照を shared-kernel 降格で一括解消

**Date**: 2026-06-01
**Status**: accepted

## Context

`arch-closure-src-wide`（#495 / ADR `2026-06-01-dsm-closure-src-wide`）で凍結した §3 DSM 違反 21 件のうち、adapter→domain 12 件と ports→domain 4 件の計 16 件を burn-down する。

残り 5 件（domain→comp-root）は並行 change `dsm-runtime-strategy-demote` の領分。

**構造的問題の本質**: adapter と port が**同じ** domain 型（`core/agent/definition` / `core/step/types` / `core/event/types` / `core/tools/types`）を直 import している。from 層（adapter / port）ごとに対策するのではなく、参照される型を legal な層に降格すれば双方の edge を一度に合法化できる。

**先例（R3）**: `core/step/step-names.ts` は既に `src/kernel/step-names.ts` の re-export barrel として存在。今回はこのパターンを 8 型に横展開する。

## Decision

### D1: 「from 層」でなく「降格する型」を cohesion 軸にグループ化

adapter と port が同一 domain 型を参照している場合、その型を一箇所に降格するだけで adapter edge と port edge が同時に legal になる（§3 で shared-kernel への import は全層から許可）。

この grouping により:
- `core/agent/definition` を降格 → adapter/managed-agent/anthropic-client + core/port/anthropic-client 両方が解消
- `core/step/types` を降格 → adapter/managed-agent/agent-runner + core/port/agent-runner 両方が解消
- `core/event/types` を降格 → adapter/claude-code/agent-runner + core/port/agent-runner 両方が解消
- `core/tools/types` を降格 → adapter/managed-agent/{sse-stream,session-client} + core/port/session-client 両方が解消

### D2: 降格先の決定基準 — kernel 「import ゼロ」原則が分岐点

降格先候補は `src/kernel/`（shared-kernel）と `src/core/port/`（ports）の 2 択。

**決定基準**: `src/kernel/` に置けるのは、その型が `src/kernel/` 内の他モジュールと `src/util/` / npm leaf パッケージのみに依存する型に限る。外部への import が 1 件でも存在する場合は `core/port/` に降格する。

| 型 | 降格先 | 理由 |
|---|---|---|
| `core/agent/definition` → `kernel/agent-definition.ts` | kernel | 外部 import ゼロ（リテラル型のみ） |
| `core/event/types` → `kernel/event-types.ts` | kernel | 外部 import ゼロ |
| `core/tools/types` → `kernel/tool-types.ts` | kernel | 外部 import ゼロ |
| `core/lifecycle/diagnostic` → `logger/diagnostic.ts` | shared-kernel（logger） | logger = shared-kernel 扱い。pure utility（logger 依存のみ） |
| `core/types.ts:StepContext` → `core/port/step-context.ts` | port | `JobState` 等に依存、kernel import ゼロ原則に抵触 |
| `core/step/types` → `core/port/step-types.ts` | port | `AgentDefinition` / `ReviewScores` 等の kernel 型を re-export するため |
| `core/step/executor-helpers:{throwWrappedError,attachStateAndRethrow}` → `core/port/error-helpers.ts` | port | `JobState`（state/schema）に依存、kernel import ゼロ原則に抵触 |

**残存関数 (`createSessionWithHistory` / `recordFailedStepResult` / `failStepWithError`)**: `SessionClient` port / `JobStateStore` 実装への依存があるため domain に残す。

### D3: re-export barrel パターンで domain 内 import site を無変更に保つ

移動後の元パスに `export * from` / `export type { X } from` の 1 行 re-export barrel を残す。

**効果**: `core/step/` 内 ~20 箇所が `../agent/definition.js` を参照している既存コードを無変更でコンパイル成功させる。adapter / port のみ新しい legal path に張り替える対象となり、変更ファイル数と並行 change との衝突リスクを最小化する。

**先例**: `core/step/step-names.ts` が既にこのパターン（R3 から）。

### D4: `step-names` adapter 参照は kernel 直参照に張り替えるだけ

`core/step/step-names.ts` は既に `kernel/step-names.ts` の re-export barrel のため、adapter の import を `../../kernel/step-names.js` に変更するだけで §3 違反が解消（新ファイル不要）。

### D5: allowlist エントリを 16 件削除（削除のみ、追加なし）

ratchet 規約継承: `arch-allowlist.ts` の `DSM-adapter-domain-*`（12 件）と `DSM-ports-domain-*`（4 件）を削除。liveness guard も維持。

## Alternatives Considered

### Alternative 1: from 層（adapter / port）ごとに対策

adapter は ports 経由でアクセス、port は VO のみ継続使用、と層ごとに対策する。

- **Pros**: 層責務に忠実な解決。
- **Cons**: adapter と port が同じ型を必要としている場合、型の扱いが分岐する。ports への interface 追加が過剰になりやすい。変更ファイル数が多くなる。
- **Why not**: 共有型を 1 箇所に降格する方が影響ファイル数が少なく、並行 change との衝突も最小。

### Alternative 2: barrel なしで全 import site を張り替え

domain 内の `core/step/types.ts` 参照箇所（~20 箇所）もすべて kernel パスに書き換える。

- **Pros**: barrel の積層がなくなり、モジュール依存グラフが単純化される。
- **Cons**: 変更ファイル数が大幅に増加（特に `core/step/` 内）。並行 change との衝突リスクが増す。
- **Why not**: barrel を残す方が変更範囲が最小で安全。将来の burn-down で barrel を除去して直参照に切り替えることは可能。

### Alternative 3: 型を ports に移動

adapter が参照する型を `core/port/` に置く（共通の降格先を port 層とする）。

- **Pros**: ports は adapter から参照可能（§3 で legal）。
- **Cons**: ports は interface 定義の場所であり、VO / 値定数を置く場所ではない（§2 の責務に反する）。§3 で kernel への import は全層から許可されているが、ports への import は adapters と domain に限られる。
- **Why not**: 型の性質（純粋 VO / 値定数）が kernel 配置に適合する。

## Consequences

### Positive

- `arch-allowlist.ts` の DSM カテゴリ違反が 16 件減少し、21 件 → 5 件（残り 5 件は domain→comp-root, 並行 change の領分）。
- adapter / port の import site が legal path に更新され、DSM closure test が green になる。
- **kernel 降格 + re-export barrel** パターンが `step-names`（R3 先例）に加え、6 型で確立された。今後の burn-down で同パターンを参照できる。
- **kernel import ゼロ原則が型配置の分岐基準として明文化**された。domain 依存を持つ型は `core/port/` に置く規則が実証された。

### Negative

- re-export barrel が 5 件増加（`core/agent/definition.ts`, `core/step/types.ts`, `core/tools/types.ts`, `core/lifecycle/diagnostic.ts`, `core/port/github-client.ts`）。将来の burn-down で barrel を除去して直参照に統一する作業が残る。
- `core/port/` に型ファイル（`step-context.ts`, `step-types.ts`, `error-helpers.ts`）が置かれ、port 層に interface 以外の成果物が混在する。これは kernel import ゼロ制約が原因であり、将来 kernel の制約を緩和するか、中間層を設ける選択肢がある。

### Known Debt

- **barrel 除去**: 6 つの re-export barrel は将来の burn-down で直参照に切り替えられる候補。ただし domain 内 import site の全張り替えを伴うため、専用 change として切り分けること。
- **`core/port/` の型ファイル**: `StepContext` / `StepDeps` 等の VO が port 層に置かれている。kernel の import ゼロ制約を保ちながら、より適切な配置（例: 中間 `shared/` 層の新設）は architecture/model.md の改訂とともに検討する。
- **残り 5 件（domain→comp-root）**: 並行 change `dsm-runtime-strategy-demote` で処理。

## References

- Request: `specrunner/changes/dsm-domain-type-demote/request.md`
- Design: `specrunner/changes/dsm-domain-type-demote/design.md`
- Review: `specrunner/changes/dsm-domain-type-demote/review-feedback-001.md`
- 先行 ADR: `specrunner/adr/2026-06-01-dsm-closure-src-wide.md`（DSM §3 closure 検査確立 + 21 件凍結）
- 先行 ADR: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（ratchet 機構確立）
- 先例（R3）: `specrunner/adr/2026-05-31-structure-rulings.md`（step-names kernel 降格）
- Implementation: `src/kernel/{agent-definition,event-types,tool-types}.ts`・`src/core/port/{step-context,step-types,error-helpers}.ts`・`src/logger/diagnostic.ts`・`tests/unit/architecture/arch-allowlist.ts`
