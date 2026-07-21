# Regression Gate Result — Iteration 002

## Findings Ledger Verification

### Finding 1: CAUSE_CLASSIFICATION が Completion 節ではなく Evidence 節に配置されている
- **Original severity**: MEDIUM
- **Status**: FIXED ✓

**Evidence**:
- `src/prompts/fragments.ts:110-118` を確認した。`COMPLETION_DIRECTIVE` は `## Completion` 見出しで始まり、その末尾に `${CAUSE_CLASSIFICATION}` を埋め込んでいる（verified: fragments.ts:118）。
- `src/prompts/design-system.ts:103` を確認した。`buildSystemPrompt(DESIGN_BASE, [COMPLETION_DIRECTIVE])` により `COMPLETION_DIRECTIVE` が base の後に結合されるため、`CAUSE_CLASSIFICATION` は `## Completion` 節に配置されている（verified: design-system.ts:103, builder.ts:19-21）。
- `DESIGN_BASE` 内の `## Evidence` 節（design-system.ts:70-72）には `EVIDENCE_DISCIPLINE` のみが埋め込まれており、`CAUSE_CLASSIFICATION` は存在しない（verified: grep で Evidence 節の範囲を確認）。
- 全 15 prompt で同様の構造：各 `*-system.ts` が `buildSystemPrompt(BASE, [COMPLETION_DIRECTIVE])` を使用し、`CAUSE_CLASSIFICATION` は `## Completion` 節で供給される。

### Finding 2: test-cases.md の automated 件数宣言（28）と実装件数（~20）が乖離している
- **Original severity**: MEDIUM
- **Status**: FIXED ✓

**Evidence**:
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` を全行確認した。
- TC-018 (PIPELINE_MAP 全 16 step): lines 627-659 に `describe("TC-018: ...")` として明示実装（16 step 識別子の個別 it + row count assertion）（verified）。
- TC-019 (COVERAGE_GATE_INTEGRITY 3 キーワード): lines 667-679 に明示実装（3 キーワードの個別 it）（verified）。
- TC-020 (rules.ts 手書き件数誤記なし): lines 686-694 に明示実装（"9 step", "11 step" 等の不在検査）（verified）。
- TC-021 (責任範囲表 5 step 追加): lines 701-715 に明示実装（5 step 識別子の個別 it）（verified）。
- TC-024 (initial message に判定基準なし): lines 722-744 に明示実装（DESIGN および SPEC_REVIEW の initial message template を検査）（verified）。
- TC-025 (request-generate 生成規律保持): lines 751-770 に明示実装（Method 節内の必須セクション名・type 推論・adr フィールドの 3 assertion）（verified）。
- TC-026 (code-fixer Fix 対応方針 Method 節): lines 777-793 に明示実装（Method 節内の Fix カラム別・Fix: yes・Fix: no の 3 assertion）（verified）。
- TC-027 (pipeline-map.ts leaf module): lines 800-817 に明示実装（相対 import 0 件 + leaf module integrity の 2 assertion）（verified）。
- TC-028 (drift-guard 配列反復構造): lines 825-837 に明示実装（配列長の 3 assertion）（verified）。
- TC-022 は spec-exempt-prompt.test.ts でカバー済み（既存）、TC-023 は TC-013 assertion（SPEC_EXEMPT_NOTE の Downstream reviewers 不在など）でカバー済み（verified）。
- 全 28 TC に明示的テスト実装が存在し、`automated: 28` 宣言と一致する。

### Finding 3: design-system.ts の骨格が厳密な Q→C→M→E→Completion の 5 節構成でない
- **Original severity**: LOW
- **Status**: FIXED ✓

**Evidence**:
- `## セキュリティ` 見出しの有無を全 prompt ファイルで確認した（`grep -rn "## セキュリティ" src/prompts/` 結果: 0 件）（verified）。
- 以前 Evidence と Completion の間に挿入されていた `## セキュリティ` 節は、全 6 ファイル（implementer / test-materialize / build-fixer / code-fixer / spec-fixer / adr-gen）で Contract 節内のインラインテキスト（`**セキュリティ制約**:`）に変換されている（verified: 各 *-system.ts 行を確認）。
- design-system.ts の `**セキュリティ制約**:` も同様に Contract 節内（line 51）に配置されており、`## セキュリティ` 見出しは存在しない（verified: design-system.ts:51）。
- `## Completion Checklist` は design-system.ts 単一ファイルの step 固有事前確認節として残存するが、これは design agent の完了前 self-check であり finding の主眼（`## セキュリティ` による Evidence-Completion 間への割り込み）とは別の性質。
- 結論: finding が指摘した `## セキュリティ` による 5 節構成の乖離は解消されており、設計書（design.md）に当該変換が反映されている。

## Unverified Claims
None.
