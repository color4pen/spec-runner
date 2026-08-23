# Test Cases: fresh session rollover on context exhaustion

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 42 cases
- **Automated** (unit/integration): 40
- **Manual**: 0
- **Priority**: must: 34, should: 7, could: 1

---

## Context exhaustion の typed 判別（error result 経路）

### TC-001: errors[] に exhaustion 文字列を含む error result は CONTEXT_WINDOW_EXHAUSTED になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Claude adapter は context exhaustion を typed に判別する > Scenario: error result の errors[] が context exhaustion 文字列を含む

### TC-002: exhaustion 以外の error result は CLAUDE_CODE_QUERY_FAILED のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Claude adapter は context exhaustion を typed に判別する > Scenario: exhaustion 以外の error result は generic code のまま

---

## Context exhaustion の typed 判別（SDK throw 経路）

### TC-003: cause チェーンに exhaustion 文字列を持つ throw は CONTEXT_WINDOW_EXHAUSTED になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: SDK throw 経路でも同じ context exhaustion 判別を行う > Scenario: ラップされた cause に exhaustion 文字列がある

---

## Fresh session rollover（同一 worktree での継続）

### TC-004: 1 回目が枯渇し 2 回目が成功する場合 query は 2 回呼ばれ success になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context exhaustion 時に同一 worktree で fresh session を開始する > Scenario: 1 回目が枯渇し 2 回目が成功する

### TC-005: 枯渇した session の report tool result は fresh session に引き継がれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context exhaustion 時に同一 worktree で fresh session を開始する > Scenario: 枯渇した session の report tool result は引き継がれない

---

## Rollover 継続 prompt

### TC-006: fresh session の prompt に git diff / tasks.md / 変更保持 / completion report の 4 要素が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rollover prompt は既存変更の保持と続行を指示する > Scenario: fresh session の prompt に継続指示が含まれる

---

## Rollover 後の success と単一 commit

### TC-007: rollover 後に success した step の finalizeStepArtifacts 呼び出しは 1 回のみ

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: rollover 後に成功した step は通常の success として完了する > Scenario: rollover 後に success した step の commit は 1 回

---

## Rollover 上限（bounded / typed halt）

### TC-008: budget を超えても枯渇が続く場合 query は maxRollovers + 1 回で停止する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rollover 回数は bounded で、超過時は typed halt になる > Scenario: budget を使い切っても枯渇が続く

### TC-009: CONTEXT_WINDOW_EXHAUSTED の typed code が halt に伝播する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rollover 回数は bounded で、超過時は typed halt になる > Scenario: typed code が halt に伝播する

---

## Context exhaustion 以外の失敗は rollover しない

### TC-010: 非 exhaustion error result では rollover せず query は 1 回のみ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context exhaustion 以外の失敗は fresh session で再実行しない > Scenario: 非 exhaustion の error result では rollover しない

### TC-011: transient error の retry 挙動（回数 / step:retry event / transientRetryAttempts）が変わらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: context exhaustion 以外の失敗は fresh session で再実行しない > Scenario: transient error の retry 挙動が変わらない

---

## Error 詳細の保全

### TC-012: error result の message に subtype と errors[] 本文の両方が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: error result の詳細が generic subtype だけに潰れない > Scenario: errors[] の本文が error message に残る

---

## Context metrics の分離と rollover observation

### TC-013: 最終 contextMetrics は最終 session の観測値であり 1 回目の値が混入しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 複数 session の context metrics を合成せず rollover を observation として残す > Scenario: 最終 contextMetrics は最終 session の観測値

### TC-014: rollover ごとに step:rollover event が正しい payload で emit される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 複数 session の context metrics を合成せず rollover を observation として残す > Scenario: rollover が event として観測できる

### TC-015: rollover observation が usage.json に contextOnly: true エントリとして残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 複数 session の context metrics を合成せず rollover を observation として残す > Scenario: rollover observation が usage.json に残る

