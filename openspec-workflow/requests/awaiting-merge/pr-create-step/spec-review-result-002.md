# Spec Review Result: pr-create-step — Iteration 2

## Verdict

- **verdict**: approved
- **score**: 7.55 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving (+1.25)
- **agents**: architect, spec-reviewer
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 8 | 0.25 | 2.00 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 7 | 0.15 | 1.05 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **7.55** |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | openspec/changes/pr-create-step/specs/pr-create-runner/spec.md L72-L89 / specs/pr-create-step/spec.md L40-L57 | `pr-create-result.md` の `## PR` セクションが「PR section listing url / number / branch / createdAt」とだけ書かれており、bullet list / table / key-value のいずれの形式かが固定されていない。後続で code-fixer や別 step が parse する場合に brittle。verification-result.md は固定 schema が確立しているのと比較して粒度が荒い。**実装に進める水準は満たすが、書き出し時に implementer が任意フォーマットを選ぶ余地が残る**。 | `pr-create-runner/spec.md` または `pr-create-step/spec.md` に「`## PR` セクションは以下の bullet list 形式: `- url: <URL>` `- number: <N>` `- branch: <name>` `- createdAt: <ISO8601>`」と明記。Scenario に具体例を含める。実装段階で code-review が拾うレベル。 |
| 2 | MEDIUM | completeness | openspec/changes/pr-create-step/specs/pr-create-runner/spec.md L105-L110 (renderPrBody) | `renderPrBody` の `## Workflow` テーブルで「each row SHALL include: phase name, final iteration verdict, iteration count, and the result-file path of the latest iteration」と書かれているが、result-file path の取得方法（`jobState.steps?.[<phaseName>]?.at(-1)?.outcome.findingsPath` 等）が pseudocode で示されていない。findingsPath は nullable な field であり、null 時の振る舞いも未定義。 | Requirement に「各 phase の result-file path は `jobState.steps?.[<phaseName>]?.at(-1)?.outcome.findingsPath` から取得する。null の場合は対応セルを空文字または `(n/a)` で埋める」と明記する。テスト fixture も両ケースを含める。実装段階で対応可能。 |
| 3 | MEDIUM | security | openspec/changes/pr-create-step/design.md "Risks" / specs/pr-create-runner/spec.md L107 | request.md 由来文字列を verbatim で PR body に流し込む方針（renderPrBody が「verbatim text, no LLM summarization」）の結果、`@user` mention / `#1234` issue ref / template-injection 文字列がそのまま GitHub に解釈される。社内運用では低リスクだが、`@org/team` mention の意図せぬ通知や PR 自動 link の暴走が起き得る。 | `design.md` Risks に「PR body の `@<user>` mention / `#<n>` issue ref はそのまま GitHub に解釈される。`request.md` 由来の文字列は escape せず流用するため、author が認識して書く責任を持つ」を 1 段落明記。`renderPrBody` で escape を導入する場合は別 Decision として記録（本 request では非対応、後続 request で検討）。 |
| 4 | LOW | maintainability | openspec/changes/pr-create-step/tasks.md §11.3 | 「commit message を分割（schema 拡張 / runner / step / transition / wiring / tests）で push」と書かれているが、`STANDARD_TRANSITIONS` 書き換え（§6.1-6.4）と `PrCreateStep` の steps Map 登録（§7.1）を **同一 commit に含める制約**が明示されていない。仮に分割してその間に `bun test` を走らせると確実に壊れる。 | tasks.md §11.3 に「§6 (transitions) と §7.1 (steps Map 登録) は同一 commit に含める。§6 単独 commit は禁止」を追記。実装段階で implementer / code-fixer が遵守すれば良い。 |
| 5 | LOW | maintainability | openspec/changes/pr-create-step/specs/pipeline-orchestrator/spec.md L114-L119 | StepName 拡張の Scenario で「9 literals」を hardcode で列挙している。将来 release-notes 等が追加される度に spec を co-evolve する必要が生じる。 | Scenario の表現を「the union contains `pr-create` along with the prior literals defined by previous changes」に置き換え、リテラル数の hardcode を避ける。次回 spec-change 時の cleanup 対象。 |

## Iteration Comparison

### Improvements

