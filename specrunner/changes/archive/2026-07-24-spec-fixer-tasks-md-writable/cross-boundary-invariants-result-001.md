# Cross-Boundary Invariants Review — spec-fixer-tasks-md-writable — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## レビュー観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した変更の範囲

`git diff main...HEAD --stat` で確認した変更:

- `src/core/step/spec-fixer.ts` — `writes()` に `tasks.md` を追加
- `src/core/step/canon-write-scope.ts` — D5 map の spec-fixer entry に `tasks.md` を追加
- `src/core/step/judge-verdict.ts` — JSDoc コメント更新（behavior 変更なし）
- `src/core/step/step-completion.ts` — `StepCompletionInput.toolResult` 型を拡張
- `src/prompts/spec-fixer-system.ts` — write-set contract に `tasks.md` を追加
- `src/prompts/rules.ts` — PIPELINE_MAP の spec-fixer 行に `tasks.md` を追加
- `src/core/step/__tests__/spec-review-fixer-routing.test.ts` — TC-013 migration
- `tests/unit/core/step/canon-write-scope.test.ts` — TC-019, TC-029 migration
- `tests/unit/core/step/judge-verdict-canon.test.ts` — TC-006 migration
- `tests/unit/step/step-io-contracts.test.ts` — writes() アサーション強化
- `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts` — 新規テスト 668 行

---

## 検証項目

### 1. 書込集合の 3 点同期と drift-guard

`writes()` / `canon-write-scope.ts` D5 map / TC-029 drift-guard 3 点が一致して更新されていることを確認。

- `spec-fixer.ts:99-105` — `tasks.md` が `writes()` に追加されている ✓
- `canon-write-scope.ts:47-51` — D5 map の `spec-fixer` entry が `{spec.md, design.md, tasks.md}` になっている ✓
- `canon-write-scope.test.ts` TC-029 — title のみ更新、assertion body は動的比較で自動 green ✓
- TC-029 の drift-guard assertion: `writes() ∩ protectedCanonPaths == D5 map entry` の等価を動的に検証するため、2 点同時更新で green を維持する設計であることを確認 ✓

### 2. escalationReason 計算のインバリアント（変更されていないコードとの相互作用）

`step-completion.ts:296-321`（変更なし）の `escalationReason` 計算を確認:

```ts
if (
  verdict === "escalation" &&        // ← "needs-fix:spec-fixer" では到達しない
  lastUndecidedFindings !== null &&
  ...
) {
  const unroutable = selectUnroutableCanonFindings(...);
  if (unroutable.length > 0) {
    escalationReason = buildCanonEscalationReason(unroutable);
  }
}
```

**STANDARD pipeline**: conformance → tasks.md + fixTarget:spec-fixer → `needs-fix:spec-fixer` → `{ CONFORMANCE, needs-fix:spec-fixer → SPEC_FIXER }` 遷移が存在するため escalate fallback には至らない。正常動作。

**FAST pipeline**: conformance → tasks.md + fixTarget:spec-fixer → `needs-fix:spec-fixer`（`writableByFixer` 拡張により） → FAST_TRANSITIONS に `{ CONFORMANCE, needs-fix:spec-fixer }` 行は意図的に不在（`types.ts:290-292` コメント参照）→ `transition?.to ?? "escalate"` でエスカレート terminal → `escalationReason` は未設定。

この変更前:
- tasks.md + fixTarget:spec-fixer → `"escalation"` verdict（unroutable）→ `escalationReason = buildCanonEscalationReason(...)` が設定される → CANON_FINDING_ESCALATION 詳細情報がジョブ state に残る

この変更後:
- tasks.md + fixTarget:spec-fixer → `"needs-fix:spec-fixer"` verdict（routable）→ escalationReason 未計算 → FAST pipeline の no-transition fallback でエスカレート → CANON_FINDING_ESCALATION 詳細情報が失われる

spec.md / design.md はこの変更前から `needs-fix:spec-fixer` を返していたため FAST での CANON_FINDING_ESCALATION 詳細がなかった。tasks.md はこの変更で spec.md / design.md と同等の挙動に統一される。すなわち診断品質の差異解消ではなく同格化である。

当該シナリオをカバーするテストは存在しない（FAST + conformance + tasks.md + fixTarget:spec-fixer の組み合わせ）。

### 3. GUARDED/SCOPED mode 境界

- `implementer` は `GUARDED_WRITE_STEPS` に含まれる（`write-scope.ts:33-39`）。GUARDED mode では worktree 全体を staging し `findWriteScopeViolations` で違反検出。tasks.md は implementer の `writes()` に含まれるため forbidden ではない（変更前後ともに正しい）。
- `spec-fixer` は GUARDED_WRITE_STEPS 外（scoped mode）。`findScopedCommitViolations` は `changedPaths - (declaredWritePaths + managedPaths)` で違反検出。tasks.md が `writes()` に追加されたことで tasks.md を含む scoped commit が合法になる。
- 両者が同一 round で並列実行されることはないため race condition なし。

### 4. conformance → spec-fixer → spec-review ループ

