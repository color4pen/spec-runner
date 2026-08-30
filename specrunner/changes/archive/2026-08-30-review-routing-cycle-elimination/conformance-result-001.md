# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Requirement: review-routing は pipeline / step factory への value import を持たない

`src/core/review-routing.ts` の import 文を全件確認:

- `import type { JobState }` — type-only ✓
- `import type { ReviewerSnapshot }` — type-only ✓
- `import type { Finding }` — type-only ✓
- `import { STEP_NAMES } from "./step/step-names.js"` — value import (許容) ✓

`pipeline/`・`step/fixer-helpers`・`step/regression-gate` への value import が 0 件であることを確認。

TC-001・TC-002: `value-import-scc.test.ts` の review-routing.ts 直接制約テスト (4 assertions) が PASS。

### Requirement: src/ の value-import SCC が 0 件になる

SCC-A 解消 (reviewer-chain ↔ fixer-helpers):
- `reviewer-chain.ts`: `step/fixer-helpers` への value import を削除し、`review-routing.ts` から必要な識別子を取得 ✓
- `fixer-helpers.ts`: `pipeline/reviewer-chain` への value import を削除し、`review-routing.ts` から re-export ✓

SCC-B 解消 (4ノード: reviewer-chain → regression-gate → findings-ledger → fixer-helpers → reviewer-chain):
- `reviewer-chain.ts`: `step/regression-gate` への value import 削除 ✓
- `regression-gate.ts`: `pipeline/reviewer-chain` への value import 削除、`review-routing.ts` から import ✓
- `findings-ledger.ts`: `step/fixer-helpers` への value import 削除、`review-routing.ts` から import ✓

TC-003～TC-005: `value-import-scc.test.ts` — `src/` 全体の value-import SCC = 0 件を自動検証。16/16 PASS。

### Requirement: type-only import は SCC 検出の対象外になる

TC-006: `import type { ... }` / `export type { ... }` が value edge として数えられないことをアサーション済み ✓
TC-007: inline type modifier `import { type X, Y }` において Y のみ value edge、X は除外されることを確認 ✓

### Requirement: STANDARD / FAST pipeline の transition 構造が変化しない

TC-008: `STANDARD_TRANSITIONS` の code-review / code-fixer 行が `buildReviewerChainTransitions(["code-review"])` と step / on / to / hasGuard の全列・全行において完全一致することを確認 (7 rows) ✓
TC-009: `FAST_TRANSITIONS` の code-review / code-fixer 行が同様に完全一致 ✓

transition-parity.test.ts — 24/24 PASS。

### Requirement: custom reviewer pipeline の transition 構造が変化しない

TC-010: `buildParallelReviewerTransitions` の code-fixer priority routing 検証:
- Priority 1 (conformanceFixInProgress) → conformance, hasGuard=true ✓
- Priority 2 (regressionGateActive) → regression-gate, hasGuard=true ✓
- Priority 3 (codeReviewLoopActive) → code-review, hasGuard=true ✓
- Priority 4 (default) → coordinator, hasGuard=false ✓

TC-011: coordinator セクション (approved→regression-gate, needs-fix→code-fixer, skipped→regression-gate) および regression-gate セクション (approved→conformance, needs-fix→code-fixer, skipped→conformance) 全行一致 ✓

### Requirement: 既存の step ロジックが変化しない

TC-012: `resolveActiveReviewer` の tie-break ロジック (`lastRun.startedAt >= latestTime` で chain 後位優先) が `review-routing.ts` line 75 に保持されていることを確認。reviewer-chain.test.ts 56/56 PASS。 ✓

TC-013: `getConformanceFixContext` の recency check (`latestPredecessor.endedAt >= latestConformance.endedAt` → null を返却) が `review-routing.ts` line 187 に保持されていることを確認。 ✓

### Gate 検証

| Gate | コマンド | 結果 |
|------|---------|------|
| build | `bun run build` | PASS |
| typecheck | `bun run typecheck` | PASS (0 エラー) |
| lint | `bun run lint` | PASS (0 warnings) |
| full test | `bun run test` | PASS — 826 files, 12545 passed, 1 skipped, 2 todo |
| value-import-scc.test.ts | | PASS — 16/16 |
| transition-parity.test.ts | | PASS — 24/24 |
| core-invariants.test.ts (B-1~B-18) | | PASS — 72/72 |
| reviewer-chain.test.ts (TC-028~TC-032 含む) | | PASS — 56/56 |
| findings-ledger.test.ts | | PASS — 26/26 |

### TC-018 (liveness guard) / TC-019 (Tarjan regression guard) / TC-020 (テストファイル除外) / TC-021 (production module ロードなし)

value-import-scc.test.ts 内で確認:
- liveness guard: `src/` から 1 件以上のソースファイルが検出されること ✓
- 合成 2-node SCC (A→B, B→A) が検出されること ✓
- `__tests__/` ディレクトリおよび `.test.ts` ファイルが除外されること ✓
- `import()`・`require()`・`createRequire` が使用されていないことを self-check でアサート ✓

### TC-022 (lastFindingsOf の null → [] 変換)

`reviewer-chain.ts` line 55–57:
```typescript
function lastFindingsOf(state: JobState, reviewer: string): Finding[] {
  return getLatestJudgeFindings(state, reviewer) ?? [];
}
```
`getLatestJudgeFindings` が `null` を返す場合に `[]` に変換している。Design Risk-2 の mitigation が正しく実装されている ✓

### TC-015 / TC-016 / TC-017 (backward compat re-export)

- `reviewer-chain.ts` が `deriveImplReviewerChain`, `deriveImplFixerChain`, `resolveActiveReviewer`, `nextAfterReviewer`, `conformanceFixInProgress`, `regressionGateActive`, `codeReviewLoopActive` を re-export ✓
- `fixer-helpers.ts` が `getLatestJudgeFindings`, `getConformanceFixContext` を re-export ✓
- `regression-gate.ts` が `REGRESSION_GATE_STEP_NAME` を re-export ✓

全 callers が変更なしでコンパイル可能。typecheck PASS で確認済み。

## 検証できなかった項目

None。TC-001～TC-027 の全 27 件を検証済み。

## Findings 詳細

None。すべての normative 要件が満たされている。

---

## Plan Divergences（normative findings なし）

### Design D1 — 実装が許可済み import の部分集合のみを使用

design.md は `collectFixableFindings`（step/judge-verdict）と `filterUndecidedFindings`（decision/decision-ledger）を許容 value import として挙げていたが、実装では不要だったため省略（tasks.md T-01 備考に記載）。spec の scenario は「のみ」（許容上限）を示しており、部分集合の使用は conformant。TC-001 の `allowedFragments` テストも通過。

### `collectParallelFixerFindings` における `getLatestJudgeFindings` 使用

`findings-ledger.ts` の `collectParallelFixerFindings`（line 103）が `review-routing.ts` の `getLatestJudgeFindings` を使用している。tasks.md には明示的な記載がないが、依存方向（findings-ledger → review-routing）は一方向であり SCC を導入しない。spec の依存方向要件に適合。

---

*evidence summary: checked=27, skipped=0, unverified=0*
