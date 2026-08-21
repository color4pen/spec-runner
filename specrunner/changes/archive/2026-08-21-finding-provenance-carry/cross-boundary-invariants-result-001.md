# Cross-Boundary Invariants Review — finding-provenance-carry

**Reviewer**: cross-boundary-invariants
**Iteration**: 1
**Date**: 2026-08-21

## Purpose

変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope of Change

主な変更ファイル（diff stat から）:

| ファイル | 変更内容 |
|---|---|
| `src/kernel/report-result.ts` | `Finding` 型に `ledgerRef?: string` を追加 |
| `src/core/step/report-tool.ts` | `findingSchema` / `conformanceFindingSchema` に `ledgerRef: optional(string())` を追加 |
| `src/core/port/report-result.ts` | `parseFindings` が `ledgerRef` を round-trip するよう拡張 |
| `src/core/pipeline/findings-ledger.ts` | `computeLedgerRef`, `buildProvenanceIndex` 追加; `collectSpecReviewLedger` に `filterUndecidedFindings` 追加 |
| `src/core/decision/wontfix.ts` | fingerprint 逆引きを `buildProvenanceIndex` + `ledgerRef` 照合に置換 |
| `src/core/step/regression-gate.ts` | `buildLedgerEntry` 追加（Provenance Ref を各エントリに表示）; `buildFindingsBlock` 参照を削除 |
| `src/prompts/regression-gate-system.ts` | `ledgerRef` verbatim echo 指示を追加 |
| `tests/unit/core/decision/wontfix.test.ts` | 新・更新テストケース群 |

---

## Invariant Analysis

### INV-1: `JUDGE_REPORT_TOOL` singleton identity — 破損なし ✓

**前提**: `step-completion.ts:137-140` の `isJudgeStep` チェックは `stepReportTool === JUDGE_REPORT_TOOL`（オブジェクト参照比較）。`JUDGE_REPORT_TOOL` オブジェクト自体の同一性が変わると regression-gate / spec-review / custom-reviewer の verdict 経路が壊れる。

**確認**: `report-tool.ts` の diff は `findingSchema` 内の Zod schema に `ledgerRef: optional(string())` 1 行を追加するのみ。`JUDGE_REPORT_TOOL` オブジェクトの宣言・定義・エクスポートは変更なし。`TC-013` テスト(`step === JUDGE_REPORT_TOOL`) が通過。

**判定**: 不変条件を破っていない。

---

### INV-2: `DecisionRecord` persisted format — 破損なし ✓

**前提**: `DispositionDecisionRecord` のフィールド集合（`kind | id | step | findingKey | finding | disposition | reason | decidedAt | source`）は後方互換として固定（#1022 で確立）。新規 required フィールドの追加は breaking change。

**確認**: `wontfix.ts` の disposition record 生成コードを確認。`records.push({...})` で追加されるフィールドは上記 9 フィールドのみ。`ledgerRef` は record に含まれない。`TC-019` が exactKeys チェックで 9 フィールドのみを assert している。

**判定**: persisted 形式変更なし。

---

### INV-3: `computeFindingKey` を使う機械尊重フィルタ群 — 破損なし ✓

**前提**: `filterUndecidedFindings(step, finding, decisions)` は `computeFindingKey(step, finding)` で照合する。disposition record の `findingKey` は SOURCE finding から計算される。wontfix 解決が gate finding の paraphrase された title を使って disposition を作ると、SOURCE finding の `findingKey` と不一致になり機械尊重が効かなくなる。

**確認**: 新しい `resolveWontfixDispositions` は `ref = gateFinding.ledgerRef` → `provenanceIndex.get(ref)` → `actualFinding`（source finding）→ `computeFindingKey(stepName, actualFinding)` という流れ。disposition の `findingKey` は SOURCE finding から算出されており、gate の再生成 title には依存しない。

3 つの消費パスすべてを確認:
- `collectFindingsLedger`: `filterUndecidedFindings(stepName, fixable, decisions)` ✓
- `collectSpecReviewLedger`: `filterUndecidedFindings(STEP_NAMES.SPEC_REVIEW, fixable, decisions)` ✓（新規追加）
- `collectParallelFixerFindings`: `filterUndecidedFindings(name, fixable, decisions)` ✓

