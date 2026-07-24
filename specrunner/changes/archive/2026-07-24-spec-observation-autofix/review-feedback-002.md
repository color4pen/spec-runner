# Review Feedback: spec-observation-autofix (Iteration 2)

## Scope

Change folder: `specrunner/changes/spec-observation-autofix`

Files reviewed:
- `src/core/step/judge-verdict.ts` — `deriveSpecReviewVerdict` 4b 変更
- `src/core/step/canon-write-scope.ts` — `buildCanonWriteScopeFromState` 追加
- `src/core/pipeline/spec-observation.ts` — 新規（predicate 2 関数）
- `src/core/pipeline/types.ts` — guarded 行 2 本追加
- `src/core/pipeline/findings-ledger.ts` — `collectSpecReviewLedger` 追加
- `src/core/step/regression-gate.ts` — ledger 合流
- `src/core/step/fixer-helpers.ts` — INVARIANT コメント追加
- `tests/unit/core/pipeline/spec-observation-autofix.test.ts` — 新規テスト（1511 行）
- `tests/unit/core/pipeline/pipeline.conformance-routing.test.ts` — TC-CONFRT-07 更新
- `implementation-notes.md` — 更新（TC-CONFRT-07 修正を「期待値変更あり」として記録）

Iteration 1 からの変更差分に集中し、前回 review-feedback-001.md の findings 解消を確認した。

---

## Evidence

### Iteration 1 Findings の解消確認

| Finding (iter 1) | Severity | 解消状態 | 確認方法 |
|---|---|---|---|
| TC-CONFRT-07 が同一タイムスタンプで observation-pass 経路を無言で通過 | [LOW] obs | **Resolved** | conformance StepRun に `ts: "2026-01-01T01:00:00.000Z"` + `toolResult.findings` を付与、`expect(specReviewCallCount).toBe(4)` 追加を確認（lines 543-564）|
| mixed severity (medium + high 共存) の明示的テストなし | [LOW] obs | — | 受け入れ基準外、TC-003/004 から導出可能、変更なし |
| `specFixerForwardsToTestGen` が state.steps へ直接アクセス | [LOW] obs | — | 既存パターン内、機能上問題なし、変更なし |

### 受け入れ基準照合

| 受け入れ基準 | カバー TC | 実装確認 |
|---|---|---|
| medium fixable on spec.md → approved; spec-fixer 後 test-case-gen 直行 | TC-001, TC-006, TC-008, TC-013 | `deriveSpecReviewVerdict` 4b: `routableCanon.some(critical\|high)` のみ needs-fix、guarded 行 2 本が遷移を固定、TC-013 で specReviewCallCount === 1 を Pipeline 統合 assert ✓ |
| high fixable on spec.md → needs-fix → 往復不変 | TC-003, TC-027 | `routableCanon.some(high)` → needs-fix、TC-027 で guarded 行 when が false を返すことを assert ✓ |
| conformance needs-fix:spec-fixer 起点の spec-fixer → spec-review 再検証 | TC-010, TC-CONFRT-07 | ordered timestamps (specReview T1 < conformance T2) + toolResult.findings で `getConformanceFixContext` non-null → `specFixerForwardsToTestGen` false; TC-CONFRT-07 で `specReviewCallCount === 4` を Pipeline 統合 assert ✓ |
| observation pass の fixable finding が ledger に載り、regression-gate 入力に含まれる | TC-011, TC-012 | `collectSpecReviewLedger` が全 spec-review StepRun を走査；regression-gate の skipWhen / buildMessage が `dedupeFindings([...specLedger, ...implLedger])` を使用；TC-012 で spec-only ledger でも skip されないことを assert ✓ |
| request.md への fixable → escalation + escalationReason（既存テスト無変更） | TC-005, 既存 TC-003/TC-006 | spec-review-fixer-routing.test.ts TC-003 / TC-006 は期待値変更なしで green、TC-005 でも escalation を assert ✓ |
| observation pass が spec-review ループ予算を消費しない | TC-013 | Pipeline.run() 統合で specReviewCallCount === 1 / specFixerCallCount === 1 / status === "awaiting-archive" を assert ✓ |
| 期待値更新済み既存テストを implementation-notes に列挙 | — | implementation-notes.md に TC-001/002/005/013/015（spec-review-fixer-routing）、TC-003（spec-fixer-tasks-md-writable）、TC-030（pipeline.transitions）、TC-067（pipeline.test.ts）、TC-WHEN-02、TC-CONFRT-07 修正を列挙済み ✓ |
| `typecheck && test` が green | — | tsc --noEmit エラーなし；vitest 9618 passed, 1 skipped ✓ |

### コードレビュー

**`judge-verdict.ts` (T-01)**
4b を `routableCanon.some((f) => f.severity === "critical" || f.severity === "high") → needs-fix`、低位は fall-through に変更。4a (unroutable → escalation) は先行評価で不変。判定 5 (非 canon critical|high) / 判定 6 (approved) も不変。関数 doc コメントが `low/medium routable canon fixable → approved (observation auto-fix)` と新挙動を正確に記述している。✓

**`canon-write-scope.ts` (T-02)**
`buildScopeForSlug(slug)` private helper に共通ロジックを集約し、`buildCanonWriteScope(state, deps)` と `buildCanonWriteScopeFromState(state)` の両方が委譲。TC-023 で canonPaths・writableByFixer の一致を assert ✓。

