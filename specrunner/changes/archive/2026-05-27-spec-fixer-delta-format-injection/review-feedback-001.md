# Review Feedback 001

- **change**: spec-fixer-delta-format-injection
- **iteration**: 1
- **verdict**: approved

## Summary

prompt-only の変更として実装は正確。spec-fixer / code-fixer の両方に 5 項目の inline 規約が追加され、code-fixer の authority spec 限定も正しく反映されている。typecheck・test すべて green。test-coverage が "12/12" と報告しているが後述のとおり TC ID 衝突による false positive であり、実装の正しさはコード直接確認で担保済み。

## Findings

### [NIT] test-coverage "12/12" は TC ID 衝突による false positive

**File**: `specrunner/changes/spec-fixer-delta-format-injection/verification-result.md`

**Issue**: test-coverage phase は TC ID 文字列をテストファイル内で検索するが、本変更の TC-029〜TC-043 はすでに他 feature のテストで同番号が使われている（例: TC-029 = `pipeline.transitions.test.ts` の code-fixer error→escalate、TC-030 = `pipeline.transitions.test.ts` の STANDARD_TRANSITIONS、TC-031〜040 = `renamed-section-format.test.ts` / `pipeline.test.ts` / `runtime-config.test.ts` 等）。本変更の prompt content assertions（`"requirement name"` 包含確認など）に対応するテストは実際には追加されていない。

`tests/prompts/spec-fixer-system.test.ts` は TC-028 と TC-060 のみ。code-fixer 側も同様に新規 content assertion テストはない。

**影響度**: 低。変更は prompt テキストの追記のみであり、ロジックを含まない。AC はコード直接確認で全件満足を確認済み（下表）。

**Fix**: 不要。prompt-only 変更にテストを追加する場合、`tests/prompts/spec-fixer-system.test.ts` に TC-029〜TC-034 相当の describe ブロックを追加し、`code-fixer-system.ts` 側も同様にするのが理想だが、将来 #334（共通 prompt fragment）で一括対応される見込みであり、本 fix の scope 外として許容する。

---

### [NIT] spec-fixer の delta spec パス記述が省略形

**File**: `src/prompts/spec-fixer-system.ts:38`

**Issue**: spec-fixer prompt の説明では `specs/**/*.md` と書かれているが、code-fixer では `specrunner/changes/<slug>/specs/**/*.md` とフルパスで記載されている。省略形でも agent が誤解する可能性は低いが、authority spec（`specrunner/specs/`）との混同リスクがわずかにある。

**Fix**: 不要。spec-fixer は delta spec のみを扱うエージェントであり、scope 上 authority spec を変更する理由がない。

---

## Acceptance Criteria Check

| 受け入れ基準 | Status |
|------------|--------|
| spec-fixer prompt に `## Removed` / `## Renamed` のフォーマット規約が inline で記載されている | ✅ |
| code-fixer prompt にも同様の規約が記載されている | ✅ |
| code-fixer の禁止事項が authority spec（`specrunner/specs/`）に限定されている（delta spec は修正対象と明記） | ✅ |
| 既存の「rules.md を読め」指示が維持されている | ✅ （spec-fixer L38、code-fixer L41 で確認） |
| `bun run typecheck && bun run test` が green | ✅ （verification-result.md より） |

## Implementation Verification

コード直接確認：

**spec-fixer-system.ts（L40-47）**:
- `- "requirement name"` リスト形式記載 ✅ (TC-029)
- `- "old name" → "new name"` リスト形式記載 ✅ (TC-030)
- `## Delta Spec Format Rules` セクション存在 ✅ (TC-031)
- `rules.md` 参照維持 ✅ (TC-032)
- `### Requirement:` header 一致規約 ✅ (TC-033)
- `SHALL` / `MUST` 規約 ✅ (TC-034)

**code-fixer-system.ts（L26, L39-50）**:
- `## Delta Spec Format Rules` セクション存在 ✅ (TC-035)
- `- "requirement name"` 記載 ✅ (TC-036)
- `- "old name"` 記載 ✅ (TC-037)
- `rules.md` 参照 ✅ (TC-038)
- `specrunner/specs/` パス限定の禁止事項 ✅ (TC-039)
- `仕様変更（spec ファイルの変更）` の旧文言なし ✅ (TC-040)
- `### Requirement:` 一致規約 ✅ (TC-041)
