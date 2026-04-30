# Spec Review Result: pr-create-step — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.30 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 4

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 5 | 0.25 | 1.25 |
| feasibility | 7 | 0.20 | 1.40 |
| security | 7 | 0.15 | 1.05 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **6.30** |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/pr-create-step/specs/pipeline-orchestrator/spec.md / src/state/schema.ts:21 | `AgentStepName = Exclude<StepName, "verification">` を pr-create にも適用する旨が delta spec / tasks.md のどこにも記述されていない。pr-create は agentless な CLI step なので `AgentStepName` から除外すべきだが、現行の Exclude 句は pr-create を含めてしまう。これにより `AgentRegistry`／`AgentSyncer`／`config.agents` 系で pr-create が agent role として扱われる型が成立し、init.ts が `pr-create` agent を要求する誤りに繋がりうる。 | `step-execution-architecture/spec.md` または `pipeline-orchestrator/spec.md` の ADDED Requirement に「StepName の追加と同時に `AgentStepName` の Exclude 句を `Exclude<StepName, "verification" \| "pr-create">` へ拡張する」ことを明記し、tasks.md §1 に対応タスクを追加する。 |
| 2 | HIGH | consistency | openspec/changes/pr-create-step/tasks.md §7.1 / src/cli/run.ts | tasks.md §7.1 で「`src/cli/run.ts` の `Pipeline` constructor に渡す `steps` Map に `PrCreateStep` を追加」と記載されているが、実際に steps Map を構築しているのは `src/core/pipeline/run.ts:40-49` であり `src/cli/run.ts` ではない（`src/cli/run.ts:160` は `runPipeline()` を呼び出しているだけ）。`step-execution-architecture/spec.md` の Requirement 本文も同じ誤りで `src/cli/run.ts` を指している。誤った経路を実装層が触ると pr-create が pipeline に登録されず、code-review approved 時に Unknown transition で escalate する致命的な実装ミスを誘発する。 | tasks.md §7.1 と `step-execution-architecture/spec.md` の対応 Requirement を `src/core/pipeline/run.ts` に修正する。`src/cli/run.ts` 自体は変更不要であることを Notes として明示する。Scenario も「`src/core/pipeline/run.ts` の steps Map に 9 entries」へ訂正する。 |
| 3 | HIGH | consistency | openspec/changes/pr-create-step/tasks.md §6.7 / tests/unit/core/pipeline/pipeline.transitions.test.ts:152, 402 / tests/core/pipeline/pipeline.test.ts:483 / tests/pipeline-integration.test.ts:570-572 | 既存テストが `code-review --approved→ end` を直接アサートしている（pipeline.transitions.test.ts:152 の TC-012、pipeline.test.ts:483、pipeline-integration.test.ts:572）。tasks.md §6.7 では「3 つの新 transition をカバーするケースを追加」とあるだけで、**既存テストの更新／削除**が指示されていない。このまま実装すると `bun test` が確実に regression し、verification が必ず failed になる（build-fixer ループへ無駄に突入する）。 | tasks.md §6.7 を「TC-012 を `code-review --approved→ pr-create` を assert する形に書き換える」「pipeline.test.ts:483 の `to: "end"` 期待値を `to: "pr-create"` に書き換える」「pipeline-integration.test.ts の `expect(result.step).toBe("code-review")` を `pr-create` ベースに更新する」を明示的に列挙する。`step-execution-architecture/spec.md` の Migration / Acceptance Criteria にも regression 対象テストを enumerate する。 |
| 4 | HIGH | feasibility | openspec/changes/pr-create-step/specs/pr-create-runner/spec.md L24-L28 | `gh pr view <branch> --json url,number,state` の挙動が「branch を引数で渡せば直接検索される」前提で書かれているが、実際の `gh` CLI は `gh pr view <branch-name>` でのブランチ名指定をサポートするのは branch name にコロン等を含まない限定的なケースであり、推奨の idempotent パターンは `gh pr list --head <branch> --state all --json url,number,state` を使う方法である。現行 spec のままだと「branch ローカルにあるが PR がまだない」「branch 名と同名のタイトルで既存 PR がある」などのエッジで誤検出する。また「non-zero status indicating "no PR found" (gh CLI standard message)」と書かれているが、stderr の文言で判別するのは brittle。 | runner spec を `gh pr list --head <branch> --base <baseBranch> --state all --json url,number,state` ベースに変更し、JSON 配列の長さ 0 を「PR 不在」、length>=1 で先頭要素の state を見て分岐するよう Requirement を改訂する。stderr 文言依存ロジックは禁止する（ exit code + JSON 構造のみで判定）。Scenario も「stderr 文言一致」ではなく「JSON output が `[]`」で表現し直す。 |
| 5 | MEDIUM | consistency | openspec/changes/pr-create-step/specs/pr-create-step/spec.md L62-L75 / src/cli/init.ts:56 | spec の "AgentRegistry skips pr-create" Scenario が「`AgentRegistry.fromSteps(stepsMap)` が pr-create を skip する」と記述しているが、現行 `src/cli/init.ts:56` は `AgentRegistry.fromSteps([ProposeStep, SpecReviewStep, ...])` という**ハードコードされた配列**を渡しており、steps Map を渡していないし pr-create も列挙していない。skip するのではなく **そもそも引数に含まれない** が正しい。誤った前提が ADR にも波及する恐れ。 | Requirement Scenario を「`init.ts` のハードコード配列に PrCreateStep を **追加しない**ことで registry に登録されない」に書き換える。あるいは init.ts を steps Map ベースのループに refactor し、その上で `kind === "cli"` で skip する設計を選ぶならその旨 ADR で D9 として記録する。後者なら新規 Requirement が必要。 |
| 6 | MEDIUM | completeness | openspec/changes/pr-create-step/specs/pr-create-runner/spec.md L66-L82 / specs/pr-create-step/spec.md L67 | `pr-create-result.md` の構造が文字列パターン（`## Status: success` / `## PR` / `## Detail`）レベルでしか規定されておらず、URL / number / branch / createdAt の **正確なフォーマット**（key-value のテーブルか箇条書きか、改行コード、URL の表現）が固定されていない。code-fixer が後続でこのファイルを参照する場合に parser が壊れやすい。verification-result.md は固定 schema が確立しているのと比較して粒度が荒い。 | `pr-create-runner/spec.md` に「`## PR` セクションは以下の bullet list 形式で出力すること: `- url: <URL>` `- number: <N>` `- branch: <name>` `- createdAt: <ISO8601>`」と明記する。Scenario にも具体例を含める。 |
| 7 | MEDIUM | completeness | openspec/changes/pr-create-step/specs/pr-create-step/spec.md L40-L57 / specs/job-state-store/spec.md L1-L48 | `JobState.pullRequest` の persist タイミングが「runner 成功後に `JobStateStore` 経由で persist」と書かれているが、`pr-create-result.md` 書き出しと state persist の **順序** および **どちらが先に失敗した場合の rollback 戦略** が未定義。result file が書けて state persist が失敗するとパイプラインが矛盾状態になる。verification step は result file 書き出しが内部で完結している点と異なる。 | `PrCreateStep.run` の手順を Requirement で明文化する: (1) runner 実行 → (2) `JobStateStore.update()` で `pullRequest` を persist → (3) result file を書き出し → (4) `appendStepRun` で `StepRun` を追加。失敗時の挙動も Scenario 化する（state persist 失敗時は result file を書かず例外を再 throw）。 |
| 8 | MEDIUM | completeness | openspec/changes/pr-create-step/specs/pr-create-runner/spec.md L83-L121 (renderPrBody) / specs/pr-create-step/spec.md L37 | `renderPrBody` が「Phases that did not execute SHALL be omitted」と書かれているが、`jobState.steps` は本 request では定義されている一方、verification の result-file path 取得方法（`steps["verification"]` の最終 element の findingsPath を取る、など）が pseudocode で示されていない。spec 上は `jobState` を渡せば取れる前提だが、`StepRun.outcome.findingsPath` は nullable で、verification は常に findingsPath を持つが他は持たない非対称がある。 | Requirement に「各 phase の result-file path は `jobState.steps?.[<phaseName>]?.at(-1)?.outcome.findingsPath` から取得する。null の場合は対応行を省略する」と明記する。テスト fixture も両ケース（findingsPath あり／なし）を含める。 |
| 9 | MEDIUM | feasibility | openspec/changes/pr-create-step/specs/pr-create-runner/spec.md L29 / D6 (design.md) | `gh pr create --title <title> --body <body>` を spawn する際、`title` / `body` を**コマンドライン引数**として渡す方針だが、request.md の `## 背景` / `## 目的` を verbatim で含めると body は数 KB になる可能性があり、OS の ARG_MAX 制限（macOS 既定で約 256KB / Linux で 128KB）に近づくリスクがある。また body 内に shell metacharacter が含まれた場合のエスケープ責任も spec から欠落。 | runner spec に「`--body-file <tempfile>` を使い、`fs.writeFile()` で一時ファイルに書き出してから渡す」方針を明記する。tempfile のクリーンアップ責任も Requirement 化する。argv 経由の `--body` 渡しは禁止する。 |
| 10 | MEDIUM | security | openspec/changes/pr-create-step/specs/pr-create-runner/spec.md L29 / design.md "Risks" | `gh pr create` に渡す `body` が request.md 由来でユーザー入力に近い扱い（spec author が書く）だが、PR body に貼る前のサニタイズ方針（特に template injection — `{{...}}`、HTML タグ、`@mentions`、`#1234` リファレンスなど）が議論されていない。本リポジトリ運用では低リスクだが、`@org/team` mention の意図せぬ通知などが事故起こり得る。 | design.md Risks に「PR body の `@<user>` mention / `#<n>` issue ref はそのまま GitHub に解釈される。`request.md` 由来の文字列は escape せず流用するため、author が認識して書く責任を持つ」と明記する。または `renderPrBody` で `@` を `\@` にエスケープする方針を D9 として追加する。 |
| 11 | LOW | maintainability | openspec/changes/pr-create-step/design.md D7 / Migration Plan | 「並行運用期を作らない」方針は妥当だが、`STANDARD_TRANSITIONS` の書き換えと `PrCreateStep` の steps Map 登録が**同一 PR で同一 commit** であることが明示されていない（commit message を分割する旨が tasks §11.3 にある）。仮に commit を「transition 書き換え」「step 登録」で分割すると、間に `bun test` を走らせた瞬間に必ず壊れる。 | tasks §11.3 の commit 分割方針に「transition 書き換えと steps Map 登録は **同一 commit に含める**」という制約を追加する。 |
| 12 | LOW | maintainability | openspec/changes/pr-create-step/specs/pipeline-orchestrator/spec.md L107-L114 | StepName 拡張の Requirement で「9 literals」と明示されているが、設計が将来追加される step（例: release-notes step）でも壊れないかどうかの言及がない。リテラル数のハードコードは将来 spec の co-evolution コストを増やす。 | Requirement の「9 literals」表現を「prior changes の 8 literals に加え `pr-create` を追加した結果」に置き換え、リテラル数を hardcode しない。 |

