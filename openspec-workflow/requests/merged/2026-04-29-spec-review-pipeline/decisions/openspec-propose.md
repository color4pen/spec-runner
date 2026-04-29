# openspec-propose decisions — 2026-04-29-spec-review-pipeline

## Slug naming workaround

- **問題**: `openspec` CLI は change 名がアルファベット始まりであることを必須化しており、リクエスト slug `2026-04-29-spec-review-pipeline` をそのまま `openspec new change` に渡すとエラー (`Change name must start with a letter`) になる
- **判断**: 一旦 `spec-review-pipeline` で scaffold して artifact を生成 → 完成後にディレクトリを `openspec/changes/2026-04-29-spec-review-pipeline/` にリネーム
- **影響**: openspec CLI 経由では `--change` で旧名を指定できなくなるが、artifact 自体は完成しており、`/openspec-apply-change` 等は新名で参照できる。今後 status / validate を実行したい場合は一時的に元名へリネームするか、CLI の制約を別途対応する必要がある
- **代替**: CLI に patch を当てる（範囲外）、slug を `r-2026-04-29-spec-review-pipeline` 等に変更する（リクエスト規約と乖離するため不採用）

## Capability の切り出し方

- **新規**: `spec-review-session` / `pipeline-orchestrator` の 2 つに分離
  - `spec-review-session` はセッション固有の責務（作成・ポーリング・verdict 取得）
  - `pipeline-orchestrator` は step 合成と verdict 分岐の責務
- **代替**: 1 つの新規 capability `spec-review-pipeline` に集約も検討したが、後続 request で implementer / code-review を追加する際にオーケストレーター責務だけ切り分けたいため分離した
- **修正**: `propose-pipeline`, `job-state-store`, `cli-commands` を MODIFIED 扱い

## 設計上の主要決定

1. **`runPipeline` を新設し step 関数を合成** (proposal の「設計上の検討事項」より、後者を採用)
   - 既存 `runProposePipeline` は薄いラッパーとして後方互換を維持
   - step 関数は `src/core/steps/` 配下に分離
2. **verdict は state ファイルに閉じる** (single source of truth、再開・観測性のため)
   - `JobState.steps: Record<StepName, StepResult>` を追加
3. **完了検知は `sessions.retrieve()` ポーリング** (request.md 明記。SSE 不要)
   - 間隔 10 秒・timeout 10 分（propose と独立）
4. **verdict 行は正規表現で行頭マッチ** (依存追加なし。review-standards.md の規約に従う)
   - パース失敗時は `escalation` フェイルセーフ
5. **system prompt は 1 ファイルに architect + spec-reviewer 役を集約** (Phase 1)
   - Phase 2 で並列化する際に分離可能な構造を維持

## Out of scope (確認のため記録)

- spec-fixer 自動起動・implementer / code-review 接続・学習層・並列レビュアー — request.md 明記の通り次 request スコープ
