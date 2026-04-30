# Implementation Notes — pr-create-step

## Status

- **result**: completed
- **tasks_completed**: 32/32

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/state/schema.ts` | modified | StepName に "pr-create" 追加、AgentStepName の Exclude 句拡張、PullRequestInfo 型と JobState.pullRequest? field 追加 |
| `src/parser/request-md.ts` | modified | ParsedRequestSections 型・ParsedRequest.sections? field 追加、extractSections() helper 実装 |
| `src/core/pr-create/runner.ts` | created | runPrCreate() — gh pr list / gh pr create spawn、PR 検出・作成・error 処理、tempfile 経由 body 渡し |
| `src/core/pr-create/body-template.ts` | created | renderPrTitle() / renderPrBody() — request.md sections + JobState steps から PR title / body 生成 |
| `src/core/step/pr-create.ts` | created | PrCreateStep (CliStep) — resultFilePath / parseResult / run 実装、state.pullRequest 更新 |
| `src/core/pipeline/types.ts` | modified | STANDARD_TRANSITIONS: "code-review approved → end" を "code-review approved → pr-create" に差し替え、pr-create success/error 行を追加（計 21 行） |
| `src/core/pipeline/run.ts` | modified | steps Map に PrCreateStep を追加（合計 9 エントリ） |
| `tests/parser.test.ts` | modified | TC-029/030 sections 抽出テストを追加 |
| `tests/unit/core/pr-create/runner.test.ts` | created | TC-001〜007: runPrCreate 7 シナリオ |
| `tests/unit/core/pr-create/body-template.test.ts` | created | TC-032〜034: renderPrTitle / renderPrBody テスト |
| `tests/unit/step/pr-create.test.ts` | created | TC-008〜017: PrCreateStep CliStep shape / run / parseResult / result file 検証 |
| `tests/unit/core/pipeline/pipeline.transitions.test.ts` | modified | TC-012 を code-review→pr-create に更新、TC-030 を 21 行アサーションに更新、TC-018〜024 新アサーション追加 |
| `tests/unit/core/pipeline/run.test.ts` | created | TC-025〜026: steps Map 9 エントリ確認、AgentRegistry 未登録確認 |
| `tests/core/pipeline/pipeline.test.ts` | modified | pr-create step を mock executor / steps Map に追加、TC-012/030 更新 |
| `tests/pipeline-integration.test.ts` | modified | pr-create runner の vi.mock 追加、TC-050 の step アサーションを "pr-create" に更新 |
| `openspec-workflow/adr/ADR-20260430-pr-create-step-design.md` | created | pr-create step 設計 ADR（D1〜D8） |
| `openspec-workflow/adr/README.md` | modified | ADR index に pr-create-step-design を追加 |
| `openspec/changes/pr-create-step/tasks.md` | modified | 全タスクを [x] 完了に更新 |
| `openspec-workflow/requests/active/pr-create-step/decisions/implementer.md` | created | 実装判断ログ |

## Blocked Tasks

なし。全タスク完了。

## Notes

- tasks.md で指定された STANDARD_TRANSITIONS の行数 22 について: 既存の `code-review --approved→ end` を削除して `code-review --approved→ pr-create` に差し替えたため正味の追加は +2 行（pr-create success/error）。結果は 21 行（19 - 1 + 3 = 21）。tests もこれを反映して 21 行アサーションに更新済み。
- test-cases.md の must テストケース（TC-001〜TC-025 の must 判定分）は全て実装済み。manual テスト（TC-038/039/040/041）は E2E 実機検証のため対象外（tasks.md Non-Goals に記載）。
