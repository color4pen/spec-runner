# Spec Review Result — specrunner-resume-command

- **reviewer**: spec-reviewer
- **iteration**: 1
- **verdict**: needs-fix

## Summary

proposal.md と design.md は request の要件を概ね網羅しており、設計判断（D1-D7）の rationale も明確。ただし、`resolveBySlug()` の再利用前提が既存実装と矛盾する致命的な問題があり、tasks.md には PipelineDeps 構築手順の欠落がある。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | design.md (D1) / tasks.md (2.2) | `resolveBySlug()` は内部で `buildResolvedTarget()` を呼び、`pullRequest`（number, url）と `branch` が存在しない場合 `{ok: false, exitCode: 2}` を返す。`awaiting-resume` の job は pr-create 前に停止していることが大半であり、PR 情報がない。resume で再利用すると slug 解決が常に失敗する | resume 用の slug 解決関数を新設する（`listJobStates()` + `getJobSlug()` でフィルタし `JobState` を直接返す）。または `resolveBySlug` の下層ロジック（slug matching 部分のみ）を共有ユーティリティに切り出し、`buildResolvedTarget` を経由しないパスを作る |
| 2 | HIGH | completeness | tasks.md (Section 2) | `PipelineDeps` の構築手順がタスクに存在しない。pipeline 実行には `config`（`loadConfig()`）、`repo`（state から取得 or `getOriginInfo()`）、`githubClient`、`client`（managed runtime のみ）、`cwd`、`slug` が必要。run.ts は `runPreflight()` でこれらを取得するが resume は preflight 不要（request.md が存在しない可能性あり）。config ロード・クライアント生成・deps 組み立てのタスクを追加すべき | Section 2 に「2.X: deps 構築」タスクを追加。`loadConfig()` で config 取得 → runtime 判定 → client/runner 生成 → `PipelineDeps` 組み立て。`repo` は `state.repository` から取得（git remote 再検出は不要）。`request` は `state.request` から取得 |
| 3 | MEDIUM | correctness | tasks.md (2.5) | `--force` で status gate を override し `failed`/`terminated` の job を resume する場合、`resumePoint` が null の可能性がある。`resolveResumeStep(options.from, state.resumePoint)` が null resumePoint でクラッシュする | task 2.5 の前に guard を追加: `resumePoint` が null かつ `--from` 未指定の場合はエラー（`--from` を指定するよう促すメッセージ）。`--from` 指定時は `resumePoint` なしでも phase 推論を fallback（state.step から推論、または code-phase をデフォルト） |
| 4 | LOW | consistency | design.md (D2) | `--from` 未指定時（default = critic）の挙動が mapping table に明示されていない。table の `critic (default)` 記載から推論可能だが、「`from` が undefined の場合は `critic` として扱う」を Decision 本文に一文追加すべき | D2 Decision 本文に「`--from` 省略時は `critic` をデフォルト値として使用する」を明記 |

## Requirement Coverage

| Req # | Covered | Artifact | Notes |
|-------|---------|----------|-------|
| 1 | ✓ | tasks 2.1, 3.1 | |
| 2 | ✓ | tasks 1.1, 3.2 | |
| 3 | ✓ | tasks 2.3 | |
| 4 | △ | tasks 2.5 | Finding #3: null resumePoint 未考慮 |
| 5 | ✓ | design D2, tasks 1.1 | |
| 6 | ✓ | design D2, tasks 1.1 | |
| 7 | ✓ | design D2, tasks 1.1 | |
| 8 | △ | tasks 2.8, 4.1-4.2 | Finding #2: deps 構築手順欠落 |
| 9 | ✓ | design D3 | Pipeline 内部で自動リセット — 追加作業不要 |
| 10 | ✓ | tasks 2.6 | |
| 11 | ✓ | tasks 2.7 | |
| 12 | ✓ | tasks 2.7 | |
| 13 | ✓ | tasks 1.2, 2.4 | |
| 14 | ✓ | tasks 1.3, 2.4 | |
| 15 | ✓ | tasks 3.1 | |
| 16 | ✓ | tasks 3.2 | |

## Verdict Rationale

Finding #1 は設計の前提（`resolveBySlug` 再利用）が既存コードの制約（PR 必須）と矛盾しており、実装時に必ず失敗する。Finding #2 は PipelineDeps 構築という実装の核心部分がタスクに欠落しており、implementer が独自に調査・判断する必要がある。いずれも HIGH であり needs-fix。
