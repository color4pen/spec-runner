# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: tasks.md — 全チェックボックスが [x] になっているか

T-01〜T-08 の全チェックボックスが `[x]` で完了済みを確認。

---

### J2: design.md — 設計判断の実装確認

- **D1** (`deriveSpecReviewVerdict` 4b 変更): `judge-verdict.ts:89-114` で実装済み。`selectRoutableCanonFindings` の critical/high サブセット条件、low/medium fall-through、4a (unroutable escalation) と 5 (非 canon critical|high) は変更なし。✓
- **D2** (`buildCanonWriteScopeFromState`): `canon-write-scope.ts` に追加。内部 `buildScopeForSlug(slug)` を private helper として切り出し、`buildCanonWriteScope` と `buildCanonWriteScopeFromState` が同一 helper に委譲。single source of truth 実現。✓
- **D3** (`spec-observation.ts`): `specReviewHasRoutableFixables` / `specFixerForwardsToTestGen` の 2 純関数を追加。`types.ts` を import せず循環 import なし。✓
- **D4** (STANDARD_TRANSITIONS guarded 行 +2): 既存無条件行の前に guarded 行を挿入。行数 44 → 46。先頭一致ガードが正しく機能。✓
- **D5** (予算非消費): observation pass で spec-review に再入場しない直行遷移により構造的に満たされる。明示的カウンタ据え置き機構は不要で導入なし。✓
- **D6** (`collectSpecReviewLedger`): `findings-ledger.ts:131-155` に追加。`specReviewEffectiveFixer` 基準の unroutable 除外 (request.md / test-cases.md / attestation) を適用し spec.md / design.md / tasks.md finding を保持。`regression-gate.ts` の `buildMessage` / `skipWhen` で `dedupeFindings([...specLedger, ...implLedger])` に合流済み。✓
- **D7** (ADR): `request.adr: true` あり。design / tasks に ADR path 記載なし。adr-gen に委譲。✓

---

### J3: spec.md — 要件とシナリオの実装確認

**Requirement 1 (verdict 導出変更)**
- `deriveSpecReviewVerdict` 4b: `routableCanon.some(critical|high)` のみ needs-fix、low/medium は fall-through して `approved`。
- TC-001 (medium on spec.md → approved) ✓ / TC-002 (low on design.md → approved) ✓ / TC-003 (high → needs-fix) ✓ / TC-004 (critical → needs-fix) ✓ / TC-005 (request.md unroutable → escalation) ✓
- 判定 1/2/3/4a/5/6 不変を既存テスト (TC-016〜TC-020 等) で確認。✓

**Requirement 2 (observation pass 遷移)**
- STANDARD_TRANSITIONS line 235: `{ SPEC_REVIEW, "approved", SPEC_FIXER, when: specReviewHasRoutableFixables }` を unconditional 行前に配置。
- TC-006 (approved + routable fixable → spec-fixer) ✓ / TC-007 (approved + no routable fixable → test-case-gen) ✓

**Requirement 3 (経路の分離)**
- STANDARD_TRANSITIONS line 244: `{ SPEC_FIXER, "approved", TEST_CASE_GEN, when: specFixerForwardsToTestGen }` を unconditional `→ SPEC_REVIEW` 前に配置。
- `specFixerForwardsToTestGen`: (1) `getConformanceFixContext === null` かつ (2) 最新 spec-review verdict `"approved"` の両方でのみ true。
- TC-008 (observation-pass → test-case-gen) ✓ / TC-009 (needs-fix → spec-review) ✓ / TC-010 (conformance-triggered → spec-review) ✓
- TC-CONFRT-07 (pipeline.conformance-routing.test.ts): conformance step に distinct timestamp (`2026-01-01T01:00:00.000Z`) と `toolResult.findings` を付与し `expect(specReviewCallCount).toBe(4)` で reverification 不変条件を Pipeline 統合レベルで固定。implementation-notes.md に記録あり。✓

