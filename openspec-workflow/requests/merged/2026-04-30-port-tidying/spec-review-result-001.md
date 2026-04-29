# Spec Review Result: 2026-04-30-port-tidying — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.7 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 5 | 0.25 | 1.25 |
| feasibility | 8 | 0.20 | 1.60 |
| security | — (skipped: refactoring; security-reviewer not enabled) | 0.15 | — |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **6.65 / 8.5** = 6.7 (security weight 0.15 を除外し 0.85 で正規化) |

> security は `enabled` に `security-reviewer` が含まれず、本 request も refactoring（認証・認可・入力検証のスペックレベル変更なし）であるため `skipped` 扱い。残 4 カテゴリで加重合計を算出（合計 weight 0.85 → 正規化）。

### カテゴリの観点

| Category | 評価観点 | 主担当エージェント |
|----------|---------|-----------------|
| completeness | 要件の網羅性、受け入れ基準の充足、仕様の漏れ | spec-reviewer |
| consistency | 既存 spec との整合性、後方互換性、用語統一 | spec-reviewer, architect |
| feasibility | 実現可能性、依存関係、工数見積の妥当性 | architect |
| security | 認証・認可、入力検証、脅威モデル（spec レベル） | security-reviewer (skipped) |
| maintainability | 仕様の明確性、将来の拡張容易性、アンチパターン回避 | architect |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/specs/cli-commands/spec.md:163 | 本 request で `fetchSpecReviewResult` を production code から削除する設計だが、`openspec/specs/cli-commands/spec.md:163` の Scenario「spec-review-result.md が見つからない」が `fetchSpecReviewResult` を直接 reference している。delta で `cli-commands` capability の MODIFIED は発行されておらず（change folder には `spec-review-session` delta のみ）、merge 後に「spec が削除済みの関数を引用する」状態になる。spec/code 乖離は learned-patterns lesson「migration の完了判定は production 経路の grep」（spec も同 grep の対象に含めるべき）に反する。 | `openspec/changes/2026-04-30-port-tidying/specs/cli-commands/spec.md` を新規作成し、`## MODIFIED Requirements` で当該 Requirement（"必要な config 項目が揃っている (既存挙動維持)" の親 Requirement）を含むセクションを発行する。Scenario 文言の `fetchSpecReviewResult がリトライ後も null を返す` を `deps.githubClient.getRawFile が adapter 内部リトライ後も null を返す` に書き換える。tasks.md Section 5 にも `cli-commands` delta の整合確認 sub-task を追加する。受け入れ基準にも `grep -rn "fetchSpecReviewResult" openspec/specs/` で 0 件を追加する。 |
| 2 | MEDIUM | completeness | tasks.md, request.md (受け入れ基準) | 受け入れ基準と tasks.md Section 6 が **production / test の grep** のみで完了判定しており、**spec の grep**（`openspec/specs/` 配下）が含まれていない。Finding #1 はこの欠落の直接の帰結。learned-patterns lesson「migration の完了判定は production 経路の grep」を spec 側へも横展開する規律が design レベルで明文化されていない。 | request.md「受け入れ基準」と tasks.md Section 6.4 に `grep -rn "fetchSpecReviewResult" openspec/specs/` で 0 件、`grep -rn "FetchSpecReviewResultParams" openspec/specs/` で 0 件を追加する。design.md の Migration Plan / Decisions に「spec も grep 対象に含める」規律を 1 文で明記する（後続 request の参考にもなる）。 |
| 3 | MEDIUM | consistency | openspec/changes/2026-04-30-port-tidying/specs/spec-review-session/spec.md:5,29 | delta の文言「`GitHubClient` port の adapter 実装に委譲する」「`GitHubClient` adapter (`GitHubApiClient.getRawFile`) の内部仕様」が、port interface の名称と adapter クラスの implementation 詳細（`GitHubApiClient`）を混在させている。Requirement レベルの spec は port 契約のセマンティクスのみを記述し、adapter 実装名（`GitHubApiClient`）は除外するのが既存仕様の流儀（例: 他 spec.md は `GitHubApiClient` を参照していない）。port を実装する adapter は本来 1 つに固定される必要は無く、テスト・Mock も含め複数あり得るため、adapter 名を spec に含めると将来の adapter 差し替えで spec を再修正する必要が生じる。 | delta の `GitHubClient adapter (GitHubApiClient.getRawFile) の内部仕様` を `GitHubClient port の getRawFile 実装の内部仕様` に書き換える。`GitHubApiClient` への直接 reference は spec から削除する（ADR や implementation-notes.md で adapter 詳細に触れるのは可）。 |
| 4 | LOW | maintainability | openspec/changes/2026-04-30-port-tidying/design.md (D2 JSDoc 例) | design.md D2 で示した JSDoc 例は port `verifyPath` のセマンティクスを「200 で true、404 で false、401 で `GITHUB_TOKEN_EXPIRED` を throw」と明示している点は良いが、**5xx / network error / その他 status** に対する port 契約が定義されていない。adapter 実装（`src/adapter/github/github-client.ts:97`）は `return resp.status !== 404` で 200 以外（5xx 含む）も true 扱いになっており、将来 5xx 連発時に false-positive で folder が「存在する」と判定される可能性がある。本 request の主目的（port 契約の純度回復）の延長として port JSDoc を strict 化しておくと、将来の adapter 差し替え時の安全性が増す。 | design.md D2 / port JSDoc に「5xx / network error の場合は GitHubApiError（または同等の throwable）を throw する」を 1 文追加する。adapter 実装側の準拠は本 request スコープ外として OK（ただし implementation-notes.md に「現在の adapter は 5xx を true 扱い。本 request では port spec のみ tighten し、adapter 修正は別 request」と記録）。 |
| 5 | LOW | feasibility | tasks.md Section 2.3 / 2.4 | Section 2.3 で `bun run typecheck` を実行するが、test mock に `verifyPath` を未実装の状態では typecheck error になる前提。Section 2.4 の note でこれを意図的としている（「列挙して Section 3 で解消」）が、tasks.md の checkbox としては Section 2 が done になる時点で typecheck error が残存している状態 = Section 完了基準が「typecheck PASS」ではないことを実装者が誤解する可能性がある。 | Section 2.3 の文言を「`bun run typecheck` を実行し、未実装箇所のリスト（typecheck error の File:Line）を `implementation-notes.md` に記録する。本 Section の完了は **未実装箇所リストの記録** であり、typecheck PASS は Section 3 完了時の条件である」と明示する。 |
| 6 | LOW | completeness | tasks.md Section 3.3.5 | mock 追従について「`tests/spec-review-step.test.ts` で `fetchSpecReviewResult` を経由していたシナリオを `githubClient` mock 経由に整理」とあるが、本 worktree には他にも `tests/pipeline.test.ts` / `tests/pipeline-integration.test.ts` の `buildMockGithubClient` が存在し、これらも `verifyPath` 必須化に伴う追従対象。tasks.md ではこの 2 ファイルが明示されていない（Section 2.3 の typecheck error で機械的に検知される設計のため運用は破綻しないが、design 段階で列挙しておくと leakage を防げる）。 | tasks.md Section 3.3.5（または Section 2.4）に「`tests/pipeline.test.ts` と `tests/pipeline-integration.test.ts` の `buildMockGithubClient` も `verifyPath` を必須実装する」を追記する。 |

