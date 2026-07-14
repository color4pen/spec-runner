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
| 1 | LOW | Correctness | tasks.md / T-07 | TC-010 は `buildRequest()` が `adr: false` を返すことを確認済み（`tests/pipeline-integration.test.ts:203`）。変更後は adr-gen が agent を実行しないため createSession 数は 8→7 になる。T-07 はこの更新を正しく記述しているが、同テスト内のコメント「adr-gen(1)」も削除対象である点を明示していない。 | T-07 で session 数更新時に、257 行目のコメント行（"adr-gen(1)"の記述）も合わせて削除する。機能上の影響なし。 |
| 2 | LOW | Completeness | design.md / D4 | `StepResultInput`（`src/state/helpers.ts`）への `addedTurns?` 追加は T-05 に記述されているが、`pushStepResult` 内での spread パターンが既存の `followUpAttempts` と同様であることは design.md に言及されていない。実装者が helpers.ts を見落とすリスクがわずかにある。 | T-05 に「`src/state/helpers.ts` の `StepResultInput` に `addedTurns?` を追加し、`pushStepResult` の outcome 組み立てで spread する」と記載済みのため実質的なリスクは低い。対応不要。 |

## Review Notes

### 正当性確認

**完了契約注入（D1）**: `buildAdditionalInstructions` が `src/adapter/shared/prompt-builder.ts` から codex と claude-code の両 adapter にインポートされていることを確認。新規 `completion-directive.ts` を `src/adapter/claude-code/` に閉じることで provider-neutral 方針を守れる設計は正しい。MCP tool 名の合成元（`REPORT_MCP_SERVER_NAME` 定数 + `reportTool.name`）はすでに `:372` と `:428` で単一ソースとして使われており、同パターンを流用できる。

**skipWhen 述語（D2）**: `StepDeps = StepContext`、`PipelineDeps extends StepContext` を確認。executor が `deps: PipelineDeps` を `skipWhen(state, deps)` に渡せる型互換は成立している。`StepContext.request: ParsedRequest` から `request.adr` および `request.baseBranch` にアクセスできることも確認済み。

**adr-gen skipped 遷移（D3）**: `STANDARD_TRANSITIONS` に `{ on: "skipped", to: PR_CREATE }` の行が存在しないことをコード確認。追加しないと `getStepOutcome` 結果が transition 未マッチで escalate 落ちするという設計の危険性把握は正確。`FAST_TRANSITIONS` に adr-gen が存在しないことも確認済み。

**regression-gate skipped 遷移（D3）**: `src/core/pipeline/reviewer-chain.ts:460-464` に `{ step: REGRESSION_GATE_STEP_NAME, on: "skipped", to: STEP_NAMES.CONFORMANCE }` が既存であることを確認。遷移追加不要という設計の判断は正しい。

**addedTurns plumbing（D4）**: `StepExecutionResult`（`commit-orchestrator.ts:54`）の success kind に `followUpAttempts?` がある現行パターンを確認。同パターンで `addedTurns?` を追加し、`projectSuccess` → `pushStepResult` → `StepOutcome` へと流す経路は既存の `followUpAttempts` 経路と対称で実装リスクが低い。

### セキュリティ評価

- **Injection リスク**: completion directive に埋め込む MCP tool 名は内部定数（`REPORT_MCP_SERVER_NAME` = `"specrunner_report"` + `reportTool.name`）から合成され、ユーザー入力を含まない。プロンプトインジェクションリスクなし。
- **skipWhen 述語**: I/O 禁止の pure function として規定されており、状態読み取りのみ。副作用なし。
- **addedTurns カウンタ**: 単純な整数インクリメント。認証・認可・外部通信に関与しない。
- **OWASP Top 10**: 本 change はプロンプト組み立てと state スキーマの追加に限定されており、新しい認証面・ネットワーク呼び出し・ファイル I/O・権限昇格は導入されない。重大な脆弱性なし。

### 総評

3 フィーチャー（完了契約注入 / 決定論 skip / ターン種別 metrics）のいずれも、request の要件・設計判断・実装タスク・受け入れ基準が一貫している。リスク欄で挙げられた既存テスト更新（TC-010 の 8→7 sessions / adr-gen verdict success→skipped）の分析は正確で、コード確認と一致する。backward compat 方針（`followUpAttempts` 維持 + `addedTurns` additive 追加）も妥当。実装上の懸念は見当たらない。
