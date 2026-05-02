# Spec Review Result: finish-redesign — Iteration 2

## Verdict

- **verdict**: approved
- **score**: 8.35 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving (delta +2.05)
- **agents**: architect, spec-reviewer, pattern-reviewer (security-reviewer は enabled に含まれず skip)
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 8 | 0.25 | 2.00 |
| feasibility | 9 | 0.20 | 1.80 |
| security | skipped | 0.15 | — |
| maintainability | 9 | 0.10 | 0.90 |
| **Total (re-normalized without security)** | | | **8.35** |

> security-reviewer は workflow options で enabled に含まれていないため `status: skipped`。weight 0.85 で再正規化:
> (8×0.30 + 8×0.25 + 9×0.20 + 9×0.10) / 0.85 = 7.10 / 0.85 = **8.35**

### カテゴリの観点

| Category | 評価観点 | 主担当エージェント |
|----------|---------|-----------------|
| completeness | 要件の網羅性、受け入れ基準の充足、仕様の漏れ | spec-reviewer |
| consistency | 既存 spec との整合性、後方互換性、用語統一 | spec-reviewer, architect |
| feasibility | 実現可能性、依存関係、工数見積の妥当性 | architect |
| security | 認証・認可、入力検証、脅威モデル（spec レベル） | security-reviewer |
| maintainability | 仕様の明確性、将来の拡張容易性、アンチパターン回避 | architect, pattern-reviewer |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | openspec/changes/finish-redesign/proposal.md:30 | iteration 1 の HIGH #1（slug nullability divergence）に対する spec-fixer の修正範囲が 5 箇所中 4 箇所（request.md / proposal.md What Changes / design.md / job-state-store/spec.md / tasks.md）に留まり、proposal.md の Modified Capabilities 説明文 "RequestInfo に `slug: string` field を追加し" が `slug: string \| null` に書き換えられていない。What Changes と design.md は `string \| null` に揃ったため canonical type の解釈に揺らぎは残らないが、explicit な記述として末端にだけ `string` 表記が残る | proposal.md:30 を `RequestInfo に \`slug: string \| null\` field を追加し` に書き換える。または `slug` field とだけ書いて型は他文書に委ねる |

## Iteration Comparison

### Improvements

iteration 1 で挙げた 16 件のうち **15 件が解消**された（HIGH 3 件 + MEDIUM 9 件 + LOW 4 件のうち 3 件）。

- **HIGH #1（slug nullability divergence）**: request.md A1 / proposal.md What Changes / design.md D1 のコードブロックを `slug: string | null` に統一済み。残りは proposal.md:30 の説明文 1 箇所のみ（LOW に降格）
- **HIGH #2（`specrunner ps --all` 未定義）**: cli-commands/spec.md:42 で `--all` flag semantics（archived も含めて表示 / `--all` なしは archived を SHALL NOT 表示）を Requirement 本文に MUST で追加。Scenario「archived 状態のジョブが表示される」も追加
- **HIGH #3（Phase 2 push 失敗パス未定義）**: cli-finish-command/spec.md:153-156 に "Phase 2 `git push` 失敗時の escalation" Scenario を追加。escalation で停止 / Phase 3 進まず / state は前 status のまま / 再実行可能 / exit code 1 を明記
- **MEDIUM #4（Open Questions の markJobArchived タイミング）**: design.md Open Questions から削除し Decisions 相当の確定記述（spec.md MUST 参照付き）に書き換え
- **MEDIUM #5（複数 state updatedAt 優先 Scenario 不在）**: cli-finish-command/spec.md:20-24 に該当 Scenario を追加
- **MEDIUM #6（feature branch existence check 不在）**: Phase 0 check 9 として追加（cli-finish-command/spec.md:65）。MERGED 状態かつ branch 削除済み = resume path、それ以外は escalation
- **MEDIUM #7（job-slug.ts 配置の二択）**: tasks.md 1.3 / 1.4 を `src/state/job-slug.ts`（新規ファイル）に固定。store.ts への配置 option を削除
- **MEDIUM #8（git checkout 曖昧表現）**: Phase 1 を `git fetch origin <feature-branch>` → `git checkout -B <feature-branch> origin/<feature-branch>` 強制に書き換え、素朴な `git checkout <branch>` を SHALL NOT で禁止（cli-finish-command/spec.md:106）
- **MEDIUM #9（staged 変更検出方法）**: `git diff --cached --quiet` exit code 判定を MUST、`git commit` の stdout / stderr 文言依存判定を SHALL NOT で明記（cli-finish-command/spec.md:117）
- **MEDIUM #10（register_branch slug validation）**: register-branch-tool/spec.md:33 に slug 空文字列 / 型外時は state.request.slug に書き込まず branch から導出する MUST 規則 + Scenario「空文字列 slug が渡された場合は branch から導出」を追加
- **MEDIUM #11（dry-run stdout fixed schema）**: cli-finish-command/spec.md:162-173 で 8 フィールドの bullet 形式（`- slug: <value>` 等）を fixed schema として MUST 宣言。フィールド順序固定 / `unknown` プレースホルダ規定済み
- **MEDIUM #12（--admin 適用条件）**: cli-finish-command/spec.md:119-124 に `mergeStateStatus=BLOCKED かつ blocking reason が required status checks のみ` 限定の `--admin` 適用条件を MUST で追加。CLEAN / MERGEABLE では SHALL NOT
- **LOW #13（gh pr view --json 強制）**: Phase 0 check 3 で `gh pr view <num> --json mergeStateStatus,state,headRefName` を MUST 明記
- **LOW #14（--dry-run flag 表記揺れ）**: 全箇所 `[<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` で統一
- **LOW #15（job-state-store の awaiting-merge 言及）**: 削除し active/<slug>/ のみに限定。"`specrunner run` is only invoked from the `active/` phase" と Invariant も追加
- **LOW #16（squash merge 文言誤解）**: "feature branch の全 commit（archive commit を含む）が単一 commit として main に landing する" に書き換え

