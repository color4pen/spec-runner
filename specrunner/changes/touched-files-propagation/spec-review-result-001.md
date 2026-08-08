# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/touched-files-propagation/request.md`
- `specrunner/changes/touched-files-propagation/design.md`
- `specrunner/changes/touched-files-propagation/tasks.md`
- `specrunner/changes/touched-files-propagation/spec.md`
- `src/adapter/claude-code/agent-runner.ts`（抜粋）
- `src/adapter/claude-code/message-types.ts`
- `src/adapter/shared/artifact-bundle.ts`
- `src/state/schema/types.ts`
- `src/state/schema/operations.ts`
- `src/store/job-state-projection.ts`（`stateToStateJson`、`composeSplitLayoutFromContent`）
- `src/core/step/commit-orchestrator.ts`
- `src/core/step/executor.ts`（`runAgentStep` 戻り値）
- `src/core/port/agent-runner.ts`（`AgentRunResult`）
- `src/adapter/codex/agent-runner.ts`（prompt 組成部）
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
- `node_modules/@anthropic-ai/claude-agent-sdk/node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts`
- `src/util/paths.ts`（`changesDirRel`、`changeFolderPath`）

### 検証した項目

**D1: `type: "assistant"` message の完成 tool_use block から抽出**
- SDK 型定義で確認。`SDKAssistantMessage = { type: 'assistant'; message: BetaMessage; ... }`、`BetaMessage.content: Array<BetaContentBlock>`、`BetaContentBlock` には `BetaToolUseBlock = { id, name, input: unknown, type: 'tool_use' }` が含まれる。
- `SDKPartialAssistantMessage = { type: 'stream_event'; event: BetaRawMessageStreamEvent }` — `content_block_start` の `input` は部分的（`BetaInputJSONDelta`）。
- D1 の前提は型定義レベルで裏付けられる。

**D2: state top-level フィールドの round-trip**
- `stateToStateJson` は `history`、`steps`、slug mode では `worktreePath`/`pid`/`session`/`request.slug`/`request.path` を除去する。`touchedFiles` は除去リストにない。
- `composeSplitLayoutFromContent` は `{ ...validated, history: foldResult.history, steps: composedSteps }` で合成し、`validated` に含まれる `touchedFiles` が保持される。
- `validateJobState` は末尾で `return raw as JobState` — 未知フィールドを素通しする。T-01 で `touchedFiles` を型に追加すれば検証ブロックも追加できる。

**D3: 伝搬経路の正確性**
- `runMainWorkTurn` → `runQuery` の for-await ループが main work turn。
- `runFollowUpQueryWithRetry`（report_result retry / postWorkPrompts）は `runQuery` を経由せず独立したストリームを持つ。`runQuery` 内での記録は D6「main work turn のみ」を構造的に満たす。
- `commitSuccess` が `store.persist` の前に状態を更新する単一の書き込み点である。`biteEvidence`/`synthesizedCommits` と同型の適用パターンが確認できる。

**D4: 正規化・除外ロジックの境界**
- `createWorkspaceToolGuard` の `isInside` 判定（`relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))`）を確認。D4 の worktree 外除外ロジックと一致する。
- `changesDirRel()` は `"specrunner/changes"`（末尾スラッシュなし）を返す。

**D5: 共有層配置**
- `src/adapter/shared/artifact-bundle.ts` が同型の純関数パターン（fail-open、`Buffer.byteLength` によるサイズ計算、空時に `""` 返却）を実証している。
- 両 adapter（claude-code:462-470、codex:334-341）が `artifactSection` を `baseFullPrompt` に挿入するパターンが共通しており、`touchedFilesSection` の同位置への挿入は自然に実装できる。

**D6: 記録境界**
- `retryWithBackoff` は `runMainWorkTurn` のみをラップし、report_result retry/postWork/outputRepair は外側で実施される。
- transient retry で `runQuery` が複数回呼ばれても、同一 accumulator に蓄積するので重複排除が効く。

**セキュリティ観点**
- Path traversal: `path.resolve + path.relative` の後に `startsWith("..") || isAbsolute` を除外 → worktree 外パスを記録しない。
- Prompt injection: 注入するのは agent 自身が発行したファイルパスのみ。16KB 上限と 100 件 cap でサイズを抑制。
- シンボリックリンク: パスレベル正規化のみのため symlink 経由の脱出は検出されないが、記録値はファイル読み取りに使われず「ヒント文字列」として注入されるだけで実害なし。

**スキーマ検証パターン**
- `reviewerStatuses`（配列）、`biteEvidence`（配列）の lightweight validation ブロックを確認。`touchedFiles`（`Record<string, string[]>`）は値がオブジェクトかつ各 value が `string[]` であることを確認するブロックを同スタイルで追加できる。

**既存 `buildMessage` テストへの影響**
- injection は adapter 層（`agent-runner.ts`）で行い、`core/step/` の `buildMessage` は変更しないため既存テストへの影響なし（T-08 に明記）。

---

## 検証できなかった項目

**SDK ランタイム実出力の検証**
- `SDKAssistantMessage`（`type: "assistant"`）が実際の streaming セッションで毎ターン発行されることを型定義以上に実測確認していない。型定義では確認済みだが、SDK のバージョンによって挙動が変わる可能性は排除できない。

**並列 reviewer round での副作用**
- D6 で「並列 reviewer round member（custom reviewer、read-only）は `commitRound` 経路で記録対象外」とされる。`commitRound` コードを詳細に読んでいないが、`commitSuccess` を経由しない限り state.touchedFiles を書き込まないという設計は構造的に正しい。

---

## Findings 詳細

### F-01: `changesDirRel()` のプレフィックスチェックに trailing slash が必要

**重要度**: low  
**種別**: fixable  
**対象ファイル**: `src/adapter/claude-code/touched-files-recorder.ts`（新規）

`changesDirRel()` は `"specrunner/changes"` を返す（末尾スラッシュなし）。D4 / T-03 の「配下のパスを除外」実装で、`relPath.startsWith(changesDirRel())` だけでは `specrunner/changes-archive/foo.ts` など `changes` で始まるが配下ではないパスを誤除外する可能性がある。

実装は `relPath.startsWith(changesDirRel() + "/")` または `relPath === changesDirRel() || relPath.startsWith(changesDirRel() + "/")` とする必要がある。仕様の「配下」という言葉は正しいが、実装例で明示されていない。

---

### F-02: transient retry 時の accumulator 蓄積が仕様に明記されていない

**重要度**: low  
**種別**: fixable  
**対象ファイル**: `specrunner/changes/touched-files-propagation/design.md`

`retryWithBackoff` が `runMainWorkTurn`（したがって `runQuery`）を N 回呼ぶ場合、同一 accumulator に N 回分のメッセージが蓄積される。設計 D6 は「main work turn の for-await ループ」と記述するが、transient retry 経路でのセマンティクス（「全 retry attempt 分を蓄積する」）を明示していない。

重複排除が働くため実害はなく、挙動としては正しいが、設計文書として gap がある。design.md に 1 行補足するか tasks.md のコメントとして明記することで解消できる。

None of the above findings block implementation. The spec, design, and tasks are otherwise internally consistent and accurately reflect the codebase structure.
