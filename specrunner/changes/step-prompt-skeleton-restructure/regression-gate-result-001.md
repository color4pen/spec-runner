# Regression Gate Result — iteration 001

## 検証した項目

### 基本方針

`git diff main...HEAD --name-only` で変更ファイル一覧を確認（35 ファイル）。
code-fixer の差分を `git diff 20cbe0dba...70450beef --name-only` で特定し、各 finding の修正有無を verified として記録。

### Finding 1: CAUSE_CLASSIFICATION が Completion 節に配置されているか

**code-fixer の変更を確認（verified）**

`git diff 20cbe0dba...70450beef -- src/prompts/fragments.ts` にて:

- **Before**: `COMPLETION_DIRECTIVE` は `CAUSE_CLASSIFICATION` を含まなかった（`COMPLETION_REPORT_LINE` + `COMPLETION_NO_EARLY_STOP_LINE` のみ）
- **After**: `COMPLETION_DIRECTIVE` の末尾に `${CAUSE_CLASSIFICATION}` を追加。コメントに "Includes CAUSE_CLASSIFICATION at the end per D3" と明記

**全 15 prompt での配置を確認（verified）**

Producer 系（COMPLETION_DIRECTIVE を fragment 付加する 9 prompt）:
- `design-system.ts`, `implementer-system.ts`, `spec-fixer-system.ts`, `test-materialize-system.ts`, `test-case-gen-system.ts`, `request-generate-system.ts`, `conformance-system.ts`, `code-fixer-system.ts`, `build-fixer-system.ts`, `adr-gen-system.ts`
- Evidence 節から `${CAUSE_CLASSIFICATION}` を削除済み（code-fixer diff で確認）。COMPLETION_DIRECTIVE が `## Completion\n...\n${CAUSE_CLASSIFICATION}` を含むため，Completion 節内に配置される ✓

Judge 系（CAUSE_CLASSIFICATION を直接埋め込む 5 prompt）:
- `code-review-system.ts:83` — `## Completion`（line 53）内に配置 ✓
- `regression-gate-system.ts:94` — `## Completion`（line 63）内に配置 ✓
- `request-review-system.ts:102` — `## Completion`（line 66）内に配置 ✓
- `spec-review-system.ts:89` — `## Completion`（line 59）内に配置 ✓
- `custom-reviewer-system.ts:109` — `## Completion`（line 79）内に配置 ✓

**結論**: Finding 1 は修正済み。全 15 prompt で CAUSE_CLASSIFICATION は `## Completion` 節内に配置されている。

---

### Finding 2: test-cases.md の automated 件数宣言（28）と実装件数の乖離

**code-fixer の変更を確認（verified）**

`git diff 20cbe0dba...70450beef -- src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` にて、TC-018〜TC-021 および TC-024〜TC-027 の 8 件のテストが追加されたことを確認:

| TC | 内容 | 実装確認 |
|----|------|---------|
| TC-018 | PIPELINE_MAP が全 16 step を列挙（lines 627-660） | ✓ |
| TC-019 | COVERAGE_GATE_INTEGRITY が 3 キーワードを含む（lines 667-679） | ✓ |
| TC-020 | rules.ts に手書き件数誤記なし（lines 686-694） | ✓ |
| TC-021 | 責任範囲表に欠落 5 step 追加（lines 701-715） | ✓ |
| TC-024 | initial message に判定基準なし（lines 722-744） | ✓ |
| TC-025 | request-generate prompt が生成規律を保持（lines 751-769） | ✓ |
| TC-026 | code-fixer prompt が Fix 対応方針を Method 節に保持（lines 777-793） | ✓ |
| TC-027 | pipeline-map.ts が leaf module（lines 800-817） | ✓ |

TC-001〜TC-017 + TC-022（spec-exempt-prompt.test.ts）+ TC-023（TC-013 で部分カバー）+ TC-024〜TC-028 の合計 28 件が実装済み。`automated: 28` 宣言と一致。

**結論**: Finding 2 は修正済み。test-cases.md の `automated: 28` と実装件数が一致している。

---

### Finding 3: design-system.ts の骨格が厳密な Q→C→M→E→Completion の 5 節構成でない

**現在のコードを確認（verified）**

`## セキュリティ` の配置を grep で確認（`grep -rn "## セキュリティ" src/prompts/`）:

```
src/prompts/design-system.ts:101:## セキュリティ
src/prompts/code-fixer-system.ts:57:## セキュリティ
src/prompts/implementer-system.ts:67:## セキュリティ
src/prompts/adr-gen-system.ts:114:## セキュリティ
src/prompts/test-case-gen-system.ts:84:## セキュリティ
src/prompts/build-fixer-system.ts:54:## セキュリティ
src/prompts/spec-fixer-system.ts:50:## セキュリティ
src/prompts/test-materialize-system.ts:74:## セキュリティ
```

上記 8 prompt すべてにおいて `## セキュリティ` は `## Evidence` の後、COMPLETION_DIRECTIVE（`## Completion`）の前に位置している。`buildSystemPrompt(base, [COMPLETION_DIRECTIVE])` で COMPLETION_DIRECTIVE が末尾付加されるため、実際の節順序は Q→C→M→E→（セキュリティ等）→Completion となっている。

`design-system.ts` はさらに `## Completion Checklist` も Evidence と Completion の間に存在する。

**design.md を確認（verified）**

`git diff 20cbe0dba...70450beef -- specrunner/changes/step-prompt-skeleton-restructure/design.md` が空（変更なし）。design.md には `## セキュリティ` を Contract 節または追加節として許容する旨の記述がない。D1 は「5 節に統一する」と宣言しており、例外の設計記録なし。

**code-fixer の対応（verified）**

`git diff 20cbe0dba...70450beef` で変更内容を確認。`## セキュリティ` の移動は行われていない。code-fixer は CAUSE_CLASSIFICATION を Evidence 節から Completion 節へ移動（Finding 1 の修正）と TC-018〜TC-028 のテスト追加（Finding 2 の修正）のみを実施。Finding 3 への対応なし。

**結論**: Finding 3 は未修正（退行）。

---

## 検証できなかった項目

- None

## Findings 詳細

### R-001: design-system.ts 他 7 prompt で `## セキュリティ` が Evidence と Completion の間に残存（退行）

Finding 3（LOW）として code-review が指摘した問題が未修正のまま。code-fixer は Finding 1・Finding 2 を修正したが、Finding 3 への対応（`## セキュリティ` を Contract 節へ移動、または design.md に追加節許容の設計判断を記録）を実施しなかった。

影響: エージェントへの実質的な機能影響はないが、spec/design/tasks が「5 節構成に統一」と規定しているにもかかわらず実装が 6〜7 節構造となっており、設計文書と実態の乖離が記録なく残る。TC-001 ordering test は `indexOf("## Completion")` が `## Completion Checklist` にヒットすることで通過し、実際の Completion 節の前に割り込む `## セキュリティ` を検出できない。

修正方法:
1. 8 prompt の `## セキュリティ` ブロックを `## Contract` 節の末尾（write-set 宣言の後）へ移動し、write-set の補足として扱う、または
2. design.md の D1 または D3 に「`## セキュリティ` を 6 節目として許容する」設計判断を明記する
