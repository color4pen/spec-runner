# Spec Review Result: code-review-fixer — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 7.6 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 9 | 0.20 | 1.80 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **7.60** |

スコアは pass_threshold (7.0) を上回っているが、HIGH ≥ 1 のため verdict は自動的に `needs-fix`（review-standards.md「承認阻止条件」）。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/code-review-fixer/specs/pipeline-orchestrator/spec.md:124-128 | `LOOP_ERROR_CODES["code-review"]` のエントリを `message: "code-review did not approve after <N> iterations"`、`hint: "Review review-feedback-<NNN>.md and address findings manually."` と plain string で書いているが、既存実装 `src/core/pipeline/types.ts:17-21` の `LoopErrorShape` は `message: (n: number) => string` / `hint: (nnn: string) => string` の **関数** 型である。spec が contract を間違って記述しており、このまま実装すると型エラーまたは既存の他 entry（spec-review / verification）と非対称な実装になる | spec の `LOOP_ERROR_CODES` ts ブロックを実装の `LoopErrorShape` に合わせて関数化し、Scenario「ループエラーコードが lookup から導出される」の文言も `message(n) === "code-review did not approve after 3 iterations"` のように関数呼び出し前提で再記述する。tasks.md §7.3 の plain-string 表記も同時に修正 |
| 2 | MEDIUM | completeness | openspec/changes/code-review-fixer/specs/step-execution-architecture/spec.md:40-55, openspec/changes/code-review-fixer/tasks.md:40 | code-fixer の前段 result（review-feedback-NNN.md）が欠落した時の振る舞いが spec / tasks のどちらにも明示されていない。既存 build-fixer は `BUILD_FIXER_NO_VERIFICATION_RESULT` で halt する pattern を持ち、module-analysis.md R4 でも `CODE_FIXER_NO_REVIEW_RESULT` が推奨されているが、要件化されていない | `step-execution-architecture/spec.md` の `CodeFixerStep` 要件に「`getLatestStepResult(state, "code-review")` が空の場合、`SpecRunnerError(CODE_FIXER_NO_REVIEW_RESULT)` を throw する」を追加。tasks.md §6 にエラーコード新設タスクを追記 |
| 3 | MEDIUM | consistency | openspec/changes/code-review-fixer/specs/agent-syncer/spec.md | `## ADDED Requirements` で「AgentSyncer は code-review / code-fixer の 2 役割も sync 対象に含む」を新設しているが、既存 `AgentSyncer は per-role に Anthropic Agent を sync する` が「全 role」を generic に要件化済みで、Scenario も「新規 role（config に entry なし）→ create」をカバーしている。role-specific な要件追加は redundant かつ将来的に role を増やすたびに ADDED Requirement が積み重なる anti-pattern を導入する | この delta は削除し、必要なら既存 `AgentSyncer は per-role に Anthropic Agent を sync する` Requirement に Scenario として「code-review / code-fixer も同じ retrieve / create / update / 404 fallback ロジックで sync される」を 1 件追加するに留める。「AgentSyncer のコード自体は無編集」という不変の検証は agent-registry の「Step を追加する際の編集箇所は Step 配列のみである」（既存）でカバー済み |
| 4 | MEDIUM | consistency | openspec/changes/code-review-fixer/specs/step-execution-architecture/spec.md:11, openspec/changes/code-review-fixer/design.md:50-58, openspec/changes/code-review-fixer/request.md:131 | review observation の git diff コマンドが spec で `git diff main...HEAD`、design.md / request.md で `git diff main...<branch>` と表記揺れ。worktree 上では等価でも、spec が真実の単一情報源となるべき場面で食い違うと implementer / レビュー時に混乱する | `main...HEAD` で統一する（HEAD はエージェント実行時に常に解決可能。`<branch>` は state からの注入が要らない HEAD の方が安定）。design.md D1 と request.md の対応箇所を併せて書き換え |
| 5 | MEDIUM | completeness | openspec/changes/code-review-fixer/design.md:181, openspec/changes/code-review-fixer/specs/step-execution-architecture/spec.md | design.md の Open Questions で「base ref = `main` 固定」と決めているが、spec / tasks のどこにも「base ref は `main` で固定」と書かれていない。将来 sub-branch workflow が入った時に code-review が無音で base を切り替える事故が起こりうる | `step-execution-architecture/spec.md` の `CodeReviewStep` 要件に「`buildMessage` は base ref として `main` を埋め込む」を invariant として追加。あるいは `CODE_REVIEW_BASE_REF` 定数として `src/core/step/code-review.ts` に置くこと、を要件化 |
| 6 | LOW | maintainability | openspec/changes/code-review-fixer/specs/pipeline-orchestrator/spec.md:18-37, 40-60 | `MODIFIED Requirements` 本文に並べた transition 17 行の list と、その直下 Scenario「Standard pipeline transitions are expressed as table rows」の expectation list が完全重複。片方を更新し忘れた時に矛盾する | Scenario 側を「the transition table contains the rows enumerated in this Requirement」のように要件本文を参照する形に圧縮し、transition rows を 1 ヶ所だけに保持する |
| 7 | LOW | consistency | openspec/specs/pipeline-orchestrator/spec.md:42 (既存) | 既存 spec が `propose --approved→ spec-review` と書かれているが、実装の `STANDARD_TRANSITIONS` (`src/core/pipeline/types.ts:55`) は `propose --success→ spec-review`。本 delta が触る MODIFIED Requirement に隣接した既存記述のため、機会的に修正対象に含めるか、別 request として切り出すかの判断が必要 | (a) 本 delta の MODIFIED 部分にあわせて `propose --success→ spec-review` に書き換える、もしくは (b) 別 request として spec-only 修正を切る。本 request は scope を新 step 追加に絞るため (b) が無難 |
| 8 | LOW | maintainability | openspec/changes/code-review-fixer/tasks.md:54 | tasks.md §7.3 の `LOOP_ERROR_CODES` 記述も plain string になっており、Finding #1 と同じ表現を別ファイルでも繰り返している。修正時に片方だけ直して食い違うリスク | Finding #1 の修正と一括して、tasks.md §7.3 のサンプル記述も関数表現（`message: (n) => "code-review did not approve after " + n + " iterations"` 等）に揃える |
| 9 | LOW | completeness | openspec/changes/code-review-fixer/specs/step-execution-architecture/spec.md:15 | `CodeReviewStep.parseResult` の「fall through to the existing parser-failure path (`escalation` with diagnostic)」という記述があるが、既存 `spec-review.ts:90-92` の実装は `verdict: verdict ?? "escalation"` で diagnostic は付いていない | "with diagnostic" の文言を削除するか、もしくは `summary` フィールドに `"verdict line missing"` を埋める要件として明確化（後者は実装変更を伴うため YAGNI で前者推奨） |
| 10 | LOW | maintainability | openspec/changes/code-review-fixer/specs/step-execution-architecture/spec.md:96-101 | `parseReviewVerdict` の Scenario「SpecReviewStep delegates to parseReviewVerdict」が「source-level reference: only one regex literal exists in the codebase for this match」を要件化している。grep ベースの不変条件は維持コストが高く、test での担保が難しい（regex 文字列が変形してもパス可能） | grep 検査でなく、`parseSpecReviewVerdict` が `parseReviewVerdict` を呼び出すこと自体を unit test で担保する形（spy / mock）に書き換える、または記述を Scenario から AC（acceptance criteria）レベルに緩める |

