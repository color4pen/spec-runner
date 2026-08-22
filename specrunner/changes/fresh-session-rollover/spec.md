# Spec: fresh session rollover on context exhaustion

## Requirements

### Requirement: Claude adapter は context exhaustion を typed に判別する

Claude Code adapter は、main work の SDK error result（`subtype !== "success"`）の `errors[]` を連結した文字列を `isContextExhaustionError()` に渡して判定し、真のときに限り `AgentRunResult.error.code` を `CONTEXT_WINDOW_EXHAUSTED` にしなければならない（MUST）。判定関数は既存の `src/adapter/claude-code/context-observer.ts` の `isContextExhaustionError()` を正本として再利用するものとし、新しい文字列 allowlist / classifier を追加してはならない（MUST NOT）。exhaustion と判定されない error result は従来どおり `CLAUDE_CODE_QUERY_FAILED` のままとする（SHALL）。

#### Scenario: error result の errors[] が context exhaustion 文字列を含む

**Given** claude-code runner の main work query が `subtype: "error_during_execution"` かつ `errors: ["API Error: Prompt is too long"]` の result を返す
**And** rollover budget が 0（rollover 無効）である
**When** `ClaudeCodeRunner.run()` が完了する
**Then** 返る `AgentRunResult.completionReason` は `"error"` である
**And** `AgentRunResult.error.code` は `"CONTEXT_WINDOW_EXHAUSTED"` である

#### Scenario: exhaustion 以外の error result は generic code のまま

**Given** claude-code runner の main work query が `errors: ["something unexpected"]` の error result を返す
**When** `ClaudeCodeRunner.run()` が完了する
**Then** `AgentRunResult.error.code` は `"CLAUDE_CODE_QUERY_FAILED"` である

### Requirement: SDK throw 経路でも同じ context exhaustion 判別を行う

SDK が result event ではなく例外を throw する経路でも、adapter は同じ `isContextExhaustionError()` による判定を行わなければならない（MUST）。判定対象のテキストは throw された Error の `message` と、`cause` チェーンを辿って得られる message の全体とする（SHALL）。

#### Scenario: ラップされた cause に exhaustion 文字列がある

**Given** claude-code runner の main work query が `new Error("query failed", { cause: new Error("Prompt is too long") })` を throw する
**And** rollover budget が 0（rollover 無効）である
**When** `ClaudeCodeRunner.run()` が完了する
**Then** `AgentRunResult.completionReason` は `"error"` である
**And** `AgentRunResult.error.code` は `"CONTEXT_WINDOW_EXHAUSTED"` である

### Requirement: context exhaustion 時に同一 worktree で fresh session を開始する

rollover budget が残っている状態で main work が context exhaustion で終わった場合、adapter は同じ step / 同じ `cwd`（worktree）のまま新しい SDK session を開始しなければならない（MUST）。新しい session の query options に、枯渇した session の session ID を `resume` として渡してはならない（MUST NOT）。fresh session 開始時、adapter は枯渇した session に属する状態（捕捉済み session ID、捕捉済み report tool result、その session の context observer）を破棄しなければならない（MUST）。

#### Scenario: 1 回目が枯渇し 2 回目が成功する

**Given** rollover budget が 1 である
**And** main work query の 1 回目が `errors: ["Prompt is too long"]` の error result を返し、2 回目が success result を返す
**When** `ClaudeCodeRunner.run()` が完了する
**Then** query は 2 回呼ばれている
**And** 2 回目の query options の `cwd` は 1 回目と同じ worktree パスである
**And** 2 回目の query options に `resume` キーが存在しない

#### Scenario: 枯渇した session の report tool result は引き継がれない

**Given** rollover budget が 1 である
**And** 1 回目の session が report tool を呼んだ後に context exhaustion で終わる
**And** 2 回目の session は report tool を呼ばずに success result を返す
**When** `ClaudeCodeRunner.run()` が完了する
**Then** 返る `AgentRunResult.toolResult` に 1 回目の session が報告した内容は含まれない

