# Spec Review Result: fixer-session-continuity (Round 2)

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-15
- **verdict**: approved

## Summary

Round 1 の F-01/F-02/F-03 はすべて design.md / tasks.md に反映済み。request.md の 18 要件が design (D1-D8)、tasks (T-01〜T-14)、delta-spec の scenario に一貫してマッピングされている。コードベースとの照合で、ファイルパス・行番号・interface 参照・型定義はすべて正確。セキュリティ観点でも新しい攻撃面はない。

## Findings

### N-01: adapter 層の projectContext / additionalInstructions は continuation でも再注入される [INFO]

request.md 要件 10 は「session 継続時の fixer prompt から project.md の再注入等を省略する」と述べているが、`buildAdditionalInstructions(ctx)` は `ctx.projectContext` を常に付加する（`src/adapter/shared/prompt-builder.ts` L17-21）。`buildMessage` が返す短縮 prompt には含まれないが、adapter 層で再注入される。

**影響**: 低。runtime instructions (~5行) + projectContext (通常 <1KB) の冗長な再注入。session 内に前回の context が残っている環境では無駄なトークンだが、機能的な問題はない。主要なコスト削減（request.md 全文、change folder 詳細説明、findings 全文の省略）は `buildMessage` の短縮で達成される。

**対応不要**: 現行設計で十分。adapter 側の条件分岐追加は complexity に見合わない。

### N-02: T-02 の buildContinuationMessage 内で STEP_NAMES 定数を使うべき [INFO]

T-02 のコード例で `const STEP_NAMES_BUILD_FIXER = "build-fixer"` とローカル定数を定義しているが、`STEP_NAMES.BUILD_FIXER` を使う方がプロジェクト規約に一致する（step-names.ts が single source of truth）。実装時に修正すれば十分。

## Verification of Round 1 Fixes

### F-01 (CodexAgentRunner sessionId 永続化): RESOLVED

- design.md D6: `CodexThread.id` プロパティ追加 + `run()` 戻り値に `sessionId: thread.id` を明記
- tasks.md T-07: ステップ 1 で `CodexThread` に `id: string` 追加、ステップ 4 で `return { ..., sessionId: thread.id }` 追加
- tasks.md T-08: テストケース 4 に `sessionId` 永続化の検証を追加
- delta-spec.md: Codex adapter は明示的にスコープ外だが、`agent-runner-port` の scenario が sessionId 永続化の前提を保証

### F-02 (buildContinuationMessage の "reviewer" 表現): RESOLVED

T-02 のコードで `stepName === "build-fixer"` の場合は `"verification"`、それ以外は `"reviewer"` を出力するよう出し分け実装済み。

### F-03 (unused parameter `slug`): RESOLVED

T-02 で `@reserved` JSDoc を付加し、将来のテンプレート拡張のために保持する意図を明記。

## Codebase Cross-Reference

| Spec Reference | Codebase Location | Status |
|---|---|---|
| `AgentRunContext` interface | `src/core/port/agent-runner.ts` L26-49 | optional field 追加は breaking change なし ✓ |
| StepExecutor ctx 構築 | `src/core/step/executor.ts` L116-130 | 挿入位置は正確 ✓ |
| ClaudeCodeRunner query options | `src/adapter/claude-code/agent-runner.ts` L122-132 | resume spread 追加可能 ✓ |
| ClaudeCodeRunner sessionId 抽出 | L169 `extractedSessionId = successResult.session_id` | 既存パスで永続化済み ✓ |
| CodexAgentRunner thread 作成 | `src/adapter/codex/agent-runner.ts` L122-128 | resumeThread 分岐追加可能 ✓ |
| CodexAgentRunner return | L199-203 | sessionId 未返却 → T-07 で修正 ✓ |
| ManagedAgentRunner createSession | `src/adapter/managed-agent/agent-runner.ts` L357-377 | skip 分岐追加可能 ✓ |
| DispatchingAgentRunner | `src/adapter/dispatching/agent-runner.ts` L22-41 | ctx passthrough、変更不要 ✓ |
| StepRun.sessionId | `src/state/schema.ts` L95 | `string \| null` で既存 ✓ |
| pushStepResult sessionId 永続化 | `src/state/helpers.ts` L86 | `partial.session?.id ?? null` → StepRun.sessionId ✓ |
| recordFailedStepResult | `src/core/step/executor-helpers.ts` L101-113 | session 未指定 → sessionId: null → resume 時は新規 session ✓ |
| STEP_NAMES 定数 | `src/core/step/step-names.ts` | SPEC_FIXER / BUILD_FIXER / CODE_FIXER 存在 ✓ |
| テストファイルパス | T-06: `tests/unit/adapter/claude-code/`, T-08: `tests/adapter/codex/`, T-10: `tests/unit/adapter/managed-agent/` | 全パス存在 ✓ |

## Security Review

- **sessionId の出所**: SDK 応答 (`successResult.session_id` / `sessionResult.sessionId`) からのみ取得。ユーザー入力による injection リスクなし
- **continuation prompt**: `buildContinuationMessage` は内部 state の `findingsPath` のみを参照。テンプレートは `<user-request>` タグで囲まれ、既存の prompt injection 対策パターンに準拠
- **新規ネットワーク通信**: なし。既存 SDK API の呼び出しパターン変更のみ
- **認証**: 変更なし。session 継続は既存の認証済み session を再利用
- **OWASP Top 10**: 該当する新規リスクなし

## Non-Issues (確認済み)

- **resume コマンドからの session 継続**: 失敗/timeout 時の `recordFailedStepResult` は `sessionId: null` で記録されるため、`getPreviousSessionId` は null を返し新規 session になる。スコープ外の要件が暗黙的に保証される
- **cross-adapter session 継続**: DispatchingAgentRunner でモデルプロバイダが変わった場合（Claude → Codex）、resume が失敗し fallback で新規 session が作成される。理論的エッジケースだが fallback が正しく処理する
- **maxTurns リセット**: 3 adapter とも新しい呼び出し単位でリセットされる。SDK の動作として正確
- **StepExecutor の fixer 名結合**: `FIXER_STEP_NAMES` 集合による判定は executor に step 知識を導入するが、Step interface に `supportsContinuation` フラグを追加するより低コスト。architect 判断として合理的