- **HIGH #1 (Iter 1)** ✅ 解消: `AgentStepName = Exclude<StepName, "verification" | "pr-create">` への拡張が `pipeline-orchestrator/spec.md` の "AgentStepName excludes pr-create from the Exclude clause" Requirement (L121-136) と tasks.md §1.4 に明記された
- **HIGH #2 (Iter 1)** ✅ 解消: steps Map 登録先を `src/cli/run.ts` から `src/core/pipeline/run.ts` に訂正済（tasks.md §7.1 + pr-create-step/spec.md L61）。`src/cli/run.ts` 変更不要であることも Notes 化
- **HIGH #3 (Iter 1)** ✅ 解消: tasks.md §6.7 で TC-012 書き換え / regression assertion 追加 / TC-030 行数更新 / 3 新 transition の存在検証ケース追加が明示列挙された。pipeline-orchestrator/spec.md にも regression guard Scenario が追加された
- **HIGH #4 (Iter 1)** ✅ 解消: runner spec が `gh pr list --head <branch> --base <baseBranch> --state all --json url,number,state` ベースに改訂され、JSON 配列長 0 で PR 不在を判定。stderr 文言依存ロジック禁止の規定も追加
- **MEDIUM #5 (Iter 1)** ✅ 解消: `AgentRegistry skips pr-create` Scenario が「ハードコード配列に追加しないことで registry に登録されない」に書き換わった（pr-create-step/spec.md L63 "absent from the array, not skipped"）
- **MEDIUM #7 (Iter 1)** ✅ 部分解消: `state.pullRequest` を `JobStateStore` 経由で persist してから result file を書き出す順序が pr-create-step/spec.md L41 と job-state-store/spec.md に明記された。state persist 失敗時の rollback 戦略は引き続き未定義だが、実装段階で例外伝播の挙動として吸収可能
- **MEDIUM #9 (Iter 1)** ✅ 解消: runner spec L31 で `--body-file <tempfile>` 必須・`--body` argv 渡し禁止・tempfile cleanup 必須が規定された

### Regressions

- なし

### Unchanged Issues

- **MEDIUM #6 (Iter 1)** → Iter 2 #1: pr-create-result.md の `## PR` セクションのフィールド書式が固定されていない（実装段階で code-review が拾える）
- **MEDIUM #8 (Iter 1)** → Iter 2 #2: renderPrBody が result-file path を `jobState.steps?.[<name>]?.at(-1)?.outcome.findingsPath` から取得する pseudocode が未記載
- **MEDIUM #10 (Iter 1)** → Iter 2 #3: PR body の template injection / `@mention` / `#issue-ref` のサニタイズ方針が design.md Risks に未記載
- **LOW #11 (Iter 1)** → Iter 2 #4: §6 (transitions) と §7.1 (steps Map 登録) を同一 commit に含める制約が tasks.md §11.3 に未追記
- **LOW #12 (Iter 1)** → Iter 2 #5: StepName Scenario の「9 literals」hardcode が残存

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.30 | needs-fix | 初回レビュー（HIGH 4 件） |
| 2 | 7.55 | approved | HIGH 4 件すべて解消、MEDIUM 一部残存 |

## Convergence

- **trend**: improving (+1.25)
- **recommendation**: approved — 次ステップ（implementer）へ進める

## Summary

iteration 1 で指摘された **HIGH 4 件すべて**が spec / tasks に正しく反映された。特に重要な修正:

1. **AgentStepName 拡張**: `Exclude<StepName, "verification" | "pr-create">` への変更が独立 Requirement として明記され、`AgentRegistry` への誤登録が型レベルで防がれる
2. **steps Map 登録先の訂正**: `src/core/pipeline/run.ts` が正しい指示先として spec / tasks 双方に反映され、誤った `src/cli/run.ts` への修正による「pr-create が pipeline に登録されない」致命的バグが回避される
3. **既存テストの更新指示**: TC-012 / TC-030 / pipeline-integration の更新箇所が tasks.md §6.7 で明示列挙され、verification phase で必ず regression する事態を防ぐ
4. **runner の冪等検出方式**: `gh pr list --head <branch> --json` ベースに刷新され、JSON 配列長で PR 不在を判定する決定的なロジックに改善された。stderr 文言依存の brittle な分岐が排除された

加えて MEDIUM #5 (AgentRegistry の表現訂正), #7 (persist 順序), #9 (--body-file tempfile + ARG_MAX 対策) も解消され、実装に進める品質に達した。

残存する MEDIUM 3 件 (#1 result-file 書式 / #2 findingsPath 取得方法 / #3 mention sanitize) と LOW 2 件 (#4 commit 分割制約 / #5 literal hardcode) はいずれも「実装段階で code-review が拾える / 後続 request で fix できる」レベルで、blocking ではない。CRITICAL: 0, HIGH: 0 のため verdict は `approved`。
