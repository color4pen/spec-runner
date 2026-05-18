/**
 * Shared prompt fragments for system prompts.
 *
 * Single source of truth for all cross-step prompt rules.
 * Each fragment is a plain string; no metadata or registry abstraction.
 *
 * Dependency direction: prompt files → fragments (one-way).
 * Fragment files do not know which prompts use them.
 */

/** Prevents agents from editing authority specs directly. */
export const AUTHORITY_SPEC_GUARD = `## authority spec の編集禁止

\`specrunner/specs/\` 配下のファイルを直接編集してはならない（MUST NOT）。
spec の変更は delta spec（\`specrunner/changes/<slug>/specs/<capability>/spec.md\`）を作成・編集する。
authority spec への直接編集は executor が commit 前に検出し、ステップを halt する。
`;

/** Prevents agents from running git commands (commit / push). */
export const COMMIT_DISCIPLINE = `## git operations

あなたは file edit のみ行ってください。\`git add\` / \`git commit\` / \`git push\` の実行は禁止です。
commit / push は pipeline executor が一括で行います。違反して自主 commit してしまっても pipeline は halt せず agent commit を許容しますが、commit message format が pipeline 規定 (\`<step>: <slug>\`) から外れて履歴が読みづらくなるため、必ず file edit のみで完了してください。
`;

/** Delta spec path conventions and format rules. */
export const DELTA_SPEC_FORMAT = `### 使用するセクションヘッダー

- \`## ADDED Requirements\` — 新規 Requirement を追加する場合
- \`## MODIFIED Requirements\` — 既存 Requirement を変更する場合
- \`## REMOVED Requirements\` — 既存 Requirement を削除する場合
- \`## RENAMED Requirements\` — Requirement header を変更する場合（MODIFIED と併記必須）

### ルール

1. **各 Requirement は \`### Requirement:\` で始まる header を持つこと**
2. **各 Requirement は少なくとも 1 つの \`#### Scenario:\` を含むこと**（scenario なしは validation error）
   - **MODIFIED Requirements にも最低 1 つの Scenario が必須である。** Scenario は「差分の説明文」や「変更概要」ではなく、変更後のシステムの振る舞いを Given/When/Then 形式で具体的に記述すること。
3. **\`## MODIFIED Requirements\` 配下の \`### Requirement:\` header は、変更前の元の header と完全一致すること**。header を変えたい場合は \`## RENAMED Requirements\` を併記し FROM / TO を明示する。
4. **\`## Changed Requirement:\` や \`## Updated:\` などの独自フォーマットは禁止**。認識されるのは \`## ADDED/MODIFIED/REMOVED/RENAMED Requirements\` のみ。
5. **Requirement 本文（header 直後〜最初の Scenario の間）に英語の \`SHALL\` または \`MUST\` を少なくとも 1 つ含めること**（normative keyword なしは validation error）
6. **\`### Requirement:\` header と最初の \`#### Scenario:\` の間にコードブロック（\`\`\` ）を挟まないこと**（コードブロックが入るとシナリオ紐付けが失敗する）

### ファイル配置

- delta spec は \`specs/<capability-name>/spec.md\` に配置すること（唯一の正規 path）
- \`<capability-name>\` は design.md で宣言した名前を使用すること
- 以下の正規外 path への出力は禁止:
  - \`<change>/delta-spec.md\`（単一フラット形式）
  - \`<change>/delta-spec/<capability>.md\`（ディレクトリ形式だが非正規）
  - \`<change>/specs/<name>.delta.md\`（拡張子付きフラット形式）`;

/** Pipeline review rules (severity / categories / findings format / scoring / verdict). */
export const PIPELINE_RULES = `## Severity

| Severity | 定義 | 対応 |
|----------|------|------|
| **CRITICAL** | 本番障害、データ損失、セキュリティ侵害に直結。マージ不可 | 即修正。リリース阻止 |
| **HIGH** | 機能不全、明確なバグ、回避策なし。承認ブロック要因 | 次リリース前に必ず修正 |
| **MEDIUM** | 品質低下、保守性問題、将来のリスク | 推奨修正。次のリファクタで対応 |
| **LOW** | 情報提供、スタイル、微小な改善 | 任意。指摘のみ |

**承認阻止条件**: CRITICAL ≥ 1 または HIGH ≥ 1 の findings が存在する場合、verdict は自動的に \`needs-fix\`。

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

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | security | src/auth/session.ts:42 | セッショントークンが平文で保存されている | bcrypt または argon2 でハッシュ化する |
| 2 | MEDIUM | maintainability | src/api/users.ts:120 | 関数が 80 行を超え責務が不明瞭 | 認証・バリデーション・永続化で分割 |
\`\`\`

**必須カラム**: \`#\`, \`Severity\`, \`Category\`, \`File\`, \`Description\`, \`How to Fix\`
**File カラム**: 可能な限り \`{path}:{line}\` の形式。行番号が特定できない場合は path のみでも可。
**How to Fix カラム**: 具体的な修正方針。「見直す」「改善する」等の抽象表現は不可。

## Scoring (code-review 専用)

\`code-review\` スキルはカテゴリ別スコアリング（1-10）と加重合計を使用する。
\`spec-review\` スキルは verdict のみの二値判定 + 停滞検出を使用する。

### Score 基準

| Score | 意味 |
|-------|------|
| 1-3 | 重大な問題あり。本番に出せない |
| 4-5 | 動くが品質不足。レビューで必ず指摘される |
| 6 | 最低限の品質。改善余地が多い |
| 7 | 良好。プロダクション品質（**承認閾値**） |
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

\`Total = Σ(Score × Weight)\`、pass threshold は \`7.0\`。

## Verdict

全レビューエージェント・オーケストレーションスキルは以下の 3 値を返す。

| Verdict | 条件 | 次のアクション |
|---------|------|--------------|
| \`approved\` | スコア ≥ pass_threshold（code-review）または全 Findings が解消済み（spec-review）、かつ CRITICAL: 0, HIGH: 0 | 次ステップへ |
| \`needs-fix\` | CRITICAL ≥ 1 または HIGH ≥ 1、または pass threshold 未達 | fixer エージェントで修正 → 再レビュー |
| \`escalation\` | リトライ上限超過、停滞検出（スコア 2 iter 連続改善なし）、予期せぬエラー | ユーザーに報告・判断を仰ぐ |

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
