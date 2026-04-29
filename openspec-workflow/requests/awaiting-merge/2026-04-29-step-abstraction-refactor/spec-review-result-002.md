# Spec Review Result: 2026-04-29-step-abstraction-refactor — Iteration 2

## Verdict

- **verdict**: needs-fix
- **score**: 7.05 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving (+0.65 from iter 1)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 5 | 0.25 | 1.25 |
| feasibility | 7 | 0.20 | 1.40 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **7.05** |

### スコア根拠

- **completeness (8 ↑1)**: `StepRun` field mapping table、`StepOutcome` の構造、Legacy B の derivation rule (`startedAt = state.updatedAt` fallback) が spec に明記され、HIGH #4 の test count 不整合も change-folder 内では解消。EventBus payload 型 (Q2) のみ未決のまま。
- **consistency (5 ↑1)**: 既存 `job-state-store` / `pipeline-orchestrator` capability への MODIFIED 化とフィールドマッピング表により HIGH #1〜#3 の根は解消。ただし `pipeline-loop-primitive` capability が `runLoopUntil` を「`src/core/loop.ts` の export 関数」として固定する Requirement を持つにもかかわらず、本 change の design.md / pipeline-orchestrator delta が「`runLoopUntil` を `Pipeline.run` 内部ロジックに吸収」と宣言しており、capability 越えの矛盾が残存（新 HIGH #1）。request.md と change-folder の test count 表記乖離も consistency を引き下げる（MEDIUM #2）。
- **feasibility (7)**: 4-commit 分割と LOC 見込みは妥当。`runLoopUntil` 廃止と `pipeline-loop-primitive` capability の REMOVED delta 不在により、tasks 8.x の削除範囲も `src/core/loop.ts` / `src/core/session-runner.ts` を含めるかが未確定（MEDIUM #4）。
- **security (8)**: 攻撃面追加なし。`register_branch` `input_schema` preservation Scenario あり、エラーコード preservation Scenario あり。`STATE_FILE_INVALID` 等 errors.ts 実在の他 11 code が preservation 列挙外であるが、`STATE_FILE_INVALID` は Job-state-store スキーマ変更の影響を受けやすい code であり明示が望ましい（LOW #5、iter 1 LOW #11 の継続）。
- **maintainability (8 ↑1)**: D7 module boundary が明確化され、`grep finds no SDK imports in core` Scenario の exit code 言及が依然として読み手を誤導する余地あり（LOW #6、iter 1 LOW #12 の継続）。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | specs/pipeline-orchestrator/spec.md:90 (Note), openspec/specs/pipeline-loop-primitive/spec.md:6-79 (entire) | pipeline-orchestrator delta の末尾 Note が「`runLoopUntil` 関数 (`src/core/loop.ts`) is absorbed into `Pipeline.run` internal logic」と宣言する一方、`pipeline-loop-primitive` capability spec の 全 7 Requirement が `runLoopUntil` を public export 関数として、`src/core/loop.ts` を file location として、stdout フォーマット文字列の **single source of truth** として固定している。本 change が `runLoopUntil` を private 内部ロジックに吸収すると、`pipeline-loop-primitive` の Requirement「`runLoopUntil` を import する」「`src/core/loop.ts` に export する」「state.history への append」等が新 Pipeline class の実装と直接矛盾する。stdout format 単一所有権を `pipeline-loop-primitive` 側に残す判断（iter 1 HIGH #3 の選択肢 (a)）と `runLoopUntil` 廃止は両立不能。 | 以下のいずれかを選択し delta に明記する: (X) `pipeline-loop-primitive` capability を REMOVED delta として `change-folder/specs/pipeline-loop-primitive/spec.md` に追加し、stdout format の正規定義を `pipeline-orchestrator` MODIFIED Requirement として吸収（`runLoopUntil` 廃止と整合）。または (Y) `runLoopUntil` を public export として `src/core/loop.ts` に残し、`Pipeline.run` がそれを内部で使う形を spec で明示（`pipeline-loop-primitive` capability を変更しない）。design.md `D6/D7` と pipeline-orchestrator delta:90 の Note は (X) を選んでいる読み方が自然なので、**recommendation は (X)**。tasks.md 8.x に「`src/core/loop.ts` 削除」を追加し、`pipeline-loop-primitive` REMOVED delta を新設する。 |
| 2 | MEDIUM | consistency | openspec-workflow/requests/active/2026-04-29-step-abstraction-refactor/request.md:111, 119, 161 | request.md の 3 箇所が依然として「168 tests」を参照する一方、proposal.md / design.md / tasks.md は「161 passing」に統一済み。change-folder 内は consistent だが、上流の request.md が deliverable 群と divergent。spec-fixer Decision Log でも「proposal/design/tasks のみ書き直す」と明記しており意図的な omission だが、reviewer / future spec-fixer が両者を再度突合できない。 | request.md に脚注または Note 1 行を追加: 「Test count "168" was an estimate at request authoring time. Actual `bun test` baseline is 161 passing / 1 fail / 1 error / 162 total — see proposal.md and design.md D8 for the authoritative count and scope-out rationale.」 これにより request.md は読み物として残しつつ、deliverable に正規 source を委ねる形が明示される。 |
| 3 | MEDIUM | completeness | specs/step-execution-architecture/spec.md:65-70 | 「prior implementations propose.ts (~386 LOC), spec-review.ts (~310 LOC), spec-fixer.ts (~185 LOC)」と「approximately 1/3 of its prior LOC」が hard-coded で残る。LOC は spec の Scenario として固定すると refactoring 中の微調整で頻繁に Scenario 修正が必要となり、実装が品質より行数を最適化するインセンティブを生む（iter 1 MEDIUM #8 の継続）。 | (a) Scenario から具体 LOC 数値を削除し「prior implementations of propose / spec-review / spec-fixer」と一般化する、または (b) Scenario 自体を削除して proposal.md / tasks.md の Goal にのみ残す。**recommendation**: (b)。spec の Scenario としては「45–55 LOC duplicate block (session create / try-catch / failJobState / appendHistory / err.state attach) is absent from each step file」のみで十分。 |
| 4 | MEDIUM | feasibility | openspec/changes/.../tasks.md:101-103 | tasks 8.1〜8.3 が `src/core/tools/` 削除 / `src/core/steps/` 削除 / `src/state/store.ts` deprecate を列挙するが、design.md 「`runLoopUntil` を `Pipeline.run` 内部ロジックに吸収」を実装するために必要な `src/core/loop.ts` および `src/core/session-runner.ts` の処遇が tasks に記述されていない（iter 1 MEDIUM #9 の継続）。HIGH #1 の解決に連動して必要な task。 | tasks 8.x に以下 2 行を追加: `8.1a src/core/loop.ts (runLoopUntil) を Pipeline.run / StepExecutor 内部に吸収して削除`、`8.1b src/core/session-runner.ts を StepExecutor に吸収して削除`。HIGH #1 を選択肢 (X) で解決する場合は必須、(Y) で解決する場合は不要（その場合は (X)/(Y) 選択結果を tasks に明記）。 |
| 5 | LOW | completeness | specs/job-state-store/spec.md:84-86 | エラーコード preservation Scenario が `SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE` の 5 種を列挙するが、`src/errors.ts` には他に 11 種の code（`STATE_FILE_INVALID`, `CHANGE_FOLDER_NOT_FOUND`, `SESSION_CREATE_FAILED`, `SPEC_REVIEW_RESULT_NOT_FOUND`, `SPEC_FIXER_NO_FINDINGS`, `CONFIG_MISSING`, `CONFIG_INVALID`, `GITHUB_TOKEN_EXPIRED`, `NOT_GIT_REPO`, `REMOTE_NOT_GITHUB`, `REQUEST_MD_INVALID`）が存在する。特に `STATE_FILE_INVALID` は本 change の schema migration の影響を受けやすい code で、preservation 対象に含めるべき（iter 1 LOW #11 の継続）。 | Scenario の error code 列挙を「all error codes defined in `src/errors.ts` (16 codes)」と総称化する、または `STATE_FILE_INVALID` を最低限追記する。 |
| 6 | LOW | maintainability | specs/module-boundary/spec.md:30-32 | `grep finds no SDK imports in core` Scenario の「the exit code is 1 (grep convention for no matches)」記述は事実だが、test ハーネス側で `\|\| true` で吸収する書き方を spec が要求するように読まれる余地あり（iter 1 LOW #12 の継続）。 | Scenario を assertion 主体に書き換える: 「the command produces zero matching lines」のみ残し、exit code 言及を削除。または「grep returns no output (exit code 1 by grep convention is acceptable)」と note 化。 |
| 7 | LOW | feasibility | openspec/changes/.../tasks.md:80-86 | task 6 で `src/adapter/github/github-client.ts` 新設が指示されるが、既存 GitHub I/O は propose.ts の inline (line 249-368) と spec-review.ts (`fetchSpecReviewResult`, line 57-109) に散在し、retry policy（404 で 3 回 retry）の adapter 内/外 配置が未決（iter 1 LOW #14 の継続）。module-analysis 4.7 が「retry policy は呼び元 (StepExecutor or step impl) で表現、adapter 層は薄い fetch wrapper に留める」と recommendation 済。 | tasks 6.x に「retry policy は呼び元 (StepExecutor or step impl) で表現し、adapter 層は薄い fetch wrapper に留める」を 1 行追加。 |
| 8 | LOW | completeness | openspec/changes/.../design.md:294-298 (Open Questions Q2) | EventBus payload 型 (Q2) の決定が iter 1 から繰り越し（iter 1 MEDIUM #10）。「`Payload<E>` mapped type で表現、emit / on で型推論。実装時に決定」のままで、後続 request の subscriber 実装時に payload shape の後付け変更が必要になる可能性あり。 | spec か design.md に最低限の payload skeleton（`step:start: { step, state }` / `step:error: { step, error: { code, message }, state }` / `pipeline:fail: { reason, lastStep }` 等）を追記し Q2 を closed にする。spec への bind が重い場合は design.md レベルで合意を残すだけでも可。 |

