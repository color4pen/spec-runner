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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Undocumented Regression | request.md Req 12, tasks.md T-13 | Codex adapter の frozen behavior `toolResult: null` + 全 step に `reportTool` 追加 + T-13 の `toolResult === null` → halt の組み合わせにより、Codex runtime を使う全 step が `awaiting-resume` で halt し Codex runtime が機能不能になる。この consequence が Req 12・リスク欄・受け入れ基準のいずれにも明記されていない。実装者が意図を誤解して誤対処するリスクあり。 | Req 12 に「本 change 適用後 Codex runtime は全 step が `awaiting-resume` に遷移し機能不能になる。これは既知の暫定 regression であり次 change で解消する」を追記する。T-13 の halt 判定条件を `if (ctx.policy?.reportTool && runResult.toolResult === null)` と明示する。 |
| 2 | MEDIUM | Spec Gap | request.md Req 6, tasks.md T-08 | `runDesignStyle` での `requires_action` 検出フローが未定義。T-08 に「SSE stream での tool 呼び出し検出」とあるが、SSE path で `requires_action` が `terminationReason` にどう反映されるか・polling fallback 経由で同一パスに合流するかが spec に記述されていない。実装者が独自判断で誤った分岐を書くリスクがある。 | Req 6 に SSE path の補足を追加する（例:「SSE path では `terminationReason` が `end_turn` 以外となり polling fallback に入る。`pollUntilComplete` が throw する `sessionRequiresActionError` を `runDesignStyle` 内でも catch して `report_result` パスへ branch する」）。T-08 受け入れ基準に SSE path の確認項目を追加する。 |
| 3 | LOW | Missing Acceptance Criteria | request.md Req 4, 受け入れ基準 | Req 4 に「`fetchResultFile` は file not found 時に halt せず `outcome.fileContent: null` で best-effort 保存」と明記されているが、この挙動変更が受け入れ基準チェックリストに含まれていない。現状コードは not-found 時に `attachStateAndRethrow` で throw する実装であり、変更後の動作を test で保証しないと regression リスクがある。 | 受け入れ基準に「`fetchResultFile` が file not found 時に throw せず `null` を返すことが test で検証されている」を追加する。 |
| 4 | LOW | Spec Inconsistency | spec.md Requirements vs tasks.md T-01 | `parseBaseReportInput` helper が tasks.md T-01 と design.md D6 では export 対象として記載されているが、spec.md の "Requirement: report-result port の定義" export リストと request.md 受け入れ基準に含まれていない。spec と tasks の記述が不整合。 | spec.md の export 要件リストに `parseBaseReportInput` を追加するか、tasks.md の記述を "内部実装詳細" として整理する。 |

## Notes

- `DEFAULT_TOOL_RETRY.buildPrompt` が `"(attempt ${attempt}/2)"` とメッセージ内に `maxAttempts` をハードコードしている。第 1 段では全 step が default を使用するため実害なし。将来 `maxAttempts` を変更した際にメッセージが矛盾することに注意。
- T-11 の `AnthropicClientAdapter.createAgent/updateAgent` で CustomToolSpec → `BetaManagedAgentsCustomToolParams` 変換の "なければ追加" ケースの実装量が不明。既存の MCP toolset 変換ロジックと類似パターンかを事前に確認することを推奨。
- Security: `parseInput` の手書き validation、zod の heavy API 不使用、in-process MCP server 分離は適切。OWASP Top 10 で適用可能な A03/A05 に該当する問題なし。

