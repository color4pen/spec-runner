# queryOneShot を agent-runner と分離した独立関数として導入する

**Date**: 2026-05-18
**Status**: accepted

## Context

`reviewer.ts` の `runReview()` は query() 呼び出しの boilerplate (config 解決 → maxTurns option 構築 → AbortController + timeout → for await loop → result 判定) を ~55 行のインラインコードで手書きしていた。同じパターンは `agent-runner.ts` の `ClaudeCodeRunner.run()` にも存在し、今後 watch のリスク評価・request create generator 等の one-shot コマンドが増えるたびに重複が拡大する見込みだった。

この重複を解消するにあたり、2 つのアーキテクチャ選択肢があった:

1. **統合**: `ClaudeCodeRunner` を汎化し、one-shot 呼び出しにも使えるよう拡張する
2. **分離**: pipeline step lifecycle 用の `ClaudeCodeRunner` とは独立した `queryOneShot` 関数を新設する

## Decision

**`queryOneShot` を `src/adapter/claude-code/query-one-shot.ts` に独立関数として新設し、`ClaudeCodeRunner` とは統合しない。**

`queryOneShot` の責務:
- config 解決 (`getStepExecutionConfig` 経由)
- AbortController + timeout 連動
- for await loop で SDK result 取得
- success 判定 + `QueryOneShotResult` (raw text 中心) 返却

result は **raw text 中心**とし、構造化 parse は caller の責務とする。理由: review / create / watch で parse 形式が異なるため、汎用基盤に use case 固有の parse を持ち込まない。

`ClaudeCodeRunner` と `queryOneShot` 双方で重複する ~15 行 (AbortController 構築、for await loop) は現時点では **inline で重複を許容**する。Rule of Three — 3 件目の one-shot consumer が生まれた時点で共通 helper 抽出を検討する。

## Alternatives Considered

### 統合: ClaudeCodeRunner を汎化する

`ClaudeCodeRunner.run()` は `AgentRunContext` (step / state / branch / slug / requestContent / emit 等) を必要とする。one-shot コマンドにはこれらが存在しない。統合すると:

- `AgentRunContext` に optional field が大量に追加され、port の型安全性が劣化する
- pipeline 固有ロジック (resultFilePath 読み出し、session resume、modelUsage 抽出、commit lifecycle) が one-shot パスに混入するリスクがある
- `agent-runner-port` spec authority の責務が拡散する

コンテキスト shape が根本的に異なるため統合は採用しなかった。

### 共通 helper を先行抽出する

`query-helpers.ts` 等に AbortController / for await の共通コードを先行抽出することも検討した。現状で重複するのは ~15 行 × 2 箇所のみ。抽出コスト (新ファイル + 間接参照) がメリットを上回らないため、Rule of Three が成立するまで延期する。

## Consequences

**正の影響:**
- `reviewer.ts` の boilerplate が ~55 行から ~15 行に削減された
- 今後の one-shot コマンド (watch, request create generator 等) は `queryOneShot` を再利用でき、重複が抑制される
- `agent-runner-port` spec authority の責務が pipeline step lifecycle に限定され、境界が明確になった

**負の影響 / トレードオフ:**
- `ClaudeCodeRunner` と `queryOneShot` の双方に AbortController / for await の類似コードが存在する (~15 行の重複)。3 件目の consumer が生まれた際に整理が必要
- `QueryFn` の型が SDK 実際のシグネチャとずれており `as unknown as QueryFn` キャストが発生している (既存 `agent-runner.ts` と同一トレードオフ)。将来の型整合リファクタリングで対処する

**影響ファイル:**
- `src/adapter/claude-code/query-one-shot.ts` (NEW)
- `src/core/request/reviewer.ts` (MODIFIED — queryOneShot 経由に置き換え)
- `src/errors.ts` (MODIFIED — QUERY_ONE_SHOT_FAILED / QUERY_ONE_SHOT_TIMEOUT 追加)
- `specrunner/specs/one-shot-query/spec.md` (spec-merge 後に新規作成)