---

## Config の解決

### TC-016: contextRollover 未指定時の maxRollovers は 1 になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rollover 上限は config で解決される > Scenario: 未指定時の default

### TC-017: maxRollovers: -1 は CONFIG_INVALID として拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rollover 上限は config で解決される > Scenario: 負値は拒否される

---

## Config 追加検証（非 Scenario 由来）

### TC-018: maxRollovers: 0 は valid であり解決値が 0 になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `contextRollover: { maxRollovers: 0 }` を含む config
**WHEN** `resolveContextRolloverConfig(config)` を呼ぶ
**THEN** 返る `maxRollovers` は `0` であり、validation エラーは発生しない

### TC-019: maxRollovers に非整数（1.5）を指定すると CONFIG_INVALID で拒否される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `contextRollover: { maxRollovers: 1.5 }` を含む config
**WHEN** config を検証する
**THEN** `CONFIG_INVALID` として拒否される

### TC-020: contextRollover にオブジェクト以外（文字列 "1"）を指定すると CONFIG_INVALID で拒否される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `contextRollover: "1"` を含む config
**WHEN** config を検証する
**THEN** `CONFIG_INVALID` として拒否される

### TC-021: contextRollover フィールドを持たない既存 config は引き続き valid である

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `contextRollover` キーを含まない最小 config（`{ version: 1, agents: {} }`）
**WHEN** config を検証する
**THEN** validation エラーが発生しない

---

## Follow-up query の typed 判別（rollover なし、design D8）

### TC-022: follow-up query が context exhaustion で失敗した場合は typed code になるが rollover しない

**Category**: unit
**Priority**: should
**Source**: design.md > D8

**GIVEN** main work は success し、follow-up query（postWorkPrompts / outputVerification repair 等）が `errors: ["Prompt is too long"]` の error result を返す
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** `AgentRunResult.error.code` は `"CONTEXT_WINDOW_EXHAUSTED"` である
**AND** query は main work 分 + follow-up 分の 2 回のみ呼ばれ、rollover による追加 query は発生しない

---

## Rollover 継続 prompt の詳細（非 Scenario 由来）

### TC-023: rollover 継続セクションに git commit / git push を指示する文言が含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `buildRolloverContinuationSection({ attempt: 1, maxRollovers: 1 })` を呼ぶ
**WHEN** 返り値を検査する
**THEN** `git commit` を指示する文字列が含まれない
**AND** `git push` を指示する文字列が含まれない

### TC-024: rollover 継続セクションに attempt と maxRollovers が反映される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `buildRolloverContinuationSection({ attempt: 2, maxRollovers: 3 })` を呼ぶ
**WHEN** 返り値を検査する
**THEN** attempt 番号（2）および上限（3）の情報が文面に含まれる

---

## Abort 発火時に rollover しない

### TC-025: step timeout / inactivity watchdog が発火している状態では rollover が起きない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D1

**GIVEN** rollover budget が 1 であり、`abortController.signal` が aborted 状態である
**AND** main work query が context exhaustion の error result を返す
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** query は 1 回だけ呼ばれ、rollover は発生しない
**AND** 最終 `completionReason` は `"timeout"` または既存の abort 経路の値と一致する

---

## 捨てた session の modelUsage 加算

### TC-026: 捨てた session の modelUsage は最終 AgentRunResult の modelUsage に加算される

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-04

**GIVEN** rollover budget が 1 であり、1 回目の session が exhaustion で終わり `modelUsage` を返す
**AND** 2 回目の session が success で終わり別の `modelUsage` を返す
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** 最終 `AgentRunResult` に集計された `modelUsage` は 1 回目と 2 回目の per-model 使用量の合計と一致する

---

## touchedFileMessages の蓄積継続

### TC-027: rollover 後も touchedFileMessages の蓄積が継続し前 session の情報が失われない

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04 / design.md > D6

