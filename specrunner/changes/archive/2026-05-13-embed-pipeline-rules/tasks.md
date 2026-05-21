# Tasks: embed-pipeline-rules

## Task 1: Create `src/prompts/pipeline-rules.ts` [x]

**Goal**: review-standards.md の内容を TypeScript 定数として埋め込む

**Steps**:
1. `src/prompts/pipeline-rules.ts` を新規作成
2. `export const PIPELINE_RULES` を template literal string として定義
3. 以下のセクションを `.claude/rules/review-standards.md` からキュレーションして含める:
   - **Severity**: 4 段階テーブル（CRITICAL/HIGH/MEDIUM/LOW）+ 承認阻止条件
   - **Categories**: 9 カテゴリテーブル（correctness, security, architecture, performance, maintainability, testing, completeness, consistency, feasibility）。「主担当エージェント」列は除外（マルチエージェント固有）
   - **Findings Format**: テーブル仕様 + 必須カラム + File/How to Fix カラムの注記
   - **Scoring (code-review only)**: Score 基準テーブル（1-10）+ Weight テーブル（6 categories）+ pass threshold 7.0
   - **Verdict**: 3 値テーブル（approved/needs-fix/escalation）+ 条件
   - **Iteration Comparison**: Improvements/Regressions/Unchanged + Convergence Trend テーブル + 停滞検出ルール
4. 除外: 責務の競合ルール、Authority matrix、testing 責務境界、Output Contract、Skip/Status、参照リンク

**Verification**: `bun run typecheck` pass

---

## Task 2: Update `src/prompts/code-review-system.ts` [x]

**Goal**: `.claude/rules` 依存を除去し、`PIPELINE_RULES` を system prompt に埋め込む

**Steps**:
1. `import { PIPELINE_RULES } from "./pipeline-rules.js"` を追加
2. `## Review Standards` セクション（lines 20-35）を以下に置換:
   - `## Pipeline Rules\n\n${PIPELINE_RULES}` を挿入
   - 既存の inline severity/verdict/categories 定義を削除（PIPELINE_RULES が提供する）
3. `## Review Process` 内の step 4 を変更:
   - Before: `Check \`.claude/rules/review-standards.md\` for the full findings format`
   - After: `Refer to the Pipeline Rules section above for the findings format and severity definitions`
4. JSDoc コメント（line 11）の `review-standards.md` 参照を `pipeline-rules` に更新

**Verification**: `bun run typecheck` pass

---

## Task 3: Update `src/prompts/spec-review-system.ts` [x]

**Goal**: `review-standards.md` 参照を除去し、`PIPELINE_RULES` を system prompt に埋め込む

**Steps**:
1. `import { PIPELINE_RULES } from "./pipeline-rules.js"` を追加
2. system prompt 内の適切な位置（`## Your Output` の前）に `## Pipeline Rules\n\n${PIPELINE_RULES}` セクションを追加
3. line 46 `Severity levels: CRITICAL, HIGH, MEDIUM, LOW` を削除（PIPELINE_RULES が定義を提供する）
4. line 74 `Findings must follow review-standards.md severity definitions.` を `Findings must follow the Pipeline Rules above.` に変更

**Verification**: `bun run typecheck` pass

---

## Task 4: Update `src/core/step/code-review.ts` [x]

**Goal**: initial message から `.claude/rules` 参照を除去

**Steps**:
1. line 129 を変更:
   - Before: `4. Read .claude/rules/review-standards.md for the findings format and severity definitions`
   - After: `4. Refer to the Pipeline Rules in your system prompt for the findings format and severity definitions`

**Verification**: `bun run typecheck` pass

---

## Task 5: Delete `.claude/rules/review-standards.md` [x]

**Goal**: .claude/ 依存を完全に除去

**Steps**:
1. `git rm .claude/rules/review-standards.md`
2. `.claude/rules/` ディレクトリが空になった場合、ディレクトリも削除確認（git は空ディレクトリを追跡しないので自動）

**Verification**: `grep -r "review-standards" src/` がヒット 0 件

---

## Task 6: Final Verification [x]

**Goal**: 全体の整合性を確認

**Steps**:
1. `bun run typecheck` — 型エラーなし
2. `bun run test` — 全テスト pass
3. `grep -r "\.claude/rules" src/` — ヒット 0 件
4. `grep -r "review-standards" src/` — ヒット 0 件
