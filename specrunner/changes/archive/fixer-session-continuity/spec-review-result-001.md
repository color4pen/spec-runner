# Spec Review Result: fixer-session-continuity

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-15
- **verdict**: needs-fix

## Summary

request.md の要件は明確で、design.md / tasks.md / delta-spec.md との整合性も高い。設計判断（session に state を持たせない原理との意図的な衝突、YAGNI、fallback 戦略）は合理的。

ただし Codex adapter の session 継続に関して、タスクレベルで欠落がある。

## Findings

### F-01: CodexAgentRunner が sessionId を返していない [HIGH / tasks.md]

**現状**: `CodexAgentRunner.run()` の return（L199-203）に `sessionId` フィールドがない。`pushStepResult` → `StepRun.sessionId` は `null` になる。

**影響**: `getPreviousSessionId()` は Codex adapter 経由の fixer run に対して常に `null` を返す。T-07 で `resumeThread(threadId)` を実装しても、thread ID が state に永続化されないため呼ばれることがない。

**修正案**: T-07 に以下を追加:
1. `CodexThread` interface に `id: string` プロパティを追加
2. `CodexAgentRunner.run()` の return に `sessionId: thread.id` を追加
3. T-08 のテストに「run() が sessionId を返す」ケースを追加

### F-02: buildContinuationMessage の "reviewer" 表現が build-fixer に不正確 [LOW / tasks.md]

T-02 の `buildContinuationMessage` テンプレートに「reviewer から新しい findings が出ました」とあるが、build-fixer の場合は verification（CLI ステップ）からの findings。LLM は findingsPath を読むので機能的影響はないが、正確な表現にする方が session 内の文脈と整合する。

**修正案**: `stepName` パラメータを使って "reviewer" / "verification" を出し分けるか、step-agnostic な表現（「新しい findings が出ました」）に変更。

### F-03: buildContinuationMessage の unused parameter `slug` [LOW / tasks.md]

T-02 の実装で `opts.slug` を受け取っているが、出力文字列に使われていない。将来の拡張意図があるなら JSDoc で明記、なければ削除。

## Non-issues (確認済み)

- **AgentRunContext 拡張**: optional フィールド追加のみ、破壊的変更なし。OK。
- **StepExecutor の ctx 構築位置**: L116-130 に `resumeSessionId` を追加する指示は正確。
- **ClaudeCodeRunner の resume**: SDK の `query({ options: { resume } })` パスは正確。`successResult.session_id`（L169）で sessionId が永続化される既存パスも健全。
- **ManagedAgentRunner の分岐**: `runPollingStyle()` 内の createSession → sendUserMessage フローの分岐は正確に記述されている。
- **DispatchingAgentRunner**: ctx をそのまま delegate する確認済み。変更不要は正しい。
- **StepRun スキーマ**: `sessionId: string | null` で既に永続化される。スキーマ変更不要は正しい。
- **maxTurns**: 各 adapter で呼び出しごとにリセットされる記述は正確。
- **buildMessage の自己判定**: `state.steps[stepName]` の配列長で判定する設計は Step interface の署名を変えずに実現できる。OK。
- **fallback 設計**: timeout 時はフォールバックしない（abort は session の問題ではない）判断は正しい。
- **セキュリティ**: sessionId はSDK応答から取得されるためユーザー入力による injection リスクなし。continuation prompt も内部生成。OWASP 観点で問題なし。

## Verdict Rationale

F-01 は Codex adapter の session 継続が実装されても動作しない（sessionId が永続化されない）致命的な欠落。request.md の要件 6 と tasks T-07/T-08 が incomplete になる。修正は小さい（CodexThread.id 追加 + return に sessionId 追加）が、spec に明記しないと implementer が見落とす。

F-02/F-03 は LOW で approved 範囲だが、F-01 の修正と合わせて対応するのが効率的。