### Requirement: rollover prompt は既存変更の保持と続行を指示する

fresh session に送る prompt は、step 本来の task prompt を保持したうえで rollover 継続セクションを含まなければならない（MUST）。継続セクションは、(1) `git status` / `git diff` による worktree 現状の確認、(2) `tasks.md` による未完了作業の確認、(3) 既に書き出された変更を revert せず保持したまま続きを実装すること、(4) 完了後に通常の completion report を返すこと、の4点を指示しなければならない（MUST）。SpecRunner 側で未完了 task を解析した独自の resume state を prompt に埋め込んではならない（MUST NOT）。report tool の completion directive が prompt の末尾に来る既存の配置は維持される（SHALL）。

#### Scenario: fresh session の prompt に継続指示が含まれる

**Given** rollover budget が 1 である
**And** main work query の 1 回目が context exhaustion の error result を返す
**When** adapter が 2 回目の query を発行する
**Then** 2 回目の prompt には `git diff` への言及が含まれる
**And** 2 回目の prompt には `tasks.md` への言及が含まれる
**And** 2 回目の prompt には既存変更を保持して続行する旨の指示が含まれる
**And** 2 回目の prompt には 1 回目と同じ step task 本文が含まれる

### Requirement: rollover 後に成功した step は通常の success として完了する

rollover を経て main work が success した場合、`AgentRunResult.completionReason` は `"success"` でなければならない（MUST）。`StepExecutor` は当該 step を通常の成功として扱い、`finalizeStepArtifacts`（commit / push）はその step につき 1 回だけ実行されなければならない（MUST）。rollover は追加の commit / push を発生させてはならない（MUST NOT）。

#### Scenario: rollover 後に success した step の commit は 1 回

**Given** rollover budget が 1 である
**And** agent step の main work が 1 回 context exhaustion で失敗し、fresh session で success する
**When** `StepExecutor` が当該 agent step を実行する
**Then** step の結果は success として記録される
**And** `finalizeStepArtifacts` は 1 回だけ呼ばれる

### Requirement: rollover 回数は bounded で、超過時は typed halt になる

adapter は 1 回の `run()` における fresh session rollover の回数を、解決済み config 値 `contextRollover.maxRollovers` を上限としなければならない（MUST）。上限に達した後にさらに context exhaustion が起きた場合、adapter は rollover せず `completionReason: "error"` / `error.code: "CONTEXT_WINDOW_EXHAUSTED"` を返さなければならない（MUST）。`maxRollovers` が 0 のとき rollover は一切行われない（SHALL）。この結果を受けた `StepExecutor` は当該 code を保持したまま halt しなければならない（MUST）。

#### Scenario: budget を使い切っても枯渇が続く

**Given** rollover budget が 1 である
**And** main work query が毎回 `errors: ["Prompt is too long"]` の error result を返す
**When** `ClaudeCodeRunner.run()` が完了する
**Then** query は 2 回だけ呼ばれている
**And** `AgentRunResult.error.code` は `"CONTEXT_WINDOW_EXHAUSTED"` である

#### Scenario: typed code が halt に伝播する

**Given** agent runner が `error.code: "CONTEXT_WINDOW_EXHAUSTED"` の non-success 結果を返す
**When** `StepExecutor` が当該 agent step を実行する
**Then** 生成される halt の `error.code` は `"CONTEXT_WINDOW_EXHAUSTED"` である

### Requirement: context exhaustion 以外の失敗は fresh session で再実行しない

adapter は、context exhaustion と判定されない non-transient error（error result / throw のいずれも）に対して fresh session rollover を行ってはならない（MUST NOT）。abort（step timeout / inactivity watchdog / signal）が発火している場合も rollover してはならない（MUST NOT）。transient error に対する既存の retry 挙動（`retryWithBackoff` の回数、`step:retry` event、`transientRetryAttempts` の値）は変更されない（SHALL）。

#### Scenario: 非 exhaustion の error result では rollover しない