**GIVEN** rollover budget が 1 であり、1 回目の session でいくつかのファイルが assistant message に記録された後に exhaustion が発生する
**WHEN** 2 回目の session が実行される
**THEN** 2 回目の query 実行中も 1 回目で収集された `touchedFileMessages` は保持されており、リセットされていない

---

## sessionRollovers フィールドの存在有無

### TC-028: rollover が発生しない場合 sessionRollovers は undefined である

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** rollover budget が 1 であり、main work query が 1 回目で success result を返す
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** `AgentRunResult.sessionRollovers` は `undefined` である（既存の result 形状が不変）

---

## Pipeline logger への step:rollover 記録

### TC-029: step:rollover event が pipeline logger の JSONL に記録される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** rollover budget が 1 であり、1 回目が exhaustion、2 回目が success で終わる
**WHEN** `ClaudeCodeRunner.run()` が完了し、pipeline logger がイベントを受信する
**THEN** JSONL に `step:rollover` エントリが 1 件書き出される
**AND** エントリは step 名・attempt・maxRollovers・`reason: "context-exhaustion"` を含む

---

## sessionRollovers 不在時の usage.json 不変性

### TC-030: sessionRollovers が無い場合 usage.json への追記内容が従来と byte 等価になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** rollover が発生せず `sessionRollovers` が `undefined` の success 結果が返る
**WHEN** `CommitOrchestrator` が当該 step の成功を commit する
**THEN** `usage.json` に追記されるエントリ数・内容が本変更前と完全に一致する（`contextOnly` エントリは追加されない）

---

## Halt 経路での rollover observation の usage.json 追記

### TC-031: rollover observation を含む halt 経路でも usage.json に contextOnly エントリが追記される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** rollover が 1 回発生し、その後 budget 超過で `CONTEXT_WINDOW_EXHAUSTED` の halt が生成される
**WHEN** `CommitOrchestrator` の `commitHalt` が実行される
**THEN** `usage.json` に `contextOnly: true` かつ `modelUsage: null` の rollover 分エントリが 1 件追記される
**AND** halt そのものの FSM 遷移は usage 追記の成否に関わらず完了する

---

## Usage 追記失敗の best-effort 維持

### TC-032: usage.json への追記失敗が step の FSM 遷移（success / halt）を妨げない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `appendInvocation` が例外を throw する状態（ファイル書き込みエラー等）である
**AND** rollover 1 回 + 最終 success の step が実行される
**WHEN** `CommitOrchestrator.applySuccessPostPersistEffects` が rollover 分エントリを追記しようとする
**THEN** 例外が握り潰され（try/catch）、step の success 遷移は正常に完了する
**AND** 最終的な step 結果は success として記録される

---

## Gate: ビルド・型検査・テスト・リント

### TC-033: build / typecheck / test / lint がすべて green になる

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09

`bun run build`、`bun run typecheck`、`bun run test`、`bun run lint` の各コマンドがゼロ終了コードで完了することを検証する。

### TC-034: 本変更で追加したテスト以外の既存テストファイルに差分が無い

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09

`git diff --name-only` で変更されたテストファイルのうち、本変更で新規追加されたもの以外が含まれないことを確認する。既存の `agent-runner.test.ts` / `agent-runner-transient-retry.test.ts` / `agent-runner-inactivity-timeout.test.ts` / `agent-runner-report-settles.test.ts` / `commit-orchestrator-context-metrics.test.ts` 等が無変更で green であることを検証する。

---

## Throw 経路の error 詳細保全

### TC-035: throw 経路で exhaustion と判定された場合 error.message と cause チェーンが保全される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** SDK query が exhaustion 文字列（例: `"Prompt is too long"`）を cause に持つ Error を throw する（例: `new Error("Claude Code SDK query failed", { cause: new Error("Prompt is too long") })`）
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** `AgentRunResult.error.code` は `"CONTEXT_WINDOW_EXHAUSTED"` である
**AND** `AgentRunResult.error.message` に元の throw message（例: `"Claude Code SDK query failed"`）が含まれる（現行どおり保全）
**AND** `AgentRunResult.error` の `cause` チェーンに元の cause が保持されている（message の劣化なし）

