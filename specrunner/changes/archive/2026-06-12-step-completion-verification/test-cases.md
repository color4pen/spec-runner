# Test Cases: step 完了時に宣言された契約を機械検証し、不足は follow-up で修復させる

## Summary

- **Total**: 34 cases
- **Automated** (unit/integration): 33
- **Manual**: 1
- **Priority**: must: 28, should: 6, could: 0

---

### TC-001: 全契約が満たされれば挙動は不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: step 完了時に宣言された出力契約を決定論で検証する > Scenario: 全契約が満たされれば挙動は不変

---

### TC-002: 検証は両 runtime で同じ宣言契約を対象にする

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: step 完了時に宣言された出力契約を決定論で検証する > Scenario: 検証は両 runtime で同じ宣言契約を対象にする

---

### TC-003: design が成果物を産出しないまま完了すると即 halt する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: produced 契約の欠落は commit 前に halt する > Scenario: design が成果物を産出しないまま完了すると即 halt する

---

### TC-004: 宣言出力が実体付きで存在すれば通過する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: produced 契約の欠落は commit 前に halt する > Scenario: 宣言出力が実体付きで存在すれば通過する

---

### TC-005: 未完了タスクが残ると follow-up が送られる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: implementer の未完了タスクは同一セッションの follow-up で修復させる > Scenario: 未完了タスクが残ると follow-up が送られる

---

### TC-006: follow-up prompt は検証結果から計算される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer の未完了タスクは同一セッションの follow-up で修復させる > Scenario: follow-up prompt は検証結果から計算される

---

### TC-007: 予算枯渇後の未完了は halt に縮退する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: follow-up 予算枯渇後も残る未完了は halt する > Scenario: 予算枯渇後の未完了は halt に縮退する

---

### TC-008: 検出 seam は throw せず violation を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 出力検証は入力検証と対称の RuntimeStrategy seam に置く > Scenario: 検出 seam は throw せず violation を返す

---

### TC-009: runtimeStrategy 未注入時は検証をスキップする

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 出力検証は入力検証と対称の RuntimeStrategy seam に置く > Scenario: runtimeStrategy 未注入時は検証をスキップする

---

### TC-010: parseIncompleteTaskLabels — `[ ]` を拾い `[x]`/`[X]` を拾わない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** tasks.md の本文に `- [ ] Task A`、`- [x] Task B`、`- [X] Task C` の 3 行が含まれる  
**WHEN** `parseIncompleteTaskLabels` を呼ぶ  
**THEN** 返り値は `["Task A"]` のみで、`Task B` / `Task C` は含まれない

---

### TC-011: producedContractsFromWrites — gitState と verify:false を除外する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `writes()` の戻り値に `{ artifact: "gitState" }` のエントリ、`{ verify: false }` のエントリ、通常エントリの 3 件が含まれる  
**WHEN** `producedContractsFromWrites(writes, scaffolds)` を呼ぶ  
**THEN** 結果には通常エントリのみが `kind: "produced"`, `policy: "halt"` で含まれ、他の 2 件は含まれない

---

### TC-012: partitionByPolicy — halt / follow-up に正しく分割する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `OutputCheckResult` の violations に `policy: "halt"` の violation 1 件と `policy: "follow-up"` の violation 1 件が含まれる  
**WHEN** `partitionByPolicy(result)` を呼ぶ  
**THEN** `halt` に halt violation、`followUp` に follow-up violation がそれぞれ 1 件ずつ入り、混入がない

---

### TC-013: LocalRuntime.validateStepOutputs — 実体付きファイル → violation なし

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** produced 契約のパス `p` に対して、worktree 上の `p` が scaffold と相違する非空の内容で存在する  
**WHEN** `LocalRuntime.validateStepOutputs([contract], cwd, null)` を呼ぶ  
**THEN** `result.violations` が空

---

