# Test Cases: review routing の value-import cycle を解消する

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 24, should: 3, could: 0

---

### TC-001: review-routing モジュールグラフにおける value import 先の制約

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: review-routing は pipeline / step factory への value import を持たない > Scenario: review-routing のモジュールグラフにおける value import 先の制約

---

### TC-002: review-routing から pipeline/types への import は type-only

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: review-routing は pipeline / step factory への value import を持たない > Scenario: review-routing から pipeline/types への import は type-only

---

### TC-003: SCC-A の解消（reviewer-chain ↔ fixer-helpers 2 ノード SCC）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: src/ の value-import SCC が 0 件になる > Scenario: SCC-A の解消（reviewer-chain ↔ fixer-helpers 2ノード SCC）

---

### TC-004: SCC-B の解消（4 ノード SCC）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: src/ の value-import SCC が 0 件になる > Scenario: SCC-B の解消（4ノード SCC）

---

### TC-005: architecture test による SCC 自動検出

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: src/ の value-import SCC が 0 件になる > Scenario: architecture test による SCC 自動検出

---

### TC-006: import type は value edge にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: type-only import は SCC 検出の対象外になる > Scenario: import type は value edge にならない

---

### TC-007: inline type modifier の部分除外

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: type-only import は SCC 検出の対象外になる > Scenario: inline type modifier の部分除外

---

### TC-008: STANDARD_TRANSITIONS の code-review セクションが不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: STANDARD / FAST pipeline の transition 構造が変化しない > Scenario: STANDARD_TRANSITIONS の code-review セクションが不変

---

### TC-009: FAST_TRANSITIONS の code-review / code-fixer セクションが不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: STANDARD / FAST pipeline の transition 構造が変化しない > Scenario: FAST_TRANSITIONS の code-review / code-fixer セクションが不変

---

### TC-010: custom reviewer ありの code-fixer priority routing が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer pipeline の transition 構造が変化しない > Scenario: custom reviewer ありの code-fixer priority routing が不変

---

### TC-011: coordinator および regression-gate のセクションが不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer pipeline の transition 構造が変化しない > Scenario: coordinator および regression-gate のセクションが不変

---

### TC-012: resolveActiveReviewer の tie-break ロジックが保たれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の step ロジックが変化しない > Scenario: resolveActiveReviewer の tie-break ロジックが保たれる

---

### TC-013: getConformanceFixContext の recency check が保たれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の step ロジックが変化しない > Scenario: getConformanceFixContext の recency check が保たれる

---

### TC-014: review-routing.ts が全識別子を export する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/core/review-routing.ts` が新規作成されている
**WHEN** モジュールの export 一覧を確認する
**THEN** `REGRESSION_GATE_STEP_NAME`、`deriveImplReviewerChain`、`deriveImplFixerChain`、`resolveActiveReviewer`、`nextAfterReviewer`、`getLatestJudgeFindings`、`getConformanceFixContext`、`conformanceFixInProgress`、`regressionGateActive`、`codeReviewLoopActive` がすべて named export として存在する

---

### TC-015: reviewer-chain.ts の re-export barrel による backward compat

**Category**: unit
**Priority**: must
**Source**: design.md > D3

**GIVEN** `pipeline/reviewer-chain.ts` が re-export barrel として更新されており、`deriveImplReviewerChain`、`deriveImplFixerChain`、`resolveActiveReviewer`、`nextAfterReviewer`、`conformanceFixInProgress`、`regressionGateActive`、`codeReviewLoopActive` を `review-routing.ts` から re-export している
**WHEN** 既存の callers（`step/code-fixer.ts`、`step/routed-findings.ts`、`pipeline/pipeline.ts`、`decision/wontfix.ts`）が変更なしで `../pipeline/reviewer-chain.js` から同名の識別子を import する
**THEN** コンパイルエラーが発生せず、これらの識別子が `review-routing.ts` 経由で正しく解決される

---

### TC-016: fixer-helpers.ts の re-export による backward compat

**Category**: unit
**Priority**: must
**Source**: design.md > D4

**GIVEN** `step/fixer-helpers.ts` が `getLatestJudgeFindings` と `getConformanceFixContext` を `../review-routing.js` から re-export しており、これらの関数定義を自身のファイルから削除している
**WHEN** 既存の callers（`step/code-fixer.ts`、`step/spec-fixer.ts`、`step/implementer.ts`、`pipeline/spec-observation.ts`、`decision/wontfix.ts`）が変更なしで `../step/fixer-helpers.js` からこれらを import する
**THEN** コンパイルエラーが発生せず、関数が `review-routing.ts` 経由で正しく解決される

---

