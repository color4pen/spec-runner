# Code Review Feedback: delta-spec-session-followup

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **iteration**: 1
- **date**: 2026-05-22

---

## Summary

実装全体として設計意図は正確に反映されており、typecheck・test は共に green (2566 passed)。
pipeline の step machinery 無改修、executor/finalizeStep 無改修、FIXER_STEP_NAMES 無改修も確認済み。
3 adapter の 2 段実行ロジックと DesignStep の followUpPrompt 設定は spec 通り。

ただし 2 点の指摘がある。1 件は受け入れ基準に直接抵触するため needs-fix とする。

---

## Findings

### F-01: `mergeFollowUpResult` が dead code — 受け入れ基準「result 集約が shared で」未充足

- **severity**: medium
- **file**: `src/adapter/shared/follow-up.ts`, 各 adapter

**事実**:
`mergeFollowUpResult` は `src/adapter/shared/follow-up.ts` でエクスポートされ、テストも通っているが、**3 adapter のいずれもこの関数を import・呼び出ししていない**。

```
$ grep -rn "mergeFollowUpResult" src/
src/adapter/shared/follow-up.ts:24:export function mergeFollowUpResult(
```

production code からの参照はゼロ。adapters は result 集約を inline で行っている。

**request.md の受け入れ基準**:
> `result 集約のうち sessionId (turn 1 維持) / resultContent (follow turn 採用) が shared で、依存が adapter → shared 純粋関数の一方向である`

この基準は「shared 純粋関数が adapter から呼ばれる」ことを前提とする。現状、adapter は `shouldRunFollowUp` だけ shared から呼んでおり、`mergeFollowUpResult` は呼んでいない。

**挙動への影響**: なし。各 adapter が inline で等価な処理をしており、動作は正しい。ただし設計意図 (adapter → shared 純粋関数の単方向依存) が実装レベルで未達成であり、将来の adapter 追加時に適用されない。

**修正方針**:
- ClaudeCodeRunner: follow turn 完了後に `mergeFollowUpResult(baseResultObj, followResultContent)` を呼んで最終結果を組み立てる
- CodexAgentRunner: 同様に呼び出す
- ManagedAgentRunner: design step は resultContent が常に null なので影響軽微だが、polling 経路では適用可能

なお、ClaudeCodeRunner の `resultContent` はファイル読み出し後に確定するため、`mergeFollowUpResult` の呼び出しタイミングは「ファイル読み出し後・return 前」になる点に注意。

---

### F-02: TC-25 (must) のファンクショナルテストが欠落

- **severity**: low
- **file**: `tests/unit/adapter/claude-code/agent-runner.test.ts`

**事実**:
`test-cases.md` の TC-25 (priority: **must**):
> GIVEN `ctx.followUpPrompt` が指定され、AbortController が abort される
> WHEN abort が 1 回目の turn 実行中に発生する
> THEN 2 回目の turn が開始されず、timeout による completion が返る

このシナリオに対応するファンクショナルテストが claude-code/agent-runner.test.ts に存在しない。
`tests/unit/core/step/types.test.ts` の TC-48 は「ファイルに 'followUpPrompt' と 'AbortController' の文字列が含まれる」という構造的 assertion に留まり、「abort 後に follow turn が開始されない」という振る舞いを保証しない。

**挙動への影響**: なし。実装コードを見ると、turn 1 が abort で throw → 外側 catch → `abortController.signal.aborted` が true → timeout 返却、という経路で follow turn は絶対に開始されない。コードは正しい。

**修正方針**:
`ClaudeCodeRunner follow-up 2-turn execution` describe ブロックに以下を追加:
- queryFn が 1 回目の呼び出し中に abort されたとき、2 回目が呼ばれず completionReason === "timeout" を返すテストケース

既存の TC-032 (timeoutMs) では `followUpPrompt` が未設定のため、follow turn の起動有無を検証できていない。

---

## Must Test Coverage (test-cases.md との照合)

| TC | Priority | Status |
|---|---|---|
| TC-01〜TC-18 (Interface / shared) | must | ✅ |
| TC-19〜TC-26 (ClaudeCode) | must/should | TC-25 のみ functional 未 |
| TC-27〜TC-33 (Codex) | must | ✅ |
| TC-34〜TC-42 (Managed) | must | ✅ |
| TC-43〜TC-46 (DesignStep) | must | ✅ |
| TC-47〜TC-48 (Timeout) | must | structural のみ (functional は TC-25 依存) |
| TC-49〜TC-52 (Pipeline) | must | ✅ |
| TC-54〜TC-55 (全体) | must | ✅ green |

---

## 非問題として記録

- **managed SSE 経路の follow turn**: `sendUserMessage` + `pollUntilComplete` の実装は design D6 通り。graceful degradation (catch → stderrWrite) も確認済み
- **Codex usage 加算**: `turn1Usage` を spread してから加算、turn 2 で上書きしない実装 (TC-31 相当) が正しく動作
- **executor 転記**: `followUpPrompt: step.followUpPrompt` の 1 行追加のみ、他の executor ロジックは無改修
- **shared が runtime 型を知らない**: `follow-up.ts` の import は `AgentRunContext` と `AgentRunResult` のみ (core/port — pure interface)
- **`shouldRunFollowUp` の早期 return 役割**: falsy or non-success で false を返すシンプルな実装で leak なし

---

## 修正スコープ

F-01 は受け入れ基準に抵触するため修正必須。F-02 は must テストケースの欠落であり追加が必要。
いずれもスコープは局所的で、pipeline/executor の変更は不要。
