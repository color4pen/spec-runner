# Spec Review Result — specrunner-resume-command

- **reviewer**: spec-reviewer
- **iteration**: 2
- **verdict**: approved

## Summary

前回 (iteration 1) の HIGH 2 件・MEDIUM 1 件・LOW 1 件は全て解消済み。design.md は D1 で専用の `resolveJobStateBySlug()` を新設し、tasks.md は 2.8 で PipelineDeps 構築、2.5 で null resumePoint guard を追加。新規の CRITICAL/HIGH は検出されず、仕様は実装可能な状態。

## Iteration Comparison

### Improvements (前回から解消)

| 前回 # | Severity | 解消方法 |
|--------|----------|---------|
| 1 | HIGH | D1 で `resolveJobStateBySlug()` 新設。tasks 1.4, 2.2 を更新。`resolveBySlug()` の PR 必須制約を回避 |
| 2 | HIGH | Task 2.8 に deps 構築手順を追加（loadConfig → runtime 判定 → client/runner 生成 → PipelineDeps 組み立て） |
| 3 | MEDIUM | Task 2.5 に resumePoint null + `--from` 未指定時のガードを追加。`state.step` からの phase 推論 fallback も明記 |
| 4 | LOW | D2 Decision 本文に「`--from` 省略時は `critic` をデフォルト値として使用する」を追記 |

### Regressions

なし。

### Convergence Trend

`improving` — 前回の全 findings が解消され、新規 HIGH/CRITICAL は 0 件。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | tasks.md (2.8) | `request は state.request から取得` とあるが、`state.request` は `RequestInfo`（path, title, type, slug?）であり、PipelineDeps が要求する `ParsedRequest`（type, title, slug, content, enabled）と型が異なる。content と enabled が欠落するため型エラーになる | `state.request.path` から request.md を再パース（`parseRequestMd()` を使用）して `ParsedRequest` を取得する。task 2.8 の記述を「request は `state.request.path` のファイルを `parseRequestMd()` で再パースして取得」に修正 |

## Requirement Coverage

| Req # | Covered | Artifact | Notes |
|-------|---------|----------|-------|
| 1 | ✓ | tasks 2.1, 3.1 | |
| 2 | ✓ | tasks 1.1, 3.2, design D2 | |
| 3 | ✓ | tasks 2.3, design D7 | |
| 4 | ✓ | tasks 2.5, 1.1 | null guard 追加済み |
| 5 | ✓ | design D2, tasks 1.1 | |
| 6 | ✓ | design D2, tasks 1.1 | |
| 7 | ✓ | design D2, tasks 1.1 | |
| 8 | ✓ | tasks 2.8, 2.9, 4.1-4.2 | deps 構築手順追加済み |
| 9 | ✓ | design D3 | Pipeline 内部で自動リセット |
| 10 | ✓ | tasks 2.6 | |
| 11 | ✓ | tasks 2.7, design D5 | |
| 12 | ✓ | tasks 2.7, design D5 | |
| 13 | ✓ | tasks 1.2, 2.4, design D4 | |
| 14 | ✓ | tasks 1.3, 2.4, design D6 | |
| 15 | ✓ | tasks 3.1 | |
| 16 | ✓ | tasks 3.2 | |

## Codebase Verification

| 前提 | 検証結果 |
|------|---------|
| `Pipeline.run(startStep, jobState, deps)` が任意 step から開始可能 | ✓ pipeline.ts:68-72 |
| `ResumePoint` が JobState に存在 | ✓ schema.ts:157 |
| `awaiting-resume` が有効な JobStatus | ✓ schema.ts:5 |
| `listJobStates()` / `getJobSlug()` が存在 | ✓ store.ts:130 / job-slug.ts:68 |
| `WorktreeManager.create()` が存在 | ✓ manager.ts:19 |
| `runPipeline()` が常に "propose" から開始 | ✓ run.ts:85 — resume では使用不可 |
| `handlePostPipelineState()` が未 export | ✓ run.ts:108 — task 5.1 で export 追加 |
| `Verdict` 型に "escalation" / "error" を含む | ✓ schema.ts:31-38 |
| `state.step` が JobState に存在 | ✓ schema.ts:142 — task 2.5 の fallback が有効 |
| `RepositoryInfo` と `OriginInfo` が構造互換 | ✓ 両方 `{ owner, name }` |
| `RequestInfo` と `ParsedRequest` は非互換 | ⚠ Finding #1 |

## Verdict Rationale

前回の HIGH 2 件が全て解消。新規 Finding #1 は MEDIUM（型不一致だが解法は自明）であり承認阻止条件に該当しない。全 16 要件がカバーされ、設計判断の rationale も明確。実装に進行可能。
