# Conformance Result — test-generation-type-gate — iter 2

## 検証した項目

### J1: tasks.md の全チェックボックス

全 T-01〜T-05 のチェックボックスがすべて `[x]` で完了していることを確認した。

### J2: spec.md Requirements / Scenarios への適合

**Requirement: テスト生成要否は request type で宣言的に決まる**

- `isTestGenRequired("chore") === false`: `TYPE_CONFIG["chore"].testGenRequired = false`、関数は `TYPE_CONFIG[type]?.testGenRequired ?? true` で実装 ✅
- 非免除 4 type が `true`: 各 entry に `testGenRequired: true` ✅
- 未知 type は fail-closed で `true`: `?? true` フォールバック ✅
- 走行中の agent 判断を挟まない: 関数は type 文字列のみから決定、副作用なし ✅

**Requirement: 免除 type の pipeline はテスト生成工程を通らない**

- chore + spec-review approved → IMPLEMENTER 直行: `{ SPEC_REVIEW, approved, IMPLEMENTER, when: isTestGenExempt }` が `specReviewHasRoutableFixables` guarded row の後、unconditional TEST_CASE_GEN row の前に挿入されている ✅
- chore + implementer success → VERIFICATION 直行: `{ IMPLEMENTER, success, VERIFICATION, when: isTestGenExempt }` が unconditional BITE_EVIDENCE row の前に挿入されている ✅
- spec-fixer 観測修正は IMPLEMENTER へ: `specFixerForwardsToImplementer = specFixerForwardsToTestGen && isTestGenExempt` が `specFixerForwardsToTestGen` guarded row の前に挿入されている ✅
- 非免除 type の遷移は無変更: 既存 row に変更なし、追加のみ ✅

**Requirement: 免除 type では changed-line coverage gate を明示 skip する**

- gate を実行しない: `finalizeVerificationRun` で免除チェックが `coverage !== undefined` の内部で failed チェックより先に評価される ✅
- skip 理由を明示: stdout は `_(skipped — test-generation-exempt request type: ${args.requestType})_` — design D4 の例示と一致 ✅
- verdict を fail にしない: skipped phase は `anyFailed = phases.some(p => p.status === "failed")` に影響しない ✅
- build 失敗時でも免除由来が先: 免除チェックが failed チェックより前に評価されるため `previous command failed` にはならない ✅

**Requirement: 免除 type でも既存テスト実行は維持される**

- command/phase 実行ループは一切変更なし。免除は `finalizeVerificationRun` 内の coverage gate と transition table のみに閉じている ✅

### J3: design.md 設計判断 D1〜D5 への適合

| 決定 | 確認内容 |
|------|---------|
| D1 | `TypeConfigEntry.testGenRequired: boolean` 追加、`isTestGenRequired()` を `isSpecRequired` と同型で実装（`?? true` fail-closed） ✅ |
| D2 | STANDARD_TRANSITIONS に 3 本の guarded row を追加。行順は設計通り（specReviewHasRoutableFixables → isTestGenExempt → unconditional TEST_CASE_GEN、specFixerForwardsToImplementer → specFixerForwardsToTestGen → SPEC_REVIEW、isTestGenExempt → unconditional BITE_EVIDENCE） ✅ |
| D3 | `specFixerForwardsToImplementer = specFixerForwardsToTestGen(state) && isTestGenExempt(state)` の AND 合成で実装 ✅ |
| D4 | `runVerification` に末尾 optional `requestType?` を追加し両内部関数へ伝播。`finalizeVerificationRun` 内で免除チェックを failed チェックより前に配置 ✅ |
| D5 | command/phase 実行ループ（build/typecheck/test/lint/security）は本 diff で変更なし ✅ |

### J4: request.md 受け入れ基準の充足

| 受け入れ基準 | 対応テスト | 状態 |
|------------|----------|------|
| chore で `SPEC_REVIEW → IMPLEMENTER → VERIFICATION`、生成工程を通らないことをテストで固定 | TC-004, TC-005 (test-gen-exemption.test.ts) | ✅ |
| unknown type が fail-closed であることをテストで固定 | TC-003 (type-config.test.ts: `isTestGenRequired("unknown-type") === true` 等) | ✅ (note 参照) |
| 免除 type で coverage gate が skip され skip が結果に明示されることをテストで固定 | TC-008 (runner-test-gen-exemption.test.ts) | ✅ |
| 免除 type でも verification command 実行が走ることをテストで固定 | TC-010 (runner-test-gen-exemption.test.ts) | ✅ |
| 既存テストが無変更で green | verification passed (build/typecheck/test/lint 全 phase passed) | ✅ |
| `typecheck && test` が green | verification-result.md: verdict passed | ✅ |

---

## 検証できなかった項目

None。すべての判定項目を実装コードとテストコードの照合により確認した。

---

## Findings 詳細

### Finding 1: unknown type に対する `isTestGenExempt` の直接 assert が欠落

**対象**: `src/core/pipeline/__tests__/test-gen-exemption.test.ts`  
**severity**: low  
**resolution**: fixable

T-05 は「request type が未知の JobState で `isTestGenExempt` が `false`（＝免除されない）ことを assert する」と規定するが、当該テストファイルには `makeState("unknown-type")` に対する `isTestGenExempt` の assert が存在しない。TC-007 の `isTestGenExempt` テストは "new-feature" のみを対象としている。

行動上の欠陥はない。TC-003 (`type-config.test.ts`) が `isTestGenRequired("unknown-type") === true`、`isTestGenRequired("docs") === true`、`isTestGenRequired("") === true` を固定しており、`isTestGenExempt` は `!isTestGenRequired(type)` の一行委譲であるため、バグが入り込む余地はない。ただし T-05 が名指しした assert ポイントが未実装である。

修正: `test-gen-exemption.test.ts` の TC-007 ブロックまたは独立ブロックに `expect(isTestGenExempt(makeState("unknown-type"))).toBe(false)` を追加する。
