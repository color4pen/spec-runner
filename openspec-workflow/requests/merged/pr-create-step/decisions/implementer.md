# Implementer Decisions — pr-create-step

## 実装方針

StepName union に "pr-create" を追加し AgentStepName の Exclude 句を拡張する :: verification と対称の CLI step のため AgentRegistry 対象外とする必要がある

JobState に pullRequest? optional field を追加する :: optional にすることで legacy state ファイルの後方互換性を保つ

request.md parser を拡張して sections.背景 / sections.目的 を ParsedRequest に追加する :: 独立 helper を作らず既存 parser を拡張することで DRY を維持する（design D8）

runner.ts は spawn wrapper を使わず node:child_process.spawn を直接使う :: 既存 verification/runner.ts のパターンに合わせる

gh pr list の PR 不在判定は JSON 配列長 0 のみで行う :: stderr 文言依存は禁止（test-cases.md TC-007）

gh pr create のボディは --body-file で一時ファイル経由で渡す :: --body 引数は回避（tasks.md 3.4）

body-template.ts は JobState.steps から最終 iteration の verdict を参照して Workflow テーブルを生成する :: steps が空の場合はその行を省略する（TC-034）

STANDARD_TRANSITIONS の "code-review --approved→ end" を削除し "code-review --approved→ pr-create" に差し替える :: D7 の方針「並行運用期を設けない」に従い同 commit で完結

LOOP_ERROR_CODES には pr-create を追加しない :: pr-create は loop でないため loop 消耗エラーの対象外

steps Map に PrCreateStep を追加するのは run.ts のみ、init.ts は変更しない :: kind=cli のため AgentRegistry への追加は不要（tasks.md 7.2）

既存の pipeline.transitions.test.ts の TC-012 と TC-030 を更新する :: code-review --approved→ end の期待値が変わるため regression guard として更新が必要