### TC-017: regression-gate.ts の REGRESSION_GATE_STEP_NAME re-export

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `step/regression-gate.ts` が自身の `REGRESSION_GATE_STEP_NAME` 定数定義を削除し、`../review-routing.js` から import して re-export している
**WHEN** 既存の callers（`pipeline/compose-reviewers.ts`、`pipeline/__tests__/reviewer-chain.test.ts` 等）が変更なしで `../step/regression-gate.js` から `REGRESSION_GATE_STEP_NAME` を import する
**THEN** コンパイルエラーが発生せず、値が `"regression-gate"` として解決される

---

### TC-018: SCC test の liveness guard

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `tests/unit/architecture/value-import-scc.test.ts` が実装されており、`src/` 配下の `.ts` ファイル（`__tests__/` と `.test.ts` を除く）を再帰スキャンする
**WHEN** テストを実行する
**THEN** スキャン対象ファイルが 1 件以上検出されることをアサートする liveness guard がパスし、スキャン設定の誤りによるサイレントな false-green を防ぐ

---

### TC-019: SCC test の regression guard（合成 2 ノード SCC の検出）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `value-import-scc.test.ts` に Tarjan's algorithm がインラインで実装されている
**WHEN** 合成した 2 ノードグラフ（ノード A→B, B→A の双方向エッジ）を渡して SCC を検出する regression guard テストを実行する
**THEN** サイズ 2 の SCC が 1 件検出される。アルゴリズムが正しく機能することが確認され、SCC-A / SCC-B が再導入された場合に確実に失敗することが保証される

---

### TC-020: SCC test が __tests__ / .test.ts ファイルを除外する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06, design.md > Risk-3

**GIVEN** `src/` 配下に `__tests__/` ディレクトリ内のファイルと `.test.ts` 拡張子のファイルが存在する
**WHEN** value-import-scc.test.ts がスキャン対象ファイルを収集する
**THEN** テストファイルはスキャン対象から除外される。テスト間の import 関係が production SCC として誤検知されない（false positive なし）

---

### TC-021: SCC test が production module のロードを行わない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `value-import-scc.test.ts` が静的ファイル解析（regex ベース）のみで import グラフを構築する
**WHEN** テストファイルのソースコードを確認する
**THEN** `import()`、`require()`、`createRequire` 等の動的 module ロードが一切使用されていない。Tarjan's algorithm と import parser がテストファイル内に自己完結して実装されており、production module の副作用（型チェック・ファイル I/O 以外）が発生しない

---

### TC-022: lastFindingsOf が getLatestJudgeFindings の null を [] に変換する

**Category**: unit
**Priority**: should
**Source**: design.md > Risk-2, tasks.md > T-02

**GIVEN** `pipeline/reviewer-chain.ts` の private helper `lastFindingsOf` が `getLatestJudgeFindings`（`review-routing.ts` 経由）を呼び出すよう更新されている
**WHEN** 対象 reviewer の run が存在しない、または最後の run に toolResult がない状態で `lastFindingsOf`（経由で `lastReviewerFixableCount`）を呼び出す
**THEN** `getLatestJudgeFindings` が `null` を返す場合、`lastFindingsOf` は `[]`（空配列）を返し、`lastReviewerFixableCount` は 0 を返す。既存の `buildReviewerChainTransitions` のガード条件が変更前と同じ挙動を示す

---

### TC-023: parity test の行数 regression guard

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `tests/unit/pipeline/transition-parity.test.ts` が `buildReviewerChainTransitions(["code-review"])` の出力を step / on / to / hasGuard の順序付きリストで明示的にアサートしている
**WHEN** `buildReviewerChainTransitions` の実装が変更されて出力行数や内容が期待値と一致しなくなる（行の追加・削除・並び替えが発生する）
**THEN** テストが失敗する。行数の増減が即座に検出され、transition 構造のサイレントな変化を防ぐ

---

### TC-024: build gate

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08

Verification command: `bun run build`

---

### TC-025: typecheck gate

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08

Verification command: `bun run typecheck`

---

### TC-026: lint gate

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08

Verification command: `bun run lint`

---

### TC-027: full test suite gate

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08

Verification command: `bun run test`

既存テスト（`reviewer-chain.test.ts` TC-028〜TC-032、`findings-ledger.test.ts`、`standard-transitions.test.ts`、`core-invariants.test.ts` B-1〜B-18）および新規テスト（`value-import-scc.test.ts`、`transition-parity.test.ts`）がすべて green であることを確認する。

---

## Result

```yaml
result: completed
total: 27
automated: 23
manual: 0
must: 24
should: 3
could: 0
blocked_reasons: []
```
