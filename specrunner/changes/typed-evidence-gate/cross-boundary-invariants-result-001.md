# Cross-Boundary Invariants Review — typed-evidence-gate — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Meta

- **reviewer**: cross-boundary-invariants
- **scope**: 51 files changed (+3416 insertions, -86 deletions)

---

## Purpose

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した項目

### 読んだ設計・仕様ファイル

- `specrunner/changes/typed-evidence-gate/design.md` — D1〜D7 全設計判断、特に D4（regression-gate 導出不変）・D6（fragment 文言方針）
- `specrunner/changes/typed-evidence-gate/tasks.md` — T-01〜T-09 全タスク
- `specrunner/changes/typed-evidence-gate/spec.md` — 全 Requirement / Scenario
- `specrunner/changes/typed-evidence-gate/spec-review-result-001.md` — spec-review Finding 1（executor 経由 regression-gate テストの欠落）
- `specrunner/changes/typed-evidence-gate/review-feedback-001.md` — コードレビュー F-001（EVIDENCE_COUNTS_DEFINITION "escalation"）、F-002（parameter reorder out-of-scope）

### 読んだ実装ファイル

| ファイル | 確認焦点 |
|---------|---------|
| `src/kernel/report-result.ts` | `Evidence` 型定義 |
| `src/core/port/report-result.ts` | `parseEvidence` / `parseJudgeReportInput` 必須化 / 委譲構造 |
| `src/core/step/report-tool.ts` | `JUDGE_REPORT_TOOL` singleton 定義・description・zodSchema |
| `src/core/step/judge-verdict.ts` | `deriveJudgeVerdict` vacuous ルール / `deriveRegressionGateVerdict` 不変 |
| `src/core/step/step-completion.ts` | `isJudgeStep` 分岐・evidence 受け渡し・checked=0 診断・persistToolResult |
| `src/core/step/regression-gate.ts` | `judgeVerdictFn: deriveRegressionGateVerdict` 設定・skipWhen・buildMessage の collectFindingsLedger 呼び出し |
| `src/core/port/step-types.ts` | `judgeVerdictFn` 型 (3 引数 optional) |
| `src/state/helpers.ts` | `StepResultInput.toolResult` に `evidence?` 追加 |
| `src/state/schema/types.ts` | `StepOutcome.toolResult` に `evidence?` 追加 |
| `src/prompts/judge-rules.ts` | `EVIDENCE_COUNTS_DEFINITION` の全文 |
| `src/prompts/regression-gate-system.ts` | `EVIDENCE_COUNTS_DEFINITION` 注入箇所 |
| `src/core/pipeline/findings-ledger.ts` | `collectFindingsLedger` シグネチャ変更 |

### 読んだテストファイル

- `src/core/port/__tests__/evidence-enforcement.test.ts` — TC-001〜TC-021
- `src/core/step/__tests__/judge-verdict-evidence.test.ts` — TC-007〜TC-013、TC-026
- `src/core/step/__tests__/step-completion-evidence-diagnostic.test.ts` — TC-025（code-review / conformance のみ。regression-gate 未カバー）
- `src/state/__tests__/evidence-backward-compat.test.ts` — TC-014〜TC-015、TC-024
- `src/prompts/__tests__/evidence-fragment-coverage.test.ts` — TC-016〜TC-018
- `tests/helpers/pipeline-mock-client.ts` — judge 系 approved 入力の evidence 追随

### ADR 参照

- `specrunner/adr/2026-07-14-reduce-added-agent-turns.md` — 旧シグネチャ参照の存在確認
- `specrunner/adr/2026-06-12-reviewer-chain-regression-gate.md` — 旧シグネチャ参照の存在確認

---

## Invariants Checked

### INV-1: `JUDGE_REPORT_TOOL` singleton — evidence 必須化が全 judge 系 step に波及する

**状態**: ✅ HOLDS

`parseJudgeReportInput`（`report-result.ts`）は `JUDGE_REPORT_TOOL.parseInput` として設定されており、`spec-review`・`code-review`（委譲）・`conformance`（委譲）・`regression-gate`・`custom-reviewer` の全 step に共通して evidence 必須化が適用される。委譲構造は変更なし（D2）。

---

