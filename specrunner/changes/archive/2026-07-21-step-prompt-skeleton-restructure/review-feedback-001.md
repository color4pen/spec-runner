# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### スコープと diff 確認

- `git diff main...HEAD --stat` 実行: 35 ファイル、3266 行挿入・965 行削除（verified）
- 変更対象: `src/prompts/` 配下の全 *-system.ts・pipeline-map.ts・fragments.ts・rules.ts、`src/templates/step-output-templates.ts`、drift-guard テスト

### 受け入れ基準の検証（全 10 項目）

| 基準 | 検証手段 | 結果 |
|------|---------|------|
| 全 step prompt が 5 節見出しを含む | TC-001 drift-guard + 各 *-system.ts 読解 | ✓ |
| stage 構成が PIPELINE_MAP 単一ソース由来・独立 stage 表 0 件 | TC-002/TC-003/TC-009 + grep | ✓ |
| EVIDENCE_DISCIPLINE が全 agent 出力に含まれる | TC-004 drift-guard | ✓ |
| coverage gate 回避禁止が単一ソース由来 | TC-006 + coverage-gate-prohibition.test.ts | ✓ |
| `architecture/` 参照が 0 件 | TC-007 + grep（test コメントのみ、prompt 出力なし）| ✓ |
| rules.ts step 列挙が PIPELINE_MAP と一致・空節なし | TC-008/TC-009 + rules.ts 読解 | ✓ |
| write-set 宣言が全 producer / fixer の Contract に存在 | TC-010 + 各 prompt 読解（8 prompt 確認）| ✓ |
| output template に verdict/Scores/行動指示なし | TC-011/TC-012/TC-013 + step-output-templates.ts 読解 | ✓ |
| 既存テストが無改変で green | `bun run test` 実行（8274 tests passed, 1 skipped, 0 failures）| ✓ |
| typecheck && test が green | `bun run typecheck` + `bun run test`（両方 clean）| ✓ |

### 新設 fragment の内容確認（verified）

- `pipeline-map.ts`: 16 step すべて列挙、各行に一行責務あり、プロジェクト内 import なし（leaf）
- `EVIDENCE_DISCIPLINE`: "unverified 列挙義務（None 明記）"・"空集合は判定不能" の 2 文言を含む
- `CAUSE_CLASSIFICATION`: request-gap / derivation-gap / implementation-defect / harness-defect / operational の 5 分類を列挙
- `COVERAGE_GATE_INTEGRITY`: "テストの削除"・"dead code"・"coverage 設定" の 3 キーワードを含む

### rules.ts 更新確認（verified）

- `${PIPELINE_MAP}` をインライン埋め込み、手書き件数記述（"9 step" 等）なし
- 「共通禁止:」空節を削除済み
- 責任範囲表に request-review / test-materialize / conformance / regression-gate / custom-reviewer を追加（全 16 step 収録）

### output template 純化確認（verified）

- 4 result template: "CLI の判定:"・"→ needs-fix"・"→ escalation" いずれも不在
- `## 検証した項目` / `## 検証できなかった項目` は全 template で保持
- `TEST_CASES_TEMPLATE`: "Category determination:"・"Priority determination:"・"result determination:" 不在
- `SPEC_EXEMPT_NOTE`: "Downstream reviewers"・"このファイルを vacuously satisfied"・"finding（non-conformity）" 不在、SPEC-EXEMPT マーカー保持

### CAUSE_CLASSIFICATION の配置（F-001 に関連）

- 全 15 prompt で CAUSE_CLASSIFICATION は `## Evidence` 節直下に配置（EVIDENCE_DISCIPLINE の直後）
- spec.md Requirement 文: 「Completion 節に ... MUST 含む」（derived from spec.md）
- design.md D3: 「CAUSE_CLASSIFICATION は `## Completion` 内」
- tasks.md T-03/T-05: 「Completion 節で ... CAUSE_CLASSIFICATION を含める/追加する」
- TC-005 drift-guard は `toContain(CAUSE_CLASSIFICATION)` による presence check のみ（section 位置を検査しない）

### TC カバレッジ数え直し（F-002 に関連）

