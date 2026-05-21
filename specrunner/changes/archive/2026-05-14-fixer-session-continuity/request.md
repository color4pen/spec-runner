# Fixer ステップの session 継続によるループ収束率の改善

## Meta

- **type**: new-feature
- **slug**: fixer-session-continuity
- **base-branch**: main
- **date**: 2026-05-15
- **author**: color4pen

## 背景

現在のパイプラインでは spec-fixer / code-fixer / build-fixer の各ステップが iteration ごとに新規 session を作成している。そのため fixer は前回の自分の修正内容を直接知ることができず、findings ファイル経由でしか文脈を得られない。

この設計により:
- fixer が前回試みた修正を認識できず、同じアプローチを繰り返す
- reviewer → fixer → reviewer のループが収束しにくい
- iteration が増えるほどコストが無駄になる

3 adapter（Claude Agent SDK / Codex SDK / Managed Agent）はいずれも session 継続 API を持っている（SDK ソースコード調査済み）:
- Claude Agent SDK: `query({ options: { resume: sessionId } })` で会話履歴をディスク（`~/.claude/projects/`）から復元して継続
- Codex SDK: `codex.resumeThread(threadId)` で thread を継続。thread は `~/.codex/sessions/` に永続化
- Managed Agent: `client.beta.sessions.events.send(sessionId, { events: [...] })` で既存 session にメッセージ送信

## 要件

### AgentRunner port の拡張

1. `AgentRunContext` に `resumeSessionId?: string` を追加する
2. `resumeSessionId` が渡された場合、adapter は既存 session を継続する。渡されなければ従来通り新規 session を作成する

### StepExecutor の resumeSessionId 注入

3. **StepExecutor** が `state.steps[step.name]` の最後の StepRun から `sessionId` を取得し、`AgentRunContext.resumeSessionId` に設定する。Pipeline は変更しない（Pipeline は transition table 駆動に専念し、state の内部構造を解釈する責務を持たない）
4. fixer 以外のステップ（reviewer / design / implementer 等）では `resumeSessionId` を設定しない（常に新規 session）

### Adapter ごとの session 継続実装

5. Claude Agent SDK adapter: `resumeSessionId` がある場合、`query({ prompt, options: { resume: resumeSessionId } })` で session を継続する（1行追加）
6. Codex adapter: `resumeSessionId` がある場合、`codex.resumeThread(resumeSessionId)` で thread を継続し `thread.run(prompt)` で新しい turn を実行する。Codex の thread は `~/.codex/sessions/` に永続化されるが、spec-runner の worktree（`.git/specrunner-worktrees/`）とは独立したパスであり、worktree 隔離モデルとの干渉はない（thread は会話履歴のみを保持し、ファイル操作は workingDirectory で指定された worktree 内で行われる）
7. Managed Agent adapter: `resumeSessionId` がある場合、`createSession()` をスキップし `client.beta.sessions.events.send(sessionId, ...)` で既存 session にメッセージを送信する（5-10行変更）
8. DispatchingAgentRunner: ctx をそのまま delegate するため変更不要

### Session 失効へのフォールバック

9. session 継続に失敗した場合（session 期限切れ、adapter エラー等）、新規 session にフォールバックして実行する。エラーは warn ログに記録し、pipeline を停止しない

### Prompt の調整

10. session 継続時の fixer prompt から、前回 iteration で既に注入済みの情報（findings ファイルの全文再掲、project.md の再注入等）を省略する。継続メッセージは新しい reviewer の結果ファイルパスのみを渡す（session 内に前回の findings コンテキストが残っているため、差分情報だけで十分）
11. 初回 iteration（新規 session）の prompt は現行のまま変更しない
12. 初回/継続の判定は buildMessage 内で `state.steps[step.name]` の配列長を見て自己判定する。Step interface の署名（`buildMessage(state, deps)`）は変更しない
13. 共通の判定ロジックと継続 prompt 生成は `src/core/step/fixer-helpers.ts`（新規ファイル）に集約する:
    - `getPreviousSessionId(state, stepName): string | null` — 前回 session ID 取得
    - `isFixerContinuation(state, stepName): boolean` — 継続判定
    - `buildContinuationMessage(opts): string` — 継続時の短縮 prompt 生成

### maxTurns の扱い

14. Claude Agent SDK: `resume` で復元された session は新しい `query()` 呼び出しなので maxTurns は呼び出しごとにリセットされる（前回消費分は引き継がない）
15. Codex SDK: `resumeThread()` + `thread.run()` は新しい turn なので同様にリセットされる
16. Managed Agent: `events.send()` は新しいメッセージ送信なのでターン制限は呼び出し単位で適用される
17. いずれの adapter でも continuation 時に maxTurns の特別な調整は不要

### コスト集計

18. StepRun は iteration ごとに記録する（現行通り）。session が継続しても StepRun の構造は変えない。同一 step 名での合算で fixer 全体のコストが取れる状態を維持する

## スコープ外

- reviewer step の session 継続（reviewer は常に新規 session）
- resume コマンドからの session 継続（resume 時は常に新規 session で開始。session 失効リスクが高いため）
- 新しい config フィールドの追加（session 継続は fixer の固定動作とし、ON/OFF の設定は設けない）
- state schema の変更（StepRun の構造は変えない）

## 受け入れ基準

- [ ] spec-fixer の 2 回目以降の iteration が前回の session を継続して実行される
- [ ] code-fixer / build-fixer も同様に session を継続する
- [ ] session 継続失敗時に新規 session にフォールバックし、pipeline が停止しない
- [ ] 継続時の prompt に前回注入済みの情報が重複しない
- [ ] StepRun が iteration ごとに記録され、modelUsage が step 名で合算可能
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- 設計原理「LLM session に state を持たせない」との衝突を認識した上で、fixer loop の収束率改善という実効性を優先する判断。session に持たせるのは直前の修正コンテキストのみで、pipeline の状態管理は引き続き CLI + filesystem + git が担う
- session 継続の上限は既存の maxIterations（デフォルト3）で制御される。fixer の初回は新規 session、2回目・3回目のみ継続するため、最大でも2回の継続が上限。追加の guardrail は不要
- resume コマンド経由の復帰は常に新規 session とする。job 中断から再開までの時間が長く session 失効リスクが高いため
- fixer の session 継続は固定動作とし config での ON/OFF は設けない（YAGNI）
- 効果検証: 既存の `state.steps[stepName]` 配列長が iteration 数を記録しているため、新しい計測機構は不要。session 継続の前後で iteration 数とコスト（modelUsage 合算）を比較すれば効果を確認できる
- buildMessage の初回/継続分岐は `src/core/step/fixer-helpers.ts` の共通 helper に集約し、3 fixer step 個別の分岐コードを避ける。Step interface の署名は変更しない（buildMessage 内で state.steps を自己判定）