### INV-2: `evidence === undefined` の後方互換パス — legacy record で verdict 変化なし

**状態**: ✅ HOLDS

`deriveJudgeVerdict(findings, ok)` の 2 引数呼び出しでは `evidence === undefined` → vacuous チェックを skip → 従来導出。`deriveConformanceVerdict` も同様。`verdict` は `state.steps[].outcome.verdict` から読むだけで再導出しない（D5）。レガシー state の resume に影響なし。

---

### INV-3: `isConformanceStep` 分岐が `judgeVerdictFn` を迂回する不変性

**状態**: ✅ HOLDS（仕様通り）

`step-completion.ts` の分岐順は `else if (isConformanceStep)` → `else if (isJudgeStep)` で、conformance は `judgeVerdictFn` を持たず `deriveConformanceVerdict` に直接ディスパッチされる。`checked=0` → `deriveJudgeVerdict` → escalation の経路は conformance に対して正確に機能する。

---

### INV-4: `verdictOverride` が vacuous escalation を上書きしない（設計上の懸念なし）

**状態**: ✅ HOLDS

`verdictOverride` は `verdict !== "error"` を条件に全 verdict を上書きする（`step-completion.ts:244`）。vacuous escalation も上書き対象に含まれるが、`verdictOverride` は code-fixer の no-op 検出（`noOpDetect`）専用であり、judge 系 step に設定されることはない（`judge-verdict.ts` / `code-fixer.ts` の設計を確認）。交差なし。

---

### INV-5: `EVIDENCE_COUNTS_DEFINITION` の escalation 断定 vs `deriveRegressionGateVerdict` の vacuous 非適用

**状態**: ❌ VIOLATED

詳細は FINDING-01 参照。

---

### INV-6: `skipWhen` / `buildMessage` の `collectFindingsLedger` 一貫性（シグネチャ変更後）

**状態**: ✅ HOLDS

`regression-gate.ts:112` と `:140` の両呼び出しが新シグネチャ `collectFindingsLedger(reviewerChain, state)` に統一済み。TypeScript が全 call site を型チェック済み。`skipWhen` と `buildMessage` は同一 `deriveImplReviewerChain + collectFindingsLedger` 呼び出しを使用しており、ledger 評価の一貫性は維持される。

---

### INV-7: `isJudgeStep` 診断が `judgeVerdictFn` オーバーライドを考慮しない

**状態**: ⚠️ DEGRADED（実運用影響は限定的だが誤情報）

詳細は FINDING-02 参照。

---

### INV-8: evidence フィールドが `persistToolResult` spread を通じて state に保持される

**状態**: ✅ HOLDS

`step-completion.ts:180-190` の `effectiveToolResult` 組み立てを確認。`extraScopeFindings.length > 0` の場合はスプレッドで evidence を含む `JudgeReportResult` 全体をコピー。`length === 0` の場合は `toolResult` オブジェクト参照をそのまま渡すため、runtime では evidence が保持される（TypeScript キャストの型は狭いが runtime 動作は正確）。

---

## Findings 詳細

### FINDING-01 [MEDIUM/FIXABLE]: `EVIDENCE_COUNTS_DEFINITION` が regression-gate prompt に "escalation" を断定するが `deriveRegressionGateVerdict` は vacuous ルールを適用しない

**箇所**: `src/prompts/judge-rules.ts:99`