**判定**: 機械尊重フィルタは source step + source findingKey で機能する。不変条件を破っていない。

---

### INV-4: `step-completion.ts` での regression-gate verdict 導出 — 破損なし ✓

**前提**: `step-completion.ts:199` で `filterUndecidedFindings(step.name, allFindings, decisions)` が gate findings に適用される。gate の `step.name = "regression-gate"` に対して decisions が機能しないと、wontfix 済み finding が gate verdict に影響するリスクがある。

**確認**: すべての disposition record は SOURCE step 名（"code-review", "spec-review" 等）で記録される。`filterUndecidedFindings("regression-gate", gateFindings, decisions)` は decisions 内に `step === "regression-gate"` のものが存在しないため、すべての gate findings をスルーさせる。

機械尊重は「ledger への追加前フィルタ」として実装されており（gate が入力として受け取る前に除外）、gate の verdict 導出後のフィルタとして実装されていない。これは正しい設計。

**判定**: gate verdict 導出に対する invariant 破損なし。

---

### INV-5: `findingFingerprint` / `dedupeFindings` の unchanged 性 — 破損なし ✓

**前提**: `findingFingerprint` = `${file}|${line ?? ""}|${title}` は `dedupeFindings` と wontfix fingerprint 逆引きの共有ベース。変更されると複数消費者が diverge する。

**確認**: `findings-ledger.ts` diff 内、`findingFingerprint` 関数の本体は変更なし。`computeLedgerRef` は `findingFingerprint(finding)` を入力として使う（既存式の上位層）。

**判定**: 既存の fingerprint 識別式に触れていない。

---

### INV-6: `collectSpecReviewLedger` に `filterUndecidedFindings` を追加した副作用 — 意図的変更、既存テスト影響なし ✓

**変更**: 旧 `collectSpecReviewLedger` は decisions を無視して全 spec-review fixable findings を返していた。新しい実装は per-run で `filterUndecidedFindings` を呼ぶ。

**影響範囲確認**:
- `collectSpecReviewLedger` の呼び出しは `computeRegressionLedger`（production）と `regression-gate-false-loop.test.ts` TC-011 のみ
- TC-011 は `state.decisions` が `undefined` の状態でテストしており、`filterUndecidedFindings(step, findings, undefined)` は findings をそのまま返す（no-op）。テストは green のまま
- ただし TC-011 のアサーション `computeRegressionLedger == dedupeFindings([...collectSpecReviewLedger(state), ...collectFindingsLedger(reviewerChain, state)])` は **decisions あり状態を未テスト**。新しいフィルタ挙動が両辺で一貫している（どちらも同じ `collectSpecReviewLedger` を呼ぶ）ため等式は依然成立するが、decisions あり状態における `collectSpecReviewLedger` の新挙動（disposed finding の除外）を assert するテストが存在しない

**判定**: 破損なし。ただし TC-008 のレジストリカバレッジ（spec-review-origin disposed finding が `collectSpecReviewLedger` から除外されることを assert）が `wontfix.test.ts` に追加されており、この新挙動を固定している。

---

### INV-7: `buildProvenanceIndex` が `filterUndecidedFindings` を呼ばないことの影響

**観察**: `buildProvenanceIndex` は ALL StepRuns を走査して全 fixable findings を index 化するが、`filterUndecidedFindings` を呼ばない。一方 `computeRegressionLedger`（gate の ledger input）は `filterUndecidedFindings` を呼ぶ。

**非対称性の含意**:
- Disposed finding は gate の ledger（ユーザーが見るもの）から除外される
- Disposed finding は provenance index には残存する
- Gate が disposed finding を ledger で見ることがないため、operator が disposed finding を `--wontfix` で選択することは実運用上不可能
- ただし、disposed finding の ref と未 disposed finding の ref が衝突した場合（32-bit hash collision）、誤った finding の origin が返る可能性がある（設計文書も言及済み）

**判定**: 実運用上の invariant 破損なし。32-bit hash（8 hex chars）の衝突確率は finding 数が数十規模では無視可能。設計文書（Risk セクション）で明示的に acceptance されたトレードオフ。

---

### INV-8: `findingSchema` 共有スキーマへの `ledgerRef` 追加 — 他 step への影響

