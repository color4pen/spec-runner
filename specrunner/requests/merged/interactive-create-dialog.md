# specrunner create を対話型 REPL に再設計する

## Meta

- **type**: spec-change
- **slug**: interactive-create-dialog

## 背景

PR #124 の 1-shot create は対話なしで request.md を生成するため、要件の練り上げができない。LLM がコードを読まずに推測で書き、品質が低い。

R1（interactive-query-foundation）で `query()` が generator prompt と `continue` / `resume` をサポートした前提で、create コマンドの本体を対話型 REPL に再設計する。

SDK の `query()` は `prompt: AsyncIterable<SDKUserMessage>` を受け取れる。CLI が `readline` でユーザー入力を読み、generator で SDK に渡し、SDK の応答を `stream_event` からストリーミング表示する。1 つの `query()` 呼び出し内で REPL 全体が完結する。

SDK は UI を一切提供しない。ストリーミング表示、ツール実行状況、完了確認の UI は全て自前で実装する必要がある。

## 要件

### 1. 対話コマンドの 4 phase 構造

1. `src/core/command/create-dialog.ts` に対話型 create の本体を実装する。CommandRunner は継承しない。以下の 4 phase で構成する:

- **initSession**: DynamicContext 収集 + request パターン収集 + system prompt 組み立て + 初回 query 呼び出し
- **dialogLoop**: ユーザー入力 → SDK 応答のストリーミング表示のループ。generator prompt 経由
- **detectCompletion**: LLM が最終版 request.md を提示したかの判定
- **finalize**: ファイル書き出し + バリデーション + stdout 出力

2. `src/cli/create.ts` のファサードを更新し、`--no-llm` 以外はデフォルトで対話モードを使う。既存の 1-shot パスは `--no-llm` のみに残す

### 2. REPL の UI 層

3. `readline/promises` でユーザー入力を受け取る。プロンプトは `> ` とする

4. SDK の応答は `includePartialMessages: true` で受け取り、`stream_event` の `content_block_delta` → `text_delta` をリアルタイムに `process.stdout.write()` する

5. ツール実行（Read / Grep / Glob）の状況を簡潔に表示する。`SDKToolUseSummaryMessage` または関連メッセージから tool 名とステータスを抽出する

6. LLM の応答が完了したら改行 + プロンプトを表示してユーザー入力を待つ

### 3. 出口戦略

7. system prompt に「request.md の全セクション（Meta / 背景 / 要件 / スコープ外 / 受け入れ基準）が十分に埋まったと判断したら、最終版を `<!-- FINAL_DRAFT -->` マーカーに続けて提示し、ユーザーに確認を求めよ」と指示する

8. LLM の応答に `<!-- FINAL_DRAFT -->` マーカーを検出したら、CLI が「この内容で request.md を書き出しますか？ [y/N]」と確認する

9. `y` で finalize（ファイル書き出し + バリデーション）。`n` で対話継続。ユーザーが修正要望を入力して続行できる

10. ユーザーが `exit` または `quit` を入力したら、現在の draft を保存して終了する

### 4. 対話用 system prompt

11. `src/prompts/create-dialog.ts` に対話用の system prompt を実装する。以下を含める:
    - あなたは spec-runner の request.md 作成アシスタントである
    - ユーザーと対話しながら要件を練り上げる
    - **コードベースを Read / Grep / Glob で積極的に調査し、推測で書かない**
    - request.md の構造ルール（既存の create-system.ts から流用）
    - 完了時のマーカープロトコル（`<!-- FINAL_DRAFT -->`）
    - Meta の type と slug はユーザー指定の値を使う

12. 初回 user message に以下を注入する:
    - ユーザーの description
    - type / slug
    - DynamicContext（specsList / changesList）
    - request パターン（collectRequestPatterns から取得）

### 5. draft 永続化

13. `src/state/draft-store.ts` を新設する。JobState とは別の軽量なストア:

```typescript
interface DraftState {
  sessionId: string;
  slug: string;
  type: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

function saveDraft(slug: string, content: string, state: DraftState): Promise<void>
function loadDraft(slug: string): Promise<{ content: string; state: DraftState } | null>
function deleteDraft(slug: string): Promise<void>
```

14. draft は `specrunner/requests/draft/<slug>/` に保存する。`request.md`（最新の内容）と `draft-state.json`（メタデータ）の 2 ファイル

15. LLM が `<!-- FINAL_DRAFT -->` を提示するたびに draft を更新する。finalize 成功時に draft を削除し `active/` に移動する

### 6. テスト

16. 4 phase 構造の各 phase のユニットテスト（query を mock）
17. `<!-- FINAL_DRAFT -->` マーカー検出テスト
18. draft-store の saveDraft / loadDraft / deleteDraft テスト
19. `--no-llm` が引き続き動作するテスト
20. ストリーミング表示の stream_event パースのテスト

## スコープ外

- slug の対話生成（R3 で実装。本 request では `--slug` 指定または既存の slugify を使用）
- `--resume` による中断セッションの再開（R3 で実装）
- `--run` フラグの対話版対応（finalize 後に手動で `specrunner run` を実行）
- Ctrl+C のシグナルハンドリング（readline のデフォルト挙動に任せる。draft は `exit` 入力で保存）

## 受け入れ基準

- [ ] `specrunner create "description" --type new-feature --slug my-feature` で対話 REPL が起動する
- [ ] ユーザーが対話しながら要件を練り上げられる
- [ ] LLM がコードベースを Read / Grep / Glob で調査する
- [ ] LLM の応答がストリーミングでリアルタイム表示される
- [ ] `<!-- FINAL_DRAFT -->` 検出後に書き出し確認が表示される
- [ ] `y` で `specrunner/requests/active/<slug>/request.md` に書き出される
- [ ] 書き出された request.md が `parseRequestMdContent()` のバリデーションを通る
- [ ] `exit` 入力で draft が保存されて終了する
- [ ] `--no-llm` が引き続き scaffold テンプレートを出力する
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **CommandRunner を継承しない**: pipeline の deterministic フローと対話の non-deterministic フローは構造が根本的に異なる
- **SDK の generator prompt で REPL を実現**: `query(prompt: AsyncIterable<SDKUserMessage>)` に readline の generator を渡す。1 つの query() 内でセッション全体が完結
- **設計原理との整合**: session は対話の手段であり、state の唯一の置き場ではない。draft ファイルに永続化することで「知識はファイルに」を維持
- **ProgressDisplay を流用しない**: pipeline の event vocabulary と対話の phase は一致しない。対話用の UI は独自実装
