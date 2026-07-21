# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### T-01 / R1: 横断規律 fragment の新設

**verified** `src/prompts/pipeline-map.ts` を読了（file:1-29）。

- `PIPELINE_MAP` 定数が 16 step すべてを列挙し、各 step に一行責務が付いている。
- プロジェクト内 import なし（leaf module 条件を満たす）。TC-027 の source-scan でも確認。

**verified** `src/prompts/fragments.ts` を読了（file:1-131）。

- `EVIDENCE_DISCIPLINE`: verified/derived/unverified の 3 区分、unverified 列挙義務（None 明記）、空集合は判定不能、数値パラメータの類推は unverified 申告の 4 規律を含む。
- `CAUSE_CLASSIFICATION`: request-gap / derivation-gap / implementation-defect / harness-defect / operational の 5 分類を列挙。
- `COVERAGE_GATE_INTEGRITY`: テストの削除・移設、dead code / dead export の追加、coverage 設定（include / exclude / threshold）の編集禁止の 3 キーワードを含む。
- 新 fragment は severity 署名文言を再掲していない（TC-010: judge-rules.ts 単一ソース不変を維持）。

### T-02 / R5: rules.ts の更新

**verified** `src/prompts/rules.ts` を読了（file:1-129）。

- `PIPELINE_MAP` を import して埋め込み済み（file:7, file:26）。
- 旧「9 step」誤記は存在しない。
- 「共通禁止:」見出しは削除済み。
- 責任範囲表に request-review / test-materialize / conformance / regression-gate / custom-reviewer の 5 行が追加されている。

### T-03〜T-06 / R2: 全 step system prompt の 5 部構成

**verified** `bun run test` が 568 test files、8323 passed（1 skipped）で green。

drift-guard テスト（`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`）の各 TC:

- **TC-001**: 15 prompt すべてが `## Question` / `## Contract` / `## Method` / `## Evidence` / `## Completion` の 5 見出しをこの順で含む — green。
- **TC-002**: 全 prompt 出力に `Pipeline Position` / `stage 1:` 等の独立 stage 表マーカーが存在しない — green。
- **TC-003**: `DESIGN_SYSTEM_PROMPT` / `IMPLEMENTER_SYSTEM_PROMPT` / `TEST_MATERIALIZE_SYSTEM_PROMPT` / `RULES_MD_CONTENT` が `PIPELINE_MAP` を含む — green。
- **TC-004**: 15 prompt すべてが `EVIDENCE_DISCIPLINE` を含む — green。
- **TC-005**: 15 prompt すべてが `CAUSE_CLASSIFICATION` を含む — green。
- **TC-006**: `BUILD_FIXER_SYSTEM_PROMPT` と `CODE_FIXER_SYSTEM_PROMPT` が `COVERAGE_GATE_INTEGRITY` を含む — green。
- **TC-007**: 全 prompt 出力に `architecture/` が存在しない — green。`architecture/` の 6 件の grep ヒットは全て test file のコメント/アサーション文字列であり、production 出力文字列ではない（verified: `grep -rn "architecture/" src/prompts/` 実行）。
- **TC-010**: 全 producer/fixer（8 step）の Contract 節に write-set 宣言が存在する — green。
- **TC-015〜TC-016**: judge 6 prompt が `SEVERITY_DEFINITION` を含み、verdict 行出力指示を持たない — green。
- **TC-017**: producer/fixer 8 prompt が `COMPLETION_DIRECTIVE` を含む — green。

### T-07 / R6: output template の純化

**verified** `src/templates/step-output-templates.ts` を読了（file:1-203）。

- 4 result template: 「CLI の判定: decision-needed → escalation」等の verdict 導出規則行は存在しない。`## 検証した項目` / `## 検証できなかった項目` / `## Findings 詳細` の evidence 必須セクションは保持されている。
- `TEST_CASES_TEMPLATE`: `Category determination:` / `Priority determination:` / `result determination:` 判定基準表は削除済み。TC 形式・Summary anchor・必須カラム名（Category/Priority/Source）は保持されている。
- `SPEC_EXEMPT_NOTE`: 「Downstream reviewers」行動指示ブロックは削除済み。`SPEC_EXEMPT_MARKER` は保持されている。

