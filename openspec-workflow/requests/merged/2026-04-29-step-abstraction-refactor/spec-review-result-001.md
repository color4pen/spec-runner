# Spec Review Result: 2026-04-29-step-abstraction-refactor — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.4 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 4

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 4 | 0.25 | 1.00 |
| feasibility | 7 | 0.20 | 1.40 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **6.40** |

### スコア根拠

- **completeness (7)**: D10 の手順 1〜4 と振る舞い不変要件は概ね網羅。ただし `StepRun` の `error` / `findingsPath` 相当フィールド、EventBus payload 型、`runLoopUntil` の処遇に空白がある。
- **consistency (4)**: 既存 spec capability との整合に大きな破綻が複数あり、後方互換 narrative は強いが MODIFIED delta が既存 capability を狙えていない。承認閾値未達の主因。
- **feasibility (7)**: ~600–800 LOC + コミット 4 段組の進め方は妥当。module-analysis.md が技術的実現性を裏付ける。
- **security (8)**: refactoring であり攻撃面の追加なし。`register_branch` input_schema 維持要件・error code preservation 要件あり。core 層 SDK 排除が信頼境界の明確化に寄与する。
- **maintainability (7)**: D7 boundary を spec で明文化、Hexagonal-lite の依存方向を grep gate で固定するのは良い。`core/step/` cohesion=6 の懸念は module-analysis に残るが implementer 判断に委譲。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | proposal.md:42, specs/job-state-schema/spec.md | `MODIFIED: job-state-schema` を宣言しているが、既存 spec capability は `job-state-store`（`openspec/specs/job-state-store/spec.md`）であり、同一ドメインの schema requirement を 2 capability に分裂させる。また `job-state-store` spec が定義する `iteration` / `session: SessionInfo` / `findingsPath` / `error` 等のフィールドと、新 `StepRun` の `attempt` / `sessionId` / `outcome` の 1:1 対応が示されていない。 | `specs/job-state-schema/` を `specs/job-state-store/` にリネームし、`## MODIFIED Requirements` で**既存 Requirement 名を見出しごと置換**する形に書き直す。具体的には `### Requirement: 状態ファイルは固定スキーマに従う` / `### Requirement: getLatestStepResult ...` / `### Requirement: StepResult への push は ...` の 3 件を MODIFIED 対象として明記し、フィールド名 (`iteration` ↔ `attempt`, `session` ↔ `sessionId`, etc.) の旧→新マッピング表を spec 内に含める。 |
| 2 | HIGH | consistency | proposal.md:43, specs/pipeline-state-machine/spec.md | `ADDED: pipeline-state-machine` を新規 capability として宣言しているが、既存 `pipeline-orchestrator` capability（`openspec/specs/pipeline-orchestrator/spec.md`）が同じ pipeline orchestration 領域を既に保有し、`runPipeline` シグネチャ・`runLoopUntil` 委譲・`step 関数は src/core/steps/` 等の Requirement を持つ。新 capability を ADD すると同一ドメインに 2 source of truth が並び、`pipeline-orchestrator` の `Requirement: step 関数は src/core/steps/ 配下に配置される` 等が新 layout (`src/core/step/`) と直接矛盾する。 | `specs/pipeline-state-machine/` を `specs/pipeline-orchestrator/` 配下の MODIFIED として書き直す。最低でも (a) `runPipeline は spec-review needs-fix で spec-fixer → spec-review iteration loop を起動する`、(b) `step 関数は src/core/steps/ 配下に配置される`、(c) `PipelineDeps の正規ロケーション` の 3 件は MODIFIED または REMOVED で明示。新 Pipeline class + transition table の Requirement は MODIFIED で既存記述を置換する形に。 |
| 3 | HIGH | consistency | specs/pipeline-state-machine/spec.md:62-74 | `### Requirement: CLI Output Format is Preserved` で `[iter N/M]` 進捗フォーマットを再記述しているが、既存 `pipeline-loop-primitive` spec の最終 Requirement (`stdout 進捗フォーマットの正規定義は pipeline-loop-primitive spec にある`) が MUST NOT 他 spec での再定義と single source of truth を宣言している。直接抵触。 | (a) `pipeline-state-machine` spec から CLI Output Format Requirement を削除し、参照のみ残す（`pipeline-loop-primitive` spec を参照する旨を Note 化）か、(b) `pipeline-loop-primitive` 側を MODIFIED/REMOVED し、Pipeline class が stdout の正規ソースになる旨を明示する、のいずれかを選択。`runLoopUntil` 廃止を伴うなら (b) が筋。 |
| 4 | HIGH | completeness | proposal.md:8, request.md:111-119, design.md:215, tasks.md:7 (and 多数) | 「全 168 既存テスト PASS」を acceptance / Goal で繰り返し参照しているが、現状の worktree では `bun test` が `162 tests` 報告（うち 1 fail / 1 error、`tests/cli.test.ts:7` でロード失敗）。受け入れ基準の base count が誤っているため、振る舞い不変判定の根拠が崩れる。 | (a) 実数を `bun test --reporter` で再計測し、`162` (or 修正後の正確な数) に書き直す、(b) 既存 1 failure を本 change 対象に含めるか、修正範囲外として切り出すかを request の補足セクションに明示する。design.md の D8 verification 4 階層もこの実数に揃える。 |
| 5 | MEDIUM | completeness | specs/job-state-schema/spec.md:6-12, design.md:38-60 | `StepRun` interface 定義に `outcome: StepOutcome` のみ記述があるが、既存 `job-state-store` spec は `findingsPath: string \| null` と `error: ErrorInfo \| null` を StepResult のトップレベルに要求している。`StepOutcome` 内に findings / error が入る前提なら、その内訳（`StepOutcome = { verdict, findings?, raw, findingsPath?, error? }` など）を spec で明示する必要がある。 | `## Requirement: JobState.steps Schema is StepRun Array Per Step` 直下に `StepOutcome` の構造を definition として追記。既存 `findingsPath` / `error` がどこに格納されるかを 1 行で対応付ける。 |
| 6 | MEDIUM | consistency | specs/job-state-schema/spec.md:38-42 | Legacy B normalization Scenario が `startedAt` / `endedAt` を「derived from existing fields if present, otherwise filled with best-effort defaults」と記述しているが、「best-effort defaults」が undefined behavior。既存 `StepResult` には `completedAt` のみ存在し `startedAt` 相当が無い。 | 「`startedAt = state.updatedAt` (旧スキーマ load 時点の updatedAt をフォールバック) / `endedAt = StepResult.completedAt ?? state.updatedAt`」のように具体的な derivation rule を Scenario 末尾に追加。production state を壊さないことを保証する。 |
| 7 | MEDIUM | completeness | specs/pipeline-state-machine/spec.md:38-42 | `Pipeline Enforces Loop Guard via maxIterations` が `SPEC_REVIEW_RETRIES_EXHAUSTED` を triggers するとあるが、既存 `pipeline-orchestrator` spec は `state.error` の message / hint 形式 (`"spec-review did not approve after <N> iterations"` / `"Review spec-review-result-<NNN>.md and adjust the request manually."`) と `state.steps["spec-review"]` 末尾 verdict 書き換えまで Requirement 化している。新 Pipeline がこれを担う場合、message / hint / verdict 書き換えの bit-for-bit 維持を spec で明示しないと振る舞い不変が証明できない。 | Loop Guard Requirement の Scenario に「error.message / error.hint の文字列が pre-refactor と verbatim」と verdict 書き換えを追記。または `pipeline-orchestrator` spec の MODIFIED として書き、引用形で正規記述を維持する。 |
| 8 | MEDIUM | consistency | tasks.md:38-39, specs/step-execution-architecture/spec.md:65-70 | `各 step ファイルが以前の 1/3 程度の LOC` を spec の Scenario として固定しているが、LOC は実装の自由度に属し spec に乗せると refactoring 中に何度も Scenario を修正する原因になる（実装が品質より行数を最適化するインセンティブ）。 | この Scenario は spec から removed し、proposal.md / tasks.md の goal に留める。Spec の Scenario としては「45–55 LOC duplicate block (session create / try-catch / failJobState / appendHistory / err.state attach) is absent from each step file」のみ残せば十分。 |
| 9 | MEDIUM | feasibility | tasks.md (全体), specs/module-boundary/spec.md:39-56 | `runLoopUntil` (existing in `src/core/loop.ts`) と `runManagedAgentSession` (existing in `src/core/session-runner.ts`) の処遇が tasks.md に明記されていない。design.md は `runLoopUntil` を `Pipeline.maxIterations` に分解する旨を述べるが、`pipeline-loop-primitive` capability の REMOVED / MODIFIED が delta に存在しない。 | (a) tasks に `4.x src/core/loop.ts (`runLoopUntil`) を Pipeline class 内に吸収・削除`、`4.y src/core/session-runner.ts を StepExecutor に吸収` を明示、(b) `specs/pipeline-loop-primitive/` の REMOVED delta を追加、(c) tasks 8.1/8.2 の delete 範囲を loop.ts / session-runner.ts に拡張。 |
| 10 | MEDIUM | completeness | design.md:154-167, specs/pipeline-state-machine/spec.md (entire) | EventBus の payload 型 (Open Question Q2) が未決のまま spec が ADDED されている。`pipeline:fail` payload の `failure reason` 形状、`step:error` payload の error shape (decorated with `state` 等) が spec で固定されないと、subscriber を後付けする際に payload が不安定で再 refactor が必要。 | spec に `Payload<E>` の mapped type 表（最低限 `step:error: { step, error: { code, message }, state }` / `pipeline:fail: { reason, lastStep }` など）を追加し、Open Question を closed にする。Phase 2 学習層の予約席として最も価値が出る部分。 |
| 11 | LOW | completeness | request.md:114, design.md:218 | error code preservation を 5 種 (`SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE`) で固定しているが、既存コード (`src/errors.ts`, `src/core/preflight.ts` 等) との突合で他の code (例: `STATE_FILE_INVALID`, `INVALID_REPOSITORY` 等) があれば preservation 対象に含めるべき。 | `grep -rE '"[A-Z_]+_(EXHAUSTED|TIMEOUT|TERMINATED|INCOMPLETE|INVALID|NOT_REGISTERED|REQUIRED)"' src/` で実在 code を列挙し、spec / request の preservation 対象を実態に揃える。 |
| 12 | LOW | maintainability | specs/module-boundary/spec.md:30-32 | `grep finds no SDK imports in core` Scenario の「the exit code is 1 (grep convention for no matches)」記述は正しいが、test ハーネスから ` || true` で吸収する書き方を spec が要求するように読める。Test 実装で誤解の余地がある。 | Scenario を「`grep ... || true` で run しても output が empty であること」など assertion 主体の記述に書き換える。または「the command produces zero matching lines」のみ残し exit code 言及を削除。 |
| 13 | LOW | consistency | specs/step-execution-architecture/spec.md:65-70, design.md:9 | 「prior implementations propose.ts (~386 LOC), spec-review.ts (~310 LOC), spec-fixer.ts (~185 LOC)」が hard-coded。次回 refactor で前提が古くなる。 | 「prior implementations of propose / spec-review / spec-fixer」と概数表記に留め、Scenario の固定値は削除。 |
| 14 | LOW | feasibility | tasks.md:80-86 | task 6 で `src/adapter/github/github-client.ts` を新設するとあるが、既存 GitHub I/O は propose.ts 内に inline (line 249-368) と spec-review.ts 内 (`fetchSpecReviewResult`, line 57-109) に散在しており、移植範囲・retry 戦略 (404 で 3 回 retry) の adapter 内/外 配置が未決。 | tasks 6.x に「retry policy は呼び元 (StepExecutor or step impl) で表現、adapter 層は薄い fetch wrapper に留める」を 1 行追加（module-analysis 4.7 の recommendation を採用）。 |

