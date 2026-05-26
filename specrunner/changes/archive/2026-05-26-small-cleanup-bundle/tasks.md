## Phase 1: module-boundary spec の grep pattern 更新

### Task 1: delta spec — module-boundary

- [x] `specrunner/changes/small-cleanup-bundle/specs/module-boundary/spec.md` (delta spec) は作成済み
- [x] baseline `specrunner/specs/module-boundary/spec.md` L42 の grep alternation pattern を変更:
  - before: `grep -rE "from ['\"]@anthropic-ai/(sdk|claude-code)" src/core/`
  - after: `grep -rE "from ['\"]@anthropic-ai/(sdk|claude-agent-sdk)" src/core/`
- [x] L39 の prose「SHALL NOT import `@anthropic-ai/sdk` or `@anthropic-ai/claude-code` directly」を更新:
  - after: 「SHALL NOT import `@anthropic-ai/sdk` or `@anthropic-ai/claude-agent-sdk` directly」

**Dep**: なし

## Phase 2: gitignore.ts の Exception 行 dedup

### Task 2: ensureDotSpecrunnerGitignore の Step 2 dedup 拡張

- [x] `src/util/gitignore.ts` の Step 2 block に `!.specrunner/config.json` の dedup を追加:
  - 既存の `globSeen` パターンと同じ方式で `exceptionSeen` フラグを追加
  - `EXCEPTION_LINE` の重複を filter（first occurrence を keep）

**Dep**: なし

### Task 3: Exception 行 dedup の regression test 追加

- [x] `tests/unit/util/gitignore.test.ts` に TC-GI-12 を追加:
  - 「deduplicates multiple `!.specrunner/config.json` lines」
  - 入力: `!.specrunner/config.json` が複数行存在する `.gitignore`
  - 期待: 実行後に `!.specrunner/config.json` が 1 行のみ

**Dep**: Task 2

## Phase 3: 最終検証

### Task 4: 全体検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が green (2 pre-existing failures unrelated to this change)
