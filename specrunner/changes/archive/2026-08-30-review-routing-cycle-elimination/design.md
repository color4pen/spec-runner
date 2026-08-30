# Design: review routing の value-import cycle を解消する

## Context

PR #1098 merge 後の main (`96f4db6a`) で確認された value-import SCC が2組ある。

### 確認済みの循環エッジ

**SCC-A（2ノード）**
```
pipeline/reviewer-chain → step/fixer-helpers    (getConformanceFixContext, line 19)
step/fixer-helpers       → pipeline/reviewer-chain (deriveImplFixerChain, resolveActiveReviewer, line 14)
```

**SCC-B（4ノード）**
```
pipeline/reviewer-chain  → step/regression-gate    (REGRESSION_GATE_STEP_NAME, line 18)
step/regression-gate     → pipeline/findings-ledger (computeRegressionLedger, computeLedgerRef, line 27)
pipeline/findings-ledger → step/fixer-helpers       (getLatestJudgeFindings, line 14)
step/fixer-helpers       → pipeline/reviewer-chain  (deriveImplFixerChain, resolveActiveReviewer, line 14)
```

`findings-ledger.ts` のコメント（lines 213–218, 264–268）が示すとおり、一部の循環は引数注入（reviewerChain をパラメータ渡し）で既に回避されているが、上記4辺は依然として SCC を形成している。

既存の architecture tests（B-1〜B-18、DSM closure）は同一ドメイン層内の SCC を対象外とするため、これらの循環は検知されていない。

### 影響範囲

`reviewer-chain.ts` を value import するファイル（テスト除く）:
- `pipeline/pipeline.ts`, `pipeline/types.ts`, `pipeline/compose-reviewers.ts`
- `decision/wontfix.ts`
- `step/routed-findings.ts`, `step/fixer-helpers.ts` (cycle), `step/regression-gate.ts` (cycle), `step/code-fixer.ts`

`fixer-helpers.ts` を value import するファイル（テスト除く）:
- `pipeline/findings-ledger.ts` (cycle), `pipeline/spec-observation.ts`, `pipeline/reviewer-chain.ts` (cycle)
- `step/prior-round-context.ts`, `step/routed-findings.ts`, `step/code-fixer.ts`, `step/spec-fixer.ts`, `step/implementer.ts`, `step/custom-reviewer-round-context.ts`
- `decision/wontfix.ts`

---

## Goals / Non-Goals

**Goals**:
- `src/` 内の value-import SCC を 0 件にする
- SCC を静的に検出する architecture test を追加する
- STANDARD / FAST / custom reviewer pipeline の transition 構造が変化していないことを保証する parity test を追加する
- observable behavior を一切変更しない

**Non-Goals**:
- reviewer / fixer / regression-gate の機能変更
- parallel reviewer 実行方式の変更
- pipeline descriptor の公開契約変更
- RuntimeStrategy、agent runner、CommandSpec の整理
- test 配置の移動
- `step/`, `pipeline/` 以外の既存モジュールの大規模 rename
- `pipeline/types.ts` の `REGRESSION_GATE_STEP_NAME` import 元更新（今回 SCC に直接寄与しないため scope 外）

---

## Decisions

### D1: 中立な pure module `src/core/review-routing.ts` を既存ドメイン層内に新設する

**Rationale**: SCC を解消するには、`pipeline/` と `step/` の双方が依存できる upstream の純粋モジュールが必要。新しい architecture layer を追加せず既存 `core/` 内に配置することで、DSM whitelist の変更を最小化する。単一ファイルとすることで実装 footprint を抑える。

**Alternatives considered**:
- `src/core/review-routing/` ディレクトリ（複数ファイル分割）: 関数群は密結合しており分割する意義が薄い。単一ファイルの方が変更範囲が小さく追跡しやすい。Rejected。
- 既存 `pipeline/` か `step/` に配置: 一方向依存が成立しないため不可。Rejected。