### T-08: initial message の追随

**verified** TC-024: `DESIGN_INITIAL_MESSAGE_TEMPLATE` と `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` に判定基準が含まれない — green。

### T-09: drift-guard テストの追加

**verified** `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` を読了（837 行）。TC-001〜TC-028 が実装され、全 green。配列反復（`ALL_15_AGENT_PROMPTS` / `PRODUCER_AND_FIXER_PROMPTS` / `JUDGE_PROMPTS`）による新 step 追加時の自動網羅構造を確認。

### T-10 / T-11: 既存テスト整合・最終検証

**verified** `bun run typecheck`: exit 0（エラーなし）。

**verified** `bun run test`: 8323 passed、0 failed。`verdict-channel-unification.test.ts` / `judge-verdict.test.ts` / `executor-*.test.ts` の protected テストが無改変で green。

### design prompt 固有の構造確認

**verified** `src/prompts/design-system.ts` を読了（file:1-199）。

- `DESIGN_BASE` は `## Evidence`（file:70）の後に `## Completion Checklist (MUST: 作業終了前に self-check)`（file:78）を持つ。
- `DESIGN_SYSTEM_PROMPT = buildSystemPrompt(DESIGN_BASE, [COMPLETION_DIRECTIVE])` により、最後に `COMPLETION_DIRECTIVE`（`## Completion` で始まる）が追加される。
- 最終出力には `## Completion Checklist` と `## Completion` の両方が存在する（合計 6 見出し構造）。
- TC-001 の `toContain("## Completion")` は `## Completion Checklist`（substring）で合格するため test は green となるが、見出し統一の不変条件は機械チェックされていない。

---

## Findings 詳細

### F-001 — design prompt の見出し非統一（spec 要件との乖離）

**severity**: low  
**resolution**: fixable  
**file**: `src/prompts/design-system.ts`  
**line**: 78  
**cause-classification**: implementation-defect

**spec 要件** (spec.md):
> 節見出しの表記は統一され、step ごとに揺れてはならない。

**観察**:
`DESIGN_BASE`（line 78）が `## Completion Checklist (MUST: 作業終了前に self-check)` をセクション見出しとして持つ。他の 14 prompt はいずれも `## Completion Checklist` 見出しを持たない。COMPLETION_DIRECTIVE が後段に追加されるため最終出力には 2 つの completion 系見出し（`## Completion Checklist` + `## Completion`）が存在し、5 節構造から逸脱する。

drift-guard テスト TC-001 は `toContain("## Completion")` による substring 検査であり `## Completion Checklist` がこれを満たすため green だが、「見出し統一」の不変条件はテストで担保されていない（テストカバレッジ gap）。

**修正方針**:
`## Completion Checklist (MUST: 作業終了前に self-check)` を `### Self-Check Checklist` 等のサブ見出しに降格し、COMPLETION_DIRECTIVE の `## Completion` の中に含める形に変更する。COMPLETION_DIRECTIVE の追加は維持する（TC-017 保持）。spec-exempt-prompt.test.ts の `contains chore Completion Checklist entry` assertion は見出しレベル変更に依存しないため影響なし。

---

## 検証できなかった項目

- **EVIDENCE_DISCIPLINE / CAUSE_CLASSIFICATION の実運用効果**: 規律文言が prompt に埋め込まれていることは verified だが、agent が実際に根拠区分・原因分類を申告するかは runtime 観察が必要。本 conformance step の範囲外。
- **design prompt の二重 completion 構造による agent 挙動への影響**: `## Completion Checklist` と `## Completion` が両方存在することで agent がどちらの節に従うか（またはどう解釈するか）は実行時観察が必要。

## Unverified 主張

None