## Iteration Comparison

（iteration 1 のため記載なし）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.30 | needs-fix | 初回レビュー |

## Convergence

- **trend**: improving | plateaued | regressing — N/A (iteration 1)
- **recommendation**: continue（spec-fixer で finding #1-#4 を必ず修正してから再レビュー）

## Summary

design.md の意思決定（D1-D8）は十分に議論されており、kind=cli の選択や独立 PR body 生成、idempotent な OPEN-PR 検出方針は妥当。ただし以下 3 点で実装に進めると確実に regression する。

1. **既存テストの更新タスク欠落**（finding #3）— `code-review --approved→ end` を assert する 4 箇所のテストが現行 tasks.md でカバーされず、verification phase が必ず failed → build-fixer 突入する。
2. **steps Map 登録の指示先ファイル誤り**（finding #2）— `src/cli/run.ts` ではなく `src/core/pipeline/run.ts` が正しい。これは spec / tasks 両方に存在する誤り。
3. **`AgentStepName = Exclude<StepName, "verification">` の更新欠落**（finding #1）— pr-create も agentless cli なので Exclude 句に追加する必要がある。

加えて runner の `gh pr view <branch>` 直接呼び出しは脆弱（finding #4）で、`gh pr list --head` を採用すべき。これら 4 点が HIGH。spec-fixer による修正（specs/tasks の文言訂正＋ Requirement 追加）で解消可能であり、escalation 相当の構造的問題はない。MEDIUM/LOW は次イテレーションで対応すれば良い。
