# Proposal: branch 名に jobId を含めて再 dogfood 時の生成ファイル衝突を回避する

## Background / Why

同じ slug で `specrunner run` を複数回実行すると、前回 run で branch に残った生成ファイル（`review-feedback-001.md` 等）を新 job が誤読する。原因は branch 名が `feat/<slug>` 固定で、過去 job の生成物を持ち越すため。

branch 名を job ごとに一意にすれば、各 run が独立した branch で動作し、生成ファイルの衝突が構造的に排除される。

## What / Proposal Overview

branch 名フォーマットを `feat/<slug>` から `feat/<slug>-<jobId-short>` に変更する。`jobId-short` は jobId UUID の先頭 8 文字（hex）。

**Core Changes**:

1. **branch 名生成**: `executor.ts` の `setsBranch` ロジックと `propose-system.ts` の `buildInitialMessage` で生成する branch 名に jobId suffix を付与する
2. **slug 逆算ロジック**: branch 名から slug を導出する全箇所で、末尾の `-<hex 8 文字>` suffix を切り落とすロジックを追加する
   - `src/state/job-slug.ts` の `stripBranchPrefix` の後段
   - `src/core/finish/resolve-target.ts` の `--pr` 経路
   - `src/adapter/managed-agent/tools/register-branch.ts` の handler
3. **delta spec**: 影響を受ける既存 spec（`change-folder-viewer`, `cli-finish-command`, `register-branch-tool`, `step-execution-architecture`）に delta spec を追加する

## Impact Scope

- **Files modified**:
  - `src/core/step/executor.ts` (1 行: branch format 変更)
  - `src/prompts/propose-system.ts` (1 行: default branch format 変更)
  - `src/state/job-slug.ts` (`stripJobIdSuffix` ヘルパー追加、`stripBranchPrefix` 後に適用)
  - `src/adapter/managed-agent/tools/register-branch.ts` (handler の slug 導出で `stripJobIdSuffix` 適用)
  - `src/core/finish/resolve-target.ts` (headRefName → slug 導出で `stripJobIdSuffix` 適用)
  - `tests/state/job-slug.test.ts` (新テスト追加)
  - `tests/register-branch-schema.test.ts` (新テスト追加)

- **Breaking changes**: branch 名フォーマットが変わるため、既存の `feat/<slug>` 形式で作られた branch を持つ job の finish は影響を受けない（suffix なし = stripJobIdSuffix が no-op）

## Acceptance Criteria

- [ ] 新規 run で生成される branch 名が `feat/<slug>-<8char>` 形式になっている
- [ ] 同じ slug で 2 回 run しても別 branch が作られる
- [ ] `specrunner finish --pr <num>` で新フォーマットの branch から正しく slug を導出できる
- [ ] `register_branch` handler が新フォーマットから正しく slug を導出できる
- [ ] delta spec が存在し既存 spec の記述と整合する
- [ ] `bun run typecheck && bun run test` が green

## Out of Scope

- 過去 run の branch を自動 cleanup する機能
- jobId suffix の長さを設定可能にする（8 文字固定）
- `change-folder-viewer` の Web UI 側実装変更（Server Actions のロジックのみ）
