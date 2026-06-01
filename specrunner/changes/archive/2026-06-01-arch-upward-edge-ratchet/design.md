# Design: closure の上向き edge（B-3/B-4）を ratchet で歯付けし R1/R3/R4 を凍結する

## Context

PR #482（`arch-test-core-wide-ratchet`）が `core-invariants.test.ts` + `arch-allowlist.ts` を新設し B-1/B-2/B-5〜B-8 を enforce した。しかし **B-3（上向き禁止）と B-4（leaf 純度）は no-op stub**（`expect(true).toBe(true)`）のまま deferred された。理由は「B-3/B-4 の違反は `core/` の外に起点があり、core scoped の scan では届かない」ため。

結果、以下の最高 ROI divergence が凍結されていない:

- **R1**: `parser/` → `core/request/types`, `core/validation/`（循環）
- **R3**: `config/migrate.ts`, `state/schema.ts` → `core/step/step-names`
- **R4**: `util/slugify.ts` → `core/request/store`, `util/copy-artifacts.ts` → `prompts/logger/state/templates/errors`

本 change は #482 の test/allowlist 機構を拡張し、B-3/B-4 の no-op を実 assert に置き換え、既存の上向き edge を allowlist で凍結する。

### 現在の violation 全件（grep 結果、test ファイル除外）

**B-3（shared-kernel / persistence → core/）**:

| # | file | import target | tracking |
|---|------|--------------|----------|
| 1 | `src/parser/request-md.ts` | `core/request/types` (export type) | R1 |
| 2 | `src/parser/request-md.ts` | `core/request/types` (import type) | R1 |
| 3 | `src/parser/rules/title-required.ts` | `core/validation/types` | R1 |
| 4 | `src/parser/rules/slug-required.ts` | `core/validation/types` | R1 |
| 5 | `src/parser/rules/adr-required.ts` | `core/validation/types` | R1 |
| 6 | `src/parser/rules/type-required.ts` | `core/validation/types` | R1 |
| 7 | `src/parser/rules/type-known.ts` | `core/validation/types` | R1 |
| 8 | `src/parser/rules/types.ts` | `core/request/types` | R1 |
| 9 | `src/parser/rules/base-branch-required.ts` | `core/validation/types` | R1 |
| 10 | `src/parser/rules/adr-valid.ts` | `core/validation/types` | R1 |
| 11 | `src/parser/rules/index.ts` | `core/validation/registry` | R1 |
| 12 | `src/config/migrate.ts` | `core/step/step-names` | R3 |
| 13 | `src/state/schema.ts` | `core/port/model-usage` (import type) | B3-state-port |
| 14 | `src/state/schema.ts` | `core/port/report-result` (import type) | B3-state-port |
| 15 | `src/state/schema.ts` | `core/port/model-usage` (export type) | B3-state-port |
| 16 | `src/state/schema.ts` | `core/step/step-names` | R3 |
| 17 | `src/state/helpers.ts` | `core/port/report-result` (import type) | B3-state-helpers |
| 18 | `src/logger/pipeline-logger.ts` | `core/event/event-bus` (import type) | B3-logger |

**B-4（leaf/util/ → anything）**:

| # | file | import target | tracking |
|---|------|--------------|----------|
| 1 | `src/util/copy-artifacts.ts` | `prompts/rules` | R4 |
| 2 | `src/util/copy-artifacts.ts` | `logger/stdout` | R4 |
| 3 | `src/util/copy-artifacts.ts` | `errors` | R4 |
| 4 | `src/util/copy-artifacts.ts` | `templates/step-output-templates` | R4 |
| 5 | `src/util/copy-artifacts.ts` | `state/schema` (import type) | R4 |
| 6 | `src/util/slugify.ts` | `core/request/store` (export re-export) | R4 |

## Goals / Non-Goals

**Goals**:

- B-3 / B-4 の no-op stub を **実際の grep scan + allowlist フィルタ付き assert** に置き換える
- 検出された全 violation を `arch-allowlist.ts` に B-3 / B-4 エントリとして追加し、suite を green にする
- T-04 regression guard を B-3 / B-4 に拡張し、新規上向き edge が CI を red にすることを保証する
- `module-boundary` delta spec で B-3/B-4 被覆を反映し、#482 の「deferred」記述を supersede する

**Non-Goals**:

- R1/R3/R4 の violation を修正する（burn-down は別 request）
- B-1/B-2/B-5〜B-8 の既存 test を変更する
- `architecture/` docs の編集
- `cli/` 等の call-site 違反の検出（B-5〜B-8 の領域）

## Decisions

### D1: B-3 の grep scope — `core/` 全体（port/ 含む）

