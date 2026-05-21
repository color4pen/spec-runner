# Design: embed-pipeline-rules

## Problem

`.claude/rules/review-standards.md` にパイプラインの判定基準が定義されており、Claude Code SDK の `query()` が cwd の `.claude/rules/` を自動読み込みすることに依存している。spec-runner を他プロジェクトにインストールした場合、このファイルが存在しないため review agent が正しく動作しない。

## Solution

review-standards.md の内容を `src/prompts/pipeline-rules.ts` に TypeScript 定数として埋め込み、spec-review と code-review の system prompt にテンプレートリテラル経由で注入する。

## Architecture

### 新規ファイル

```
src/prompts/pipeline-rules.ts
  export const PIPELINE_RULES: string
```

`PIPELINE_RULES` はレビューエージェントが従う共通ルールの全文を含む。system prompt のテンプレートリテラル内で `${PIPELINE_RULES}` として展開する。

### 注入先

| ファイル | 変更内容 |
|---------|---------|
| `src/prompts/code-review-system.ts` | `PIPELINE_RULES` import + 展開。inline の severity/verdict/categories 定義と `.claude/rules` 参照を削除 |
| `src/prompts/spec-review-system.ts` | `PIPELINE_RULES` import + 展開。`review-standards.md severity definitions` 参照を削除 |
| `src/core/step/code-review.ts` | initial message から `Read .claude/rules/review-standards.md` 指示を削除 |

### 注入しないファイル

| ファイル | 理由 |
|---------|------|
| `src/prompts/spec-fixer-system.ts` | `.claude/rules` 参照なし。findings の "How to Fix" に従うのみ |
| `src/prompts/code-fixer-system.ts` | 同上 |
| `src/prompts/build-fixer-system.ts` | 同上 |

### 削除

- `.claude/rules/review-standards.md` — git rm

## Content Curation

review-standards.md は openspec-workflow のマルチエージェントアーキテクチャ向けに書かれている。spec-runner のパイプラインで実際に使用するセクションのみを `PIPELINE_RULES` に含める。

### 含めるセクション

| Section | 用途 |
|---------|------|
| Severity | 4 段階の定義 + 承認阻止条件 |
| Categories | 9 カテゴリの評価観点（code-review: 6, spec-review: +3） |
| Findings Format | テーブル形式の仕様 + 必須カラム |
| Scoring | code-review 専用。Score 基準 + Weight + pass threshold |
| Verdict | 3 値の条件と次アクション |
| Iteration Comparison | iteration 2+ の比較項目 + Convergence Trend |

### 除外するセクション

| Section | 除外理由 |
|---------|---------|
| 責務の競合ルール / Authority matrix | マルチエージェント固有。spec-runner は単一 reviewer |
| testing カテゴリの責務境界 | verification と code-review の境界は step 設計で担保 |
| Output Contract | spec-runner の prompt テンプレートで個別定義済み |
| Skip / Status 報告 | マルチエージェントのオーケストレーション用 |
| 参照リンク | openspec-workflow の skills/ パスへのリンク |

## Design Decisions

**Q: PIPELINE_RULES を共通定数にするか、reviewer 別に分割するか？**
A: 共通定数。code-review は scoring セクションを使い、spec-review は使わないが、system prompt 全体の中で無害な追加コンテキストに留まる。分割するとルール変更時に 2 箇所メンテが必要になるデメリットの方が大きい。

**Q: template literal 内で展開するか、関数で結合するか？**
A: template literal 内で `${PIPELINE_RULES}` として展開。既存パターン（`${_changesDir}`）と一貫性がある。

**Q: delta spec は必要か？**
A: 不要。外部から観測可能な振る舞い（review output format, verdict）に変更なし。ルールの配置場所が `.claude/rules/` から system prompt 内に移動するだけ。