**観察**: `findingSchema` は `JUDGE_REPORT_TOOL`（gate / spec-review / custom reviewers）および `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL` で共有される。`ledgerRef: optional(string())` が全ツールのスキーマに追加された。

**影響**:
- LLM が JSON Schema を見て non-gate judge step でも `ledgerRef` を populate する可能性がある
- Gate でない step の findings に `ledgerRef` が含まれても、`computeLedgerRef` / `buildProvenanceIndex` / `resolveWontfixDispositions` はいずれも SOURCE findings の `ledgerRef` を参照しない（これらは GATE findings の `ledgerRef` のみを使う）
- `computeFindingKey` / `findingFingerprint` / `dedupeFindings` はいずれも `ledgerRef` を無視

**判定**: 機能的な invariant 破損なし。`ledgerRef` が non-gate source findings に混入しても消費者は全てそれを無視する。

---

### INV-9: `verifyFindingRefs` チェックとの整合性 — 破損なし ✓

**前提**: `step-completion.ts` の `verifyFindingRefs` は judge step findings の `file` が実在することを検証し、hallucinated ref → escalation override する。

**確認**: gate system prompt は「元の file / line / title（ledger から）」の使用を指示。`ledgerRef` は file path ではなく 8 char hex 文字列のため、ref verification の `file` フィールドとは無関係。gate が ledger の file/line を verbatim に使う限り、`verifyFindingRefs` の動作は変わらない。

**判定**: 不変条件を破っていない。

---

### INV-10: `buildFindingsBlock` の regression-gate での削除 — 他 consumer への影響

**変更**: `regression-gate.ts` は `buildFindingsBlock`（`fixer-helpers.ts`）の import を削除し、専用の `buildLedgerEntry` に置換。

**影響確認**: `buildFindingsBlock` は code-fixer.ts, implementer.ts, spec-fixer.ts, fixer-helpers.ts 自体でも使われており、これらの import は変更なし。regression-gate 用の ledger block format のみが新 format に変わった。

**Regression-gate テストへの影響**: `regression-gate-step.test.ts` のアサーション:
- `expect(msg).toContain("Hardcoded secret")` — title ✓（`buildLedgerEntry` の heading に含まれる）
- `expect(msg).toContain("src/auth.ts")` — file ✓（`- **File**: ...` 行に含まれる）
- `expect(msg).toMatch(/ledger is empty|No fixable findings|empty findings/i)` — 空 ledger notice ✓（"No fixable findings were recorded..."）
- `expect(msg).toContain(expectedRef)` — TC-001 新規 assert ✓

**判定**: 他の fixer/implementer は `buildFindingsBlock` を継続使用。regression-gate の ledger format 変更は gate 専用のため他 consumer への影響なし。

---

## Observation: system prompt severity 指示の矛盾（既存問題）

System prompt: `severity: "high", resolution: "fixable"` for regressions

`buildMessage` user message: "Report any regressions with the severity from the ledger entry"

これは今回の変更で導入されたものではなく、**変更前から存在していた矛盾**。ただし `buildLedgerEntry` が heading に `[${finding.severity.toUpperCase()}]` を表示するようになったことで、gate agent が実際の severity を目にしやすくなった。

機械的な invariant への影響: `deriveRegressionGateVerdict` は severity に依存せず任意の fixable finding を needs-fix とするため、gate が "high" を使っても original severity を使っても verdict は同一。`ledgerRef` の provenance resolution も severity に依存しない。

**これは cross-boundary invariant 破損ではなく既存の observation**。

---

## Evidence Summary

### 確認済み不変条件（checked）

| # | 不変条件 | 確認方法 | 結果 |
|---|---|---|---|
| INV-1 | JUDGE_REPORT_TOOL singleton identity | diff + TC-013 | ✓ |
| INV-2 | DecisionRecord persisted format | diff + TC-019 | ✓ |
| INV-3 | machine-respect filters (filterUndecidedFindings) | code trace + TC-008/009/020 | ✓ |
| INV-4 | step-completion gate verdict derivation | code trace | ✓ |
| INV-5 | findingFingerprint / dedupeFindings unchanged | diff | ✓ |
| INV-6 | collectSpecReviewLedger behavioral change | diff + TC-011 | ✓ |
| INV-7 | buildProvenanceIndex 非対称性 | code trace + design | ✓ |
| INV-8 | findingSchema 共有スキーマ拡張 | diff + code trace | ✓ |
| INV-9 | verifyFindingRefs との整合性 | code trace | ✓ |
| INV-10 | buildFindingsBlock 削除の影響範囲 | grep + diff | ✓ |