```typescript
export const EVIDENCE_COUNTS_DEFINITION =
`**evidence 記入 (ok=true 必須)**:
...
- \`checked === 0\` は「判定不能」として扱われ、\`escalation\` になります。...`
```

このフラグメントは `src/prompts/regression-gate-system.ts` に注入される（`${EVIDENCE_COUNTS_DEFINITION}`、line 91）。

**違反している不変条件**: regression-gate agent は "checked=0 → escalation" と教えられるが、`deriveRegressionGateVerdict`（**変更されていない**）は evidence 引数を完全に無視する。`verdictFn(undecidedFindings, tr.ok, tr.evidence)` は `deriveRegressionGateVerdict(findings, ok)` として実行され（JavaScript の extra-args-ignored）、`checked=0` でも `findings: []` なら `"approved"` を返す。

**設計との乖離**: design.md D6 は明示的に「文言を「判定不能」に留め（EVIDENCE_DISCIPLINE と同語彙）、**具体的 routing（escalation）を断定しない**ことで、vacuous 非適用の regression-gate にも矛盾なく共有できる」と方針を記述している。実装の "escalation になります" は D6 の却下判断を実質的に無視した形になっている。

**テストギャップ**: TC-017 は "report_result" / "end_turn" の不在のみ確認しており、"escalation" 断定の不在は検証対象外。このずれは自動テストで検出されない。

**実運用影響**: regression-gate は `skipWhen` により ledger 非空でのみ実行され、通常 `checked > 0` が期待される。実際に checked=0 を返す経路は実運用で到達不能と設計が主張する。ただし、fragment が誤った behavioral claim を regression-gate agent に提示し続ける。

**修正案**: `escalation になります` を削除し、`判定不能として扱われます` に変更する（D6 の intent を実装に反映）。あるいは TC-017 に "escalation" 文字列の不在チェックを追加する。

---

### FINDING-02 [LOW/FIXABLE]: `step-completion.ts` の `isJudgeStep` 診断が `judgeVerdictFn` オーバーライドの存在を考慮せず "escalation" を誤報する

**箇所**: `src/core/step/step-completion.ts:163-164`

```typescript
} else if (isJudgeStep) {
  const tr = toolResult as JudgeReportResult;
  ...
  const verdictFn = "judgeVerdictFn" in step && step.judgeVerdictFn
    ? step.judgeVerdictFn
    : deriveJudgeVerdict;
  if (tr.evidence?.checked === 0) {
    stderrWrite(`[${step.name}] vacuous check: checked=0 — 検証実績ゼロのため approved を保留し escalation`);  // ← 問題箇所
  }
  verdict = verdictFn(undecidedFindings, tr.ok, tr.evidence);
}
```

regression-gate は `judgeVerdictFn = deriveRegressionGateVerdict` を持ち、`JUDGE_REPORT_TOOL` を使用するため `isJudgeStep === true`。`evidence.checked === 0` のとき診断が firing し "escalation" と表示するが、`deriveRegressionGateVerdict`（**変更されていない**）は evidence を無視し `findings: []` なら `"approved"` を返す。

**影響**: 診断は機械的な verdict derivation に影響しない（人間向け表示のみ）。ただし、regression-gate で checked=0 が報告された場合、オペレーターは "escalation" と表示されたにもかかわらず verdict が "approved" になる状況を目撃する。FINDING-01 と同根の問題。

**修正案**: 診断を `verdictFn !== deriveRegressionGateVerdict`（または `!step.judgeVerdictFn`）で guard する。あるいは "escalation" を断定せず「vacuous check: checked=0 — 判定不能として扱われます」に文言変更する。

---

### FINDING-03 [LOW/FIXABLE]: `collectFindingsLedger` のパラメータ順序変更後も ADR が旧シグネチャを参照している

**箇所**: 
- `specrunner/adr/2026-07-14-reduce-added-agent-turns.md:61` — `collectFindingsLedger(state, deriveImplReviewerChain(state))`
- `specrunner/adr/2026-06-12-reviewer-chain-regression-gate.md:57` — `collectFindingsLedger(state, reviewerChain)`

本 change は `findings-ledger.ts` のシグネチャを `(state, reviewerChain)` → `(reviewerChain, state)` に変更した（コードレビュー F-002 でも指摘済み）。全アクティブ call site（`regression-gate.ts`・テストファイル群）は新シグネチャで更新済みで、TypeScript が型安全を担保している。

**影響**: runtime への影響はゼロ。ただし ADR（ライブドキュメント）に旧シグネチャが残り、将来の実装者を誤誘導する可能性がある。パラメータ型が異なる（`JobState` vs `string[]`）ため、旧シグネチャで呼び出した場合 TypeScript がコンパイルエラーを出す。サイレントな不整合は起きにくいが、ドキュメントとしての ADR の信頼性が下がる。

**修正案**: 参照している ADR の該当行を新シグネチャ `(reviewerChain, state)` に更新する。

---

## 検証できなかった項目

- `bun run test` の実行確認（コードレビュー結果「8418 passed / 1 skipped」に委ねた）
- managed runtime でのエージェント実際動作（スコープ外）
