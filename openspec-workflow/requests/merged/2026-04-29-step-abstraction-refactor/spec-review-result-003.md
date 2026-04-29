# Spec Review Result: 2026-04-29-step-abstraction-refactor — Iteration 3

## Verdict

- **verdict**: approved
- **score**: 7.55 / 10.0 (pass threshold: 7.0)
- **iteration**: 3 / 3
- **trend**: improving (+0.50 from iter 2)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 2/2
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 7 | 0.25 | 1.75 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 6 | 0.10 | 0.60 |
| **Total** | | | **7.55** |

### スコア根拠

- **completeness (8)**: HIGH #1 完全解消。`pipeline-loop-primitive` REMOVED delta が 7 Requirement すべてを `Reason` + `Migration` 付きで明示し、stdout format の正規定義は `pipeline-orchestrator` MODIFIED delta の `Pipeline Emits Iteration Progress to Stdout` Requirement に bit-for-bit 移管された。LOC 数値の hard-coded（MEDIUM #3）は未対応で −1。Q2 EventBus payload も未決のまま（LOW 継続）。
- **consistency (7 ↑2)**: capability 越えの矛盾（旧 HIGH #1）解消で大幅改善。tasks 8.1a / 8.1b 追加で実装範囲も整合。残課題は (a) `proposal.md:45` の Affected Specs 行が「stdout format の single source of truth は `pipeline-loop-primitive` に維持」と記述しており、新 REMOVED delta（stdout format 所有権を pipeline-orchestrator に移管）と内部矛盾、(b) request.md の 168 表記 3 箇所が deliverable 群（161 baseline）と divergent のまま（旧 MEDIUM #2 継続）。これらは LOW〜MEDIUM の文言不整合で、HIGH には届かない。
- **feasibility (8 ↑1)**: tasks 8.1a / 8.1b 追加で `src/core/loop.ts` / `src/core/session-runner.ts` の処遇が確定。4-commit 分割と LOC 見込みは妥当。
- **security (8)**: 攻撃面追加なし。エラーコード preservation Scenario は 5 種列挙のままで `STATE_FILE_INVALID` 等が漏れる懸念は残るが LOW（旧 LOW #5 継続）。
- **maintainability (6 ↓2)**: D7 module boundary は明確だが、`grep finds no SDK imports in core` Scenario の exit code 言及（旧 LOW #6）が未対応。さらに proposal.md 内部矛盾（前述）で読み手の信頼が下がる。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | openspec/changes/2026-04-29-step-abstraction-refactor/proposal.md:45 | proposal.md の Affected Specs 行が「`pipeline-orchestrator` ... stdout format の single source of truth は `pipeline-loop-primitive` に維持」と記述する一方、change-folder の実 delta では `pipeline-loop-primitive` が REMOVED され stdout format 所有権は `pipeline-orchestrator` MODIFIED delta の `Pipeline Emits Iteration Progress to Stdout` Requirement に移管されている。proposal.md の Affected Specs 行と change-folder/specs/ の実態が衝突する。 | proposal.md:45 を以下のように書き換える: `- **MODIFIED**: pipeline-orchestrator — Pipeline class + Transition table 駆動、runLoopUntil 委譲の廃止、src/core/steps/ → src/core/step/ レイアウト変更、stdout format の single source of truth を「Pipeline Emits Iteration Progress to Stdout」Requirement として吸収`。さらに Affected Specs リストに `- **REMOVED**: pipeline-loop-primitive — runLoopUntil 関数を Pipeline.run 内部に吸収するため capability 全体を REMOVED` を 1 行追加する。 |
| 2 | MEDIUM | consistency | openspec-workflow/requests/active/2026-04-29-step-abstraction-refactor/request.md:111, 119, 161 | request.md の 3 箇所が依然として「168 tests」を参照する一方、proposal.md / design.md / tasks.md は「161 passing」に統一済み。spec-fixer iter 2 では HIGH #1 + MEDIUM #4 のみ修正され、MEDIUM #2 は未対応のまま繰り越し。 | request.md に脚注 1 行を追加: 「Note: 「168 tests」は request 起案時の見積もり。実際の `bun test` baseline は 161 passing / 1 fail / 1 error / 162 total — proposal.md 冒頭注記および design.md D8 を authoritative source とする。」 |
| 3 | MEDIUM | completeness | openspec/changes/2026-04-29-step-abstraction-refactor/specs/step-execution-architecture/spec.md:65-70 | `Three existing steps reduce to declarative form` Scenario が「prior implementations propose.ts (~386 LOC), spec-review.ts (~310 LOC), spec-fixer.ts (~185 LOC)」と「approximately 1/3 of its prior LOC」を hard-coded。LOC を spec の Scenario として固定すると refactoring 中の微調整で頻繁に Scenario 修正が必要となり、実装が品質より行数を最適化するインセンティブを生む。iter 1 → iter 2 → iter 3 で 3 回繰り越し。 | Scenario を以下に書き換える: `#### Scenario: Three existing steps reduce to declarative form` / `- **GIVEN** the prior implementations of propose, spec-review, spec-fixer steps` / `- **WHEN** they are migrated to Step implementations` / `- **THEN** each migrated file contains only buildMessage / resultFilePath / parseResult and tool-handler registration` / `- **AND** the 45–55 LOC duplicate block (session create / try-catch / failJobState / appendHistory / err.state attach) is absent from each step file`。具体 LOC 数値は proposal.md / tasks.md の Goal にのみ残す（spec の振る舞い証明には不要）。 |
| 4 | LOW | completeness | openspec/changes/2026-04-29-step-abstraction-refactor/specs/job-state-store/spec.md:84-86 | エラーコード preservation Scenario が 5 種（`SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE`）を列挙するが、`src/errors.ts` には他に 11 種の code が存在。特に `STATE_FILE_INVALID` は本 change の schema migration の影響を受けやすい code で、preservation 対象に含めるべき。iter 1 → 2 → 3 で繰り越し。 | Scenario の error code 列挙を「all error codes defined in `src/errors.ts` (16 codes including STATE_FILE_INVALID)」と総称化する、または最低限 `STATE_FILE_INVALID` を追記。 |
| 5 | LOW | maintainability | openspec/changes/2026-04-29-step-abstraction-refactor/specs/module-boundary/spec.md:30-32 | `grep finds no SDK imports in core` Scenario の「the exit code is 1 (grep convention for no matches)」記述は事実だが、test ハーネス側で `\|\| true` で吸収する書き方を spec が要求するように読まれる余地。iter 1 → 2 → 3 で繰り越し。 | Scenario を assertion 主体に書き換え: 「**THEN** the command produces zero matching lines」のみ残し、exit code 言及を削除（または note 化: `(grep returns exit code 1 by convention when there are no matches; harness MAY tolerate this)`）。 |
| 6 | LOW | feasibility | openspec/changes/2026-04-29-step-abstraction-refactor/tasks.md:80-86 | task 6 で `src/adapter/github/github-client.ts` 新設が指示されるが、retry policy（404 で 3 回 retry）の adapter 内/外 配置が未決。module-analysis 4.7 の recommendation（「retry policy は呼び元 (StepExecutor or step impl) で表現、adapter 層は薄い fetch wrapper に留める」）が tasks に未反映。iter 1 → 2 → 3 で繰り越し。 | tasks 6.x に 1 行追加: `- [ ] 6.3a retry policy（404 で 3 回 retry 等）は呼び元 (StepExecutor or step impl) で表現し、adapter/github は薄い fetch wrapper に留める`。 |
| 7 | LOW | completeness | openspec/changes/2026-04-29-step-abstraction-refactor/design.md:294-298 (Open Questions Q2) | EventBus payload 型 (Q2) の決定が iter 1 → 2 → 3 で繰り越し。「`Payload<E>` mapped type で表現、emit / on で型推論。実装時に決定」のままで、後続 request の subscriber 実装時に payload shape の後付け変更が必要になる可能性。 | design.md または step-execution-architecture spec に最低限の payload skeleton を追記し Q2 を closed にする。例: `step:start: { step: StepName, state: JobState }` / `step:error: { step: StepName, error: { code: string, message: string }, state: JobState }` / `verdict:parsed: { step: StepName, outcome: StepOutcome }` / `pipeline:fail: { reason: "escalation" \| "exhausted" \| "exception", lastStep: StepName }`。 |

