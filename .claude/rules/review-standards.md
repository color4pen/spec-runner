# Review Standards

全レビューエージェントと review-integrator が従う共通フォーマットと判定基準。

`architect`, `spec-reviewer`, `security-reviewer`, `code-reviewer`, `pattern-reviewer`,
`review-integrator` は本ファイルを唯一の真実として出力を生成すること。個別スキル（spec-review, code-review）はこの規約に加えて、ファイル出力テンプレート（`spec-review-result-template.md`, `review-feedback-template.md`）を併用する。

## Severity

| Severity | 定義 | 対応 |
|----------|------|------|
| **CRITICAL** | 本番障害、データ損失、セキュリティ侵害に直結。マージ不可 | 即修正。リリース阻止 |
| **HIGH** | 機能不全、明確なバグ、回避策なし。承認ブロック要因 | 次リリース前に必ず修正 |
| **MEDIUM** | 品質低下、保守性問題、将来のリスク | 推奨修正。次のリファクタで対応 |
| **LOW** | 情報提供、スタイル、微小な改善 | 任意。指摘のみ |

**承認阻止条件**: CRITICAL ≥ 1 または HIGH ≥ 1 の findings が存在する場合、verdict は自動的に `needs-fix`。

## Categories

レビュー対象の観点を以下のカテゴリに統一する。

| Category | 評価観点 | 主担当エージェント |
|----------|---------|-----------------|
| correctness | ロジック、仕様準拠、境界条件、edge case | code-reviewer, pattern-reviewer |
| security | 脆弱性、認証・認可、入力検証、OWASP Top 10 | security-reviewer |
| architecture | 設計パターン、責務分離、依存方向 | architect（設計段階）, code-reviewer（実装段階） |
| performance | クエリ、メモリ、レスポンス、N+1、バンドルサイズ | code-reviewer |
| maintainability | 可読性、テスタビリティ、命名、コメント | code-reviewer |
| testing | 網羅性、テスト品質、Scenario Coverage | code-reviewer（test-cases.md 参照） |
| completeness | 仕様の網羅性、要件の充足 | spec-reviewer |
| consistency | 既存 spec との整合性、後方互換性、用語統一 | spec-reviewer, architect |
| feasibility | 実現可能性、依存関係、工数見積 | architect, spec-reviewer |

**責務の競合ルール** — 指摘が重複した場合、カテゴリごとに定められた authority を review-integrator が適用する。authority を持たないカテゴリは存在しない（未定義カテゴリへの severity フォールバックは発生しない想定）。

| Category | Authority | 補助エージェント | 備考 |
|----------|-----------|----------------|------|
| security | **security-reviewer** | code-reviewer, architect | OWASP Top 10 の判定は常に security-reviewer を最終判断とする |
| architecture | **architect**（設計段階）/ **code-reviewer**（実装段階） | pattern-reviewer | 段階は `pipeline-context.md` の phase から判定 |
| correctness | **code-reviewer** | pattern-reviewer（review-lessons 由来の再発検出に限定） | pattern-reviewer は補助的位置づけ |
| performance | **code-reviewer** | — | 実装層での計測・観測結果が唯一の根拠 |
| maintainability | **code-reviewer** | architect（設計パターン起因の場合のみ） | 命名・可読性は code-reviewer が最終判断 |
| completeness | **spec-reviewer** | — | 要件と受け入れ基準の網羅性は spec-reviewer の専属領域 |
| consistency | **spec-reviewer** | architect（設計レベルの矛盾時のみ） | 既存 spec との整合性は spec-reviewer が最終判断 |
| feasibility | **architect** | spec-reviewer | 実現可能性・依存関係は architect が最終判断 |

`testing` は **authority competition が発生しないカテゴリ**（verification の Test phase と code-review の Scenario Coverage は独立軸であり重複しない）。詳細は下記「testing カテゴリの責務境界」を参照。

### testing カテゴリの責務境界

`testing` カテゴリは code-review 専用であり、**test-cases.md に宣言された must シナリオの実装率（Scenario Coverage）** を評価する。`verification` スキルの Test phase（テストスイート全体の PASS/FAIL 判定）とは別軸であり、競合しない。

| 判定軸 | スコープ | スキル |
|--------|---------|--------|
| Test Suite PASS/FAIL | 実装された全テストが通るか | verification（Step 5b） |
| Scenario Coverage | test-cases.md の must シナリオが実装されているか | code-review の testing カテゴリ |

**パターン別の扱い**:
- verification PASS + Scenario Coverage HIGH → testing スコア 8-10
- verification PASS + Scenario Coverage LOW → testing スコア 3-5（必要なテストが未実装）。code-fixer が「must シナリオのテスト追加」を指示される
- verification FAIL → Step 5b のリトライ対象（build-fixer）。code-review は実行されない