### Regressions

- なし（前回から悪化した指摘は検出されず）

### Unchanged Issues

- proposal.md:30 の `slug: string` 表記が説明文に残存。HIGH #1 の修正範囲が 1 箇所漏れた（前回 HIGH 指摘の中で唯一の残骸だが、上位文書の canonical type は `string | null` で確定しており、implementer が解釈で迷う余地は実質ゼロのため LOW に降格）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.30 | needs-fix | initial review — 3 HIGH（slug nullability / `--all` 未定義 / push 失敗パス未定義）, 9 MEDIUM, 4 LOW |
| 2 | 8.35 | approved | 15/16 解消（HIGH 3 + MEDIUM 9 + LOW 3）。残 1 件は proposal.md:30 の表記漏れで LOW 降格、ブロック要因なし |

## Convergence

- **trend**: improving (前回比 +2.05、停滞検出条件未該当)
- **recommendation**: approved（spec-fixer 1 iter で needs-fix を解消、score が pass threshold +1.35 に到達）

### 停滞検出ルール

- `plateaued` (前回との差が ±0.3 以内) が **2 iteration 連続** した場合、`verdict` を `escalation` にする → 該当せず（improving）
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する → 該当せず

## Summary

iteration 1 で指摘した 3 HIGH（slug nullability divergence / `specrunner ps --all` semantics 未定義 / Phase 2 push 失敗パス未明文化）と 9 MEDIUM、4 LOW は spec-fixer により 15/16 件が解消された。canonical type 統一・受け入れ基準の Scenario 補完・review-lessons preventive 群（`gh --json` 強制 / `git diff --cached --quiet` 判定 / `git checkout -B` force re-point / register_branch 空文字列 validation / dry-run fixed schema / `--admin` 条件付き付与）の全反映により、completeness と consistency が +2-3 ポイント、maintainability が +2 ポイント上振れた。feasibility は元から 8 で、Phase 0 check 9（feature branch existence）と `--admin` 適用条件の精緻化で 9 に到達。

唯一 proposal.md:30 の "RequestInfo に `slug: string` field を追加し" 表記が `string | null` への置換漏れとして残るが、(a) 同じ proposal.md の What Changes 本文（line 14）は `slug: string | null` で正しく書かれている、(b) 上位文書（request.md A1 / design.md D1）と直接 spec（job-state-store/spec.md）はすべて `string | null` で統一済み、(c) implementer が参照する canonical 文書（specs/ 配下）に揺らぎは無い、ため LOW 降格として approved の判定をブロックしない。spec-fixer がもう 1 iter 走るより、implement 時にこの 1 行を併修するか archive 前の最終整合チェック（tasks 8.4）で吸収する方が cost-effective。

`openspec validate finish-redesign --strict` も pass。delta spec の RENAMED / MODIFIED 規約整合は維持されている。spec-change の性質上 security-reviewer は enabled に含まれず skip 判定は妥当（外部 attack surface 変更なし）。1-PR モデル転換 / Phase 0 pre-flight / slug canonical 化 / register_branch slug 連動 / adversarial test fixture（TC-101〜TC-110）の核心要件は揺るぎなく、dogfooding-006 で露呈した defect 群の構造的解消への直接対応として方向性が正しい。実装フェーズに進める。