**Requirement 4 (regression-gate ledger)**
- `collectSpecReviewLedger` (findings-ledger.ts:131-155): spec-review 全 run 走査、`specReviewEffectiveFixer` 基準除外。
- `regression-gate.ts` `skipWhen`: `ledger.length === 0` のみ skip。spec-review finding のみでも gate を走らせる。
- TC-011 (ledger に finding が含まれる) ✓ / TC-012 (regression-gate not skipped for spec-review-only ledger) ✓ / TC-028 (request.md finding canonScope 付きで除外) ✓

**Requirement 5 (予算非消費)**
- TC-013 (Pipeline 統合テスト): `specReviewCallCount === 1` / `specFixerCallCount === 1` / `testCaseGenCallCount === 1` を assert。re-entry なしを直接確認。✓

**Requirement 6 (impl 側・他 verdict 関数・FAST 不変)**
- `deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` / `deriveRequestReviewVerdict` / `collectFixableFindings` 変更なし。TC-014 で `deriveJudgeVerdict` 不変確認。✓
- `FAST_TRANSITIONS` に spec-review / spec-fixer / test-case-gen 行なし: TC-015 ✓
- reviewer-chain.ts / spec-review prompt / spec-fixer 書込集合 変更なし。✓

---

### J4: request.md — 受け入れ基準の充足

| 受け入れ基準 | テスト | 充足 |
|---|---|---|
| medium fixable → approved + spec-fixer → test-case-gen (re-review なし) | TC-001, TC-006, TC-008, TC-013 | ✓ |
| high fixable → needs-fix → spec-fixer → spec-review 往復 | TC-003, TC-027, TC-009 | ✓ |
| conformance needs-fix:spec-fixer 起点 spec-fixer → spec-review 再検証 | TC-010, TC-CONFRT-07 | ✓ |
| observation pass の fixable finding が ledger に載り regression-gate に含まれる | TC-011, TC-012 | ✓ |
| request.md fixable (unroutable) → escalation + escalationReason（既存テスト無変更） | TC-005; 既存 TC-003/TC-006 (spec-review-fixer-routing.test.ts) 無変更 | ✓ |
| observation pass が spec-review ループ予算を消費しない | TC-013 (specReviewCallCount === 1) | ✓ |
| 期待値を更新した既存テストを implementation-notes に列挙 | implementation-notes.md に TC-001/002/005/013/015 (spec-review-fixer-routing), TC-003 (spec-fixer-tasks-md-writable), TC-030 (pipeline.transitions), TC-067 (pipeline.test), TC-WHEN-02 (transition-when), TC-CONFRT-07 記録済み | ✓ |
| `typecheck && test` green | 直接実行: 647 test files passed, 9618 tests passed, typecheck エラー 0 | ✓ |

---

### スコープ確認

diff stat (37 ファイル) より変更が T-08 記載範囲に限定されていることを確認:

変更あり (スコープ内):
- `src/core/step/judge-verdict.ts` — 4b 変更のみ
- `src/core/step/canon-write-scope.ts` — `buildCanonWriteScopeFromState` 追加
- `src/core/pipeline/spec-observation.ts` — 新規追加（純関数モジュール）
- `src/core/pipeline/types.ts` — guarded 行 2 本追加
- `src/core/pipeline/findings-ledger.ts` — `collectSpecReviewLedger` 追加
- `src/core/step/regression-gate.ts` — 台帳合流
- `src/core/step/fixer-helpers.ts` — `getConformanceFixContext` INVARIANT コメント追記（利用者向け注記）
- テストファイル (既存更新 + 新規): 全て受け入れ基準に対応

変更なし (スコープ外):
- `reviewer-chain.ts`（impl 側 observation auto-fix）
- `FAST_TRANSITIONS`
- spec-review / spec-fixer prompt
- conformance fixTarget routing
- `deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` / `deriveRequestReviewVerdict`

---

## 検証できなかった項目

None

## Findings 詳細

None（指摘なし）
