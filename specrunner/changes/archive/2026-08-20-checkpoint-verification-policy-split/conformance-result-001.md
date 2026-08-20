# Conformance Result — checkpoint-verification-policy-split — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Normative Sources

- **request.md**: 5 acceptance criteria
- **spec.md**: 4 Requirements, 9 Scenarios (all normative)

### Scope of Changes

```
src/core/attach/checkpoint-policy.ts        (new — 112 lines)
src/core/attach/verify-checkpoint.ts        (modified — ~80 lines removed, ~17 added)
tests/attach/checkpoint-policy.test.ts      (new — 350 lines)
```

既存テストファイル (`tests/attach/verify-checkpoint.test.ts`,
`tests/attach/verify-checkpoint-r1-assurance.test.ts`) — **zero diff** 確認済。
`tests/unit/architecture/arch-allowlist.ts` — **zero diff** 確認済。

### Req: verifyCheckpoint shall accept an optional verification policy

- `verifyCheckpoint` が `policy: CheckpointVerificationPolicy = attachResumePolicy` を第二引数として受け取る (verify-checkpoint.ts L79) ✅
- TC-001: 既存呼び出し元がポリシー引数なしで動作する ✅
- TC-002: カスタムポリシーを注入すると `policy.verify({ state, slug, treeFiles })` が呼ばれる (L175) ✅

### Req: generic integrity verification shall be independent of use-case policy

実行順序を verify-checkpoint.ts で確認:
1. (b-new) events.jsonl 必須 (L82–99)
2. (b) journal/projection integrity (L101–118)
3. (b-new) counter reversal (L120–149)
4. (profile) profile self-consistency (L151–170)
5. **[policy]** `policy.verify({ state, slug, treeFiles })` (L175) ← ここで policy 呼出
6. (d) request.md 存在確認 (L177–184) ← policy 後・identity 前（spec.md Note と一致）
7. (e) identity 検証 (L186–215)

spec.md Note「(d) request.md presence is verified after policy.verify() and before identity (e)」に完全一致。 ✅

- TC-003: permissive policy + awaiting-archive → generic 通過して VerifiedCheckpoint 返却 ✅
- TC-004: corrupted events.jsonl → journal-corrupted で throw、policy.verify() は一度も呼ばれない ✅

### Req: resume-specific checks shall live exclusively in attachResumePolicy

checkpoint-policy.ts `attachResumePolicy.verify()` に三つの resume 固有検査を確認:
- (a) `state.status !== "awaiting-resume"` → `not-quiescent` (L48–53) ✅
- (c) resumePoint + pipeline definition 解決 → `pipeline-unresolvable` / `resume-step-unresolvable` (L56–80) ✅
- (d-new) reads() 必須入力検査 → `resume-reads-unevaluable` / `resume-input-missing` (L82–110) ✅

MUST NOT 検証:
- `grep "awaiting-resume" verify-checkpoint.ts` → **no matches** ✅
- `grep "getPipelineDescriptor|getPipelineId|resolveResumeStep|buildAllowedStepSet" verify-checkpoint.ts` → **no matches** ✅

- TC-005: status 不一致 → `not-quiescent` ✅
- TC-006: resumePoint=null + 無効 step → `resume-step-unresolvable` ✅ (spec Note の non-null passthrough 挙動と一致)
- TC-007: tasks.md 欠落 → `resume-input-missing` ✅

### Req: attach-resume behavior shall be preserved end-to-end

- TC-008: awaiting-archive → default policy → `not-quiescent` で reject ✅
- TC-009: valid awaiting-resume → VerifiedCheckpoint (slug/jobId/branch/checkpointOid 全一致) ✅

### Acceptance Criteria (request.md)

| # | 基準 | 結果 |
|---|------|------|
| 1 | 既存 attach テスト無改変で green | ✅ 既存ファイル diff ゼロ; verification-result.md: 11772 tests PASS |
| 2 | rebind primitive が policy を受け取り generic が独立して機能することをテストで pin | ✅ TC-002/TC-003/TC-004 |
| 3 | attach-resume policy 単体テスト（status 不一致 / resumePoint 解決失敗 / reads() 欠落） | ✅ TC-005/TC-006/TC-007 |
| 4 | `tests/unit/architecture/` green、新 allowlist エントリなし | ✅ arch-allowlist.ts 無改変、verification PASS |
| 5 | `bun run typecheck` / `bun run test` green | ✅ verification-result.md: 全 phase PASS |

### Structural Checks (TC-010, TC-011)

- TC-010: `verify-checkpoint.ts` に `getPipelineDescriptor` / `getPipelineId` / `resolveResumeStep` / `buildAllowedStepSet` の直接 import なし ✅
- TC-011: `verify-checkpoint.ts` に `"awaiting-resume"` 文字列なし ✅

### Plan Conformance (design / tasks — 参考)

| 判断 | 実装 |
|------|------|
| D1: policy = default argument | `policy: CheckpointVerificationPolicy = attachResumePolicy` ✅ |
| D2: `checkpoint-policy.ts` 新規作成 | `src/core/attach/checkpoint-policy.ts` ✅ |
| D3: generic + identity checks は verifyCheckpoint に残す | ✅ |
| D4: `PolicyVerificationContext = { state, slug, treeFiles }` | ✅ |
| D5: `verify()` は sync | `verify(ctx: PolicyVerificationContext): void` ✅ |
| T-01〜T-04 全 checkbox [x] | ✅ |

## 検証できなかった項目

None。全 normative 項目を実装・テストで直接確認した。

## Findings 詳細

None。
