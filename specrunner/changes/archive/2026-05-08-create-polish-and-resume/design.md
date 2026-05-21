# Design: create-polish-and-resume

## Context

R2（interactive-create-dialog）で確立した構造:

- `executeCreateDialog()` — 4-phase REPL（initSession → dialogLoop → detectCompletion → finalize）
- `createPromptGenerator()` — AsyncGenerator で SDK にユーザーメッセージを供給
- `DraftState` — `{ sessionId, slug, type, description, createdAt, updatedAt }` を `draft-store.ts` で永続化
- `QueryOptions` — `{ resume?: string, sessionId?: string }` で SDK session 制御
- `buildDialogSystemPrompt()` / `buildDialogInitialMessage()` — 対話用プロンプト

本変更は上記の基盤に `--resume`、slug 対話生成、Ctrl+C ハンドリング、`--run` 対応、1-shot クリーンアップを追加する。

## Goals

- 中断した対話セッションを 2 層（hot resume / cold start）で復帰させる
- slug を LLM との対話で導出するプロトコルを確立する
- デッドコード化した 1-shot LLM パスを除去する
- Ctrl+C で draft を保存する signal handler を追加する

## Non-Goals

- ManagedRuntime での対話サポート
- 複数 draft の管理 UI（`--list` 等）
- 対話履歴の永続的ログ保存

## Decisions

### D1: `--resume` の 2 層復帰モデル

**問題**: 中断した対話を再開する方法が 2 種類ある。SDK session が生きていれば会話履歴ごと復帰できる（hot）が、session が失効している場合は draft content だけで再構成する必要がある（cold）。

**方針**: `DialogParams` に `resume?: { content: string; state: DraftState }` を追加。`executeCreateDialog()` 内で以下の分岐を行う:

```typescript
// Hot resume: SDK session が有効なら resume オプションで復帰
if (resume && resume.state.sessionId) {
  try {
    query = runtime.queryInteractive(generator, {
      resume: resume.state.sessionId,
      systemPrompt,
      cwd,
      ...
    });
    // draft 内容を stderr に再表示してからユーザー入力を待つ
  } catch {
    // Cold start にフォールバック
  }
}

// Cold start: 新規 session + draft content を初回 prompt に注入
if (!query) {
  const coldGenerator = createPromptGenerator({
    initialMessage: buildResumeInitialMessage(resume.content, resume.state),
    ...
  });
  query = runtime.queryInteractive(coldGenerator, { systemPrompt, cwd, ... });
  process.stderr.write("セッションを復旧できなかったため新規開始します\n");
}
```

**理由**: hot resume は SDK の `resume` オプションをそのまま活用するだけで実装コストが低い。cold start は draft-store に既存の content が残っているため、それを prompt に含めるだけで十分な復帰品質が得られる。try-catch で自動フォールバックすることで、ユーザーに復帰方式の選択を強いない。

### D2: slug 対話生成のマーカープロトコル

**問題**: LLM が slug を提案し、CLI が検出・確認するプロトコルが必要。`<!-- FINAL_DRAFT -->` と同様のマーカー方式を採用する。

**方針**:

```
マーカー: <!-- SLUG_PROPOSAL: <slug> -->
検出正規表現: /<!-- SLUG_PROPOSAL:\s*(\S+)\s*-->/
複数マーカー: 同一応答に複数ある場合は最後を採用
```

dialogLoop 内で slug 未確定（`params.slug === undefined`）の場合、各 assistant ターン完了後にマーカーを検出する。検出した slug を `slugify()` でバリデーション（kebab-case, 50 文字, 衝突チェック）し、通過すればユーザーに確認する:

```
slug: my-feature-name で良いですか？ [y/N]
```

`y` で slug 確定。`n` で LLM に別案を要求（ユーザー入力がそのまま次の prompt になる）。

**フォールバック**: 3 assistant ターンを経過してもマーカーが検出されない場合、`slugify(description)` で自動生成し stderr に通知する。

**理由**: `FINAL_DRAFT` マーカーと同じ構造化出力パターンを再利用する。LLM のレスポンスに埋め込まれた HTML コメントなので、ユーザーへの表示時にもノイズにならない。3 ターンのフォールバックは、LLM が指示を見落とした場合のセーフティネット。

### D3: slug 未確定中の状態管理

**問題**: slug 確定前に draft を永続化すると、ディレクトリ名が決まらない（draft パスは `specrunner/requests/draft/<slug>/`）。

