/**
 * Shared prompt fragments for system prompts.
 *
 * Single source of truth for cross-step prompt rules that remain as fragments.
 * Each fragment is a plain string; no metadata or registry abstraction.
 *
 * Dependency direction: prompt files → fragments (one-way).
 * Fragment files do not know which prompts use them.
 *
 * NOTE: SPEC_RUNNER_COMMON_CONTEXT, AUTHORITY_SPEC_GUARD, and SPEC_FORMAT
 * have been moved to specrunner/rules.md. Agents read rules.md via Read tool
 * (identity priming) rather than receiving it as a static system prompt fragment.
 */

/** Prevents agents from running git commands (commit / push). */
export const COMMIT_DISCIPLINE = `## git operations

あなたは file edit のみ行ってください。\`git add\` / \`git commit\` / \`git push\` の実行は禁止です。
commit / push は pipeline executor が一括で行います。違反して自主 commit してしまっても pipeline は halt せず agent commit を許容しますが、commit message format が pipeline 規定 (\`<step>: <slug>\`) から外れて履歴が読みづらくなるため、必ず file edit のみで完了してください。
`;

import { VERDICT_BLOCKING_RULES } from "./judge-rules.js";

/** Pipeline review rules (severity / categories / findings format / scoring / verdict). */
export const PIPELINE_RULES = `## Severity

| Severity | 定義 | 対応 |
|----------|------|------|
| **CRITICAL** | 本番障害、データ損失、セキュリティ侵害に直結。マージ不可 | 即修正。リリース阻止 |
| **HIGH** | 機能不全、明確なバグ、回避策なし。承認ブロック要因 | 次リリース前に必ず修正 |
| **MEDIUM** | 品質低下、保守性問題、将来のリスク | 推奨修正。次のリファクタで対応 |
| **LOW** | 情報提供、スタイル、微小な改善 | 任意。指摘のみ |

${VERDICT_BLOCKING_RULES}

## Categories

レビュー対象の観点を以下のカテゴリに統一する。

| Category | 評価観点 |
|----------|---------|
| correctness | ロジック、仕様準拠、境界条件、edge case |
| security | 脆弱性、認証・認可、入力検証、OWASP Top 10 |
| architecture | 設計パターン、責務分離、依存方向 |
| performance | クエリ、メモリ、レスポンス、N+1、バンドルサイズ |
| maintainability | 可読性、テスタビリティ、命名、コメント |
| testing | 網羅性、テスト品質、Scenario Coverage |
| completeness | 仕様の網羅性、要件の充足 |
| consistency | 既存 spec との整合性、後方互換性、用語統一 |
| feasibility | 実現可能性、依存関係、工数見積 |

## Findings Format

全エージェントは findings を以下のテーブル形式で返す。

\`\`\`markdown
## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | security | src/auth/session.ts:42 | セッショントークンが平文で保存されている | bcrypt または argon2 でハッシュ化する | yes |
| 2 | MEDIUM | maintainability | src/api/users.ts:120 | 関数が 80 行を超え責務が不明瞭 | 認証・バリデーション・永続化で分割 | no |
\`\`\`

**必須カラム**: \`#\`, \`Severity\`, \`Category\`, \`File\`, \`Description\`, \`How to Fix\`, \`Fix\`
**File カラム**: 可能な限り \`{path}:{line}\` の形式。行番号が特定できない場合は path のみでも可。
**How to Fix カラム**: 具体的な修正方針。「見直す」「改善する」等の抽象表現は不可。
**Fix カラム**: \`yes\` = この PR で fixer が修正すべき finding。\`no\` = pre-existing / 設計判断 / 別 scope の issue（fixer は無視）。

## Scoring (code-review 専用)

\`code-review\` スキルはカテゴリ別スコアリング（1-10）と加重合計を使用する。
\`spec-review\` スキルは verdict のみの二値判定 + 停滞検出を使用する。

### Score 基準

| Score | 意味 |
|-------|------|
| 1-3 | 重大な問題あり。本番に出せない |
| 4-5 | 動くが品質不足。レビューで必ず指摘される |
| 6 | 最低限の品質。改善余地が多い |
| 7 | 良好。プロダクション品質（**承認閾値**: ≥ 7.0） |
| 8 | 優良。丁寧な実装 |
| 9-10 | 卓越。模範的なコード |

### Weight (code-review default)

| Category | Weight |
|----------|--------|
| correctness | 0.30 |
| security | 0.25 |
| architecture | 0.15 |
| performance | 0.10 |
| maintainability | 0.10 |
| testing | 0.10 |

\`Total = Σ(Score × Weight)\`。スコアは reviewer の思考補助として任意で使用できるが、CLI 側の verdict 判定には使用されない。agent が出した verdict が最終判定。

## Verdict

全レビューエージェント・オーケストレーションスキルは以下の 3 値を返す。

| Verdict | 条件 | 次のアクション |
|---------|------|--------------|
| \`approved\` | 実装が要件を満たし、blocking な問題がない | 次ステップへ（Fix: yes の finding がある場合は fixer が自動修正後に次ステップ） |
| \`needs-fix\` | blocking な問題がある（CRITICAL / HIGH severity、または重大な設計乖離） | fixer エージェントで修正 → 再レビュー |
| \`escalation\` | リトライ上限超過、停滞検出、予期せぬエラー | ユーザーに報告・判断を仰ぐ |

## Iteration Comparison

iteration 2 以降では必ず以下を含める:

- **Improvements**: 前回から改善された指摘（fixer が修正できた項目）
- **Regressions**: 前回から悪化した指摘（修正が副作用を生んだ項目。CRITICAL 相当）
- **Unchanged Issues**: 前回の must-fix で未対応の指摘

### Convergence Trend

| Trend | 判定基準 | 推奨アクション |
|-------|---------|--------------|
| \`improving\` | Total スコアが前回より 0.3 以上向上 | 継続 |
| \`plateaued\` | 前回との差が ±0.3 以内 | escalation を検討（次回も改善しなければ確定） |
| \`regressing\` | Total スコアが前回より 0.3 以上低下 | 即 escalation |

**停滞検出**: \`plateaued\` が 2 iteration 連続した場合、verdict を \`escalation\` にする。`;
