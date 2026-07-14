# Spec: 追加 AI ターンの構造的削減

## Requirements

### Requirement: local path の first-turn prompt に completion directive を注入する

`ctx.policy.reportTool` が設定された agent step を local Claude Code path で実行するとき、システムは first-turn prompt に、MCP tool `mcp__specrunner_report__report_result` を turn 終了前に呼ぶことを指示する completion directive を含めなければならない (MUST)。directive の provider 固有部分（MCP tool 名）は claude-code adapter 内に閉じ、core prompt は provider-neutral のままでなければならない (SHALL)。

#### Scenario: reportTool 設定時に directive が first-turn prompt に含まれる

**Given** `ctx.policy.reportTool` が設定された agent step
**When** `ClaudeCodeRunner.run()` が first-turn の `query()` を発行する
**Then** その `query` に渡される prompt に MCP tool 名 `mcp__specrunner_report__report_result` を呼ぶ completion directive が含まれる

#### Scenario: reportTool 未設定時は directive を注入しない

**Given** `ctx.policy.reportTool` が未設定の agent step
**When** `ClaudeCodeRunner.run()` が first-turn の `query()` を発行する
**Then** その prompt に MCP report_result tool を呼ぶ completion directive は含まれない

### Requirement: report_result 再試行 fallback を維持する

completion directive の注入後も、agent が first turn で report_result を呼ばなかった場合の再試行 fallback（`DEFAULT_TOOL_RETRY`, maxAttempts=2）を保持しなければならない (MUST)。fallback を削除してはならない (MUST NOT)。

#### Scenario: first turn で tool 未呼び出しなら再試行が走る

**Given** reportTool 設定済みで、agent が first turn で report_result を呼ばず session を確立して終える
**When** `ClaudeCodeRunner.run()` が first-turn 完了後に tool 未呼び出しを検出する
**Then** report_result 再試行 turn が maxAttempts の範囲で発行される

### Requirement: request.adr が false のとき adr-gen を agent 実行前に skip する

`request.adr === false` のとき、システムは adr-gen step の agent を実行せず、skipped verdict を記録しなければならない (MUST)。skip は既存の `commitSkipped` 経路（skipped verdict + `{step}-skipped` history）に載せ、新しい状態型・履歴型・halt を導入してはならない (MUST NOT)。

#### Scenario: adr:false で adr-gen が skip される

**Given** `request.adr === false` の job で pipeline が adr-gen step に到達する
**When** executor が adr-gen を実行する
**Then** agent runner は呼ばれず、adr-gen の最新 StepRun の verdict が "skipped" になり、`{step}-skipped` history entry が積まれる

#### Scenario: skip された adr-gen は pr-create へ進む

**Given** adr-gen が "skipped" verdict で完了する
**When** pipeline が次ステップを解決する
**Then** 遷移先が pr-create であり、pipeline は escalation に落ちない

### Requirement: findings ledger が空のとき regression-gate を agent 実行前に skip する

reviewer chain から算出した findings ledger が空のとき、システムは regression-gate step の agent を実行せず、skipped verdict を記録しなければならない (MUST)。ledger が非空のときは従来どおり agent を実行しなければならない (MUST)。

#### Scenario: 空 ledger で regression-gate が skip される

**Given** reviewer chain の fixable findings が 0 件の状態で pipeline が regression-gate に到達する
**When** executor が regression-gate を実行する
**Then** agent runner は呼ばれず、regression-gate の最新 StepRun の verdict が "skipped" になり、遷移先が conformance になる

#### Scenario: 非空 ledger で regression-gate は従来どおり実行される

**Given** reviewer chain に fixable finding が 1 件以上ある状態で pipeline が regression-gate に到達する
**When** executor が regression-gate を実行する
**Then** agent runner が呼ばれ、skip されない

### Requirement: 追加ターンを種別分離して計測し post-work を計上する

`StepOutcome` は追加ターンを report_result 再試行 / post-work / output-repair の種別で分離計測できなければならない (SHALL)。post-work turn を計上しなければならない (MUST)。既存 `followUpAttempts` フィールドは後方互換のため維持しなければならない (MUST)。

#### Scenario: post-work turn が種別計測に計上される

**Given** local claude-code adapter が work turn の後に postWorkPrompts の follow turn を実行する step
**When** step が成功して StepOutcome が記録される
**Then** StepOutcome の種別分離計測（addedTurns）に post-work turn 数が計上される

#### Scenario: report_result 再試行と output-repair が分離計測される

**Given** report_result 再試行 turn と output-repair turn が発生した step
**When** StepOutcome が記録される
**Then** 種別分離計測で report_result 再試行数と output-repair 数が別々に読め、両者の和が既存 `followUpAttempts` と一致する

### Requirement: skip 対象以外の観測挙動は不変

skip 対象 step（adr:false の adr-gen / 空 ledger の regression-gate）以外の verdict 導出と pipeline 遷移の観測挙動は変化してはならない (MUST NOT change)。

#### Scenario: 通常 step の verdict と遷移が不変

**Given** skip 対象でない任意の agent step が成功で完了する
**When** executor が verdict を導出し pipeline が遷移を解決する
**Then** verdict 値と遷移先は本 change 導入前と同一である