**`review-routing.ts` が export する識別子**:
- `REGRESSION_GATE_STEP_NAME` — 文字列定数（"regression-gate"）
- `deriveImplReviewerChain` — reviewer chain 導出（`pipeline/reviewer-chain` から移動）
- `deriveImplFixerChain` — fixer chain 導出（`pipeline/reviewer-chain` から移動）
- `resolveActiveReviewer` — active reviewer 解決（startedAt 比較・tie-break）（`pipeline/reviewer-chain` から移動）
- `nextAfterReviewer` — chain 内の次ステップ取得（`pipeline/reviewer-chain` から移動）
- `getLatestJudgeFindings` — judge ステップの最新 findings 読み取り（`step/fixer-helpers` から移動）
- `getConformanceFixContext` — conformance fix context 検出（`step/fixer-helpers` から移動）
- `conformanceFixInProgress` — routing predicate（`pipeline/reviewer-chain` から移動）
- `regressionGateActive` — routing predicate（`pipeline/reviewer-chain` から移動）
- `codeReviewLoopActive` — routing predicate（`pipeline/reviewer-chain` から移動）

**`review-routing.ts` の import 制約**:
- type-only のみ許容: `Transition`、`JobState`、`ReviewerSnapshot`、`CodeReviewReportResult`、`Finding`（いずれも `import type`）
- value import 許容（cycle なし、pure utility）: `STEP_NAMES`（step/step-names→kernel/leaf）、`collectFixableFindings`（step/judge-verdict）、`filterUndecidedFindings`（decision/decision-ledger）
- `pipeline/` composition module および `step/` factory module への value import: **禁止**

### D2: `buildReviewerChainTransitions` / `buildParallelReviewerTransitions` は `pipeline/reviewer-chain.ts` に残す

**Rationale**: これらの関数は `Transition` 型（`pipeline/types.ts` 定義）を返す pipeline composition 機能であり、`pipeline/` 層の責務に属する。`review-routing.ts` に移動せず、`reviewer-chain.ts` が `review-routing.ts` の純粋ロジックを import して transition を構築する形にすることで、層の責務を明確に保つ。

**Alternatives considered**:
- `review-routing.ts` に transition builder ごと移動する: `import type { Transition }` で型のみ参照すれば value cycle にならないが、pipeline composition 関数が domain pure module に混在することになりぎこちない。Rejected。

### D3: 変更後の `pipeline/reviewer-chain.ts` は re-export barrel として後方互換を維持する

**Rationale**: `pipeline/pipeline.ts`、`step/code-fixer.ts`、`step/routed-findings.ts`、`decision/wontfix.ts` など多数の callers が `reviewer-chain.ts` を import している。これらを一括変更するとスコープが広がる。re-export barrel にすることで callers を変更せず済む。

**変更後の `reviewer-chain.ts` 構造**:
- 削除: `step/regression-gate` / `step/fixer-helpers` への value import
- 追加: `review-routing.ts` から `REGRESSION_GATE_STEP_NAME`、routing predicates、`getLatestJudgeFindings` を import
- 追加: re-export section（`deriveImplReviewerChain`、`deriveImplFixerChain`、`resolveActiveReviewer`、`nextAfterReviewer`、routing predicates）
- 残留: `buildReviewerChainTransitions`、`buildParallelReviewerTransitions`、`lastReviewerFixableCount`、private helper `lastFindingsOf`（`getLatestJudgeFindings` 経由に更新）

### D4: `step/fixer-helpers.ts` は移動済み関数を `review-routing.ts` から re-export する

**Rationale**: `getLatestJudgeFindings`、`getConformanceFixContext` を使用するファイルは多数ある（`step/code-fixer.ts`、`step/spec-fixer.ts`、`step/implementer.ts`、`pipeline/spec-observation.ts`、`decision/wontfix.ts` 等）。これらの callers を変更せず、`fixer-helpers.ts` から re-export することで backward compat を保つ。