- drift-guard で実装済み: TC-001〜TC-017（17 件）+ TC-028（1 件）= 18 件
- spec-exempt-prompt.test.ts でカバー: TC-022
- TC-013 で部分カバー: TC-023
- explicit 実装なし（"should"/"could"）: TC-018・TC-019・TC-020・TC-021・TC-024・TC-025・TC-026・TC-027（8 件）
- test-cases.md 宣言値 `automated: 28` と乖離

### design-system.ts 骨格構造（F-003 に関連）

- base の末尾に `## Completion Checklist (MUST: 作業終了前に self-check)` + `## セキュリティ` が存在
- `buildSystemPrompt(DESIGN_BASE, [COMPLETION_DIRECTIVE])` で `## Completion` が末尾に付加
- TC-001 の `prompt.indexOf("## Completion")` は "## Completion Checklist" を先にヒット → ordering test 通過
- 実際の `## Completion` 節（COMPLETION_DIRECTIVE）は `## セキュリティ` の後に来る
- implementer / spec-fixer / adr-gen 等でも同様に `## セキュリティ` が Evidence と Completion の間に存在

## 検証できなかった項目

- 実際の pipeline 実行でエージェントが CAUSE_CLASSIFICATION をどちらの節で参照するかの実行時挙動（静的テスト外）
- TC-024（initial message に severity/verdict/Category/Priority の判定基準が含まれないこと）の包括的な保証: verdict-channel-unification TC-018 は verdict OUTPUT 指示のみを検査しており、判定基準テーブルの混入は未チェック

## Findings 詳細

### F-001: CAUSE_CLASSIFICATION が Completion 節ではなく Evidence 節に配置されている

spec.md Requirement・design.md D3・tasks.md T-03/T-05 の 3 者が「Completion 節に含む」と規定しているが、全 15 prompt の実装は Evidence 節（EVIDENCE_DISCIPLINE 直後）に配置している。TC-005 は presence check のみで section 位置を検査しないため、この乖離を検出できない。

エージェントは指示を受け取るため機能影響は低いが、「原因分類を付すのは完了報告時の規律」という意味論（Completion 文脈）と Evidence 節配置（根拠規律）の間に概念的なズレがある。spec・design・tasks の 3 アーティファクトが同一の section 指定を行っており、明示的に覆す設計判断の記録がない。

### F-002: test-cases.md の automated 件数が宣言値（28）と実装数（~20）で乖離している

test-cases.md の Result YAML は `automated: 28` と宣言しているが、drift-guard テストの実装は TC-001〜TC-017 + TC-028 の 18 件（TC-022 が spec-exempt-prompt.test.ts でカバー、TC-023 が TC-013 で部分カバー）。

以下 8 件が "should"/"could" 分類ながら explicit なテスト実装を持たない:
- TC-018: PIPELINE_MAP が全 16 step を列挙し各行に一行責務を持つ
- TC-019: COVERAGE_GATE_INTEGRITY が "テストの削除"・"dead code"・"coverage 設定" の 3 キーワードを含む
- TC-020: rules.ts に手書き件数誤記（"9 step" 等）が存在しない
- TC-021: rules.ts 責任範囲表に欠落していた 5 step が追加されている
- TC-024: initial message に severity/verdict/Category/Priority の判定基準が含まれない
- TC-025: request-generate prompt が必須セクション列挙・type/adr 推論規律を保持する
- TC-026: code-fixer prompt が Fix 対応方針を Method 節に保持する
- TC-027: pipeline-map.ts がプロジェクト内 import を持たない leaf module である

実装内容自体は読解と grep で正確性を確認済み（verified）。テスト宣言と実態の乖離が regression 保護の欠如として残る。

### F-003: design-system.ts の 5 節構造が "Q→C→M→E→Completion のみ" でない

DESIGN_BASE に `## Completion Checklist (MUST: ...)` と `## セキュリティ` が含まれており、実際の `## Completion` 節（COMPLETION_DIRECTIVE）はその後ろに付加される。TC-001 の ordering test は "## Completion" の substring が "## Completion Checklist" にヒットするため通過するが、厳格に読むと 5-part 骨格（Q/C/M/E/Completion）の Completion は末尾の COMPLETION_DIRECTIVE が担い、その前に `## セキュリティ` が割り込む構造になっている。

implementer / test-materialize / build-fixer / code-fixer / spec-fixer / adr-gen も同様に `## セキュリティ` が Evidence と Completion の間に存在する。テストは通過するが骨格の "5 節のみ" という宣言と実態に乖離がある。