## Iteration Comparison

### Improvements (iter 2 → iter 3)

- **HIGH #1（pipeline-loop-primitive REMOVED の不在）→ 完全解消**: `change-folder/specs/pipeline-loop-primitive/spec.md` に REMOVED delta を新設し、7 Requirement すべてに `Reason` と `Migration` を付与。stdout format の正規定義は `pipeline-orchestrator` MODIFIED delta の `Pipeline Emits Iteration Progress to Stdout` Requirement に bit-for-bit 移管され、Iteration progress format の 5 文字列（approved / needs-fix / escalation / exhausted / start）すべてが authoritative 形で記載。
- **MEDIUM #4（loop.ts / session-runner.ts 削除タスク不在）→ 完全解消**: tasks.md に `8.1a src/core/loop.ts (runLoopUntil) を Pipeline.run / StepExecutor 内部に吸収して削除` および `8.1b src/core/session-runner.ts を StepExecutor に吸収して削除` を追加。
- **pipeline-orchestrator delta 整合性 → 改善**: 末尾 Note が「`pipeline-loop-primitive` capability is REMOVED by this change」に書き換えられ、iter 2 の「remains UNCHANGED」表記と新 REMOVED delta との矛盾が解消。

### Regressions

- **proposal.md:45 の Affected Specs 行が新たな内部矛盾**: spec-fixer は specs/ 下と pipeline-orchestrator delta を更新したが、proposal.md の Affected Specs リストは「stdout format の single source of truth は `pipeline-loop-primitive` に維持」のまま残っており、change-folder の実 delta（pipeline-loop-primitive REMOVED + stdout format を pipeline-orchestrator に移管）と矛盾する状態に。新 MEDIUM #1（旧 HIGH #1 解消の副作用、ただし HIGH には到達しない文言不整合）。