**Alternatives considered**:
- 全 callers を `review-routing.ts` 直接 import に書き換える: 変更ファイル数が増え、スコープ外作業になる。Rejected。

### D5: SCC 検査は静的ファイル解析（regex ベース）で実装する

**Rationale**: 要件「cycle detectorの導入に既存production moduleの読み込みや副作用を必要としないこと」に直接対応する。TypeScript ファイルのテキストを読み込み、正規表現で import 文を解析する。

**import の type-only 判定ルール**:
- `import type { ... } from "..."` → type-only（value edge としてカウントしない）
- `export type { ... } from "..."` → type-only（同上）
- `import { type X, Y } from "..."` → Y のみ value edge、type X は除外
- `export { type X, Y } from "..."` → Y のみ value edge
- `import { X } from "..."` → value edge
- `import X from "..."` → value edge（default import）
- `import * as X from "..."` → value edge（namespace import）

SCC 検出: Tarjan's algorithm（O(V+E)）をテストファイル内にインライン実装。外部ライブラリ・production module ロード不要。

**Alternatives considered**:
- ts-morph / tsc programmatic API: TS compiler を起動するため重く、side-effect（型チェック等）が生じる。Rejected。
- 既存の grep ベース architecture test: SCC 検出には graph traversal が必要で grep では不十分。Rejected。

### D6: Transition parity test は明示的構造アサーションで実装する

**Rationale**: `when` クロージャはシリアライズできないため golden file snapshot は lossy になる。step / on / to / guard 有無を各行について明示的にアサーションすることで、行の追加・削除・順序変更が即座に失敗として検出される。

**テスト対象**:
1. `buildReviewerChainTransitions(["code-review"])` の出力（STANDARD / FAST で利用される無 reviewer ケース）
2. `buildParallelReviewerTransitions({ coordinator, members })` の出力（custom reviewer ありケース）
3. `STANDARD_TRANSITIONS` の code-review / code-fixer セクション
4. `FAST_TRANSITIONS` の code-review / code-fixer セクション

**Alternatives considered**:
- JSON snapshot: クロージャが含まれるため不可。Rejected。

---

## Risks / Trade-offs

[Risk 1]: `reviewer-chain.ts` が re-export barrel になることで、一部の static analysis ツールが tree-shaking を誤認する可能性がある。
→ Mitigation: この project は Bun runtime のみで実行される（browser bundler 不使用）。build + typecheck で確認する。

[Risk 2]: `lastFindingsOf`（private）が `getLatestJudgeFindings` を経由するよう変更される際、戻り値の型（`[]` vs `null`）の違いが動作に影響する可能性がある。
→ Mitigation: `lastFindingsOf` は `getLatestJudgeFindings` の戻り値 `null` を `[]` に変換するラッパーとして実装する。既存の動作は保たれる。既存の `buildReviewerChainTransitions` テストが green を維持することで確認する。

[Risk 3]: SCC test が `__tests__/`・`.test.ts` ファイルを誤スキャンして false positive を報告する可能性がある。
→ Mitigation: スキャン対象を `src/` のみ（`__tests__/`、`.test.ts` を除外）に限定する。liveness guard（スキャン対象ファイル数 > 0）を追加する。

[Risk 4]: re-export barrel 経由の callers が型チェック時に type-only import として誤認識される可能性がある。
→ Mitigation: TypeScript の re-export は値エクスポートとして正しく解釈される。`bun run typecheck` で確認する。

---

## Open Questions

現時点でブロッキングな未解決事項なし。

補足: `pipeline/types.ts` が `step/regression-gate.ts` から `REGRESSION_GATE_STEP_NAME` を import している件（line 3）は、今回の SCC に直接寄与しないが（`regression-gate → findings-ledger → review-routing` に変わり back-edge なし）、次の cleanup 機会に `review-routing.ts` への direct import に整理するとよい（今回スコープ外）。
