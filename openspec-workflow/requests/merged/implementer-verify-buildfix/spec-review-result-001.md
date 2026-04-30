# Spec Review Result: implementer-verify-buildfix — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.7 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, security-reviewer, pattern-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 3

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 7 | 0.20 | 1.40 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **6.70** |

### スコア理由

- **completeness 6**: 5 phase verification の I/F は揃っているが、`bun test` 指定 vs 実 package.json (`vitest`) の乖離、test phase が `bun test` で他 phase が `bun run <phase>` という「2 系統」を吸収する config が phases.ts の Scenario レベルで明文化されていない。受け入れ基準（13.x）に「verification-result.md が 5 phase の結果を含む形式」はあるが、target project の package.json scripts 不在時の skipped 挙動と verdict 算出（全 skipped でも passed か）が spec で曖昧。
- **consistency 6**: `Verdict` union 拡張で `"success"` / `"error"` を新設したが、agent step の完了検知は「session 完了 = success / 例外 = error」と StepExecutor 内で導出する設計が `step-execution-architecture` spec の lifecycle 番号 7 で `derive verdict: "success"` と書かれており、`error` 側の verdict 導出経路が spec に欠落。`spec-fixer` の既存 verdict は `null` のままで、`implementer` / `build-fixer` は `"success"` を導出するという挙動差が「同じ resultFilePath: null パターン」なのに非対称になっている（既存 spec-fixer の挙動を変える MODIFIED 指定が無い）。
- **feasibility 7**: D1 discriminator の migration（既存 3 step に `kind: "agent"` 追加）は mechanical で実現可能。loop guard 汎用化は `STANDARD_TRANSITIONS` から導出する設計が記述されている。ただし「`AgentStep | CliStep` の判別を kind のみで行い step 名 hardcode を一切残さない」は executor のみならず init.ts / run.ts の steps Map にも波及するため、cleanup 完了の grep 検証範囲が tasks.md 8.3 で executor 限定になっていて狭い。
- **security 8**: `<user-request>` XML 包囲は implementer / build-fixer の Requirement に明記。verification CLI runner は agent を呼ばないため prompt injection 経路は無い。child_process.spawn の引数注入リスクは phase 名が固定配列であり問題なし。
- **maintainability 8**: discriminator union の採用は learned-pattern 「lifecycle はデータ存在で推論せず明示的 discriminator」に正しく準拠。Step interface の型レベル分離は将来の PR step 追加にも再利用可能。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/implementer-verify-buildfix/specs/implementer-session/spec.md:39 / build-fixer-session/spec.md:42 | `implementer` / `build-fixer` の `parseResult` 戻り値が `{ verdict: null, findingsPath: null }` の 2 フィールドだが、既存 `ParsedStepResult` interface (`src/core/step/types.ts:19`) は 3 フィールド (`verdict`, `findingsPath`, `fileContent?`) であり、設計 D10 が引用する spec-fixer の現状 shape と一致しない。さらに module-analysis 4.4 / tasks.md 1.4 で導入される `NULL_PARSE_RESULT` は `fileContent: null` を含む形だが spec の Scenario はこれと矛盾する記述になっている。 | implementer / build-fixer の Scenario 「parseResult は verdict null」を `{ verdict: null, findingsPath: null, fileContent: null }`（または「`NULL_PARSE_RESULT` を返す」）に修正し、`NULL_PARSE_RESULT` の正確な shape を 1 箇所で定義（agent-registry または step-execution-architecture spec）して 3 step（spec-fixer / implementer / build-fixer）で共有参照する。 |
| 2 | HIGH | completeness | openspec/changes/implementer-verify-buildfix/specs/verification-runner/spec.md:22 + 45-54 | 「全 phase が skipped」だった場合の verdict 算出が未定義。Scenario「lint script 不在」は 1 phase skipped 時の例だが、極端に `package.json` が空の target で 5 phase 全部 skipped になった場合に `passed` を返すのか、`failed` を返すのか、`escalation` を返すのかが Requirement にない。受け入れ基準 13.3 の「5 phase の結果を含む形式」も「全 phase 実行が前提」となっておりエッジケース漏れ。 | verification-runner spec に Requirement 追加: 「全 phase が skipped の場合の verdict 算出」。推奨は `verdict: "failed"` + 専用 `errorCode: "VERIFICATION_NO_RUNNABLE_PHASES"` (build-fixer に渡せない死路を回避) または「最低 1 phase が passed であること」を verdict passed の必要条件にする。Scenario「全 phase skipped」を追加。 |
| 3 | HIGH | consistency | openspec/changes/implementer-verify-buildfix/specs/verification-runner/spec.md:22 | test phase の起動コマンドを `bun test` と固定指定しているが、target project の `package.json` には `"test": "vitest run"` が定義されており、`bun run test` のほうが project が宣言した test runner（vitest）を呼ぶ。`bun test` 固定だと package.json 上の `"test"` script が無視され、Bun 内蔵の test runner が走り vitest テストが完全に無視される（または失敗する）。受け入れ基準 13.1「既存テスト全 PASS」と直接矛盾する。 | verification-runner spec の test phase 指定を `bun run test`（package.json scripts 経由）に統一する。phases.ts は `PHASE_SCRIPTS: Record<PhaseName, string>` を `{ build: "build", typecheck: "typecheck", test: "test", lint: "lint", security: "security" }` の単一形式（全て `bun run <script>` で呼ぶ）に揃える。design.md D2 / tasks.md 3.1 の「test phase は `bun test`、それ以外は `bun run <phase>`」記述も同時修正。 |
| 4 | MEDIUM | consistency | openspec/changes/implementer-verify-buildfix/specs/pipeline-orchestrator/spec.md:84-89 | `Verdict` 拡張で `"success"` / `"error"` を追加し「`StepExecutor` lifecycle で導出」と書かれているが、既存 spec-fixer の verdict は `null` のまま据え置きと design D9 / D10 が明言。これは「同じ resultFilePath: null パターン」で挙動差が出る非対称設計であり、existing `spec-fixer` Scenario（spec-fixer-session の既存 spec で `verdict: null` を assertion している）と新 `implementer` の `verdict: "success"` 導出が共存する。spec-fixer に MODIFIED ブロックを入れて `"success"` 導出に揃えるか、なぜ spec-fixer だけ null を保持するのかの根拠を design.md / spec の `Verdict` Requirement に明示する必要がある。 | (a) 推奨: spec-fixer-session spec を MODIFIED に追加し、既存 `spec-fixer` も「session 完了で `verdict: "success"` を導出」に揃える（3 step 同一パターン化）。または (b) `Verdict` Requirement に「`spec-fixer` のみ後方互換のため `null` を保持し、新 step は `"success"` を導出する」と明示する根拠 1 文を追加し、design.md Open Question として「将来 `spec-fixer` も統一する条件」を記録する。 |
| 5 | MEDIUM | completeness | openspec/changes/implementer-verify-buildfix/specs/build-fixer-session/spec.md:25 | `BUILD_FIXER_NO_VERIFICATION_RESULT` の error shape が Requirement に文字列だけ書かれており、`message` / `hint` の format が未指定。`SPEC_REVIEW_RETRIES_EXHAUSTED` / `VERIFICATION_RETRIES_EXHAUSTED` は pipeline-orchestrator spec で format 完全指定（`message`: "...", `hint`: "..."）されているのと非対称。 | build-fixer-session spec の Requirement に「`{ code: "BUILD_FIXER_NO_VERIFICATION_RESULT", message: "build-fixer requires verification result but none found", hint: "Ensure verification step produced openspec/changes/<slug>/verification-result.md before invoking build-fixer." }`」相当の format を明記する。Scenario「verification 結果不在」も `state.error` の field 値を assert する形に拡張。 |
| 6 | MEDIUM | consistency | openspec/changes/implementer-verify-buildfix/specs/verification-runner/spec.md:74-94 | `VerificationStep.parseResult` が「マッチしない場合は `verdict: null` を返し StepExecutor 側で escalation 経路に乗せる」と書かれているが、`Verdict` 値として `null` から `escalation` への変換ロジックがどこに定義されるかが pipeline-orchestrator spec / step-execution-architecture spec のいずれにも明示されていない。STANDARD_TRANSITIONS には `verification --escalation→ escalate` 行があるので「null → escalation 変換」は誰がやる？ | step-execution-architecture spec の `StepExecutor` lifecycle Requirement に「`parseResult` が `verdict: null` を返した CLI step の場合、`StepExecutor` は `verdict: "escalation"` に正規化して `state.steps[step.name]` に書く」を明示する。または `VerificationStep.parseResult` 自体が `verdict: "escalation"` を返す（`Verdict` union を活用）形に統一する。 |
| 7 | MEDIUM | feasibility | openspec/changes/implementer-verify-buildfix/specs/pipeline-orchestrator/spec.md:58-63 + tasks.md:9.5 | loop name と error code の mapping を「transition table から導出」と書いているが、`SPEC_REVIEW_RETRIES_EXHAUSTED` / `VERIFICATION_RETRIES_EXHAUSTED` の **コード文字列とエラーメッセージ template** はどこに保持される？ transition table 1 行が「step ↔ step」の cycle 識別までは導出可能だが、エラー code の文字列自体は別 table が必要。spec で algorithm が曖昧。 | pipeline-orchestrator spec に Requirement 追加: 「`Pipeline` は cycle ごとの error code を `LOOP_ERROR_CODES: Record<StepName, { code: string; message: string; hint: string }>` のような lookup から取得する」または「transition table の `Transition` 型に optional `loopErrorCode` field を追加して cycle 端点で参照する」。algorithm の責任分界を 1 箇所で固定し、tasks.md 9.5 の汎用化作業の入力を確定する。 |
| 8 | MEDIUM | maintainability | openspec/changes/implementer-verify-buildfix/specs/step-execution-architecture/spec.md:93 | 「`StepExecutor` MUST NOT contain hardcoded step-name branches」と明記されたが、`tasks.md 8.5` で既知の `runPollingStyleStep` 内 `state.steps?.["spec-review"]?.length` hardcode を `state.steps?.[step.name]?.length` に汎用化する作業が tasks にあるだけで、Requirement レベルでの「step 名 hardcode 禁止」が `runPollingStyleStep` 等の helper にも及ぶことが明示されていない。同じ違反が build-fixer 追加時に再発しうる。 | step-execution-architecture spec の Requirement に「`StepExecutor` の helper 関数（`runPollingStyleStep` 等）も step 名 hardcode を含まない」「grep `"spec-review"` / `"verification"` 等の step 名リテラルが executor.ts に出現しない」Scenario を追加。 |
| 9 | LOW | completeness | openspec/changes/implementer-verify-buildfix/specs/verification-runner/spec.md:60 | `verification-result.md` 1 行目 format `# Verification Result — <slug> — iter <N>` の `<N>` が「verification step の累積実行回数」か「pipeline 全体の iteration」か未定義。spec-review-result-`{NNN}.md` は 3 桁ゼロ埋めだが、verification-result.md は同名上書きか連番出力かも未定義。 | verification-runner spec に Requirement または Scenario 追加: 「`<N>` は `state.steps["verification"].length`（1-origin）」、ファイル名は「`verification-result.md` 単一上書き」または「`verification-result-{NNN}.md` 連番」のいずれか確定。学習パターン「iteration 番号の表記揺れ」(review-lessons.md) を参照。 |
| 10 | LOW | maintainability | openspec/changes/implementer-verify-buildfix/specs/build-fixer-session/spec.md:13-23 | build-fixer の buildMessage が「failed phase の error log を読んで mechanical 修正」と書いているが、verification-result.md には「passed/failed の各 phase の stdout/stderr 全部」が含まれる format。「passed phase は読まない」「failed phase の最初の 1 つだけ読む」等の絞り込み指示は agent prompt まかせで spec には書かれていない。 | build-fixer の system prompt 内容（`BUILD_FIXER_SYSTEM_PROMPT` の Requirement）に「failed phase（status: failed）のみを修正対象とし、skipped phase は次 iteration の verification で再実行されることを期待する」を含める Scenario を追加（または design.md Open Question として後続に委ねる）。 |
| 11 | LOW | feasibility | openspec/changes/implementer-verify-buildfix/specs/verification-runner/spec.md:22 | spawn の `cwd` / `env` / `timeout` が未指定。spec-runner CLI の cwd は target project の root という前提だが、worktree 内実行時の cwd 解決が spec で示されていない。 | verification-runner spec に「spawn は cwd を target project の repository root で実行する」「per-phase timeout は本 request スコープ外（design.md Open Question 1 のとおり）」を 1 文追加。 |
| 12 | LOW | consistency | openspec/changes/implementer-verify-buildfix/specs/agent-registry/spec.md:9 | 「propose / spec-review / spec-fixer / implementer / build-fixer の 5 agent step」と書いているが、新規 step が複数になる場合の registry sort 順や `registry.list()` の戻り順は未定義（既存 spec も silent）。本 PR では問題ないが、将来 PR step 追加で順序依存テストが壊れる risk。 | agent-registry spec に「`registry.list()` の順序は Step 配列の登録順に従う」を 1 文追加（既存挙動の明示化）。 |

