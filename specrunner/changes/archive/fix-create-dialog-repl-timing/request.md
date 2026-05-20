# create 対話 REPL を continue: true ループに切り替える

## Meta

- **type**: bug-fix
- **slug**: fix-create-dialog-repl-timing

## 背景

PR #129-#130 で実装した `specrunner create` の対話 REPL が正常に動作しない。

SDK の `query()` に `AsyncIterable<SDKUserMessage>` generator を渡す方式では、SDK が generator から次のメッセージを pre-pull する。generator 内の `rl.question("> ")` が LLM の応答完了前に呼ばれるため、readline プロンプトと LLM のストリーミング出力が混在し、表示が壊れる。

### 再現手順

```
bun ./bin/specrunner.ts create "description" --type spec-change --slug test
```

### 症状

- `> ` プロンプトが LLM 応答の前に表示される
- ユーザー入力が複数回エコーされる
- LLM 応答がリアルタイムではなくまとめて表示される
- readline プロンプトが重複する

### 原因

SDK の `query({ prompt: AsyncIterable<SDKUserMessage> })` は generator を非同期に消費する。generator の `yield` 後に即座に次の `rl.question()` が呼ばれ、LLM が応答を生成している最中に readline がターミナルを制御しようとする。

### 修正方針

generator 方式を廃止し、`continue: true` で毎ターン独立した `query()` を呼ぶ方式に切り替える。

```typescript
// 初回
for await (const msg of runtime.query(initialMessage, { systemPrompt, ... })) {
  // ストリーミング表示
}
// LLM 応答完了後にユーザー入力を受け付ける
const input = await rl.question("> ");
// 2回目以降
for await (const msg of runtime.query(input, { continue: true, ... })) {
  // ストリーミング表示
}
```

この方式なら LLM 応答の完了と readline 入力が直列化され、表示の競合が起きない。

## 要件

### 1. dialog loop の書き換え

1. `src/core/command/create-dialog.ts` の `executeCreateDialog()` から `createPromptGenerator()` を使う generator 方式を廃止する

2. 代わりに while ループで毎ターン `runtime.query()` を呼ぶ。セッション管理は `session_id` を明示的に追跡する（`continue: true` の暗黙的な cwd ベースの session resolution には依存しない）:

```
a. 初回: runtime.query(initialUserText, { systemPrompt, includePartialMessages: true, ... })
b. for await で全メッセージを処理（ストリーミング表示 + FINAL_DRAFT 検出 + slug 検出）
c. result メッセージから session_id を取得して保持する
d. assistant メッセージ完了後に rl.question("> ") でユーザー入力を受け取る
e. exit/quit なら draft 保存して終了
f. 2回目以降: runtime.query(userInput, { resume: sessionId, includePartialMessages: true, ... })
   ※ systemPrompt は初回のみ。2回目以降は渡さない（セッション内で引き継がれる）
   ※ continue と resume は mutually exclusive（SDK 制約）。resume: sessionId で明示指定する
g. b-f を繰り返す
```

3. `RuntimeStrategy.query()` の signature は `prompt: string` のまま。`resume` は `QueryOptions` に既にある。`queryInteractive()` は本修正後に呼び出し元がなくなるため削除する。`SdkQueryFn` 型も合わせて削除する

4. while ループ化後も論理的な phase 境界を関数分割で維持する（processAssistantTurn / handleUserInput / finalize 等）

### 2. createPromptGenerator と queryInteractive の削除

5. `createPromptGenerator()` を削除する。`pendingAutoMessage` / `getPendingMessage` のシグナリング機構も不要になる

6. `LocalRuntime.queryInteractive()` と `SdkQueryFn` 型を削除する。本修正後に呼び出し元がなくなる dead code であり、YAGNI に基づき削除する。必要になった場合は `git log` から復元可能

7. slug collision 時の LLM フィードバックは、次のターンの `query()` に collision メッセージを prompt として渡すだけで実現できる

### 3. resume パスの修正

8. hot resume は `runtime.query("(セッション再開)", { resume: sessionId, ... })` で実現する。`continue: true` は使わない（SDK で `resume` と `continue` は mutually exclusive）

9. cold start は初回 query に `buildResumeInitialMessage()` の内容を prompt として渡す（通常の初回 query と同じフロー。session_id は新規取得）

### 4. テスト修正

10. `createPromptGenerator` のテスト（TC-CD-005〜TC-CD-007）を削除し、新しい dialog loop のテストに置き換える
11. `queryInteractive` のテスト（TC-LR-012 関連）を削除する
12. 既存の detectCompletion / detectSlugProposal / finalize のテストは変更不要（pure function）

## スコープ外

- ストリーミング表示の改善（改行・インデント等の細かい UX）
- `Query.streamInput()` を使った単一 query 内マルチターン方式（将来の改善候補として ADR に記録）

## 受け入れ基準

- [ ] `specrunner create "description" --type spec-change --slug test` で対話 REPL が正常動作する
- [ ] LLM の応答がリアルタイムにストリーミング表示される
- [ ] LLM 応答完了後に `> ` プロンプトが表示される（応答中には表示されない）
- [ ] `<!-- FINAL_DRAFT -->` 検出後の確認フローが動作する
- [ ] `exit` 入力で draft が保存される
- [ ] `--resume` の hot resume / cold start が動作する
- [ ] slug 提案・collision フィードバックが動作する
- [ ] `createPromptGenerator()` が削除されている
- [ ] `queryInteractive()` と `SdkQueryFn` が削除されている
- [ ] `continue` と `resume` が同時に渡されていない（SDK の mutually exclusive 制約）
- [ ] 初回 query の result から session_id を取得し、2 回目以降は `resume: sessionId` で明示指定している
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **generator 方式を廃止**: SDK の pre-pull 挙動と readline の競合が根本原因。毎ターン独立した `query()` を呼ぶ方式で直列化
- **`continue: true` ではなく `resume: sessionId` で明示指定**: `continue` は cwd ベースの暗黙的 session resolution に依存し、並走時に session 衝突のリスクがある。`session_id` を明示追跡する方が堅牢
- **`continue` と `resume` は mutually exclusive**: SDK の型定義で明記されている制約。hot resume では `resume: sessionId` 単体を使用
- **`queryInteractive()` と `SdkQueryFn` を削除**: 呼び出し元がなくなる dead code。YAGNI に基づき削除
- **systemPrompt は初回のみ**: 2 回目以降はセッション内で引き継がれるため渡さない


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/fix-create-dialog-repl-timing.md` by `merged-to-archive-consolidation`.