---

## PR #1076 レビュー指摘対応 (operator-apply)

### TC-036: throw 経路での exhaustion が rollover ループへ正しくルーティングされ成功する

**Category**: unit
**Priority**: must
**Source**: PR #1076 escalation 裁定 (throw 経路 rollover)

**GIVEN** rollover budget が 1 で、1 回目の query が exhaustion 文字列を cause に持つ Error を throw し、2 回目が success result を返す
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** query は 2 回呼ばれ `completionReason` は `"success"`、`sessionRollovers` は 1 件である

### TC-037: throw 経路での exhaustion が budget 枯渇時に CONTEXT_WINDOW_EXHAUSTED を返す

**Category**: unit
**Priority**: must
**Source**: PR #1076 escalation 裁定 (throw 経路 rollover)

**GIVEN** rollover budget を使い切った状態でさらに exhaustion throw が発生する
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** `AgentRunResult.error.code` は `"CONTEXT_WINDOW_EXHAUSTED"` で、元 throw が `cause` に保全される

### TC-038: resumeSessionId があっても throw 型 exhaustion は rollover に到達する

**Category**: unit
**Priority**: must
**Source**: PR #1076 review F1

**GIVEN** `ctx.session.resumeSessionId` が設定され、1 回目の query が exhaustion 文字列を cause に持つ Error を throw する
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** resume→fresh fallback ではなく rollover が発動し（`step:rollover` emit、`sessionRollovers` 1 件）、2 回目の query options に `resume` が無い

### TC-039: implementer 以外の step では rollover しない

**Category**: unit
**Priority**: must
**Source**: PR #1076 review F2

**GIVEN** step 名 `code-review` と `contextRollover: { maxRollovers: 1 }` の config で query が exhaustion の error result を返す
**WHEN** `ClaudeCodeRunner.run()` が完了する
**THEN** query は 1 回のみ、`step:rollover` は emit されず、`error.code` は `"CONTEXT_WINDOW_EXHAUSTED"` である

### TC-040: cause chain 判定の throw 型 rollover でも exhaustionAtTokens が記録される

**Category**: unit
**Priority**: must
**Source**: PR #1076 review F3

**GIVEN** 1 回目の session が usage 付き assistant message（active context 150000）を観測後、outer message 非 exhaustion / cause のみ exhaustion の Error を throw する
**WHEN** rollover が発動して success する
**THEN** `sessionRollovers[0].contextMetrics.exhaustionAtTokens` が 150000 である

### TC-041: usage を取得できない rollover は usageUnavailable が立つ

**Category**: unit
**Priority**: must
**Source**: PR #1076 review F4

**GIVEN** throw 型 rollover（usage 取得不能）と、modelUsage 付き exhaustion result による result 型 rollover
**WHEN** それぞれ `ClaudeCodeRunner.run()` が完了する
**THEN** 前者の rollover 記録は `usageUnavailable: true` を持ち、後者は持たない

### TC-042: usageUnavailable rollover は unmarked "usage unavailable" entry として記録される

**Category**: unit
**Priority**: must
**Source**: PR #1076 review F4

**GIVEN** `usageUnavailable: true` の rollover を含む success 結果
**WHEN** `CommitOrchestrator` が当該 step の成功を commit する
**THEN** rollover 分エントリは `modelUsage: null` かつ `contextOnly` を持たず（contextMetrics 無しでも skip されず）追記される

（TC-005 は「1 回目 session が実際に report tool を呼んでから枯渇する」ケースを追加して強化済み — 捕捉済み report result の破棄を実挙動で検証する）

---

## Result

```yaml
result: completed
total: 35
automated: 33
manual: 0
must: 27
should: 7
could: 1
blocked_reasons: []
```