## Findings Format

全エージェントは findings を以下のテーブル形式で返す。

```markdown
## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | security | src/auth/session.ts:42 | セッショントークンが平文で保存されている | bcrypt または argon2 でハッシュ化する |
| 2 | MEDIUM | maintainability | src/api/users.ts:120 | 関数が 80 行を超え責務が不明瞭 | 認証・バリデーション・永続化で分割 |
```

**必須カラム**: `#`, `Severity`, `Category`, `File`, `Description`, `How to Fix`
**File カラム**: 可能な限り `{path}:{line}` の形式。行番号が特定できない場合は path のみでも可。
**How to Fix カラム**: 具体的な修正方針。「見直す」「改善する」等の抽象表現は不可。

## Scoring (code-review 専用)

`code-review` スキルはカテゴリ別スコアリング（1-10）と加重合計を使用する。
`spec-review` スキルは verdict のみの二値判定 + 停滞検出を使用する（詳細は各スキルのドキュメント）。

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

`Total = Σ(Score × Weight)`、pass threshold は `7.0`。

業務タイプによる weight オーバーライドは `skills/execute-request/references/type-config.md` を参照。

## Verdict

全レビューエージェント・オーケストレーションスキルは以下の 3 値を返す。

| Verdict | 条件 | 次のアクション |
|---------|------|--------------|
| `approved` | スコア ≥ pass_threshold（code-review）または全 Findings が解消済み（spec-review）、かつ CRITICAL: 0, HIGH: 0 | 次ステップへ |
| `needs-fix` | CRITICAL ≥ 1 または HIGH ≥ 1、または pass threshold 未達 | fixer エージェントで修正 → 再レビュー |
| `escalation` | リトライ上限超過、停滞検出（スコア 2 iter 連続改善なし）、予期せぬエラー | ユーザーに報告・判断を仰ぐ |

## Skip / Status 報告

エージェントが評価不能な状態の場合、以下の status を返すこと。

```yaml
status: skipped
reason: review-lessons.md が未生成
findings: []
```

`status: skipped` の場合、review-integrator はそのエージェントのスコアを合計から除外し、他エージェントのスコアのみで加重合計を再計算する（デフォルトスコアの代入は禁止 — 根拠のない値はオーケストレーターの判断を歪める）。

## Output Contract

### 単体レビュアー（agents/ 配下）

以下を Task ツール経由で呼び出し元に返す：

1. **findings**: 上記 Findings Format のテーブル
2. **scores**（code-reviewer, security-reviewer のみ）: 担当カテゴリの Score (1-10)
3. **status**（skipped の場合）: reason 付き
4. **summary**: 1-3 行の総合所見

### オーケストレーションスキル（spec-review, code-review）

以下をファイル出力し、呼び出し元には verdict のみ返す（コンテキスト軽量化）：

- `spec-review` → `<request-path>/spec-review-result-{NNN}.md`
- `code-review` → `<request-path>/review-feedback-{NNN}.md`

テンプレート:
- `skills/spec-review/references/spec-review-result-template.md`
- `skills/execute-request/references/review-feedback-template.md`

呼び出し元（execute-request）は verdict 行のみ読み、findings 全文は読まない。

## Iteration Comparison

iteration 2 以降では必ず以下を含める:

- **Improvements**: 前回から改善された指摘（fixer が修正できた項目）
- **Regressions**: 前回から悪化した指摘（修正が副作用を生んだ項目。CRITICAL 相当）
- **Unchanged Issues**: 前回の must-fix で未対応の指摘

### Convergence Trend

| Trend | 判定基準 | 推奨アクション |
|-------|---------|--------------|
| `improving` | Total スコアが前回より 0.3 以上向上 | 継続 |
| `plateaued` | 前回との差が ±0.3 以内 | escalation を検討（次回も改善しなければ確定） |
| `regressing` | Total スコアが前回より 0.3 以上低下 | 即 escalation |

**停滞検出**: `plateaued` が 2 iteration 連続した場合、verdict を `escalation` にする。

## 参照

- [`skills/code-review/SKILL.md`](../skills/code-review/SKILL.md) — code-review の詳細フロー
- [`skills/spec-review/SKILL.md`](../skills/spec-review/SKILL.md) — spec-review の詳細フロー
- [`skills/execute-request/references/type-config.md`](../skills/execute-request/references/type-config.md) — 業務タイプ別のエージェント構成・weight 調整
- [`skills/code-review/references/checklist.md`](../skills/code-review/references/checklist.md) — code-review のプロジェクト固有チェック項目
- [`skills/spec-review/references/review-criteria.md`](../skills/spec-review/references/review-criteria.md) — spec-review の仕様観点
