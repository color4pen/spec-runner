# Tasks: abolish-spec-merge

## T-01: orchestrator から spec-merge 呼び出しを除去

- [x] `src/core/finish/orchestrator.ts` から `import { mergeSpecsForChange } from "./spec-merge.js"` を削除
- [x] `runPhase1Archive` 内の `mergeSpecsForChange` 呼び出し（L272-274: `const mergeResult = ...` 〜 `if (!mergeResult.skipped) stdoutWrite(mergeResult.message)` の 3 行）を削除

**Acceptance Criteria**:
- orchestrator.ts に `spec-merge` / `mergeSpecsForChange` の参照が残らない
- Phase 1 の流れが usage derive → archive → commit の順で維持される

## T-02: spec-merge.ts / baseline-headers.ts を削除

- [x] `src/core/finish/spec-merge.ts` を `git rm` で削除
- [x] `src/core/finish/baseline-headers.ts` を `git rm` で削除

**Acceptance Criteria**:
- 両ファイルが `src/` 内に存在しない
- `bun run typecheck` が pass する（他モジュールからの import が残っていないことの確認）

## T-03: spec-merge テストを削除

- [x] `tests/finish-spec-merge.test.ts` を `git rm` で削除
- [x] `tests/unit/core/finish/spec-merge-baseline-check.test.ts` を `git rm` で削除

**Acceptance Criteria**:
- 両テストファイルが存在しない
- `bun run test` が pass する

## T-04: orchestrator テスト・request-review テストを更新

- [x] `tests/finish-orchestrator.test.ts` 内の `spec-merge can parse type` コメントを更新（例: `request.md content for orchestrator tests`）。orchestrator test が `mergeSpecsForChange` の stub を含む場合は削除
- [x] `tests/unit/command/request-review.test.ts` の TC-RR-014 テスト：`spec-merge` 文字列アサーションを削除し、更新後の prompt に合わせたアサーションに差し替え

**Acceptance Criteria**:
- テストファイル内に `spec-merge` / `mergeSpecsForChange` の参照が残らない
- `bun run test` が pass する

## T-05: prompt の spec-merge rationale を更新

- [x] `src/prompts/spec-fixer-system.ts`: `**Critical（spec-merge が parse に依存するフォーマット）:**` → `**Critical（delta-spec-validation が parse に依存するフォーマット）:**`
- [x] `src/prompts/code-fixer-system.ts`: 同上の差し替え
- [x] `src/prompts/request-review-system.ts`: `authority specs are auto-updated by \`specrunner finish\` spec-merge from the delta; the baseline is read-only within the PR. Write Requirements in the delta spec and verify baseline state in AC via grep assertions rather than direct edits.` → baseline は finish で自動更新されない旨に更新。delta spec で記述し test で振る舞いを検証する方針に差し替え

**Acceptance Criteria**:
- 3 ファイル内に `spec-merge` の文字列が残らない
- フォーマット規約自体（`## Removed` リスト形式、`### Requirement:` header 一致等）は維持される
- `bun run typecheck` が pass する

## T-06: rules.ts の spec authority lifecycle を更新

- [x] `src/prompts/rules.ts` L68: `authority spec の更新は \`specrunner finish\` 時に mergeSpecsForChange が自動実行する。PR 内で baseline を更新する経路は存在しない` → `baseline は pipeline / finish のいずれでも更新されない。振る舞いの authority は test suite が担う。PR 内で baseline を直接編集する経路は存在しない`

**Acceptance Criteria**:
- rules.ts 内に `mergeSpecsForChange` / `spec-merge` の参照が残らない

## T-07: commit-archive.ts / no-authority-spec-direct-edit.ts のコメント更新

- [x] `src/core/finish/commit-archive.ts` L4: `Commits the staged changes produced by mergeSpecsForChange + archiveChangeFolder` → `Commits the staged changes produced by archiveChangeFolder`
- [x] `src/core/finish/commit-archive.ts` L20: `Commit staged changes (spec-merge + archive) as a single archive commit.` → `Commit staged changes (archive) as a single archive commit.`
- [x] `src/core/spec/rules/no-authority-spec-direct-edit.ts` L17: `updated via \`specrunner finish\` (spec-merge). Direct edits by agents must` → `updated via \`specrunner finish\`. Direct edits by agents must`

**Acceptance Criteria**:
- 両ファイル内に `spec-merge` / `mergeSpecsForChange` の参照が残らない

## T-08: 全体検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が green（B-1〜B-10 / §3 DSM closure を含む）
- [x] `src/` 内に `spec-merge` / `mergeSpecsForChange` / `baseline-headers` への参照が残っていないことを grep で確認

**Acceptance Criteria**:
- typecheck・test が green
- `grep -r "spec-merge\|mergeSpecsForChange\|baseline-headers" src/` の結果が空
