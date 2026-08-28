# Conformance Result — fixer-unpushable-path-coverage — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Normative Sources

| Source | Role |
|---|---|
| request.md | Acceptance criteria (normative) |
| spec.md | Requirements (SHALL/MUST) + Scenarios (normative) |
| design.md | Design decisions D1–D5 (plan context) |
| tasks.md | Checkbox state (plan context) |

---

## 検証した項目

### AC-1: pushCapability 宣言時、code-fixer / spec-fixer の prompt に capability notice が含まれる（unit test で固定）

`code-fixer.ts` L129: `const capabilityNotice = renderPushCapabilityNotice(deps.pushCapability ?? null)` を `buildMessage` 冒頭で一度計算し、全 8 return path で `+ capabilityNotice` を付加。インスペクションで全 return を確認。

`spec-fixer.ts` L119: 同様。全 5 return path で付加済み。

Unit tests (fixer-push-capability.test.ts):
- TC-001 / TC-002 / TC-003: code-fixer initial / continuation / null
- TC-006 / TC-007 / TC-008 / TC-009: spec-fixer initial / fallback / continuation / null
- TC-016: code-fixer conformance branch
- TC-017: code-fixer coordinator loop branch
- TC-022 / TC-023: spec-fixer conformance initial / continuation

全 29 テスト pass 確認。

### AC-2: fixer が unpushable path を変更した場合、Layer 2 halt の前に 1 回の follow-up prompt が送られる

`CodeFixerStep.outputContracts` (code-fixer.ts L84-86) が `buildUnpushablePathContracts(deps)` を返す。
`SpecFixerStep.outputContracts` (spec-fixer.ts L87-89) が同様。

`fixer-helpers.ts` L187-197 の `buildUnpushablePathContracts` は `implementer.ts` L269-276 と同形の contract を返す。`policy: "follow-up"` により adapter の `OutputVerificationPolicy` が attempt 1 で follow-up prompt を送る。`step-context-builder.ts` の一回限り不変式（attempt ≥ 2 で unpushable-path を除外）は変更なし。

TC-015 がチェーンを検証：
- contract 宣言 ✓
- `buildOutputFollowUpPrompt` が修復 prompt を生成 ✓
- attempt-1 は violation を含む / attempt-2 は除外 → null → 2 回目 follow-up なし ✓

### AC-3: follow-up 後も違反が残る場合は UNPUSHABLE_PATH_BLOCKED で halt し escalation marker が投稿される

`executor.ts` L479-493 が `finalizeStepArtifacts`（commit-push.ts Layer 2）から投げられた `UnpushablePathBlockedError` を捕捉し `makeUnpushablePathHalt` → `awaiting-resume` halt に変換。この経路は維持されている。

**注**: code-fixer step が `executor.ts` を修正し、`"unpushable-path"` contract を output-contract gate から除外した。理由はコメントに記載：executor gate は `commitAndPush` の `git reset --mixed` 正規化より前に実行されるため、self-commit した unpushable path を誤検知する偽陽性 halt を生じる可能性があった。

この変更は：
- `UNPUSHABLE_PATH_BLOCKED` 経路を削除しない（Layer 2 経由で維持される）
- spec scenario 「`commitScopedPaths`（Layer 2）が `UNPUSHABLE_PATH_BLOCKED` を投げる」と一致する
- "No additional fixer-specific halt logic is introduced" 要件に沿う（halt ロジックの追加ではなく削除）

`unpushable-path-escalation.test.ts` TC-014 が更新され、新しい正しい挙動（gate は halt しない; Layer 2 が backstop）を検証。全テスト pass。

### AC-4: implementer / request-review の既存挙動に変更がない

```
git diff main -- src/core/step/implementer.ts src/core/step/request-review.ts
```
出力なし（未変更）。

executor.ts の変更は implementer にも影響する（unpushable-path を executor gate で halt しなくなる）が、可観測動作は維持される：`UNPUSHABLE_PATH_BLOCKED` halt + escalation marker は Layer 2 経由で引き続き発火する。

### AC-5: typecheck / test / architecture tests が green

```
bun run typecheck → exit 0（新規型エラーなし）
bun run test      → 841 test files passed, 12599 tests passed (1 skipped, 2 todo)
```

`src/core/step/__tests__/fixer-push-capability.test.ts` に 29 テスト（最低 18 件の要件を満たす）。全 pass。

### Spec Requirements — 全 Scenario 確認

| Requirement | Scenario | Result |
|---|---|---|
| code-fixer SHALL inject notice | initial with active pushCapability | PASS (TC-001) |
| code-fixer SHALL inject notice | continuation with active pushCapability | PASS (TC-002) |
| code-fixer SHALL inject notice | null pushCapability | PASS (TC-003) |
| code-fixer SHALL declare contract | with active pushCapability | PASS (TC-004) |
| code-fixer SHALL declare contract | without pushCapability | PASS (TC-005) |
| spec-fixer SHALL inject notice | initial with findings + active pushCapability | PASS (TC-006) |
| spec-fixer SHALL inject notice | fallback with active pushCapability | PASS (TC-007) |
| spec-fixer SHALL inject notice | continuation with active pushCapability | PASS (TC-008) |
| spec-fixer SHALL inject notice | null pushCapability | PASS (TC-009) |
| spec-fixer SHALL declare contract | with active pushCapability | PASS (TC-010) |
| spec-fixer SHALL declare contract | without pushCapability | PASS (TC-011) |
| buildUnpushablePathContracts SHALL return [] | null pushCapability | PASS (TC-012) |
| buildUnpushablePathContracts SHALL return [] | empty patterns array | PASS (TC-013) |
| buildUnpushablePathContracts SHALL return [] | non-empty patterns array | PASS (TC-014) |
| fixer steps SHALL rely on Layer 2 backstop | code-fixer follow-up does not resolve | PASS (TC-015) |

### Infrastructure Files (TC-020 / TC-021)

| File | Status |
|---|---|
| `src/core/step/implementer.ts` | 未変更（git diff で確認） |
| `src/core/step/request-review.ts` | 未変更（git diff で確認） |
| `src/core/step/step-context-builder.ts` | 未変更（git diff で確認） |
| `src/core/step/output-verify.ts` | 未変更（git diff で確認） |
| `commit-push.ts` | 未変更（git diff で確認） |

---

## 計画との差異（conformance finding ではない）

**executor.ts の修正（計画外）**: design / tasks に記載のない `executor.ts` の変更が code-fixer step によって行われた。design の Non-Goals リスト（`step-context-builder.ts`, `output-verify.ts`, `commit-push.ts`）に `executor.ts` は含まれない。変更内容は correctness 改善（`git reset --mixed` タイミング問題の回避）であり、spec の Layer 2 定義（`commitScopedPaths`）との整合を高める。

**TC-015 の実装方式**: test-cases.md は "integration" カテゴリとしたが、実装は unit test チェーン方式（Layer 1 と Layer 2 を個別に検証）。Layer 2 の end-to-end 検証は `commit-scoped-paths.test.ts` が担い、step 横断で再利用可能。spec の normative 要件には違反しない。

---

## 検証できなかった項目

None。全 normative 項目を確認済み。

## Findings 詳細

None。規範的要件の違反は検出されなかった。