## Iteration Comparison

（iteration 2 以降で記載）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.40 | needs-fix | 初回。capability 分裂 (HIGH x2)、stdout 形式抵触 (HIGH)、test count 不一致 (HIGH) が主要ブロッカー |

## Convergence

- **trend**: —（初回）
- **recommendation**: continue（spec-fixer による修正を経て iteration 2 へ）

### 停滞検出ルール

- `plateaued` (前回との差が ±0.3 以内) が **2 iteration 連続** した場合、`verdict` を `escalation` にする
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する

## Summary

設計の方向性 (D1〜D9) と module boundary の定義は良く、refactoring の goal 設定も明瞭。**しかし spec delta の capability 設計に複数の構造的不整合**があり、既存 `job-state-store` / `pipeline-orchestrator` / `pipeline-loop-primitive` の 3 capability と新規 ADDED 4 capability の関係が整理されていない。特に同一ドメインに対して既存 capability を MODIFIED せず新 capability を ADDED した結果、既存 Requirement と新 Requirement が直接矛盾する箇所が 3 件以上ある（HIGH #1 / #2 / #3）。

加えて acceptance criteria が「168 tests PASS」で固定されているが現状 `bun test` は 162 tests（1 fail / 1 error 含む）で、振る舞い不変の根拠が崩れている（HIGH #4）。これは spec-fixer が機械的に修正できる部類だが、原因（テスト追加 / 削除があったか、test loader 側の問題か）の確認とともに修正が必要。

architect 観点では D1〜D9 のクラス設計は ADR と整合しており feasibility は問題ない。security 観点では refactoring のため攻撃面追加なし、`register_branch` input_schema preservation と error code preservation の Requirement が CRITICAL を防いでいる。

**spec-fixer への指示の要点**:
1. `specs/job-state-schema/` → `specs/job-state-store/` にリネームし MODIFIED 化（fields マッピング表を含めて既存 Requirement を置換）
2. `specs/pipeline-state-machine/` → `specs/pipeline-orchestrator/` の MODIFIED 化（または `pipeline-orchestrator` 既存 Requirement の REMOVED delta を追加）
3. `pipeline-loop-primitive` capability を REMOVED delta として追加（または stdout format 記述を pipeline-state-machine 側から削除）
4. test count を実測値に書き直し、現状の 1 failure を scope に含めるか out-of-scope として明記
5. `StepOutcome` の構造を spec で固定し、`startedAt` / `endedAt` の derivation rule を Scenario で明示
6. `runLoopUntil` / `runManagedAgentSession` の削除を tasks に明記
