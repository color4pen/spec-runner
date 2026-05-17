# Design: implementer-self-commit-tolerance

## Problem

`executor.ts:commitAndPush()` は `git diff --cached --quiet` が exit 0 (staged 0) のとき一律 halt する。agent が step 中に自主 commit すると working tree clean + HEAD 進行中の状態になり、staged 0 で halt 判定されてしまう。

## Solution

### 主対策: executor HEAD 比較判定

step 開始時に `git rev-parse HEAD` を保存し、`commitAndPush` 内で staged 0 のときに HEAD が進んでいるかを追加判定する。

```
git add -A
git diff --cached --quiet
  ├─ staged あり → 従来通り commit + push
  └─ staged 0
       ├─ HEAD 進みあり → push のみ (agent 自主 commit)
       └─ HEAD 進みなし
            ├─ requiresCommit: true → halt (noCommitDetectedError)
            └─ requiresCommit: false → silent skip
```

HEAD 比較は `requiresCommit: true` の step にのみ適用。`requiresCommit: false` は HEAD 進みの有無に関わらず silent skip (既存挙動)。

### 副対策: prompt commit-discipline fragment

`PIPELINE_RULES` と同じ template literal embed パターンで、commit 禁止規律を 1 定数に集約し `requiresCommit: true` の全 prompt に inject。

### スコープ

- **対象**: `src/core/step/executor.ts` の `commitAndPush` (local runtime 限定)
- **対象外**: `src/adapter/managed-agent/agent-runner.ts` (既に HEAD SHA 比較で実装済み)
- **対象外**: tool restriction (adapter level で git commit を block)

## Key Decisions

1. **HEAD 比較の実行位置**: `runAgentStep` 冒頭で取得、`commitAndPush` にパラメータとして渡す
2. **push-only 経路**: agent 自主 commit 時は `git commit` スキップ、`git push` のみ実行。既存 retry ロジック流用
3. **event**: push-only でも `commit:push` event を emit (既存 event 監視との互換)
4. **ログ**: agent 自主 commit 検出時に stderr へ 1 行メッセージ出力。state schema 変更なし
5. **prompt fragment**: `src/prompts/commit-discipline.ts` に `COMMIT_DISCIPLINE_RULE` を新規定義。4 ファイル (implementer / spec-fixer / code-fixer / build-fixer) に embed。delta-spec-fixer は spec-fixer-system.ts の共有 import 経由でカバー

## File Changes

| File | Change |
|------|--------|
| `src/core/step/executor.ts` | HEAD 取得 + `commitAndPush` 判定ロジック拡張 + push-only 経路 + ログ |
| `src/prompts/commit-discipline.ts` | 新規: `COMMIT_DISCIPLINE_RULE` 定数 |
| `src/prompts/implementer-system.ts` | embed `${COMMIT_DISCIPLINE_RULE}` |
| `src/prompts/spec-fixer-system.ts` | embed `${COMMIT_DISCIPLINE_RULE}` |
| `src/prompts/code-fixer-system.ts` | embed `${COMMIT_DISCIPLINE_RULE}` |
| `src/prompts/build-fixer-system.ts` | embed `${COMMIT_DISCIPLINE_RULE}` |
| `tests/unit/step/executor.commit.test.ts` | 新規: commitAndPush HEAD 比較の unit test |
| `tests/pipeline-integration.test.ts` | 追加: agent 自主 commit scenario |
| `specrunner/specs/step-execution-architecture/spec.md` | HEAD 比較判定を明文化 |