### TC-014: LocalRuntime.validateStepOutputs — ファイル欠落 → produced violation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** produced 契約のパス `p` に対して、worktree 上に `p` が存在しない  
**WHEN** `LocalRuntime.validateStepOutputs([contract], cwd, null)` を呼ぶ  
**THEN** `result.violations` に `kind: "produced"`, `path: p` の violation が 1 件含まれる

---

### TC-015: LocalRuntime.validateStepOutputs — 空ファイル → produced violation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** produced 契約のパス `p` に対して、worktree 上の `p` が存在するが内容が空（trim 後 0 長）  
**WHEN** `LocalRuntime.validateStepOutputs([contract], cwd, null)` を呼ぶ  
**THEN** `result.violations` に `p` の produced violation が含まれる

---

### TC-016: LocalRuntime.validateStepOutputs — scaffold と byte 一致 → produced violation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** produced 契約に scaffold 内容 `S` が設定されており、worktree 上の `p` の内容が `S` と byte 一致する  
**WHEN** `LocalRuntime.validateStepOutputs([contract], cwd, null)` を呼ぶ  
**THEN** `result.violations` に `p` の produced violation が含まれる（agent が overwrite していない）

---

### TC-017: LocalRuntime.validateStepOutputs — tasks.md に `[ ]` 残 → tasks-complete violation（ラベル含む）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** tasks-complete 契約で指定した `tasks.md` に `- [ ] Task A` が残り、`- [x] Task B` のみ完了している  
**WHEN** `LocalRuntime.validateStepOutputs([contract], cwd, null)` を呼ぶ  
**THEN** `result.violations` に `kind: "tasks-complete"` の violation が含まれ、`detail` に `"Task A"` が列挙される

---

### TC-018: ManagedRuntime.validateStepOutputs — git state に実体付き → violation なし

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** produced 契約のパス `p`、`git cat-file -e` が exit 0（存在）、`getRawFile` が非空の内容を返す mock  
**WHEN** `ManagedRuntime.validateStepOutputs([contract], cwd, branch)` を呼ぶ  
**THEN** `result.violations` が空

---

### TC-019: ManagedRuntime.validateStepOutputs — git state に欠落 → produced violation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** produced 契約のパス `p`、`git cat-file -e` が non-zero（不在）を返す mock  
**WHEN** `ManagedRuntime.validateStepOutputs([contract], cwd, branch)` を呼ぶ  
**THEN** `result.violations` に `p` の produced violation が含まれる

---

### TC-020: ManagedRuntime.validateStepOutputs — stdout 非汚染

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** managed runtime の `validateStepOutputs` が `git fetch` と `git cat-file` を伴って実行される  
**WHEN** `validateStepOutputs` を呼ぶ  
**THEN** stdout への出力は 0 バイト（`git fetch` / `cat-file` が stdout を汚染しない）

---

### TC-021: ManagedRuntime.validateStepOutputs — branch null → violation に積む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D5

**GIVEN** produced 契約のパス `p`、`branch` 引数が `null`  
**WHEN** `ManagedRuntime.validateStepOutputs([contract], cwd, null)` を呼ぶ  
**THEN** `result.violations` に `p` の violation が含まれる（branch 未確定では検証不能）

---

### TC-022: implementer.outputContracts — tasks.md を policy:follow-up で返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** implementer step のインスタンスに有効な `state`（slug 確定済み）と `deps` を渡す  
**WHEN** `step.outputContracts(state, deps)` を呼ぶ  
**THEN** 返り値が `[{ kind: "tasks-complete", path: "<changeFolderPath(slug)>/tasks.md", policy: "follow-up" }]` と一致する

---

### TC-023: outputContracts 未実装の既存 step がコンパイルエラーにならない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `outputContracts` を実装していない既存の AgentStep 実装（design / spec-review 等）  
**WHEN** `bun run typecheck` を実行する  
**THEN** TypeScript コンパイルエラーが発生しない（`outputContracts` は optional）

---

