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
| 1 | LOW | Implementation | tasks.md / agent-runner.ts | T-01 の注入箇所: `fullPrompt` は ~285 行で組み立てられるが `reportTool` の解決は ~302 行。tasks.md はこの順序問題を指摘し「injection は reportTool 解決後に行うか、fullPrompt サイトで ctx.policy?.reportTool を直接チェック」と案を提示している。どちらも正しいが、tasks が要求する「postWorkPrompts / retry turn への非注入」を守るには fullPrompt の末尾追記（main turn のみが使う変数）が最も安全。実装者が選択する余地があるため LOW として記録。 | tasks.md の注意書き通りに fullPrompt の再組み立てを reportTool 解決後に置くか、同一箇所で `ctx.policy?.reportTool` をインラインチェックする。どちらでも受け入れ基準を満たす。 |
| 2 | LOW | Type Design | design.md / tasks.md | `CompletionReportDiagnostic.failureReason` は `string` 型として定義されている。design.md のコメントに `"json-parse-error" \| "validation-failed" \| "no-json-found"` が示されているが、型は string のまま。型安全性の観点ではリテラルユニオンが望ましいが、`tryExtractToolResult` の戻り値型と一致させる必要があるため、そちらが string を返している限り変更は不要。将来の拡張時に型が発散するリスクのみ。 | `tryExtractToolResult` の `failureReason` 型を文字列リテラルユニオンに昇格するなら `CompletionReportDiagnostic` も合わせる。今回のスコープ外として無視しても受け入れ基準は満たす。 |

## Summary

設計・仕様・タスクは一貫しており、実装上のブロッカーなし。

**D1（単一ソース化 + main turn 注入）**: `COMPLETION_REPORT_MEANS` 定数と `buildMainTurnCompletionInstruction` / `buildCompletionRetryPrompt` ビルダーによる単一ソース化は正しい設計。`fullPrompt` への追記は main turn 専用変数であるため他の turn（postWorkPrompts / retry / output-verification）に漏れない。

**D2（診断の構造化記録）**: `transientRetryAttempts` が通ったのと同じ additive optional spread チェーンをそのまま踏襲する方針を確認した。`StepOutcome` → `StepResultInput` → `pushStepResult` → `StepRun` → `stepRunToRecord` → `StepAttemptRecord.outcome` → `fold()` の全ホップが tasks.md T-03 に列挙されており、事後分析のためのデータが inbox 起動の job でも `events.jsonl` に残る。`SessionLogWriter` を選ばない理由（`-vv` 限定、ブランチ外）も design.md に明示済みで正当。

**セキュリティ**: `rawFragment`（≤200 chars）は既存 stderr 出力と同じ内容を `events.jsonl`（ブランチコミット済みファイル）へ追記するもの。モデルの応答断片がブランチ履歴に残ることは `toolResult` の既存記録と同水準であり新たなリスクを導入しない。認証・入力バリデーション・OWASP 対象の web サーフェスは存在しない。

**受け入れ基準のテスト網羅性**: T-04 の各シナリオ（reportTool 有無の main turn プロンプト検証、単一ソース確認、全 turn 失敗時の diagnostics 非空確認、成功時の key 不在確認、journal レベルの fold/stepRunToRecord ラウンドトリップ、既存 extraction/retry/fail-closed の無退行）はすべて既存ハーネス（mock thread / pushStepResult / fold）で実装可能かつ spec シナリオと 1:1 対応している。