### 未確認（skipped）

- Managed runtime での `ledgerRef` JSON Schema transport（runtime adapter 層のテストが対象外）
- マルチセッション並行実行シナリオ（アーキテクチャ上 sequential のため対象外）

### 未確認（unverified）

- 32-bit hash collision の実測（設計文書で acceptedリスクとして明示）

---

## Findings

### FINDING-1 [medium / fixable]

**Title**: `regression-gate-false-loop.test.ts` TC-011 は `collectSpecReviewLedger` の新しい decisions フィルタ挙動を assert していない

**File**: `src/core/step/__tests__/regression-gate-false-loop.test.ts`
**Line**: 200

**Rationale**:
TC-011 は `computeRegressionLedger == dedupeFindings([collectSpecReviewLedger, collectFindingsLedger])` を検証するが、使用している state には `decisions` フィールドが設定されていない。今回の変更で `collectSpecReviewLedger` は per-run で `filterUndecidedFindings` を呼ぶようになったが、decisions が空の場合は no-op なのでテストは緑のまま通過する。

等式の成立理由が変わった（「`collectSpecReviewLedger` が decisions 無視していたから等しい」から「両辺が同じ関数を呼ぶから等しい」に）にもかかわらず、テストは decisions あり状態を検証していない。`wontfix.test.ts` の TC-008 がこの挙動を別途固定しているが、`regression-gate-false-loop.test.ts` のコメントに「TC-011 は decisions なし状態のみ検証」という注記が欠如している。

これは invariant 破損ではないが、TC-011 が「`collectSpecReviewLedger` は decisions に関わらず全 findings を返す」という旧契約を implicit に assert しているかのように見える可能性がある。

**修正案**: TC-011 に `decisions` あり状態のケースを追加するか、「このテストは decisions なし状態のみ対象」とコメントで明示する。

---

### FINDING-2 [low / fixable]

**Title**: `JUDGE_REPORT_TOOL` description が `ledgerRef` を言及しないが、shared `findingSchema` が non-gate step にも適用される

**File**: `src/core/step/report-tool.ts`
**Line**: 111

**Rationale**:
`findingSchema`（`ledgerRef` を含む）は `JUDGE_REPORT_TOOL`, `CODE_REVIEW_REPORT_TOOL`, `REQUEST_REVIEW_REPORT_TOOL` の全てで shared される。`JUDGE_REPORT_TOOL` の description 文字列（spec-review, custom reviewer が受け取るもの）は `ledgerRef` を説明していない。

設計 D5 通りの意図的決定だが、JSON Schema には `ledgerRef` が存在するため、spec-review / code-review / custom reviewer の LLM が自己判断で `ledgerRef` を populate する可能性がある。これ自体は消費者側で harmless（誰も non-gate source findings の `ledgerRef` を使わない）だが、gate 専用フィールドが source findings の state に混入することは「additive but gate-only」という設計意図と乖離する。

現状の invariant 破損はないが、maintenance concern として記録する。

**修正案**: `JUDGE_REPORT_TOOL` description に「`ledgerRef` は regression-gate exclusive — 他 step は設定不要」という注記を追加するか、`findingSchema` を gate 用と非 gate 用に分離する（ただし後者は非 trivial な変更であり scope-out 判断が妥当）。

---

## Conclusion

実装は変更していないコードの不変条件を破っていない。`JUDGE_REPORT_TOOL` singleton、`DecisionRecord` 形式、machine-respect フィルタ、`findingFingerprint` / `dedupeFindings`、`verifyFindingRefs` — いずれも invariant を維持している。

2 件の findings は軽微:
- FINDING-1: テストの意図が変化した新挙動を assert していない（既存テスト green だが coverage の穴）
- FINDING-2: shared schema による gate 専用フィールドの leakage リスク（実害なし）

typecheck green、test 806 files all passed を確認。
