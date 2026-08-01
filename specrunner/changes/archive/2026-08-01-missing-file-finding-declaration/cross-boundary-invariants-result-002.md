# Cross-Boundary Invariants Review — missing-file-finding-declaration — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更差分の把握

`git diff main...HEAD --stat` を実行し、21 ファイル 2637 行追加を確認。

実装対象ソースファイル（不変との相互作用を検証）:

| ファイル | 変更内容 |
|----------|----------|
| `src/kernel/report-result.ts` | `Finding` 型に `fileMissing?: boolean` を追加 |
| `src/core/port/report-result.ts` | `parseFindings` で `fileMissing === true` のみ capture |
| `src/core/step/report-tool.ts` | 4 tool schema / description に `fileMissing` を追加 |
| `src/core/step/step-completion.ts` | ref 検証ブロックを `missingDecl` / `regular` 2 群に分割・反転、`branch=null` 時は fail-closed |
| `src/core/step/__tests__/step-completion-missing-file-finding.test.ts` | 新規テスト（TC-001〜TC-006b, TC-007〜TC-012） |

**変更されていない**コード（不変条件の保持を確認する側）:
- `src/core/runtime/managed.ts:381-422` — `verifyFindingRefs` 実装（`branch=null` → 全 ref 非実在扱い）
- `src/core/runtime/local.ts:752-781` — `verifyFindingRefs` 実装（filesystem ベース、branch 無視）
- `src/core/port/runtime-strategy.ts:428-443` — seam 契約（非実在 ref の部分集合を返す）
- `src/core/step/judge-verdict.ts:26-30` — `collectVerdictAffectingFindings`（critical/high/decision-needed）
- `src/core/step/step-completion.ts:300-321` — `verdictOverriddenByFindingRef` による escalationReason 抑止

---

## iter 1 F-01 の解消確認

iter 1 の HIGH finding F-01:
> managed runtime `branch = null` + `missingDecl` 群 → fail-open
> （`branch=null` → seam が全 ref を非実在として返す → `absentFiles` に全件 → `falseDecl` 空 → `override=false` → routing 保存）

**解消確認**:

`step-completion.ts:264-270` （新規追加コード）:
```typescript
if (missingDecl.length > 0) {
  const branch = state.branch ?? null;
  if (branch === null) {
    // Without a branch, verifyFindingRefs cannot distinguish "file truly absent" from
    // "branch unavailable → all refs reported non-existent" (managed runtime behavior).
    // Fail-closed: unverifiable missingDecl declarations → escalation override.
    override = true;
  } else {
    ...
  }
}
```

`branch === null` 時は seam を呼ばずに `override = true` を即設定する。
seam が「全件非実在」を返すことで `absentFiles` が full になり `falseDecl` が空になる、という従来の fail-open 経路を根本から遮断している。

**対応テスト TC-006b** (`src/core/step/__tests__/step-completion-missing-file-finding.test.ts:706-752`):
```typescript
const state = { ...makeState("regression-gate"), branch: null };
// ...
expect(completion.verdict).toBe("escalation");
expect(mockVerifyFindingRefs).not.toHaveBeenCalled();
```

2 つのアサーション:
1. `verdict === "escalation"` — fail-closed が機能していること
2. `mockVerifyFindingRefs` が呼ばれていない — 短絡経路（seam 呼び出し前）での上書きであること

F-01 は実装・テストの両方で正しく解消されている。✅

---

## 境界交差の追加確認（iter 2 新規チェック）

### 境界 α: `branch=null` の対称性 — `regular` 群 vs `missingDecl` 群

| 群 | `branch=null` 時の挙動 |
|---|---|
| `regular` | seam に `state.branch ?? null = null` を渡す → managed: 全 ref 非実在 → `override=true`（fail-closed） |
| `missingDecl` | seam を呼ばずに `override=true`（fail-closed）|

両群とも `branch=null` で escalation となり、fail-closed の対称性が成立する。✅

**混合ケース**（regular + missingDecl 両方あり、`branch=null`）:
- `regular.length > 0`: seam 呼び出し → managed では `branch=null` → 全件非実在 → `override=true`
- `missingDecl.length > 0`: `branch=null` → `override=true`（短絡）
- 最終: `override=true` → escalation ✅

### 境界 β: `local` runtime の `branch` パラメータ無視 × `branch=null` 短絡

`local.ts:752` の `verifyFindingRefs` シグネチャ:
```typescript
async verifyFindingRefs(refs: FindingRef[], cwd: string, _branch: string | null): Promise<FindingRef[]>
```

local 実装は `_branch` を無視し常に filesystem を参照する。
このため `state.branch=null` + `missingDecl` で short-circuit 前に seam を呼んだ場合、local は filesystem の実際の状態を返す。

TC-006b は `branch=null` で seam が呼ばれないことを確認済みのため、local/managed の違いは顕在化しない。
`state.branch=null` が judge step に到達する経路は pipeline 順序不変条件（design 完了後にのみ judge に到達）により実運用上存在しない。
fail-closed の方向は `state.branch=null` を問わず均一に機能する。✅

### 境界 γ: `missingDecl` 群の重複 file 参照

同一 file が複数の `missingDecl` finding に含まれるケース:
- `refs = [{ file: "foo.md" }, { file: "foo.md" }]`（重複渡し）
- `absentFiles = new Set(nonExistent.map(r => r.file))`（Set で自動 dedup）
- `Set.has(f.file)` での判定は重複に依存しない

重複 file があっても誤判定は生じない。✅

### 境界 δ: `regular` 群で `override=true` 確定後も `missingDecl` 群が評価される

コードは `override=true` が確定した後も `missingDecl.length > 0` ブロックを評価する（early return なし）。tasks.md が「任意の最適化」と明示した仕様通りで、正確性には影響しない（最終的な `if (override)` で正しく上書きされる）。✅

### 境界 ε: `verdictOverride` との相互作用

`verdictOverride`（code-fixer no-op 検出用）は producer step 専用。judge / request-review step では設定されない。ref 検証（`isJudgeStep || isRequestReviewStep` ガード）と `verdictOverride`（producer step 専用）は排他的であり、同一 step で両方が干渉する経路は存在しない。✅

### 境界 ζ: `filterUndecidedFindings` の二重呼び出し対称性（iter 1 境界 D の再確認）

verdict 導出ブロックと ref 検証ブロックで `filterUndecidedFindings` が別々に呼ばれる。
両ブロックとも `effectiveToolResult.findings`（scope findings を含む）を入力とし同一の `state.decisions` を参照するため、入力集合は同一。iter 1 から変更なし。✅

---

## 既存テストの確認

- `src/core/runtime/__tests__/managed-verify-finding-refs.test.ts` — 無変更確認（diff stat に現れない）
- `tests/unit/core/runtime/verify-finding-refs.test.ts` — 無変更確認（diff stat に現れない）
- verification-result.md: `test 10032 passed | 1 skipped (10033)` — 全テスト green を確認

---

## 検証できなかった項目

- pipeline descriptor 全遷移テーブルの網羅確認（design 完了前に judge step が起動されない不変条件の完全形式検証）。これは ADR の対象であり、本レビュー範囲外。

---

## Findings 詳細

なし。

iter 1 の F-01（HIGH: `branch=null + missingDecl` → fail-open）は、実装（`branch===null → override=true` 短絡）と専用テスト（TC-006b）の両方で解消されていることを確認した。その他の境界交差について追加の問題は発見されなかった。
