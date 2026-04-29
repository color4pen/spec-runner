## Why

CLI core pipeline (PR #19) で propose セッション 1 段の実装が完了したが、Author-Bias Elimination の最初の境界（設計者 ≠ レビュアー）が未成立で、propose 後に人手で spec を確認する必要がある。spec-review セッションを自動接続して「fresh-per-task dispatcher」の最初の実装を確立すれば、後続の implementer / code-review も同じ枠組みで段階的に拡張できる。

## What Changes

- propose 完了後に spec-review セッションを自動起動するパイプライン拡張を追加する
- 上位オーケストレーター `runPipeline` を新設し、step を順次実行 + verdict 分岐する責務を持たせる（既存の `runProposePipeline` は step 関数として再利用）
- `src/core/steps/spec-review.ts` を新設し、セッション起動・`sessions.retrieve()` ポーリング完了検知・GitHub API による `spec-review-result.md` 取得・verdict パースを実装する
- spec-review 用 system prompt テンプレート `src/prompts/spec-review-system.ts` を追加する（architect + spec-reviewer の役割を 1 セッションで担う）
- spec-review セッションは Custom Tool を使わない（ファイル経由 verdict のみ）
- 状態ファイルに `spec-review` step を追加し、`session.id` / `verdict` / `findingsPath` を記録する
- verdict (`approved` / `needs-fix` / `escalation`) に応じた終了挙動を実装する（自動リトライは次 request スコープ）
- spec-review セッションの timeout を propose と独立に設定可能にする

## Capabilities

### New Capabilities

- `spec-review-session`: spec-review セッションのライフサイクル（作成・初回メッセージ・完了検知・verdict 取得）を定義する
- `pipeline-orchestrator`: 複数 step を順次実行し verdict に応じて遷移する上位オーケストレーター（fresh-per-task dispatcher の構造）

### Modified Capabilities

- `propose-pipeline`: 単独パイプラインから `pipeline-orchestrator` 配下の最初の step に位置付けを変更する（API 互換は維持しつつ、step 関数として呼び出される形に refactor）
- `job-state-store`: `step` フィールドを `"propose"` 固定から `"propose" | "spec-review"` に拡張し、各 step ごとに session ID / verdict / findings ファイルパスを記録できるよう state schema を拡張する
- `cli-commands`: `specrunner run propose` 完了時の終了メッセージに spec-review verdict を含める。verdict ごとに exit code・stdout を切り替える

## Impact

- **Affected code**:
  - `src/core/pipeline.ts`: `runPipeline` を新設し step 順次実行に refactor。既存 `runProposePipeline` は `src/core/steps/propose.ts` へ移動
  - `src/core/steps/spec-review.ts` (new): spec-review step 実装
  - `src/prompts/spec-review-system.ts` (new): system prompt テンプレート
  - `src/state/state.ts`: 状態スキーマ拡張（step ごとの session 情報）
  - `src/cli/run.ts`: verdict ハンドリング・stdout 出力
- **APIs**: 内部 API のみ。CLI 公開コマンドは互換維持
- **Dependencies**: 新規依存なし。既存の Anthropic SDK / `PipelineDeps.githubFetch` (raw fetch) / `pollUntilComplete` / job state store を再利用
- **ADR alignment**:
  - ADR-20260424-session-pipeline-design.md（4 セッション直列モデルの spec-review）
  - ADR-20260427-cli-first-architecture.md（Custom Tool なし）
  - ADR-20260429-positioning-vs-gsd-and-openspec.md（fresh-per-task dispatcher の最初の実装）
- **Out of scope (next request)**: spec-fixer 自動起動、implementer / code-review 接続、学習層、decision logging、security-reviewer / pattern-reviewer 並列化
