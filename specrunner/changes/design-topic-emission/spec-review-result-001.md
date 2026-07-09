# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Security | spec.md / tasks.md (T-02 renderTopicFile) | LLM 生成の `title`/`rationale` が bare な `---`（行全体がトリプルダッシュ）を含む場合、一部の frontmatter パーサーがそれを frontmatter 区切りとして誤解釈し、id/source が失われる恐れがある。spec は body のエスケープ要件を規定していない。 | `renderTopicFile` 実装時に body 内の行頭 `---` を `\-\-\-` 等でエスケープするか、パーサーが MDX/remark の場合は影響範囲を確認して対策を記載する。v1 リスクが許容できるなら MEDIUM のまま注記を spec に追記するだけでよい。 |
| 2 | LOW | Spec/completeness | spec.md (Requirement: Emission SHALL run on both archive paths) | stdout summary 行の出力フォーマット（例: `Emitted 3 topics to design/topics/`）が仕様に規定されていない。実装者が自由に決めてよいが、後でテストが形式に依存する場合に揺れが生じる。 | 実装者が合理的なフォーマットを採用してよい。必要であれば tasks.md の T-03 に例示を 1 行追記するが、ブロッカーではない。 |
| 3 | LOW | Implementation clarity | tasks.md (T-02) | `isFindingDecided` は真偽値を返すが、`renderTopicFile` が実際に必要なのは `DecisionRecord.selectedOption`（label/consequence）。T-02 は「`isFindingDecided` を import して用い、一致する `DecisionRecord` の `selectedOption` を取得する」と記載しているが、bool チェックの後に `state.decisions.find(d => d.step === step && d.findingKey === key)` で record を取得するパターンを明示していない。 | 実装パターンは `computeFindingKey` → `decisions.find(...)` で自明であり、`decision-ledger.ts` の既存コードを参照すれば補える。ブロッカーではない。 |

## Review Notes

### 設計整合性

- **orchestrator の state hoist**: Phase 0 try ブロック内の `state` から `state.steps`/`state.decisions` を Phase 1 で使えるよう変数を hoist する変更（T-04）は、既存の `jobId`/`branch`/`worktreePath` の hoist パターンと完全に一致しており、最小変更として妥当。
- **dedupeFindings の非流用**: 既存の `dedupeFindings`（file|line|title キー、provenance なし）を流用せず専用収集関数を新設する判断（D3）は正しい。slug と source に step/iteration/index が必要であり、既存関数の意味論（regression-gate 用の fixable 専用）とも分離できる。
- **D9 の全リテラル列挙**: `ResolvedDesignLayer` を構築する 3 箇所（`resolveDesignLayerConfig`・`noopDesignLayer`・`disabledDesignLayer`）が明示されており、typecheck がセーフティネットとして機能する。T-01 の grep 確認と合わせて漏れの恐れは低い。
- **D7 の配置順序（mark-hook より前）**: `emitDesignTopics` を mark-hook ブロックより前に置く決定は、mark-hook エラー時でも排出が完了している状態を構造的に保証し、要件「独立したステージング」の最小実現として正しい。

### セキュリティ

- **パストラバーサル**: slug は `<job-slug>-<step>-<iteration>-<index>` を `[^a-z0-9]→ハイフン` 正規化してから構築されるため、スラッシュ・ドット等の危険文字が除去されており、`design/topics/<slug>.md` 以外へのファイル書き込みは生じない。
- **git add スコープ**: `git add -- design/topics` は design/topics 配下のみに限定されており、意図しないファイルのステージングは起きない。
- **frontmatter 注入**: frontmatter の値（`id`/`source`）はいずれも正規化済みの制御値（slug・step 名・整数）から構成されており、LLM 出力が frontmatter に流れ込む経路はない。body は自由テキストだが Markdown ファイルとして読まれるのみで実行されない（F1 の bare `---` 問題を除く）。
- **OWASP Top 10**: CLI ツールであり Web 認証・セッション管理・SQL 等は無関係。A03（インジェクション）については F1 の YAML frontmatter 誤解釈リスクのみが該当し MEDIUM とした。

### 受け入れ基準との対応

仕様に列挙された受け入れ基準（統合テスト・ユニットテスト・冪等・縮退・typecheck && test）はすべて T-05〜T-07 のタスクとシナリオに 1:1 で対応しており、漏れは確認されない。