## Iteration Comparison

（iteration 1 のため省略）

### Improvements
- N/A

### Regressions
- N/A

### Unchanged Issues
- N/A

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.70 | needs-fix | 初回 — HIGH 3 件（parseResult shape 不整合、全 skipped 時 verdict 未定義、test phase 起動コマンド誤り） |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue（spec-fixer に修正を依頼し iteration 2 で再評価）

### 停滞検出ルール

- 初回のため停滞検出は適用なし。

## Summary

設計の骨格（kind discriminator 導入、verification CLI-resident step 化、loop guard 汎用化）は learned-patterns に正しく整列しており、architect / spec-reviewer / pattern-reviewer の総意として「方向性は妥当」。一方で実装に進める前に解消すべき HIGH 3 件:

1. **parseResult shape の非整合**（`{ verdict, findingsPath }` 2 field vs 既存 `ParsedStepResult` の 3 field）— `NULL_PARSE_RESULT` の単一定義場所を spec で固定する必要あり
2. **全 phase skipped 時の verdict 算出未定義** — エッジケースが死路を作る
3. **test phase の起動コマンドが target project の test runner を bypass** — `bun test` 固定だと vitest が動かず受け入れ基準 13.1（regression 0 件）と矛盾する

加えて MEDIUM 4 件（spec-fixer の verdict 非対称、`BUILD_FIXER_NO_VERIFICATION_RESULT` shape 未指定、null verdict → escalation 変換の責任所在、loop error code の保持場所）を spec-fixer が 1 iteration 内で吸収できれば iteration 2 で approved 到達可能。