**`spec-observation.ts` (T-03)**
`specReviewHasRoutableFixables`: `getLatestJudgeFindings` + `selectRoutableCanonFindings(findings, scope, specReviewEffectiveFixer)` で routable fixable の有無を判定。findings null / 空のとき false。TC-024, TC-025 でカバー ✓。

`specFixerForwardsToTestGen`: 2 条件（`getConformanceFixContext === null` かつ 最新 spec-review verdict `approved`）の連言。spec-review runs 不在時 false（TC-026）。コメントに test fixture 要件（ordered timestamps + toolResult.findings）を明示 ✓。

`types.ts` を import しないため循環依存なし ✓。

**`types.ts` (T-04)**
guarded 行 2 本を unconditional 行より前に挿入（`find()` 先頭一致のため順序が重要、コメントで明記）。FAST_TRANSITIONS 不変。TC-029 で length === 46 を assert ✓。TC-067 が `findWithTo` で両行の存在を確認する構成に更新済み ✓。

**`findings-ledger.ts` (T-05)**
`collectSpecReviewLedger`: 全 spec-review StepRun を走査し、canonScope 付きなら `specReviewEffectiveFixer` 基準で unroutable（request.md / test-cases.md / attestation）を除外。spec.md / design.md / tasks.md は保持。TC-028 でフィルタ動作を assert ✓。

**`regression-gate.ts` (T-05)**
`skipWhen` と `buildMessage` の双方で `dedupeFindings([...specLedger, ...implLedger])` を同一式で構築（divergence なし）。TC-012 で spec-only ledger で skip されないことを assert ✓。regression-gate が spec.md regressed finding を報告した場合、`deriveRegressionGateVerdict` R1（judgeEffectiveFixer = code-fixer、spec.md は unroutable）で escalation が発火。設計 D6 の「honest な帰結」と整合 ✓。

**T-03 reroute との互換性**
新規 guarded 行 `SPEC_REVIEW approved → SPEC_FIXER` は `fixerNamesForReroute.has("spec-fixer") === true` で T-03 clean transition 探索から除外され、unconditional `SPEC_REVIEW approved → TEST_CASE_GEN` が clean transition として選択される。spec-fixer budget 枯渇時の挙動は不変 ✓。

**TC-CONFRT-07（iter 1 high finding 解消）**
conformance StepRun に `ts: "2026-01-01T01:00:00.000Z"` と `toolResult.findings` を付与。`expect(specReviewCallCount).toBe(4)` を追加。これにより `getConformanceFixContext` の recency check（spec-review.endedAt < conformance.endedAt → non-null 返却）と findings check が両方通過し、`specFixerForwardsToTestGen` が false → unconditional spec-fixer → spec-review fallback → reverification 経路が Pipeline integration レベルで確認されるようになった ✓。

**implementation-notes.md**
「TC-CONFRT-07 フロー変化の記録（期待値変更あり）」セクションが上記修正内容を正確に記述している。cross-boundary-invariants-result-002.md F-1（「stale」）は当該 notes が更新される前の中間状態での読み取りに基づくと判断される。現在の notes は正確 ✓。

---

## Findings

なし

---

## Observations

### [LOW] reverification 後の spec-review が routable fixable findings を持つシナリオのタイムスタンプリスク

**File**: `tests/unit/core/pipeline/pipeline.conformance-routing.test.ts`

TC-CONFRT-07 で spec-review#4（reverification）は常に findings なしで approved を返す。reverification 後の spec-review が routable fixable findings を持つシナリオは TC-CONFRT-07 ではテストされていない。このシナリオでは spec-review#4.endedAt（default `"2026-01-01T00:00:00.000Z"`）が conformance#1.endedAt（`"2026-01-01T01:00:00.000Z"`）より古いため、`getConformanceFixContext` が依然 non-null を返し `specFixerForwardsToTestGen` = false → spec-fixer → spec-review の再ループが発生しうる。production では wall-clock 順で spec-review#4.endedAt > conformance#1.endedAt が保証されるため runtime リスクはない。将来このシナリオをテストに追加する場合は spec-review#4 に ordered timestamp が必要。

---

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認
- 全実装ファイル（judge-verdict.ts / canon-write-scope.ts / spec-observation.ts / types.ts / findings-ledger.ts / regression-gate.ts / fixer-helpers.ts）を通読、設計 D1〜D7 との整合を確認
- spec.md・design.md・tasks.md・test-cases.md を通読し受け入れ基準を照合
- `bun run typecheck` → エラーなし（確認）
- `bun run test` → 9618 passed, 1 skipped（確認）
- TC-CONFRT-07 修正（ordered timestamps + specReviewCallCount assertion）をコードで直接確認（pipeline.conformance-routing.test.ts lines 116-147, 536-564）
- implementation-notes.md の現在状態を確認（「期待値変更あり」と記述、修正内容が正確に列挙されていることを確認）
- cross-boundary-invariants-result-001/002.md を読み、iter 1 high finding（TC-CONFRT-07 equal timestamp）の解消を確認

## 検証できなかった項目

None

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

（何をどう確認したか。読んだファイル・辿った diff・確認したコード等を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
