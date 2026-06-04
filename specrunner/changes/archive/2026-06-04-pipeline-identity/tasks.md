# Tasks: JobState に pipeline 同一性（pipelineId）を記録する

## T-01: kernel に canonical pipeline 識別子定数を追加する

- [x] `src/kernel/` に pipeline 識別子定数モジュールを新設する（例: `src/kernel/pipeline-ids.ts`）。`STANDARD_PIPELINE_ID = "standard"` を export する。`step-names.ts` と同形で、必要なら `PIPELINE_IDS = { STANDARD: "standard" } as const` と `PipelineId` 型も併せて export してよい。
- [x] 文字列リテラル `"standard"` を pipelineId の意味で他ファイルに直書きしないこと（この定数を single source of truth とする）。

**Acceptance Criteria**:
- `STANDARD_PIPELINE_ID` が kernel 層から import 可能で、値が `"standard"`。
- 定数モジュールは `src/state/` / `src/store/` / `src/core/pipeline/` から循環依存なく import できる（kernel は最下層）。

## T-02: JobState schema に optional な pipelineId フィールドを追加する

- [x] `src/state/schema.ts` の `JobState` interface に `pipelineId?: string` を追加する。配置・JSDoc は既存の top-level optional フィールド（`worktreePath`）に倣い、「どの pipeline 定義で実行したか。legacy state では欠落。欠落時は getPipelineId が `"standard"` に解決」旨を記す。
- [x] `validateJobState` では `pipelineId` の欠落をエラーにしないこと。値の充填・書き換えは行わない（`worktreePath` と同じく optional として放置）。発見性のため backward-compat コメントのみ追加してよい。

**Acceptance Criteria**:
- `pipelineId` を持つ／持たない双方の object が `validateJobState` を通過する（throw しない）。
- `bun run typecheck` が green。
- `validateJobState` は `pipelineId` 欠落の入力に対し、その欠落をそのまま保つ（`"standard"` を書き込まない）。

## T-03: pipelineId 欠落時の解決ヘルパ getPipelineId を追加する

- [x] `src/state/` に純粋関数 `getPipelineId(state: JobState): string` を新設する（例: `src/state/pipeline-id.ts`）。実装は `state.pipelineId ?? STANDARD_PIPELINE_ID` とし、T-01 の定数を参照する。`getJobSlug`（`src/state/job-slug.ts`）の設計に倣う。
- [x] 既定値（`"standard"`）を消費側に分散させず、この関数を唯一の解決入口とする。

**Acceptance Criteria**:
- `pipelineId` を持たない state に対し `getPipelineId` が `"standard"` を返す。
- `pipelineId: "standard"` を持つ state に対し `getPipelineId` が `"standard"` を返す。
- I/O・filesystem 依存を持たない純粋関数である。

## T-04: 起動時に pipelineId を記録する

- [x] `src/store/job-state-store.ts` の `JobStateStore.create` の params に optional な `pipelineId?: string` を追加する。初期 state 構築時に `pipelineId: params.pipelineId ?? STANDARD_PIPELINE_ID` を書き込む（T-01 の定数を参照）。既存呼び出し（テスト含む）が無改修で通るよう default を用意する。
- [x] `src/core/command/pipeline-run.ts` の `PipelineRunCommand.prepare` から `JobStateStore.create` 呼び出しに `pipelineId: STANDARD_PIPELINE_ID` を明示的に渡す（標準 pipeline を選ぶ command が記録の起点であることを表す）。
- [x] pipeline 実行・再開・画面出力のコード（`src/core/pipeline/run.ts` の `createStandardPipeline`、`src/core/resume/resolve-step.ts`、`src/core/pipeline/pipeline.ts`）は変更しない。`pipelineId` を分岐条件として参照しないこと。

**Acceptance Criteria**:
- `JobStateStore.create` が `pipelineId` 未指定でも `"standard"` を含む初期 state を生成する。
- `PipelineRunCommand.prepare` 経由で作成される state の `pipelineId` が `"standard"`。
- pipeline 再構築・遷移・stdout 出力ロジックに差分がない（記録専用フィールドとして導入）。

## T-05: テストを追加する

- [x] state-store の round-trip テスト（`tests/state-store.test.ts` 近辺）：`pipelineId: "standard"` を持つ state を persist→load して値が保たれることを検証する。
- [x] 後方互換 load テスト：`pipelineId` フィールドを含まない既存 state JSON を `validateJobState`／`JobStateStore.load` で読み、throw せず他フィールドが保たれることを検証する。
- [x] `getPipelineId` の unit テスト（例: `tests/unit/state/pipeline-id.test.ts`）：欠落時 `"standard"`、記録時はその値、の 2 ケースを検証する。
- [x] 起動時記録テスト：`JobStateStore.create`（default）および `PipelineRunCommand.prepare` 経由で作成された state の `pipelineId` が `"standard"` であることを検証する。
- [x] 挙動不変の回帰検証：既存の画面出力スナップショットテスト（`tests/cli-stdout-snapshot.test.ts`）が green であること、および `pipelineId` を持たない legacy state からの resume が従来と同じ pipeline・開始 step で再開する（既存の resume 互換テストが green）ことを確認する。state スナップショット系テストが存在する場合、`pipelineId` 追加に伴う期待値更新が必要かを確認し、必要なら更新する。

**Acceptance Criteria**:
- 上記すべての新規テストが pass する。
- 既存の画面出力スナップショットテストと resume 互換テストが green（挙動不変）。

## T-06: spec.md の振る舞いを満たし全検証を green にする

- [x] `spec.md` の全 Requirement / Scenario が実装・テストで満たされていることを確認する。
- [x] `tasks.md` の各 checkbox を完了に更新する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- 新規ジョブの state に `pipelineId` が記録される。
- `pipelineId` を持たない既存 state ファイルが従来通り読め、欠落時は `"standard"` に解決される。
- 画面出力スナップショットと再開互換テストが green（挙動不変）。