**方針**:
- `DialogParams.slug` を `slug?: string` に変更
- slug 未確定の間は `saveDraft()` を呼ばない
- slug 確定前の Ctrl+C では draft ロスを許容（known limitation）
- slug 確定後は従来通り FINAL_DRAFT 検出時に draft を保存
- `buildDialogInitialMessage()` の slug パラメータも optional に。未指定時は slug 行を省略

**理由**: slug がディレクトリ名に直結しているため、未確定状態での永続化は構造的に不可能。slug 確定前の対話は通常 1-2 ターンなので、ロスの影響は限定的。

### D4: `executeCreate()` のファサード化

**問題**: `executeCreate()` 内の 1-shot LLM パス（step c-g: context 収集 → prompt 生成 → LLM query → extract）は、対話モードがデフォルトになった今デッドコード。

**方針**:
- `extractRequestContent()` を削除（本体 + export）
- `buildCreateSystemPrompt()` / `buildCreateUserMessage()` を削除（`src/prompts/create-system.ts` ファイルごと削除）
- `executeCreate()` は `noLlm` 分岐のみ残し、else は `executeCreateDialog()` に委譲
- `src/cli/create.ts` の `runCreate()` は常に `executeCreate()` を呼ぶ（ルーティングは `executeCreate()` 内部）

```typescript
// create.ts (after cleanup)
export async function executeCreate(params: CreateParams): Promise<number> {
  if (params.noLlm) {
    // scaffold template path — existing logic
    ...
  } else {
    // delegate to interactive dialog
    return executeCreateDialog({ ... });
  }
}
```

**理由**: `executeCreate()` をファサードとして残すことで、CLI 側のインターフェース（`runCreate()` → `executeCreate()`）を維持しつつ内部実装を整理できる。`--no-llm` パスは対話不要のため `create.ts` に残す。

### D5: Ctrl+C ハンドリング

**問題**: 現状 `exit`/`quit` コマンドでは draft が保存されるが、Ctrl+C（SIGINT）では即座にプロセスが終了し draft がロストする。

**方針**:
- `executeCreateDialog()` 開始時に `process.on('SIGINT', handler)` を登録
- handler: slug 確定済みなら `saveDraft()` → `process.exit(130)`。未確定なら即 `process.exit(130)`
- readline の `close` イベントも併用（readline が active でない瞬間の SIGINT に対応）
- finalize 完了後に handler を解除（`process.removeListener`）

```typescript
const sigintHandler = async () => {
  if (currentSlug && dialogState.latestDraftContent) {
    await saveDraft(cwd, currentSlug, dialogState.latestDraftContent, draftState);
    process.stderr.write(`\nDraft saved to specrunner/requests/draft/${currentSlug}/\n`);
  }
  process.exit(130);
};
process.on('SIGINT', sigintHandler);
```

**理由**: SIGINT は readline とは独立したシグナル。readline が `question()` でブロックしていない瞬間（SDK がストリーミング中など）の Ctrl+C に対応するには `process.on('SIGINT')` が必要。exit code 130 は SIGINT の慣例。

### D6: `--run` の対話版対応

**問題**: `--run` フラグが対話モードで未対応（`src/cli/create.ts` に TODO コメントが残っている）。

**方針**:
- `DialogParams` に `run?: boolean` を追加
- finalize 成功後（return 0 の前）に確認ダイアログ: `specrunner run を実行しますか？ [y/N]`
- `--run` フラグが付いている場合は確認なしで `runRunCore()` を実行
- `runRunCore()` は `create.ts` から import（既存）

**理由**: finalize 後の確認は対話モードの UX に合致する。`--run` はスクリプト用途で確認スキップが必要。

## Risks

### R1: hot resume の SDK 互換性

SDK の `resume` オプションが session 失効時にどの例外を投げるかは SDK バージョンに依存する。try-catch で全例外を捕捉し cold start にフォールバックすることで、SDK の挙動変更に対して頑健にする。

### R2: slug 提案の LLM 従順性

LLM が `SLUG_PROPOSAL` マーカーを出力しない可能性がある。3 ターンのフォールバックタイマーで対処するが、system prompt の指示が明確であれば 1 ターン目で提案されることがほとんど。

### R3: SIGINT handler の非同期処理

`process.on('SIGINT')` の handler 内で `saveDraft()`（async）を呼ぶ。Node.js は SIGINT handler 内での非同期処理を完了を保証しないが、`fs.writeFile` は通常ミリ秒単位で完了するため実用上問題ない。
