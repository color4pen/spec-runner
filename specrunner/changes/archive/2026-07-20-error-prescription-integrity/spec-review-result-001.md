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
| None | | | | | |

## Observations

| # | Severity | Category | File | Description |
|---|----------|----------|------|-------------|
| 1 | LOW | Test | tasks.md (T-03) | T-03の歯テストはソースファイルの静的解析（テンプレートリテラルのコメント除去・ヒント抽出）が必要で実装複雑度が高い。tasks.md は「`${...}` があっても command トークンは静的抽出できる」と言及するが、正規表現戦略の詳細は実装者に委ねられている。現行コードのヒント文字列は事実上すべて静的リテラルなので偽陰性リスクは低い。 |
| 2 | LOW | Design | design.md / spec.md | `workflow-structure` check は `required: false` で `status: "warn"` を返す（fail ではない）。このためD2 の next steps 規則表（`status === "fail"` のみ起点）には含まれない。spec.md と tasks.md はこれを正しく反映しているが、「hint を修正するがnext steps には出ない」という関係が明示されていない。混乱リスクは低い。 |
| 3 | LOW | Scope | design.md (Non-Goals) | `specrunner ps` は `src/core/archive/orchestrator.ts`（`recommendedAction`）や `src/core/finish/resolve-target.ts`（`message`）など hint 外にも残存する。これらは明示的にスコープ外（Non-Goals）として記録されており、D3の歯も対象外。設計の境界は妥当。 |
| 4 | LOW | Implementation | tasks.md (T-07) / src/core/doctor/checks/config/file-exists.ts | D4 で `DoctorContext.configPath: string`（必須フィールド）を追加すると、`buildMockContext` を介さず `DoctorContext` をインライン構築しているテストがすべてコンパイルエラーになる。tasks.md はリスクとして明示し `mock-context.ts` の既定値追加で対処するが、インライン構築が追加で存在する場合は T-12（typecheck）で発覚する。 |

## Review Summary

コードベースの実測との照合結果：

- **D1（origin 処方）**: `src/git/remote.ts:34-38` と `:49-53` の 2 箇所が同一インライン `SpecRunnerError`（hint: "cd into a git repository..."）であることを確認。factory 集約は DRY かつ T1 の単一テスト対象に正しく集約される。
- **D3（歯）**: `src/errors.ts:220`, `:362`、`src/config/store.ts:268`、`src/config/getAgentId.ts:20`、`src/adapter/managed-agent/agent-runner.ts:585`、`src/core/runtime/prereqs.ts:35,53,59`、doctor/checks/agents 各ファイルで `specrunner managed setup` ヒントを実測確認。`specrunner job list` は `src/errors.ts:362` で確認。`job start`・`runtime setup`・`job ls` は COMMANDS レジストリに実在することを確認。
- **D4（XDG）**: `src/core/doctor/checks/config/file-exists.ts:15` の `path.join(ctx.homeDir, ".config", ...)` を `ctx.configPath` に置換することで、`src/cli/doctor.ts:18` から既に import 済みの `getConfigPath()` と同一規則に揃う。`src/cli/doctor.ts` の ctx 組み立て（:190-209）に `configPath` フィールドが現在ないことを確認。
- **D5（auth エラー wrap）**: `src/core/runtime/local.ts:464` の生 stderr throw を確認。純関数分離は T8 の単体固定に適切。
- **D6（--help）**: `src/cli/command-registry.ts:817` の `doctor` エントリに `usage` フィールドがないことを確認。既存 `LOGIN_USAGE` パターンと同型の追加で実装可能。
- **Security**: CLI ツールの性質上 OWASP Top 10 の主要項目（SQLi / XSS 等）は非適用。`describeGitFetchFailure` が stderr をユーザーへ表示する際の制御文字インジェクションは、現行コードと同等以上（構造化により改善）であり許容範囲内。`XDG_CONFIG_HOME` による config パス変更は XDG 仕様どおりで意図的な動作。

設計判断は全項目において代替案と却下理由が記録されており、request.md の architect 評価済み判断と一致している。spec.md のシナリオは受け入れ基準 T1〜T9 に 1:1 で対応しており、破壊確認（destructive test）も各所に明示されている。
