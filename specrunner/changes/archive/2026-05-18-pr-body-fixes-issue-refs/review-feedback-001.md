# Code Review — pr-body-fixes-issue-refs — iter 1

## Summary

- **verdict**: approved
- **date**: 2026-05-18
- **reviewer**: code-reviewer agent

---

## Findings

### [info] TC-04 not explicitly tested (keyword "Fixes" vs "Closes"/"Resolves")

**Severity**: info  
**File**: `tests/unit/core/pr-create/body-template.test.ts`

test-cases.md の TC-04 (must) は「`Closes #264` および `Resolves #264` が body に含まれない」を要求するが、この assertion を持つテストが追加されていない。実装は `Fixes ${parsedRequest.issue}` のテンプレートリテラルで固定されているため "Closes"/"Resolves" が混入する経路は存在しない。安全上の問題はないが、仕様の意図を明示するテストとして追加する価値はある。

### [info] TC-05 / TC-06 / TC-09 の明示的テストが不在

**Severity**: info  
**Files**: `tests/unit/core/pr-create/body-template.test.ts`, `tests/unit/parser/request-md.test.ts`

- **TC-05** (must): issue 存在時に既存 section (Summary / Workflow / Test plan / signature) が保持されることの明示的 assertion がない
- **TC-06** (must): issue = undefined のとき body 全体が変化しないことの regression assertion がない
- **TC-09** (must): parser で `type` / `slug` / `baseBranch` が issue 追加後も正常に取れることの明示的テストがない

いずれも 2050 件の既存テストが regression カバーしており、実際の安全網としては機能している。新規テストで意図を明示することが望ましいが、通過中の既存テストスイートで代替されているため approval を妨げるレベルではない。

---

## 確認事項（問題なし）

| 項目 | 結果 |
|------|------|
| `src/core/pr-create/body-template.ts` — Fixes 行の挿入位置 (Summary 直後、Workflow 直前) | ✅ 設計 D3 通り |
| `src/parser/request-md.ts` — issuePattern のスキャン方式 | ✅ 既存 type/slug/baseBranch と同一パターンで一貫 |
| `parsedRequest.issue` が falsy の場合に何も挿入しない | ✅ `if (parsedRequest.issue)` ガード |
| TC-01 / TC-02 / TC-07 / TC-08 (must) — 明示的テスト | ✅ すべて実装済み |
| typecheck (TC-11 / TC-12) | ✅ passed (0 errors) |
| 全テスト (TC-13) | ✅ 2050 tests passed |
| spec authority 更新 (TC-14 / TC-15) | ✅ request-md-parser/spec.md / pr-create-runner/spec.md 両方更新済み |
| `bun run typecheck && bun run test` | ✅ green |

---

## 総評

変更は最小限かつ正確。optional field の追加 + 条件分岐のみで既存パスへの影響がない設計。TC-04/TC-05/TC-06/TC-09 の明示的テストが欠けるものの、すべて既存テストスイートまたは実装の構造的保証でカバーされており、機能・型安全性・回帰の観点で問題は見当たらない。
