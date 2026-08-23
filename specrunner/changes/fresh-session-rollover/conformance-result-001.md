# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### AC-1: SDK error result の errors[] に exhaustion 文字列 → isContextExhaustionError() を正本として typed 判別
- `src/adapter/claude-code/agent-runner.ts` の `joinErrorsFromResult()` + `isContextExhaustionError()` を使用（新規 allowlist なし）
- exhaustion → `CONTEXT_WINDOW_EXHAUSTED_CODE`、非 exhaustion → `CLAUDE_CODE_QUERY_FAILED`
- TC-001、TC-002 で直接テスト済み ✓

### AC-2: SDK throw 経路でも同じ exhaustion 判別
- `collectCauseText()` で cause チェーンを辿り `isContextExhaustionError()` に委譲
- rollover ループ内の `iterErr` 捕捉（agent-runner.ts 1031-1125）+ 外側 catch（1619-1621）の両方に実装
- TC-003 で直接テスト済み ✓

### AC-3: context exhaustion 時に同じ worktree で fresh session を開始し、失敗 session ID を resume に渡さない
- rollover 時に `delete queryOptions["resume"]`（1061 / 1175 行）
- `extractedSessionId = undefined`（session ID リセット）
- `capturedToolResult = null`（捨てた session の report tool result を破棄）
- `resumeFallbackDone = true`（resume→fresh fallback の二重発火防止）
- TC-004 で `resume` キー不在 + `cwd` 同一を assert ✓

### AC-4: rollover prompt が git diff / tasks.md / 既存変更保持 / completion report を指示する
- `src/adapter/claude-code/rollover-prompt.ts` に実装
- 4 点すべて含む（`git status および git diff` / `tasks.md` / `既存の変更を保持したまま` / `completion report を返す`）
- SpecRunner 側での未完了 task 解析なし（MUST NOT 充足）
- git commit / git push を促す文言なし（COMMIT_DISCIPLINE 維持）
- TC-006 / TC-023 / TC-024 で検証 ✓

### AC-5: rollover 後に成功した step は通常の success として完了し、executor commit は 1 回だけ
- rollover ループは `ClaudeCodeRunner.run()` 内に閉じており、`StepExecutor` 側に session lifecycle が露出しない
- `finalizeStepArtifacts` は executor が success を受け取った後に 1 回だけ呼ばれる
- TC-007 (agent-runner-executor-integration.test.ts) で `finalizeStepArtifacts` が 1 回のみ呼ばれることを assert ✓

### AC-6: rollover 回数上限を超えた場合は typed halt になる
- `rolloverExhausted` フラグでループ後に `CONTEXT_WINDOW_EXHAUSTED` エラーを返却
- `StepExecutor.makeNonSuccessHalt()` が `error.code` を `ErrorInfo.code` として halt に転記
- TC-008（query は maxRollovers+1 回で停止）/ TC-009（CONTEXT_WINDOW_EXHAUSTED halt + finalizeStepArtifacts 0 回）で検証 ✓

### AC-7: context exhaustion 以外の non-transient error を fresh session で再実行しない
- `isExhaustion` が false の場合はループを break（rollover しない）
- abort 発火中も rollover しない（`!abortController.signal.aborted` ガード）
- TC-010 / TC-025 で検証 ✓

### AC-8: transient retry の既存挙動を変えない
- `src/adapter/shared/transient-error.ts` は UNCHANGED（0 diff）
- `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` は UNCHANGED（0 diff）
- rollover ループは `retryWithBackoff` の外側に配置（層が分離）
- ⚠️ 詳細は Findings F-1 参照

### AC-9: error result の詳細が generic subtype だけに潰れない
- `errorMessage = "Claude Code SDK query failed: ${subtype}${errorBody}"` で `errors[]` 本文を付加
- errors[] が空の場合は subtype のみ（従来と同じ）
- TC-012 で `error.message` に subtype と errors[] 本文の両方が含まれることを assert ✓

### AC-10: 複数 session の context metrics を合成せず、rollover を observation として残す
- rollover 時に `contextObserver` を新規生成して差し替え（D7）
- 最終 `AgentRunResult.contextMetrics` は最終 session の observer snapshot
- 捨てた session の snapshot は `sessionRollovers[]` に保持
- `step:rollover` domain event を emit（`kernel/event-types.ts` に追加済み）
- `CommitOrchestrator.applySuccessPostPersistEffects()` と `commitHalt()` で `contextOnly: true` エントリを usage.json に追記
- TC-013 / TC-014 / TC-015 / TC-030 / TC-031 / TC-032 で検証 ✓

### AC-11: 既存テストは無変更で green
- `bun run test` 全 830 テストファイル、12378 テストがパス（1 skipped, 2 todo）✓

### 設計判断の確認（計画文脈）

- D1（rollover ループを `ClaudeCodeRunner.run()` 内に置く）: ✓ 実装確認
- D2（`isContextExhaustionError()` を唯一の正本として再利用）: ✓ 新規 allowlist/classifier なし確認（context-observer.ts は UNCHANGED）
- D3（typed code `CONTEXT_WINDOW_EXHAUSTED` 導入）: ✓ adapter-local exported const として実装
- D4（`contextRollover.maxRollovers` config）: ✓ types/resolution/validation 実装、default 1、gte(0) 検証
- D5（rollover prompt 構成）: ✓ baseFullPrompt + rolloverSection + completionDirective の順
- D6（捨てる状態のみ破棄、worktree 由来の事実は引き継ぐ）: ✓ `touchedFileMessages` リセットなし、`abortController` 共有確認
- D7（context metrics を session 単位で分離）: ✓ observer 差し替え + sessionRollovers 伝播確認
- D8（follow-up turn は rollover しない）: ✓ TC-022 で確認
- D9（claude-code adapter の全 agent step に適用）: ✓ step 種別フィルタなし確認

---

## 検証できなかった項目

None — 全 AC 項目について実装コードとテストを直接確認した。

---

## Findings 詳細

### F-1: Spec Scenario「transient error の retry 挙動が変わらない」のテスト未実装（medium / fixable）

**Spec 箇所**: `spec.md` — Requirement「context exhaustion 以外の失敗は fresh session で再実行しない」内の Scenario「transient error の retry 挙動が変わらない」

**Scenario が求めるもの**:
```
Given rollover budget が 1、transient retry の maxRetries が 3 である
And main work query が毎回 transient error を throw する
When ClaudeCodeRunner.run() が完了する
Then query は 4 回（maxRetries + 1）呼ばれている
And step:retry event が 3 回 emit されている
And AgentRunResult.transientRetryAttempts は 3 である
```

**現状**:
- `agent-runner-transient-retry.test.ts`（既存、UNCHANGED）は transient retry 単独の挙動を検証する。
- `agent-runner-rollover.test.ts`（新規）は rollover シナリオを検証するが、「rollover budget が 1 の状態で transient error が毎回発生する」組み合わせのテストが存在しない。
- 実装の構造上（rollover ループは `retryWithBackoff` の外側に配置）、この組み合わせでも正しく動作するはずだが、spec Scenario の具体的な数値（4 回呼び出し / 3 回 step:retry / transientRetryAttempts=3）を検証するテストが欠如している。

**修正方針**: `agent-runner-rollover.test.ts` または `agent-runner-transient-retry.test.ts` に rollover budget > 0 かつ transient error が続くケースのテストを追加し、spec Scenario の Then 節を直接 assert する。