## Iteration Comparison

（iteration 1 のため記載なし）

### Improvements
- N/A

### Regressions
- N/A

### Unchanged Issues
- N/A

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.7 | needs-fix | initial review |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue (spec-fixer で HIGH #1 を解消し再レビュー)

### 停滞検出ルール

- `plateaued` (前回との差が ±0.3 以内) が **2 iteration 連続** した場合、`verdict` を `escalation` にする
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する

## Summary

設計の骨格（D1 `fetchSpecReviewResult` 削除 / D2 port `verifyPath` 必須化 / D3 structural typing leak 除去 / D4 `spec-review-session` MODIFIED delta）は learned-patterns に整合しており、tasks.md の 4-sub-task 分解（全置換 / 旧 export 削除 / テスト書き換え / grep 残存ゼロ）も lesson に従っている。feasibility は高く、振る舞い不変の機械的検証（CLI snapshot test の `--update-snapshot` 無し PASS）も妥当。

ただし **HIGH #1: `cli-commands/spec.md:163` の `fetchSpecReviewResult` reference 漏れ** が承認阻止要因。delta は `spec-review-session` のみで発行されているが、`cli-commands` capability も同関数を Scenario 文言で reference しており、merge 後に spec/code 乖離が固定化される。`cli-commands` の MODIFIED delta 追加で解消可能。

加えて MEDIUM #2 / #3 / LOW #4-6 で「spec の grep を完了判定に含める規律」「port spec から adapter 実装名を除く」「port JSDoc の 5xx 契約」「test mock 追従の対象列挙の網羅」を改善するとさらに堅牢になる。spec-fixer 起動時は HIGH #1 + MEDIUM #2 / #3 を必須対応（受け入れ基準と tasks.md にも反映）、LOW は時間が許せば対応で次 iteration へ。
