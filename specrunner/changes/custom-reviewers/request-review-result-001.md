# Request Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approve | needs-discussion | reject
  - approve:          No blocking findings (no HIGH, no decision-needed). Request is ready for pipeline execution.
  - needs-discussion: One or more blocking findings (HIGH or decision-needed) resolvable through discussion.
  - reject:           Multiple blocking findings AND requirement contradictions or structural breakdown.
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | Location | Description | Recommendation
- Valid Severity values (uppercase): HIGH | MEDIUM | LOW
  - HIGH:   Request-level defect — goal unclear, acceptance criteria absent/untestable, or critical external constraint unspecified
  - MEDIUM: Scope ambiguity, recommended additions
  - LOW:    Clarity improvements, expression refinements
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approve

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | MEDIUM | Clarity | 要件 3 | カスタムレビューワーの実行位置として "code-review の後" とだけ記述されており、conformance の前に来ることが明示されていない。design step は常識的に推論できるが、遷移テーブルの最終形（CR → custom-rev-N → conformance）が読み取れると実装誤りが起きにくい | "code-review の後かつ conformance の前に宣言順で直列実行" と明記することを推奨 |
| 2 | MEDIUM | Clarity | 要件 1 | frontmatter の `name` フィールドとファイルのベース名（`<name>.md`）の関係が不明。衝突時の扱い（どちらが識別子か）が未定義 | ファイルのベース名を識別子とし、`name` は表示名（省略可）と明示するか、frontmatter から `name` を除いてファイル名だけで識別する設計を選択・記載する |
| 3 | LOW | Clarity | 要件 1 | 必須セクションの見出しレベル（`##` か `###` か）が指定されていない。validation は正規表現でマッチするため、レベル不一致で誤判定が起きる | `## 目的` / `## 観点` / `## 判定基準` の形式（見出しレベル含む）を明記する |
