# Review Feedback: pr-create-step — Iteration 1

## Verification Summary

| Phase | Result | Detail |
|-------|--------|--------|
| Build | PASS | `tsc --noEmit false --outDir dist` 成功（0 error） |
| Type Check | PASS | `tsc --noEmit` 成功（0 error） |
| Tests | PASS | `vitest run` 469/469 PASS（54 files） |
| Lint | SKIP | package.json に lint script 未定義（progress.md と整合） |
| Security | PASS | spawn は shell:false、`--body-file` で argv injection 回避、認可情報のログ出力なし |

> 注意: `bun test` で 36 fail が出るが、本リポジトリの test runner は `vitest`（`package.json scripts.test = "vitest run"`）。`bun test` は `vi.mock(..., async (importOriginal) => ...)` の hoisted importOriginal を未対応のため fail する。これは runner mismatch であり実装の問題ではない（`bun run test` は通る）。

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| correctness | 7 | 0.30 | 2.10 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.60** |

## Verdict

- **verdict**: approved
- **pass_threshold**: 7.0
- **iteration**: 1 / 2
- **blocking_findings**: CRITICAL: 0, HIGH: 0
- **trend**: — (初回)

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/core/pr-create/body-template.ts:84 | `renderPrBody` 内で slug を `jobState.request.path.split("/").slice(-2,-1)[0]` から導出している。他の step（verification.ts、code-review.ts、build-fixer.ts 等）は全て `deps.slug` を使用しており、両者が乖離する可能性がある。例えば現在の cli/run.ts では `slug = path.basename(absolutePath, ".md")`（=`request`）だが、body-template の slug は親ディレクトリ名（=`pr-create-step`）。Workflow テーブルが指す result-file path と他 step の resultFilePath が指すパスが食い違い、PR body のリンクが死ぬ可能性がある。 | `renderPrBody` のシグネチャに `slug: string` を追加し、`PrCreateStep.run` から `deps.slug` を渡す。body-template 内の自前 slug 推論ロジックを削除する。テスト fixture も slug 引数を取るよう更新する。 |
| 2 | MEDIUM | maintainability | openspec/changes/pr-create-step/test-cases.md:287-294 ; openspec/changes/pr-create-step/tasks.md §6.7 | TC-022（must）と tasks.md §6.7 が STANDARD_TRANSITIONS の行数を `22` と規定しているが、実装は `21`（19 - 1 + 3 = 21）。implementer が implementation-notes.md L38 に算術不一致を明記し、テスト側を `21` に合わせている。spec と実装のドキュメント上の不整合が残存。 | tasks.md §6.7 と test-cases.md TC-022 の数値を `21` に訂正する（または delta spec を update して 21 に揃える）。次の spec 改訂で同じ confusion が再発しないよう実装根拠（`code-review→end の削除と pr-create→end の追加で +2 行`）を併記する。 |
| 3 | LOW | maintainability | src/core/pr-create/body-template.ts:84 | slug が見つからない場合のフォールバック値が `"unknown"`。Workflow テーブルに `openspec/changes/unknown/...` という不正パスが書き込まれる可能性があり、PR を見た人間に誤解を与える。フォールバック発動は設定不備の徴候なので、verbose log かエラーで早期検出すべき。 | フォールバックを削除し、slug 不在時は throw で fail-fast にする（または body 末尾に診断 footnote を追加）。Finding #1 の修正と同時に `slug` を必須引数化すれば自然に解決する。 |
| 4 | LOW | maintainability | src/core/pr-create/runner.ts:104 | tmpfile 名が `Date.now()` のみで構成されており、同一 process 内で並行実行すると衝突する理論的可能性がある（pr-create は pipeline 内で 1 回しか走らないため実害はないが）。`crypto.randomUUID()` のほうが堅牢。 | `path.join(os.tmpdir(), `specrunner-pr-body-${crypto.randomUUID()}.md`)` に変更。または `fs.mkdtemp()` を使う。 |
| 5 | LOW | security | src/core/pr-create/body-template.ts:47-54 | `parsedRequest.sections.背景` / `目的` が verbatim で PR body に挿入される。`@user` / `#1234` / GitHub が解釈する markdown が任意に流し込まれる。spec-review iter2 #3 で「LOW、後続 request で対応」と既に合意済み。 | 規定方針に従い本 iteration では対応不要。後続 request で sanitize（`@` → `@​`、`#N` → `#​N` 等）を検討する。design.md Risks にこの判断を 1 段落で明記しておくと監査時に追跡しやすい。 |
| 6 | LOW | testing | tests/unit/core/pr-create/runner.test.ts:18-31 ; tests/unit/step/pr-create.test.ts:23-25 | `vi.mock("node:fs/promises", async (importOriginal) => ...)` を使っており、bun:test では hoisted importOriginal の挙動差で動かない。本プロジェクトは vitest 固定なので問題ないが、過去に bun:* / Bun.* の禁止 lint（TC-009 等）が定着している文脈から、bun-only な readers が踏みやすい落とし穴。 | tests/README または CONTRIBUTING に「test runner は vitest 固定。`bun test` は使わない」と一行明記する（対応済みなら link）。または vitest config から runner を逆引きできる note を tests 配下に置く。 |

## Iteration Comparison

初回のため比較なし。

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.60 | approved | 初回レビュー。CRITICAL/HIGH なし、pass threshold (7.0) 超過 |

## Summary

- **総合所見**: 32/32 tasks 完了、469/469 tests PASS、build/typecheck/security 全て pass。spec-review でカバーされた設計判断（kind=cli, idempotent OPEN PR detection, --body-file 強制, retry なし escalation）は実装に忠実に反映されている。CliStep interface 適合、StepName/AgentStepName の整合、STANDARD_TRANSITIONS の差し替えと regression guard、AgentRegistry 除外まで漏れなく実装されている。
- **主要指摘**:
  - `body-template.ts` の slug 推論が他 step の `deps.slug` 経路から乖離している（**Finding #1**, MEDIUM）。実害が出るのは PR body 内の result-path リンクの死活のみで pipeline 動作は影響しないが、self-host pipeline の出力品質に直結するため次イテレーション or follow-up で修正推奨。
  - tasks.md / test-cases.md の行数規定（22）と実装（21）の不整合（**Finding #2**, MEDIUM）。実装根拠は implementation-notes.md L38 に明記されており runtime には影響しないが、archive 後に spec を読む人間が混乱する。
  - その他は LOW（tmpfile naming 堅牢化、test runner 明記、verbatim body の sanitize 方針）。
- **収束トレンド**: 初回。pass threshold 7.0 を超え CRITICAL/HIGH なしのため `approved`。Finding #1, #2 は follow-up として処理してもよい品質。
- **承認判定**: pass_threshold 7.0、Total 7.60、blocking_findings 0 → **approved**。

## Convergence

- **trend**: — (初回)
- **recommendation**: approved