## Iteration Comparison

### Improvements (iter 1 → iter 2)

- HIGH #1 (job-state-schema 分裂) → 解消。`specs/job-state-store/` MODIFIED delta + フィールドマッピング表 (Legacy StepResult → StepRun) を新設。
- HIGH #2 (pipeline-state-machine 並立) → 解消。`specs/pipeline-orchestrator/` MODIFIED delta + REMOVED Requirements セクションで既存 6 Requirement を MODIFIED/REMOVED 化。step layout `src/core/steps/` → `src/core/step/` 移動も明示。
- HIGH #3 (stdout format 抵触) → 部分解消。pipeline-orchestrator delta から CLI Output Format Requirement を REMOVED し、`pipeline-loop-primitive` 側に format 所有権を残す方針を採用。ただし副作用として新 HIGH #1（loop.ts 廃止 vs pipeline-loop-primitive 維持の衝突）を生んだ。
- HIGH #4 (test count 168) → change-folder 内は解消。proposal.md/design.md/tasks.md が 161 passing baseline + cli.test.ts scope-out 明記に統一。
- MEDIUM #5 (StepOutcome 構造) → 解消。フィールドマッピング表で `outcome.verdict` / `outcome.findingsPath` / `outcome.error` の対応を明示。
- MEDIUM #6 (Legacy B normalization) → 解消。`startedAt = state.updatedAt`、`endedAt = StepResult.completedAt` の derivation rule を Scenario に追記。
- MEDIUM #7 (Loop Guard error format) → 解消。pipeline-orchestrator MODIFIED の `Pipeline Enforces Loop Guard via maxIterations` Scenario が message / hint / verdict 書き換えを bit-for-bit 記述。

