# Code Review Feedback — checkpoint-verification-policy-split — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

**差分スコープ**:
- `src/core/attach/checkpoint-policy.ts` (新規, 112 行): `PolicyVerificationContext`, `CheckpointVerificationPolicy`, `attachResumePolicy` を定義
- `src/core/attach/verify-checkpoint.ts` (リファクタ, net -80 行): resume 固有 checks を削除し policy injection point を追加
- `tests/attach/checkpoint-policy.test.ts` (新規, 350 行): TC-001〜TC-011 を実装

**受け入れ基準の照合**:

| 基準 | 確認方法 | 結果 |
|------|----------|------|
| 既存テスト無改変 green | `git diff main -- tests/attach/verify-checkpoint.test.ts` (0 lines), `git diff main -- tests/attach/verify-checkpoint-r1-assurance.test.ts` (0 lines) | ✓ |
| rebind が policy を受け取る構造をテストで pin | TC-003 (awaiting-archive + no-op policy → VerifiedCheckpoint), TC-004 (journal-corrupted → policy 呼ばれる前に throw) | ✓ |
| attachResumePolicy 単体: 3 拒否ケース | TC-005 not-quiescent, TC-006 resume-step-unresolvable, TC-007 resume-input-missing | ✓ |
| architecture allowlist 変更なし | `git diff main -- tests/unit/architecture/arch-allowlist.ts` (0 lines) | ✓ |
| typecheck / test green | verification-result.md: build/typecheck/test/lint/coverage 全 passed | ✓ |

**コード確認ポイント**:
- `verify-checkpoint.ts` に `"awaiting-resume"` リテラルが残っていない: `grep` で 0 件 ✓
- `verify-checkpoint.ts` に `getPipelineDescriptor`, `getPipelineId`, `resolveResumeStep`, `buildAllowedStepSet` の import が残っていない: `grep` で 0 件 ✓
- `orchestrator.ts` は `verifyCheckpoint(input)` を policy 引数なしで呼んでいる（default = attachResumePolicy）: 変更なし ✓
- policy.verify() の呼び出し位置: profile 検証後・request.md 確認前 (L175) — design.md D3 の順序と一致 ✓

## 検証できなかった項目

None

## Findings 詳細

指摘なし。構造・挙動・テスト網羅すべて正常。
