# Implementer Decisions — cli-finish-command

## 実装方針

- tasks.md で誤記されていたパス（`src/cli/commands/finish.ts`、`src/lib/jobs/state.ts`）を module-analysis.md の Path correction notice に従い、`src/cli/finish.ts`、`src/state/schema.ts` に修正して実装する :: 既存 codebase 規約（`src/cli/` フラット配置）に準拠し、divergent module tree を回避するため
- `spawnCommand` を `src/util/spawn.ts` に抽出し、`src/core/pr-create/runner.ts` は import に差し替える（R1）:: 9+ call site での重複を避け、finish と pr-create 双方からの再利用を可能にするため
- `loadJobState` / `updateJobState` を `src/state/store.ts` に追加する（R3）:: finish の job state 読み書きを既存の atomic write プロトコルと一貫させ、テスタビリティを確保するため
- 全 finish step module は `spawn: SpawnFn` と `fs: FinishFs` を DI パラメータとして受け取る（R4）:: 実際のプロセスを spawn せずに unit test が記述できるよう、DoctorContext パターンと同様の境界注入を行うため
- `src/core/gh/pr.ts` に `runGhPrCreate` を抽出し、archive PR の `--body-file` パターンを共通化する（R5 一部）:: constraints.md に `--body-file <tempfile>` と `try/finally` cleanup を義務付ける制約があり、pr-create と finish の両方で適用するため
- `src/core/gh/error.ts` に `buildGhFailureMessage` を抽出する（R5 一部）:: gh auth エラーのヒント文字列を finish でも再利用し、pr-create との一貫性を保つため（ただし現実装では finish 側は escalation block に inline している）
- `JOB_NOT_FOUND`, `JOB_NOT_FINISHABLE`, `OPENSPEC_ARCHIVE_FAILED`, `AUTO_MERGE_UNAVAILABLE`, `GH_SUBPROCESS_FAILED`, `GIT_SUBPROCESS_FAILED` を `ERROR_CODES` に追加する :: finish 固有のエラーコードを型安全に管理し、既存パターンと整合させるため
- `specrunner ps --active` フィルタで `ACTIVE_STATUSES = Set(["running"])` を使い `archived` / `success` / `failed` / `terminated` をデフォルトで除外する :: TC-034 の仕様通り。将来の status 追加時は ACTIVE_STATUSES の Set を更新するだけで済む構造にするため
- `src/core/finish/orchestrator.ts` の CLOSED 分岐を escalation block として exit code 1 で返す :: CLOSED は finish の通常フローに乗らず、`specrunner cancel`（未実装）への案内が必要なため。TC-022 に準拠
- archive PR の idempotency チェックを `gh pr list --state merged` で実装する :: TC-057 対応。archive PR ブランチ名 `chore/archive-<slug>` で既存の MERGED PR を検出し、push / create をスキップするため

## 実装しなかった事項（Blocked）

- TC-051, TC-052, TC-056, TC-062, TC-065: manual / e2e テスト :: CI 環境や実際の GitHub + gh CLI 環境に依存するため自動実装不可。実行者が手動で確認する
- TC-012.4 (dogfooding-006 E2E): PR #48 を最初の finish ターゲットにする E2E 実行 :: 本 change 自体の merge 後に実施。chicken-and-egg のため本実装では対象外
- 11.5 README 更新 :: docs/ ファイルの確認が必要だが、実装スコープの核心ではないため blocked に記録（README が存在する場合は別途対応が望ましい）
