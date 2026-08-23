# implementer のコンテキスト枯渇で途中成果が全損する — fresh session rollover がない

## Meta

- **type**: new-feature
- **slug**: fresh-session-rollover
- **base-branch**: main
- **adr**: false

## 症状

local runtime の `implementer` が作業中にコンテキストウィンドウを使い切り、Claude Code SDK から `Prompt is too long` が返ると、step は `CLAUDE_CODE_QUERY_FAILED` で終了する。

implementer の編集結果は worktree 上に存在していても、executor の `finalizeStepArtifacts`（commit / push）は agent session の正常終了後にしか実行されない。GitHub Actions の ephemeral runner では、この時点で run が終了すると未commitの途中成果が runner とともに消える。

実測（C2）:

- implementer は約18.5分間動作
- 作業中に `Prompt is too long` で停止
- implementer の正常終了に到達せず、executor commit は0件
- ephemeral runner 上の未commit worktreeも回収不能

## 現行コードで確認できること

- `src/adapter/claude-code/agent-runner.ts` は main work を1回の SDK `query()` / 1 session として実行する
- `src/core/step/implementer.ts` の `maxTurns` は60で、長時間・多ファイル作業を単一sessionに載せる
- `src/prompts/fragments.ts` は agent の `git add / commit / push` を禁止し、pipeline executor が一括commitする契約
- `src/core/step/executor.ts` は agent が `completionReason: "success"` を返した後にのみ `finalizeStepArtifacts` を呼ぶ。non-successでは途中成果をcommitしない
- `src/adapter/shared/artifact-bundle.ts` は成果物合計が64KiBを超えると bundle 全体を空にする。C2の成果物は約100KBなので、「初期promptへ全成果物が同梱された」のではなく、その後の Read / tool result / 編集 / テスト出力の累積で枯渇した可能性が高い
- non-success result の `errors[]` は transient 判定には参照されるが、最終的な返却 error は `Claude Code SDK query failed: ` に潰され、context exhaustionをtypedに区別できない（generic `CLAUDE_CODE_QUERY_FAILED` のまま。typed code `CONTEXT_WINDOW_EXHAUSTED` は未実装）
- #1070 (merged) により `src/adapter/claude-code/context-observer.ts` の `isContextExhaustionError()` が context exhaustion 文字列の fail-closed allowlist 照合の正本として存在し、`exhaustionAtTokens` / compaction / active context の観測は usage.json に永続化される

## #1070 マージ後のスコープ確定

#1070 で active context / context window / compaction / exhaustion の観測基盤は入ったため、本 Issue では観測機能を再実装せず、**reactive fresh-session rollover 本体**に絞る。

実装イメージ:

```text
Claude session
  ↓
context exhaustion
  ↓
既存 isContextExhaustionError() で typed 判別
  ↓
fresh session
  ↓
同じ implementer step / 同じ worktree
失敗 session ID は resume に渡さない
  ↓
git diff / tasks.md を読んで既存変更を保持したまま続行
  ↓
success
  ↓
executor が従来どおり最後に1回だけ commit / push
```

### 実装境界

rollover loop は `StepExecutor` ではなく `ClaudeCodeRunner.run()` 内に置く。現在の `AgentRunner` port は adapter が agent lifecycle を完結させ、executor は `runner.run(ctx)` の結果だけ扱う契約なので、session lifecycle を core / pipeline 側へ漏らさない。

- pipeline step は増やさない
- task 単位 commit / checkpoint commit はしない
- 同一 worktree をそのまま継続利用する
- context exhaustion 以外の non-transient error は rollover しない
- transient retry の既存挙動は変えない
- rollover 回数は bounded にする

### #1070 の再利用

context exhaustion 判定は新しい classifier を作らず、#1070 で入った `isContextExhaustionError()` を正本として再利用する。

必要なら `AgentRunResult.error.code` を `CONTEXT_WINDOW_EXHAUSTED` のような typed code に上げ、その code を rollover 条件にする。ただし provider 固有の文字列判定は adapter 内に閉じる。

### rollover prompt

SpecRunner 側で未完了 task を解析して独自の resume state を作らない。fresh agent に最低限、次を指示すればよい。

1. 現在の `git diff` / worktree を確認する
2. `tasks.md` を確認する
3. 既に書き出された変更を保持して続きを実装する
4. 全タスク完了後に通常の completion report を返す

Git/worktree を進捗の正本とし、conversation session は使い捨て可能な実行資源として扱う。

### metrics の扱い

1回の `run()` 内で複数 fresh session を使う場合、各 session の context metrics を混ぜて1つの session metric にしない。rollover 時点の session metrics は event / observation として残し、最終 `AgentRunResult.contextMetrics` は最終 session の観測値として扱う。

proactive compact / rollover の token 閾値は本 Issue には入れない。#1070 で実測を貯めてから別途判断する。

## 受け入れ条件

- [ ] SDK error resultの `errors[]` に context exhaustion 文字列が含まれる場合、`isContextExhaustionError()` を正本として typed に判別される（新規 classifier を作らない）
- [ ] SDK throw経路でも同じcontext exhaustion判別が行われる
- [ ] context exhaustion時、同じworktreeでfresh sessionが開始され、失敗session IDを `resume` に渡さない
- [ ] rollover promptが `git diff` / 未完了tasks / 既存変更の継続を指示する
- [ ] rollover後に成功した場合、implementer step全体は通常のsuccessとして完了し、executorのcommit / pushは1回だけ実行される
- [ ] rollover回数上限を超えた場合はtyped haltになる
- [ ] context exhaustion以外のnon-transient errorをfresh sessionで再実行しない
- [ ] transient retryの既存挙動を変えない
- [ ] error resultの詳細がgeneric subtypeだけに潰れず、halt / logに残る
- [ ] rollover 発生時、複数 session の context metrics を1つに合成しない。最終 `AgentRunResult.contextMetrics` は最終 session の観測値であり、rollover 発生は event / observation として残る
- [ ] 既存テストは無変更でgreen

## スコープ外

- implementerを「追加のみ → 切替」等の固定pipeline stepへ分割すること
- task単位の途中commit
- 未完了worktreeをcheckpoint commitとしてpushすること
- sizing gate（task本数閾値）の変更
- context / compaction の観測機能の再実装（#1070 で実装済み）
- proactive compact / rollover の token 閾値決定
- provider native compaction policy の上書き
- request分割規律の変更

## 当面の回避策

C2は「追加のみ」と「既存参照の切替」にrequestを分割することで、1sessionあたりの探索・変更fan-outを抑える。ただし、これは個別requestのworkload shapingであり、本issueのsession寿命問題の根治ではない。