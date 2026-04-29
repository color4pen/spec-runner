# spec-fixer Decision Log

## Iteration 1 (2026-04-29)

- `specs/job-state-schema/` を `specs/job-state-store/` にリネームして MODIFIED delta に変換する :: 既存 capability は `job-state-store` であり、同一ドメインに 2 spec を並立させると single source of truth が崩れるため（HIGH #1）
- Legacy StepResult → StepRun のフィールドマッピング表を spec に追加する :: `iteration` ↔ `attempt`、`session` ↔ `sessionId`、`completedAt` ↔ `endedAt` の対応が明示されていないと後方互換の証明ができないため（HIGH #1）
- Legacy B normalization の `startedAt` derivation rule を明示する :: `startedAt = state.updatedAt`（fallback）、`endedAt = StepResult.completedAt` と具体化し「best-effort defaults」の undefined behavior を解消するため（MEDIUM #6 先取り対応）
- `specs/pipeline-state-machine/` を `specs/pipeline-orchestrator/` の MODIFIED delta に変換する :: 既存 capability は `pipeline-orchestrator` であり、新 ADDED を並立させると `step 関数は src/core/steps/` 等の既存 Requirement と直接矛盾するため（HIGH #2）
- `pipeline-orchestrator` MODIFIED delta に REMOVED Requirements セクションを追加する :: `runLoopUntil` 委譲モデル・`PipelineDeps` の `src/core/types.ts` 定義・`runPipeline が state ファイルを single source of truth として扱う` の 3 Requirement が新 Pipeline class 導入で不要になるため明示的に REMOVED と記録する（HIGH #2）
- `pipeline-orchestrator` MODIFIED delta の step layout Requirement で `src/core/steps/` → `src/core/step/` のディレクトリ移動を明示する :: 既存 Requirement が `src/core/steps/` を指定しており新レイアウトと矛盾するため（HIGH #2）
- `pipeline-state-machine/spec.md` の `CLI Output Format is Preserved` Requirement を削除し `pipeline-orchestrator/spec.md` にも再定義しない :: `pipeline-loop-primitive` spec が single source of truth として MUST NOT 他 spec での再定義を宣言しており直接抵触するため（HIGH #3）
- `runLoopUntil` の stdout format 定義は `pipeline-loop-primitive` spec のままとし REMOVED delta を追加しない :: `runLoopUntil` の内部実装を `Pipeline.run` に吸収するが stdout 文字列は不変であり format の定義所有者を変える理由がないため
- proposal.md / design.md / tasks.md の「168 テスト」を「161 passing テスト」に書き直す :: 実際の `bun test` 結果は 162 total（161 pass、1 fail、1 error）であり `tests/cli.test.ts` の vitest API 非互換による既存破損が含まれる。誤った base count は振る舞い不変判定の根拠を崩すため（HIGH #4）
- `tests/cli.test.ts` の 1 fail + 1 error を scope 外として明示する :: vitest API（`vi.mock`）は Bun runtime 非互換であり本 refactor とは無関係の既存破損であるため、修正は後続 request のスコープとする（HIGH #4）

## Iteration 2 (2026-04-29)

- `pipeline-loop-primitive` capability を REMOVED delta として change-folder に追加する :: `runLoopUntil` を `Pipeline.run` 内部ロジックに吸収すると既存 capability spec の 7 Requirement すべてが新実装と矛盾するため、REMOVED delta を明示して衝突を解消する（HIGH #1、選択肢 X を採用）
- stdout 進捗フォーマットの所有権を `pipeline-orchestrator` MODIFIED delta の新 Requirement に移管する :: `pipeline-loop-primitive` が REMOVED になるため format 文字列の single source of truth を `Pipeline Emits Iteration Progress to Stdout` Requirement として pipeline-orchestrator delta に吸収する（HIGH #1）
- `pipeline-orchestrator` MODIFIED delta の末尾 Note を更新し `pipeline-loop-primitive` は REMOVED と明示する :: iter 1 の Note が「`pipeline-loop-primitive` spec remains UNCHANGED」と記述しており新 REMOVED delta と矛盾するため（HIGH #1）
- tasks.md に 8.1a / 8.1b を追加する :: `src/core/loop.ts` および `src/core/session-runner.ts` の削除タスクが tasks 8.x に不在であり、REMOVED delta の実装範囲が未定義になるため（MEDIUM #4、HIGH #1 の連動 fix）