**決定**: B-3 の grep pattern は shared-kernel ディレクトリ + persistence（`src/store/`）から `core/` への import を**サブパス制限なし**で検出する。`core/port/` への import も B-3 違反として扱う。

**Rationale**: model.md §3 の closure table で shared-kernel → ports も ✗（forbidden）。port/ を除外すると `state/schema.ts` → `core/port/model-usage` 等が歯から漏れ、divergence が凍結されない。grep を `core/` 全体にかけるほうが simple かつ closure table に忠実。

**Alternatives considered**:
- `core/port/` を除外し B-3 を domain subpath 限定にする → closure table で forbidden な edge が歯から漏れる。不採用。

### D2: B-3 の scan 対象ディレクトリ

**決定**: B-3 は以下のディレクトリを scan する:
- shared-kernel: `src/parser/`, `src/config/`, `src/state/`, `src/git/`, `src/prompts/`, `src/logger/`, `src/templates/`
- persistence: `src/store/`

`src/util/`（leaf）は B-4 が独立して「何も import しない」を assert するため B-3 scope から除外する（重複回避）。

**Rationale**: model.md §2 の層 mapping に準拠。B-4 が leaf の全 import を禁止するため、B-3 で leaf を二重に見る必要はない。

### D3: B-4 の grep pattern — `src/` 内の全 import を検出

**決定**: B-4 は `src/util/` 内のファイルが `../` で始まる相対 import を持つかを grep で検出する。これは `util/` 外の任意の `src/` モジュールへの import をすべて捕捉する。

**Rationale**: B-4 の定義は「leaf は何も import しない」（model.md §4）。`../` パターンで `util/` 外への全 import を一括検出でき、import 先を列挙する必要がない。`./`（util 内部）は許容する（leaf 内部の分割は層違反ではない）。

**Alternatives considered**:
- 特定の import 先（`core/`, `prompts/` 等）を個別に grep する → 新しい import 先の追加を見逃すリスク。不採用。

### D4: 既存 test の grepE helper を再利用

**決定**: `core-invariants.test.ts` の既存 `grepE()` + `parseGrepOutput()` + `filterViolations()` を B-3/B-4 でも再利用する。B-3 は scan 対象が複数ディレクトリのため、ディレクトリごとに `grepE()` を呼び結果を concat する。

**Rationale**: #482 が確立した ratchet 機構（grep → parse → allowlist filter → assert empty）をそのまま拡張できる。新しいテスト基盤を導入する必要がない。

**Alternatives considered**:
- 全ディレクトリを一度に grep するために `grepE` を `src/` 全体にかけ exclude で絞る → `grepE` は単一ディレクトリ引数のため変更が必要。既存 helper を変えず concat するほうが低リスク。

### D5: test ファイル除外

**決定**: B-3/B-4 の grep 結果から `__tests__/` ディレクトリと `.test.ts` ファイルを除外する。

**Rationale**: test ファイルは production の依存グラフに含まれない。#482 の B-6 test が `__tests__/` を除外する前例に従う。`src/logger/__tests__/pipeline-logger.test.ts` → `core/event/event-bus` のような test 内 import は false positive になる。

### D6: comment line 除外は既存 filterViolations で対応

**決定**: `filterViolations()` は既に `isCommentLine()` フィルタを含んでいるため、B-3/B-4 でも追加のコメント除外ロジックは不要。

### D7: T-04 regression guard — synthetic injection 方式を踏襲

**決定**: B-3 / B-4 の regression guard は、既存の B-1/B-2/B-6 regression guard と同じ synthetic injection 方式で実装する。実際のファイルを作成するのではなく、`GrepMatch[]` を手動構築して `filterViolations()` に通し、allowlist にない新規 edge が検出されることを assert する。

**Rationale**: #482 の T-04 パターンを踏襲。real grep ではなく synthetic data を使うため、test の実行が速く、filesystem 副作用がない。

## Risks / Trade-offs

- [Risk] `grepE` の pattern が `export type` と `import type` の両方を捕捉する → import / export の区別なく「`core/` への参照」を全件検出することで false negative を防ぐ。`export type { X } from "core/..."` も上向き re-export（依存の伝播）であり B-3 違反。
- [Risk] 実装者が grep を実行した時点で新たな violation が見つかる可能性がある → 設計上「scan が検出する全件を allowlist 化する」を authoritative とし、実装者の grep 実行結果が正典。本 design の violation 表は seed であり網羅を保証しない。
- [Risk] `src/store/` に将来 `core/` import が追加された場合に B-3 で検出されるか → D2 で store を B-3 scope に含めているため検出される。現時点で violation は 0 件。

## Open Questions

なし。
