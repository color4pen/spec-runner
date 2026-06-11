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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Security / Input Validation | design.md D4, tasks.md T-02 | reviewer `name` のバリデーションにパスセーフ文字種の制約がない。`customReviewerResultPath(slug, name, iter)` は `name` を無加工でパス文字列に埋め込む（D10）。`name = "../../../etc/passwd"` や `name = "foo/bar"` のような値が frontmatter に書かれた場合、結果ファイルが `specrunner/changes/` 外に生成されるパストラバーサルが成立する。 | T-02 の `validateReviewerDefinitions` に「name は `/^[a-z0-9][a-z0-9\-_]*$/` にマッチすること」のチェックを追加し、D4 の validation 項目リストにも明記する。 |
| 2 | HIGH | Design Consistency | design.md D6, src/core/pipeline/types.ts L53 | `PipelineDescriptor.roles` には "each phase has exactly one creator and exactly one reviewer" というインバリアントが明記されている。D6 はカスタムレビューワーに `{ role: "reviewer", phase: "impl" }` を与えるため、impl フェーズに複数の reviewer が存在しインバリアントを破る。下流のどのコードがこのインバリアントに依存しているか（resume / step-role 解決）が調査・文書化されておらず、安全に破れるかどうか不明。 | design.md に「roles インバリアントをカスタムレビューワー対応のため緩和する」旨と、依存コードの影響調査結果を明記する。または、カスタムレビューワー専用のロール値（例: `"custom-reviewer"`）を定義し、既存インバリアントを維持する案を検討する。 |
| 3 | HIGH | Design Gap | design.md D11 | `code-fixer.reads()` の一般化（D11）で「active reviewer の最新結果ファイル」を返すとしているが、`code-review` の結果ファイルは `reviewFeedbackPath()` = `review-feedback-NNN.md` 形式であり、カスタムレビューワーは `customReviewerResultPath()` = `<name>-result-NNN.md` 形式と異なる。D11 はどちらのパス形式を返すかを active reviewer 名で分岐する必要があるが、その分岐ロジック（あるいは両者を統一するパスリゾルバー）が設計に記述されていない。executor の STEP_INPUT_MISSING 検証もパス形式が正しくなければ誤動作する。 | D11 に `resolveReviewerResultPath(reviewerName, slug, iteration)` の仕様を追加し、`reviewerName === STEP_NAMES.CODE_REVIEW` のとき `reviewFeedbackPath` を、それ以外は `customReviewerResultPath` を返す分岐を明記する。tasks.md T-13 にこの関数の追加・テストを含める。 |
| 4 | MEDIUM | Type Error | tasks.md T-11 | `maxIterationsByStep?: Record<string,string>` と記載されているが `Record<string, number>` が正しい（design.md D9 と矛盾）。タイプチェックは通らず実装者が混乱する。 | T-11 の記述を `Record<string, number>` に訂正する。 |
| 5 | MEDIUM | Design Gap | src/core/resume/resolve-step.ts, spec.md (resume シナリオ) | `resolveResumeStep` は `ALL_STEP_NAMES_SET`（標準 step 名のみ）で `--from` を検証するため、`specrunner resume --from <custom-reviewer-name>` が "Invalid --from value" エラーになる。spec.md の resume シナリオはこの制限に言及しておらず、ユーザーが手動再開できない状況が無言で生まれる。自動 resume（`resumePoint` 経由）は機能するが、`--from` での再開は失敗する。 | `resolveResumeStep` のバリデーションを「標準 step 名 OR job state の reviewer snapshot に含まれる名前」に拡張するか、カスタムレビューワー名での `--from` は非対応と spec.md の制限事項に明記する。 |
| 6 | LOW | Specification Gap | design.md D7 | `resolveActiveReviewer` は「`startedAt` が最大の reviewer」を返すと定義しているが、複数 reviewer の `startedAt` が一致した場合の tie-breaking ルールが不定。テスト環境でのモック時刻では同一タイムスタンプが発生しやすい。 | D7 に tie-breaking ルール（例: chain 上で後位の reviewer を優先）を追記する。 |
| 7 | LOW | Specification Gap | design.md D9, D10 | stdout の `[iter N/M]` 形式（`loopName` = `spec-review` 固定）はカスタムレビューワーの実行中に更新されない。ユーザーがジョブの進行状況を把握しにくい可能性があるが、設計に言及がない。 | 意図的に `[iter N/M]` を spec-review ループのみに限定するなら、その設計判断を design.md に明記する。 |