### Regressions

- 新 HIGH #1（pipeline-loop-primitive と runLoopUntil 廃止の衝突）: iter 1 HIGH #3 の選択肢 (a) を採用した結果生じた構造的副作用。iter 1 では選択肢のいずれも採れば解消する想定だったが、(a) を採用しつつ `runLoopUntil` 廃止を design に残したため、capability 越えの矛盾が顕在化。

### Unchanged Issues (iter 1 から繰り越し)

- MEDIUM #8 (LOC を spec に固定) → そのまま残る。
- MEDIUM #9 (`runLoopUntil` / `runManagedAgentSession` の処遇) → tasks 8.x への明記なし。新 HIGH #1 の前提条件。
- MEDIUM #10 (EventBus payload Q2) → 未決のまま。
- LOW #11 (error code 列挙の網羅性) → 未対応。
- LOW #12 (`grep` exit code 言及) → 未対応。
- LOW #13 (LOC 数値の hard-coded) → MEDIUM #8 と重複（iter 2 で MEDIUM #3 に統合）。
- LOW #14 (retry policy 配置) → 未対応。

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.40 | needs-fix | 初回。capability 分裂 (HIGH x2)、stdout 形式抵触 (HIGH)、test count 不一致 (HIGH) が主要ブロッカー |
| 2 | 7.05 | needs-fix | HIGH 4 件中 3.5 件解消 (#1, #2 完全; #3 部分; #4 change-folder 内のみ)。新 HIGH #1（pipeline-loop-primitive と runLoopUntil 廃止の衝突）が iter 1 HIGH #3 解消の副作用として発生 |

## Convergence

- **trend**: improving (+0.65)
- **recommendation**: continue (escalation 推奨ではない)

### 停滞検出ルール適用

- iter 1 (6.40) → iter 2 (7.05) の差分は +0.65 で `improving` 相当（≥ 0.3）。`plateaued` でも `regressing` でもないため停滞検出には該当しない。
- pass threshold (7.0) を Total として超過しているが、HIGH #1 が残るため verdict は `needs-fix`（review-standards.md の承認阻止条件: HIGH ≥ 1）。

### Retry の見通し

- retries: 1/2（最大 2 回中 1 回消化）
- 残 retry 1 回で HIGH #1 (pipeline-loop-primitive REMOVED delta 追加 or runLoopUntil 維持の明示) を解消すれば approved 可能性が高い。MEDIUM #2〜#4 の少なくとも 1 件併合修正で score 7.3+ を見込める。
- HIGH #1 の修正方向は明確（選択肢 X か Y のいずれか + tasks 8.x 追記）であり、spec-fixer が処理可能な範囲。escalation 推奨ではない。

## Summary

iter 1 で指摘した HIGH 4 件のうち #1, #2 は capability rename + MODIFIED 化で完全解消、#4 は change-folder 内で完全解消、#3 は方針 (a)（`pipeline-loop-primitive` を stdout 単一所有権者として維持）で部分解消した。MEDIUM 群も #5, #6, #7 は `StepOutcome` 構造化と Legacy B derivation rule の明示で解消し、設計の核（D1〜D9 の class architecture と D7 module boundary）は spec として十分に固まった。

ただし iter 1 HIGH #3 の解消手段として選択した方針 (a) と、design.md / pipeline-orchestrator delta が宣言する「`runLoopUntil` を `Pipeline.run` 内部ロジックに吸収」が **capability 越えで両立不能**である点が新 HIGH #1 として顕在化した。`pipeline-loop-primitive` spec の 7 Requirement すべてが `runLoopUntil` の public export と `src/core/loop.ts` location を前提にしており、これらが新 Pipeline class の実装と矛盾する。**この衝突は iter 1 HIGH #3 の修正指示が選択肢 (a) と (b) の二択だった点に起因**しており、(a) を選んだのは妥当だが、その場合 `runLoopUntil` を public export として残す必要があった（あるいは `pipeline-loop-primitive` capability を REMOVED にする必要があった）。

それ以外の MEDIUM #2〜#4 は spec-fixer が低コストで処理可能な範疇（request.md 注記 / Scenario の LOC 削除 / tasks.md への loop.ts 削除 task 追記）。LOW 群は次回 retrospect で扱う。

**spec-fixer への指示の要点（iter 3 を起こす場合）**:

1. **HIGH #1 の最優先解消**: 以下のいずれかを選択し delta に反映:
   - 選択肢 X (recommended): `change-folder/specs/pipeline-loop-primitive/spec.md` に REMOVED delta を新設し、`pipeline-loop-primitive` capability の 7 Requirement を REMOVED にする。stdout format の正規定義は `pipeline-orchestrator` MODIFIED Requirement として吸収（新 Requirement「Pipeline emits stdout progress in the same format as the prior runLoopUntil」を追加し、format 文字列例を bit-for-bit 列挙）。tasks 8.x に `src/core/loop.ts` / `src/core/session-runner.ts` 削除を追記。
   - 選択肢 Y: design.md / pipeline-orchestrator delta:90 の Note を「`runLoopUntil` は `src/core/loop.ts` に public export として残し、`Pipeline.run` がそれを内部で使う」と書き直し、tasks に loop.ts 削除を追記しない。`pipeline-loop-primitive` capability は無変更。
2. **MEDIUM #2**: request.md に脚注 1 行を追記して change-folder への正規 source 委譲を明示。
3. **MEDIUM #3**: `step-execution-architecture/spec.md:65-70` の Scenario から具体 LOC 数値を削除（または Scenario 自体を削除し proposal.md/tasks.md の Goal に留める）。
4. **MEDIUM #4**: tasks 8.x に `src/core/loop.ts` / `src/core/session-runner.ts` の処遇 1 行追加（HIGH #1 の選択結果と整合）。
5. LOW 群（#5〜#7）は scope 外で次回 retrospect に回しても OK。HIGH と MEDIUM のみで approved 到達可能。
