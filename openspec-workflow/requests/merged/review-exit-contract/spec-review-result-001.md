# Spec Review Result: review-exit-contract — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 7.55 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect (default), spec-reviewer (default), pattern-reviewer (enabled)
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 2

> Note: スコア合計は pass threshold 以上だが、HIGH ≥ 1 のため review-standards.md により verdict は自動的に `needs-fix`。

> Note: 本イテレーションは spec-review skill の Task ツール（subagent dispatch）が当環境で利用不能だったため、orchestrator が architect / spec-reviewer / pattern-reviewer の 3 観点を統合的に評価した。security-reviewer は pipeline-context.md の `enabled` に含まれず skip。

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 7 | 0.25 | 1.75 |
| feasibility | 9 | 0.20 | 1.80 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **7.55** |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/review-exit-contract/proposal.md, design.md, tasks.md, specs/agent-output-contract/spec.md (and request.md) | ADR ファイル名規約の不整合: change folder 全体で生成予定 ADR の filename を `{NNN}-review-exit-contract-managed-agents.md` と書いているが、`openspec-workflow/adr/README.md` は命名規約を `ADR-YYYYMMDD-<タイトル>.md` と明示している（既存 ADR も全件この規約に従う）。このまま実装すると ADR README の規約に違反した filename が生成される。 | tasks.md 7.1 / 7.2、proposal.md Impact、design.md Decision 5、spec.md Requirement "ADR SHALL document..." と "Scenario: ADR exists with required sections" の filename 表記をすべて `ADR-20260430-review-exit-contract-managed-agents.md`（または該当日付）に揃える。あるいは ADR README 側の規約を変更する判断ならば本 request 範囲で README 更新タスクを追加する。どちらにせよ change folder と既存 README を一致させる。 |
| 2 | HIGH | completeness | openspec/changes/review-exit-contract/tasks.md §4, src/core/step/code-review.ts:44-69 | code-review の user message に `buildGitPushInstruction(branch)` を embed するタスクが欠落: spec.md Requirement "Review system prompts SHALL include explicit commit/push instructions" は「user message construction MUST embed the same `buildGitPushInstruction(branch)` shape used by propose / fixer steps」を要求するが、tasks.md は spec-review (4.3) でのみ embed を指示し code-review 側のタスクは「system prompt の "MUST commit and push" 文を維持」(4.4) のみ。現状 `buildCodeReviewInitialMessage` は branch も受け取らず push instruction も embed していない。spec の MUST 要求と tasks のカバレッジが不一致。 | tasks.md §4 に新タスク 4.5（または 4.4 を分割）として「`src/prompts/code-review-system.ts` または `src/core/step/code-review.ts` の `buildCodeReviewInitialMessage` に `branch` 引数を追加し、user message に `buildGitPushInstruction(branch)` を embed する」を追加。さらに deps から branch を threading する必要があるため `code-review.ts:buildMessage` で `state.branch`（または `deps.branch`）を取得して `buildCodeReviewInitialMessage` に渡す。 |
| 3 | MEDIUM | consistency | openspec/changes/review-exit-contract/specs/agent-output-contract/spec.md vs openspec/specs/spec-review-session/spec.md | 既存 `spec-review-session` capability の Requirement が既に「`spec-review-result-{NNN}.md` 3 桁ゼロ埋め」を宣言している（`spec-review-session/spec.md` の "spec-review セッションには初回メッセージとして system prompt 派生のテンプレートを送る" Requirement）。新規 `agent-output-contract` capability に「Review-side result filenames SHALL follow `{step}-result-{NNN}.md`」を ADDED Requirement として追加すると、suffix 規約が 2 capabilities に重複する。spec-review-session 側と agent-output-contract 側のどちらが authority なのか曖昧で、将来どちらを編集すれば良いか判断しにくい。 | design.md または spec.md に「filename suffix 規約は agent-output-contract が SSOT、spec-review-session 側は cross-reference のみ」または逆方向の SSOT 関係を明記する 1 段落を追加。あるいは spec-review-session 側を MODIFIED Requirement として agent-output-contract への参照に書き換える delta を追加（ただし scope 拡張になるため SSOT 宣言で十分）。 |
| 4 | MEDIUM | completeness | openspec/changes/review-exit-contract/tasks.md 1.1, 1.2 / spec.md "Scenario: specReviewResultNotFoundError generates hint with iteration suffix" | hint 文言の「commit + push 不足を疑うガイダンス」の追加がタスクで明示されていない: spec.md scenario は hint string が `commit + push` 不足ガイダンスを含むことを要求するが、tasks 1.1 / 1.2 は filename suffix と branch 名を含む hint としか指示していない。現行の `specReviewResultNotFoundError` の hint は "Ensure the spec-review agent wrote the result file..." と書くだけで、「もし書いたなら push を確認せよ」というガイダンスが無い。dogfooding-001 で発生した「書いたが push してない」症状を hint で示せるようにする観点が未定義。 | tasks.md 1.1 / 1.2 に「hint に "If the agent wrote the file but did not commit + push, re-run the step or check the agent session logs for git push errors" 相当の文言を含める」を追記。spec.md Scenario も同様に「`commit + push` 不足を疑うガイダンス」を more specific phrasing に置換。 |
| 5 | MEDIUM | maintainability | openspec/changes/review-exit-contract/design.md Decision 6, src/prompts/implementer-system.ts | Implementer prompt の言語整合: 既存 `IMPLEMENTER_SYSTEM_PROMPT` は全文日本語（"あなたは implementer です..." 等）。design.md Decision 6 と spec.md Requirement "Implementer system prompt SHALL describe pipeline workflow context positively" は追記文言を英語表記（"stage 3: implementer (you) → verification → code-review"）で例示。日本語 prompt に英語文言を mix すると LLM の指示遵守率が低下しうる。 | design.md / spec.md / tasks.md 5.1 で「既存 prompt の言語（日本語）に揃えて追記する。例: 『あなたは pipeline の stage 3 (implementer) です。次工程: verification (build/test/lint), その次: code-review。build/test/lint は次工程に渡してください』」と明記する。Scenario の例文は意味的内容で書き、表記言語は実装の既存 prompt に合わせる。 |
| 6 | MEDIUM | consistency | openspec/changes/review-exit-contract/tasks.md 3.3 vs src/core/step/executor.ts:688-705 | task 3.3 のスコープが曖昧: executor.ts:688 は `step.resultFilePath(state, deps)` 経由で fetch path を取得し、これは既に `buildFindingsPath` / `buildReviewFeedbackPath`（3 桁ゼロ埋め）を使うため、現状で agent message と executor fetch の filename は一致している。task 3.3 が「確認のみで修正不要」なのか「修正の可能性あり」なのか実装者が判断しにくい。 | tasks.md 3.3 を「executor.ts は `step.resultFilePath` 経由で agent と同一 helper を使うため、コード修正は不要見込み。本 task は invariant の確認（grep + 1 行コメント追加）に限定」と明記して scope を fix。または DoD として「unit test で agent message の filename と executor の resultFilePath の一致を assert する test を追加」を加えて検証方法を固定する。 |
| 7 | LOW | maintainability | openspec/changes/review-exit-contract/specs/agent-output-contract/spec.md | iteration 番号表記の混在: spec.md 内で `{NNN}` (Requirement 文)、`NNN` (一部 Scenario 注釈) が混在。review-lessons.md にも「iteration 番号の表記揺れ」観点が記録されている。実害は無いが、後任が grep する際に検索が分散する。 | spec.md を `{NNN}` で統一（自然文では「3 桁ゼロ埋め iteration suffix」と書く）。同一 PR 内で実装側の prompt template も `{NNN}` か `NNN` の片方に揃える検討を design.md に追記。 |
| 8 | LOW | feasibility | openspec/changes/review-exit-contract/tasks.md §6 | `test-cases.md` がまだ change folder に未生成: tasks 6.1 は「test-cases.md に must シナリオを追加」を指示するが、これは Step 3.5 (test-case-generator) が生成する想定で、現時点では存在しない。タスク順序の前提（test-case-generator が先に走る）が tasks.md に書かれていないため、implementer が混乱する余地。 | tasks.md §6 の冒頭に「test-cases.md は Step 3.5 (test-case-generator) で生成済み前提。実装層 (Step 4) で本タスクを処理する」と注記する。Or tasks.md にプリアンブル section として「Pre-conditions」を追加し pipeline stage の前提を明示する。 |
| 9 | LOW | maintainability | openspec/changes/review-exit-contract/design.md "Risks / Trade-offs" | Risk: gitWrite 付与で agent が source code を変更しうる（mitigation: prompt + diff 監視）と書かれているが、「diff 監視」が pipeline 上のどの stage で実行されるか具体記述が無い。verification 側で diff guard を持つのか、code-review 側で git diff のスコープを assert するのかが曖昧。 | design.md Risks 1 に「`git diff main...HEAD -- src/` の限定検出は code-review/spec-review session 内 prompt 上の宣言に依存し、orchestrator 側 diff guard は本 request 範囲外」など実装責任の分担を明記。または別 Risk として「prompt のみが運用契約で技術的強制は無い」を明記。 |

## Iteration Comparison

（iteration 1 のため省略）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-------------|---------|-------------|
| 1 | 7.55 | needs-fix | initial review |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue (spec-fixer で HIGH 2 件 + MEDIUM 4 件を解消 → re-review)

## Summary

review-exit-contract の change folder は dogfooding-001 で観測した review 系出口契約の divergence を、capability 宣言・prompt 指示・error hint factory・filename 規約・ADR 記録の 5 軸で正規化する設計として概ね妥当。Decision の根拠（Managed Agents workspace 不可視）と代替案（custom_tool / orchestrator commit）の却下理由も明確で、feasibility は高い。一方で 2 件の HIGH（ADR filename 規約が project 既存規約と不整合 / code-review 側の `buildGitPushInstruction` embed タスクが spec の MUST と未整合）が承認阻止要因として残る。スコア合計 7.55 は閾値を超えるが、HIGH の構造的不整合は実装後に regression を生む可能性が高いため、spec-fixer での修正を 1 周回すことを推奨。MEDIUM 4 件は仕様の SSOT 明示と implementer prompt 言語整合の観点で同時に解消できる。