既存遷移: `{ CONFORMANCE, needs-fix:spec-fixer → SPEC_FIXER }` + `{ SPEC_FIXER, approved → SPEC_REVIEW }`

spec-fixer が conformance から呼ばれた場合、完了後に spec-review に戻り全 spec round を再実行する。これは spec.md / design.md の conformance 発火で既に存在していた挙動。tasks.md の conformance 発火でも同一パスを通るようになる。変更前後で遷移表の変更なし。

### 5. workspace tool guard と permission 層の整合

`step-context-builder.ts:136-148` で `writeScope.declaredWritePaths = step.writes(...).map(r => r.path)` が計算される。tasks.md が `writes()` に追加されたことで `forbiddenWritePaths` から除外され、agent のファイル書込み許可が拡張される。この拡張は書込集合の設計意図と一致する。

### 6. step-completion.ts 型変更

`StepCompletionInput.toolResult` の型が `BaseReportResult | null` から `JudgeReportResult | ProducerReportResult | RequestReviewReportResult | BaseReportResult | null` に変更されている（`step-completion.ts:64`）。

- 全新型は `BaseReportResult` のサブタイプであり、union は意味的に `BaseReportResult | null` と等価
- `step-completion.ts` 内部では依然として `toolResult as JudgeReportResult` 等の明示キャストを使用（型変更の恩恵は間接的）
- runtime 挙動への影響なし
- タスク T-01 〜 T-07 のいずれにも記載されていない変更

### 7. TC-029 drift-guard の第三点（期待値）の扱い

TC-029 の assertion body は動的比較（`writes() ∩ protectedCanonPaths` と D5 map entry を実際に比較）であり、固定値を持たない。tasks.md が両者に同時追加されたため TC-029 は自動的に green を維持する。title 更新は文書化のみ。設計通り。

### 8. 保護境界（request.md / test-cases.md / attestation）の維持

- `canon-write-scope.ts` の spec-fixer D5 map entry: `{spec.md, design.md, tasks.md}` のみ（request.md / test-cases.md / attestation を含まない）
- TC-019: `spec-fixer writable に request.md / test-cases.md は含まれない` アサーションが維持されている
- TC-013 test-cases.md sub-test: `escalation` 期待値を維持
- 境界維持を確認 ✓

---

## Findings 詳細

### F1: FAST pipeline で tasks.md conformance finding の escalationReason が消失する

**経路**:
1. FAST pipeline で conformance step が `tasks.md` への fixable finding（fixTarget: spec-fixer）を返す
2. `deriveConformanceVerdict` が `"needs-fix:spec-fixer"` を返す（変更前は `"escalation"` だった）
3. `step-completion.ts` の escalationReason 計算ブロック（未変更）は `verdict === "escalation"` のときのみ動作するため、escalationReason が設定されない
4. FAST_TRANSITIONS に `{ CONFORMANCE, needs-fix:spec-fixer }` 行が意図的に不在 → `transition?.to ?? "escalate"` → escalate terminal
5. ジョブ state の `outcome.escalationReason` が未設定のまま operator 停止

**変更前の挙動**: tasks.md + fixTarget:spec-fixer → `"escalation"` → `buildCanonEscalationReason` → `escalationReason = "[CANON_FINDING_ESCALATION] ..."` → 詳細情報あり  
**変更後の挙動**: tasks.md + fixTarget:spec-fixer → `"needs-fix:spec-fixer"` → escalationReason 未設定 → no-transition fallback → 詳細情報なし

**根拠コード**（変更されていない箇所）:
- `step-completion.ts:300`: `if (verdict === "escalation" && ...)`（escalationReason 計算のガード）
- `types.ts:290-292`: FAST_TRANSITIONS コメント「needs-fix:spec-fixer is intentionally absent」

**影響の限定**:
- spec.md / design.md の FAST conformance finding は変更前から同一挙動（`needs-fix:spec-fixer` → no-transition → escalate、escalationReason なし）だった。tasks.md がそれらと同格になるだけであり機能的退行ではない。
- 当該シナリオ（FAST + conformance + tasks.md + fixTarget:spec-fixer）のテストは存在しない。

**How to Fix**: 診断情報の完全性を優先する場合、設計 D3 の注記に「FAST pipeline では tasks.md 含む全 spec-fixer-routable conformance finding が no-transition escalation となり escalationReason は設定されない」と明示するか、FAST pipeline の挙動を固定するテストを追加する。コード修正は不要。

---

## 検証できなかった項目

- FAST + conformance + tasks.md + fixTarget:spec-fixer のエンドツーエンド実行（テストなし）
- `createWorkspaceToolGuard` の動的実行による permission 拒否の実証

## 観察事項（findings に非ず）

- `step-completion.ts:64` の型変更: タスク外の追加だが runtime 影響なし。`JudgeReportResult | ProducerReportResult | RequestReviewReportResult` は全て `BaseReportResult` のサブタイプであり union の意味的な広がりはない。
- `rules.md` の `spec-fixer` 行（change folder の snapshot）は `spec.md, design.md` のまま更新されていないが、これはこのジョブ実行時の snapshot であり、`src/prompts/rules.ts` の更新が future jobs に正しく反映される設計のため問題なし。