**Given** rollover budget が 1 である
**And** main work query が `errors: ["something unexpected"]` の error result を返す
**When** `ClaudeCodeRunner.run()` が完了する
**Then** query は 1 回だけ呼ばれている
**And** `AgentRunResult.error.code` は `"CLAUDE_CODE_QUERY_FAILED"` である

#### Scenario: transient error の retry 挙動が変わらない

**Given** rollover budget が 1、transient retry の maxRetries が 3 である
**And** main work query が毎回 transient error を throw する
**When** `ClaudeCodeRunner.run()` が完了する
**Then** query は 4 回（maxRetries + 1）呼ばれている
**And** `step:retry` event が 3 回 emit されている
**And** `AgentRunResult.transientRetryAttempts` は 3 である

### Requirement: error result の詳細が generic subtype だけに潰れない

main work の non-success error result から生成される `AgentRunResult.error.message` は、SDK の `subtype` に加えて `errors[]` の本文（長い場合は truncate 可）を含まなければならない（MUST）。この message は halt 経路を通じて job state の error 情報に記録される（SHALL）。

#### Scenario: errors[] の本文が error message に残る

**Given** main work query が `subtype: "error_during_execution"` かつ `errors: ["API Error: Prompt is too long"]` の error result を返す
**When** `ClaudeCodeRunner.run()` が完了する
**Then** `AgentRunResult.error.message` は `"error_during_execution"` を含む
**And** `AgentRunResult.error.message` は `"Prompt is too long"` を含む

### Requirement: 複数 session の context metrics を合成せず rollover を observation として残す

rollover が発生した `run()` において、`AgentRunResult.contextMetrics` は最終 session の観測値のみを表さなければならず、複数 session の観測値を合成してはならない（MUST NOT）。捨てられた各 session の観測値は `AgentRunResult.sessionRollovers[]` の要素として保持されなければならない（MUST）。adapter は rollover ごとに `step:rollover` domain event を emit しなければならない（MUST）。`CommitOrchestrator` は各 rollover observation の context metrics を、success / halt いずれの経路でも `usage.json` に `contextOnly: true` のエントリとして追記しなければならない（MUST）。

#### Scenario: 最終 contextMetrics は最終 session の観測値

**Given** rollover budget が 1 である
**And** 1 回目の session の active context 観測値が 2 回目の session より大きい
**And** 1 回目が context exhaustion、2 回目が success で終わる
**When** `ClaudeCodeRunner.run()` が完了する
**Then** `AgentRunResult.contextMetrics.peakActiveContextTokens` は 2 回目の session で観測された値と等しい
**And** `AgentRunResult.sessionRollovers` は 1 要素を持ち、その `contextMetrics.exhaustionAtTokens` は 1 回目の session の観測値である

#### Scenario: rollover が event として観測できる

**Given** rollover budget が 1 である
**And** 1 回目が context exhaustion、2 回目が success で終わる
**When** `ClaudeCodeRunner.run()` が完了する
**Then** `step:rollover` event が 1 回 emit されている
**And** その payload は step 名と rollover 回数と `reason: "context-exhaustion"` を含む

#### Scenario: rollover observation が usage.json に残る

**Given** agent step の実行結果が context metrics 付きの `sessionRollovers` を 1 件含む
**When** `CommitOrchestrator` が当該 step の成功を commit する
**Then** `usage.json` に `contextOnly: true` かつ当該 rollover の context metrics を持つエントリが追記される

### Requirement: rollover 上限は config で解決される

`contextRollover.maxRollovers` は非負整数として config schema で検証されなければならない（MUST）。未指定時の解決値は 1 でなければならない（MUST）。当該キーを持たない既存 config は引き続き valid でなければならない（MUST）。

#### Scenario: 未指定時の default

**Given** `contextRollover` を含まない config
**When** `resolveContextRolloverConfig(config)` を呼ぶ
**Then** 返る `maxRollovers` は 1 である

#### Scenario: 負値は拒否される

**Given** `contextRollover: { maxRollovers: -1 }` を含む config
**When** config を検証する
**Then** `CONFIG_INVALID` として拒否される
