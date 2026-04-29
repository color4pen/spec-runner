# Implementer Decisions

## Implementation Choices

- `StepResult[]` ではなく既存の `appendStepResult` は後方互換のため残す :: schema.test.ts が `appendStepResult` を直接テストしており、削除すると既存テストが壊れる。新しい `pushStepResult` を追加し、段階的に移行する
- `PipelineDeps` は `src/core/types.ts` に切り出して `pipeline.ts` からも re-export する :: 既存テストが `import type { PipelineDeps } from "../src/core/pipeline.js"` でインポートしているため、`pipeline.ts` からの re-export を維持して破壊的変更を防ぐ
- `spec-review-result.md` の旧形式 findingsPath は TC-049 等の既存テストで固定されているため、新形式（NNN付き）は spec-review step が iteration 引数を受け取る形で実装する :: 既存テストとの互換のため iteration=undefined の場合は旧ファイル名にフォールバックしない。既存テストを新形式に更新する
- `getAgentId` の propose ロールは `agents.propose.id → config.agent.id` の順でフォールバックする :: 既存 config を持つユーザーが specrunner init を再実行しなくても propose が動く必要がある
- `writeJobState` は `persistJobState` の別名として追加する :: 設計ドキュメントでは `writeJobState` と記述されているが、既存コードは `persistJobState` を使用している。loop.ts で `writeJobState を呼ばない` という仕様があるため、step 側で使う関数と区別のために `writeJobState` をエイリアスとして提供する
- spec-review step は `pushStepResult` に移行し、state.steps["spec-review"] を配列化する :: 既存テスト spec-review-step.test.ts は `state.steps?.["spec-review"]` をオブジェクトとして参照しているため、テストも配列形式に更新する
- `runManagedAgentSession` ヘルパーを spec-review と spec-fixer で共用する :: propose は SSE ストリーミング方式のため対象外。design.md の Session Lifecycle Helper Extraction に従う
- spec-fixer Agent の `AGENT_SPEC_FIXER_MODEL` は propose Agent と同じ `"claude-sonnet-4-5"` を使う :: design.md D5 で「propose と同モデル」と指定されている
- config の `agents` フィールドは optional にしてバックコンパット保持 :: 既存 config を持つユーザーへの破壊的変更を防ぐ
- TC-044 の iter=1/iter=2 ファイル名テストに対応するため、`runSpecReviewStep` は state の現在の steps 配列の長さから iteration を計算する :: `state.steps["spec-review"]?.length ?? 0 + 1` で iteration を自動採番し、ファイル名を `spec-review-result-001.md` のように 3 桁ゼロパディングで生成する