### Unchanged Issues (iter 1 → iter 2 → iter 3 で繰り越し)

- MEDIUM #2 (request.md の 168 tests 表記) → 未対応（脚注追加せず）
- MEDIUM #3 (LOC を spec に hard-code) → 未対応
- LOW #4 (error code 列挙の網羅性) → 未対応
- LOW #5 (`grep` exit code 言及) → 未対応
- LOW #6 (retry policy 配置) → 未対応
- LOW #7 (EventBus payload Q2) → 未対応

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.40 | needs-fix | 初回。capability 分裂 (HIGH x2)、stdout 形式抵触 (HIGH)、test count 不一致 (HIGH) が主要ブロッカー |
| 2 | 7.05 | needs-fix | HIGH 4 件中 3.5 件解消。新 HIGH #1（pipeline-loop-primitive と runLoopUntil 廃止の衝突）が iter 1 HIGH #3 解消の副作用として発生 |
| 3 | 7.55 | approved | HIGH 完全解消（pipeline-loop-primitive REMOVED delta 新設、stdout format 移管、tasks 8.1a/8.1b 追加）。残課題は MEDIUM 3 件 + LOW 4 件で、approval 阻止条件 (CRITICAL/HIGH ≥ 1) に該当せず |

## Convergence

- **trend**: improving (+0.50)
- **recommendation**: approve（HIGH 0 件、Total ≥ 7.0、停滞検出非該当）

### 停滞検出ルール適用

- iter 2 (7.05) → iter 3 (7.55) の差分は +0.50 で `improving` 相当（≥ 0.3）。`plateaued` でも `regressing` でもないため停滞検出には該当しない。
- pass threshold (7.0) を Total として超過し、CRITICAL: 0 / HIGH: 0 のため verdict は `approved`（review-standards.md の承認阻止条件: `CRITICAL ≥ 1 または HIGH ≥ 1` に非該当）。

### Retry の見通し

- retries: 2/2（最大 2 回中 2 回消化）
- 残 retry 0 だが、approved 判定のため retry 不要。MEDIUM 群 #1〜#3 は scope 外として後続フェーズ（implementer / code-review）または retrospect で扱える文言不整合。LOW 群（#4〜#7）は次回 retrospect 候補。

## Summary

iter 2 の HIGH #1（`pipeline-loop-primitive` capability spec と「`runLoopUntil` を Pipeline.run 内部に吸収」design 宣言の衝突）が iter 3 で完全解消した。spec-fixer は選択肢 X（recommended）を採用し、`change-folder/specs/pipeline-loop-primitive/spec.md` に REMOVED delta を新設、7 Requirement すべてに `Reason` と `Migration` を付与し、stdout format の正規定義（5 文字列：iteration start / approved / escalation / needs-fix / exhausted）を `pipeline-orchestrator` MODIFIED delta の新 Requirement `Pipeline Emits Iteration Progress to Stdout` に bit-for-bit 移管した。tasks 8.1a / 8.1b で `src/core/loop.ts` / `src/core/session-runner.ts` の削除タスクも追加され、実装範囲も整合した。

設計の核（D1〜D9 の class architecture と D7 module boundary）は spec として十分に固まり、capability 越えの矛盾も解消。Total score 7.55 で pass threshold 7.0 を超過し、CRITICAL/HIGH も 0 件のため `approved` を返す。

残課題は以下の通りで、いずれも HIGH に到達しない文言不整合または scope 外の improvement：

1. **MEDIUM #1**: proposal.md:45 の Affected Specs 行が iter 2 の旧方針（「stdout format の single source of truth は `pipeline-loop-primitive` に維持」）のまま残り、change-folder の実 delta（pipeline-loop-primitive REMOVED + stdout format を pipeline-orchestrator に移管）と内部矛盾。後続フェーズで proposal.md を 1 行修正することで容易に解消可能。
2. **MEDIUM #2** (繰り越し): request.md の 168 tests 表記。脚注 1 行で deliverable に正規 source を委譲する形が推奨。
3. **MEDIUM #3** (繰り越し): step-execution-architecture spec に LOC が hard-coded。Scenario を一般化することで解消可能。
4. **LOW #4〜#7** (繰り越し): error code 網羅性 / grep exit code 言及 / retry policy 配置 / EventBus payload Q2。いずれも次回 retrospect 候補。

approved 判定であるため、これらの MEDIUM/LOW は code-review 段階で documentation/spec 修正として併合 fix することが推奨。spec-review としては収束完了とする。

**implementer / code-review への申し送り**:

- proposal.md:45 を「pipeline-orchestrator MODIFIED + pipeline-loop-primitive REMOVED」と整合する記述に書き換える（MEDIUM #1）。
- step-execution-architecture/spec.md:65-70 の Scenario から具体 LOC 数値を削除（MEDIUM #3）。LOC は実装時の Goal にのみ残す。
- request.md の 168 tests 表記 3 箇所に脚注を追加（MEDIUM #2）。
- LOW 群（#4〜#7）は continuous-learning / retrospect で扱う。