### TC-024: claude-code adapter — outputVerification なしの step は追加 turn なし

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `ctx.policy.outputVerification` が未設定の step run  
**WHEN** `ClaudeCodeRunner.run` が完了する  
**THEN** `postWorkPrompts` を超えた follow-up turn が送信されない（queryFn 呼び出し回数が変わらない）

---

### TC-025: claude-code adapter — tasks-complete violation で follow-up 送信・followUpAttempts 加算

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `outputVerification` が設定されており、`detect()` が tasks-complete violations を返し、session ID が確立済み（mock queryFn）  
**WHEN** ClaudeCodeRunner 内の follow-up 修復ループが実行される  
**THEN** `resume: sessionId` で同一 session に follow-up prompt が送信され、`followUpAttempts` が 1 以上加算される

---

### TC-026: claude-code adapter — violation 解消でループ打ち切り

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** 1 回目の `detect()` が violations を返し、2 回目の `detect()` が空を返す（mock）  
**WHEN** follow-up ループが実行される  
**THEN** ループは 2 回目の detect 後に break し、追加 turn は 1 turn のみ送信される

---

### TC-027: managed-agent adapter — tasks-complete violation で follow-up 送信

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** managed-agent `runPollingStyle`（implementer 経路）で `outputVerification` が設定され、`detect()` が violations を返す mock  
**WHEN** `postWorkPrompts` 後の follow-up ループが実行される  
**THEN** `executeFollowUpTurn` が計算済みプロンプトで呼ばれ、`followUpAttempts` が加算される

---

### TC-028: executor gate — produced 欠落で finalizeStepArtifacts 到達前 halt

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** mock runner が success を返し、mock `runtimeStrategy.validateStepOutputs` が produced violation を返す  
**WHEN** `StepExecutor.runAgentStep` が実行される  
**THEN** `STEP_OUTPUT_MISSING` エラーが throw され、`finalizeStepArtifacts`（commit）は呼ばれず、failed StepRun が記録され `step:error` が emit される

---

### TC-029: executor gate — follow-up 予算枯渇後も `[ ]` 残 → halt

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** mock runner が success を返し、`maxAttempts` 回の follow-up ループ後も `validateStepOutputs` が tasks-complete violations を返す  
**WHEN** executor の authoritative gate が実行される  
**THEN** `STEP_OUTPUT_MISSING` で halt し、エラーメッセージに残タスク名が含まれる

---

### TC-030: executor gate — 全契約充足で素通り

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** mock runner が success を返し、mock `runtimeStrategy.validateStepOutputs` が空の violations を返す  
**WHEN** `StepExecutor.runAgentStep` が実行される  
**THEN** `finalizeStepArtifacts` が正常に呼ばれ、`STEP_OUTPUT_MISSING` は throw されない

---

### TC-031: verify:false が produced 契約から除外される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 / design.md > D7

**GIVEN** `IoRef` に `verify: false` が設定されたエントリを含む `writes()` 宣言  
**WHEN** `producedContractsFromWrites` を呼ぶ  
**THEN** `verify: false` のエントリは produced 契約リストに含まれない

---

### TC-032: 標準 pipeline の stdout が不変（snapshot）

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** すべての出力契約が充足される標準 pipeline 実行（mock runner）  
**WHEN** pipeline を end-to-end で実行する  
**THEN** stdout 出力が本変更前の snapshot と一致する（差分なし）

---

### TC-033: 全 12 step の produced 契約が正常経路で充足される

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** 標準 pipeline の各 agent step（design / spec-review / test-case-gen / implementer / code-review / conformance 等）が正常経路で実行される  
**WHEN** 各 step が `writes()` で宣言した出力を産出して完了する  
**THEN** produced gate が halt を起こさず、`verify: false` を付けた条件付き write には根拠が doc comment に記されている

---

### TC-034: typecheck && test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** T-01 〜 T-08 の実装がすべて適用された状態  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 両コマンドが exit 0 で完了し、エラー・失敗テストがない

---

## Result

```yaml
result: completed
total: 34
automated: 33
manual: 1
must: 28
should: 6
could: 0
blocked_reasons: []
```