## Iteration Comparison

（iteration 2 以降で記載）

### Improvements
- 初回のため該当なし

### Regressions
- 初回のため該当なし

### Unchanged Issues
- 初回のため該当なし

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.60 | needs-fix | 初回レビュー。HIGH 1 件（LOOP_ERROR_CODES の型不整合）、MEDIUM 4 件 |

## Convergence

- **trend**: improving | plateaued | regressing
- **recommendation**: continue（HIGH 1 件を解消すれば approved 圏内、score は既に閾値超え）

### 停滞検出ルール

- 初回のため適用なし

## Summary

新 step 2 種（code-review / code-fixer）と pipeline transition 拡張は既存 PR #36 の `AgentStep | CliStep` 判別 union と `LOOP_ERROR_CODES` lookup table の拡張点を素直に活用しており、対称性・実現可能性は高い（feasibility 9）。仕様の網羅性も module-analysis.md と tasks.md で良くカバーされている（completeness 8）。

ブロッキング要素は 1 点のみ — `pipeline-orchestrator/spec.md` の `LOOP_ERROR_CODES` エントリが既存実装の `LoopErrorShape`（関数型）と契約が食い違う（Finding #1, HIGH）。これを修正すれば approved 圏。

その他の MEDIUM 4 件はいずれも仕様のクリーンアップ系で、本 request の構造的方向性に影響しない:
- code-fixer の前段欠落エラーコード未要件化（#2）
- agent-syncer delta が role-specific で redundant（#3）
- diff コマンド表記の `HEAD` vs `<branch>` 揺れ（#4）
- base ref の `main` 固定が spec に未記述（#5）

emphasis として指定された「LOOP_ERROR_CODES lookup table の対称拡張」「parser 共通化判断」「AgentStep への新メンバー追加 pattern 整合」については、Finding #1 が前者の核心、Finding #9-10 が parser 共通化境界の整理、step-execution-architecture spec の `CodeReviewStep` / `CodeFixerStep` 要件が後者をカバーしている。
