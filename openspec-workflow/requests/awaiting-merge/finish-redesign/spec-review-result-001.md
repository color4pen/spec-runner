# Spec Review Result: finish-redesign — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.3 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, pattern-reviewer (security-reviewer は enabled に含まれず skip)
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 3

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 5 | 0.25 | 1.25 |
| feasibility | 8 | 0.20 | 1.60 |
| security | skipped | 0.15 | — |
| maintainability | 7 | 0.10 | 0.70 |
| **Total (re-normalized without security)** | | | **6.30** |

> security-reviewer は workflow options で enabled に含まれていないため `status: skipped`。review-standards.md に従い weight を 0.85 で再正規化:
> (6×0.30 + 5×0.25 + 8×0.20 + 7×0.10) / 0.85 = 5.35 / 0.85 = **6.29**

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | request.md:67, openspec/changes/finish-redesign/proposal.md:14, openspec/changes/finish-redesign/design.md:43-47, openspec/changes/finish-redesign/specs/job-state-store/spec.md:11-16, openspec/changes/finish-redesign/tasks.md:3 | `slug` field の nullability が文書間で divergent。request.md A1 と design.md D1 と proposal.md は `slug: string`、specs/job-state-store と tasks.md 1.1 は `slug: string \| null`。canonical type が決定不能 | 全 5 箇所を `slug: string \| null` に統一する（legacy state 後方互換のため null 許容が canonical）。request.md A1、proposal.md What Changes、design.md D1 を `string \| null` に修正 |
| 2 | HIGH | completeness | openspec/changes/finish-redesign/specs/cli-commands/spec.md:78 | `specrunner ps --all` Scenario が delta spec に存在するが、`--all` flag を導入する Requirement 本文が無い。implementer は flag の semantics（archived 含めるかの toggle）を自由に解釈できる | ps Requirement 本文に「`--all` flag は archived ジョブも含めて表示する」を MUST 追加し、現状 default で archived を表示する/しないを明示。または Scenario から `--all` を外し default 動作のみで表現 |
| 3 | HIGH | completeness | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md (Phase 2 区間) | Phase 2 (`git push origin <feature-branch>`) の **失敗パスが Requirement / Scenario いずれにも明文化されていない**。push reject / network error 時の挙動が未定義（escalation か retry か state 残置か）。review-lessons "失敗パスの責務委譲が Requirement + Scenario として spec で明文化されているか" の再発リスク | "1-PR モデル" Requirement に Phase 2 失敗時の Scenario を追加: `git push` non-zero 終了時は escalation、Phase 3 に進まず、state は前 status のまま、再実行可能。exit code は 1 |
| 4 | MEDIUM | consistency | openspec/changes/finish-redesign/design.md:170-174 | "Open Questions" 節に "`markJobArchived` のタイミングを Phase 4 の最後に置くか先頭に置くか" が **未解決として残存**。spec.md は既に「Phase 4 の最後」で MUST 記述しており、design は更新漏れ | design.md Open Questions から該当項目を削除し、Decisions に統合（または "Phase 4 末尾に確定" を Decision 化） |
| 5 | MEDIUM | completeness | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md:5-13 | Requirement 1 で `<slug>` 直接指定の Scenario "複数該当時は最新 `updatedAt` を優先" が MUST として記述されているが、対応する Scenario が存在しない | "複数 state 該当時の最新 updatedAt 優先" Scenario を追加（GIVEN 2件の state、WHEN finish <slug>、THEN updatedAt 新しい方を採用 + stdout に通知） |
| 6 | MEDIUM | completeness | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md (1-PR モデル Requirement Scenario) | "feature branch が既に削除済み（resume）" Scenario が "Phase 0 で feature branch が remote / local に存在せず" を前提にするが、Phase 0 pre-flight Requirement に "feature branch existence" の check が宣言されていない（check 1〜8 に該当なし） | (a) Phase 0 check 9 として "feature branch existence" を追加、または (b) 既に MERGED 状態 + delete-branch 済みは check 3 (`gh pr view`) の `state=MERGED` 判定で代替できることを Scenario に明記 |
| 7 | MEDIUM | consistency | openspec/changes/finish-redesign/tasks.md:6, openspec/changes/finish-redesign/module-analysis.md:62-64 | tasks 1.4 が `stripBranchPrefix` を `src/state/store.ts` から export 宣言だが、module-analysis 4.3 / 2.2 は `src/state/job-slug.ts` への分離を推奨。implementer は二択で迷う | tasks.md 1.3 / 1.4 を "store.ts または `src/state/helpers.ts` / `src/state/job-slug.ts`" の表記から実装上の最終配置を 1 つに固定。または module-analysis の推奨を採用してタスクを書き換え（既存 helpers.ts 採用が最小 coupling） |
| 8 | MEDIUM | maintainability | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md (Phase 1 区間), openspec/changes/finish-redesign/tasks.md:24 | spec が "git checkout <feature-branch>（必要なら fetch + checkout）" と曖昧。review-lessons "`git checkout -b ... origin/<base>` 失敗時の fallback が `-B`（force re-point）" の再発リスク。stale local branch silent reuse の余地 | spec で "MUST `git fetch origin <branch>` → `git checkout -B <branch> origin/<branch>`（force re-point）" を明記。または `git checkout <branch>` への素朴 fallback を SHALL NOT で禁止 |
| 9 | MEDIUM | maintainability | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md (Phase 1 idempotency 関連), openspec/changes/finish-redesign/tasks.md:25 | "staged 変更ゼロ → commit step skip" の検出方法が未指定。review-lessons "`git commit` の `nothing to commit` のような外部 CLI 文言依存判定が、`git diff --cached --quiet` の exit code による pre-check に置換されているか" の再発リスク | spec / tasks に "MUST `git diff --cached --quiet` の exit code で判定。git commit の stderr / stdout 文言マッチで判定する SHALL NOT" を追加 |
| 10 | MEDIUM | completeness | openspec/changes/finish-redesign/specs/register-branch-tool/spec.md:29-31 | slug 入力に対する空文字列・型外 validation 規則が delta spec に明示されていない。既存 Requirement "不正な入力は明確なエラーで拒否する"（branch 用）から類推する形になっている | MODIFIED ハンドラ Requirement に "slug が空文字列 / string 以外で渡された場合は state.request.slug に書き込まず branch から導出する" または "明確に reject する" を MUST で追加し、対応 Scenario を 1 件追加 |
| 11 | MEDIUM | completeness | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md:138-147 | `--dry-run` stdout 出力項目が箇条書きで述べられているのみで、具体的な行フォーマット（例: `- slug: <value>`）が固定されていない。review-lessons "後続 step / fixer が parse する result-file が spec で `- url: <URL>` のような bullet 形式 / fixed schema で固定されているか" の再発（dry-run output を tooling が parse する将来想定で危険） | spec で 1 行 1 フィールドの bullet 形式（例: `- slug: <value>`、`- source: <1\|2\|3\|4-a\|4-b>`、`- pr-state: <state>`、`- archive-plan: <run\|skip>`、`- merge-strategy: squash+delete-branch`、`- expected-status: archived`）を fixed schema として宣言 |
| 12 | MEDIUM | feasibility | openspec/changes/finish-redesign/tasks.md:30 | tasks 3.6 が `gh pr merge ... --squash --delete-branch` に加えて "`--force` で `--admin` 付与" と書くが、spec では `--admin` / `--force` の使用条件が未定義。security 観点（branch protection の強制 bypass）と feasibility 観点（gh CLI で `--admin` 権限が無いユーザでの fallback）の両方で曖昧 | spec の "1-PR モデル" Requirement に `--admin` 適用条件（例: required_status_checks が PASS なら `--admin` 不要、UNKNOWN/PENDING で SHALL NOT 自動付与）を MUST で明記。tasks 側の "`--force` で `--admin` 付与" 表現は spec 経由で具体化 |
| 13 | LOW | maintainability | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md (Phase 0 check 3-4 区間) | spec が `gh pr view <num>` を呼ぶと書くが、`--json` flag を使った構造化出力 MUST 規定がない。review-lessons "外部 CLI の出力解析が `--json` / `--format json` のような構造化形式で行われているか" の preventive 対象 | spec に MUST `gh pr view <num> --json mergeStateStatus,state,headRefName,...` を明記 |
| 14 | LOW | consistency | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md:5, openspec/changes/finish-redesign/specs/cli-finish-command/spec.md:138 | `--dry-run` flag の引数位置が文書間で揺れる: Requirement 1 は `[<slug>] [--pr <num>] [--job <jobId>] [--dry-run]`、`--dry-run` Requirement は `--dry-run [<slug>]`。flag は位置非依存だが表記統一が好ましい | 全箇所を `[<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` で固定 |
| 15 | LOW | consistency | openspec/changes/finish-redesign/specs/job-state-store/spec.md:20 | "the directory containing `request.md` (typically `openspec-workflow/requests/active/<slug>/`)" の `awaiting-merge/<slug>/` 言及があるが、`specrunner run` は active phase でのみ起動される（Step 7c で awaiting-merge へ遷移）ので awaiting-merge 配下からの起動は dead code | spec から `awaiting-merge` の言及を削除し `active/<slug>/` のみに限定。または "run 起動時 path は active/ 配下のみ" を Requirement の Invariant に追加 |
| 16 | LOW | maintainability | openspec/changes/finish-redesign/specs/cli-finish-command/spec.md (1-PR モデル Requirement "通常成功フロー" Scenario) | "feature PR が squash merge され、archive commit が main に反映され" の表現が誤解を招く（squash で archive commit は単一 commit に潰れて main に landing）。reader が "archive commit が main に独立した commit として残る" と誤解する余地 | "feature PR が squash merge され、feature branch の全 commit（archive commit を含む）が単一 commit として main に landing する" に書き換え |

## Iteration Comparison

（iteration 1 のため記載なし）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.30 | needs-fix | initial review — 3 HIGH（slug nullability 不整合 / `--all` 未定義 / push 失敗パス未定義）, 9 MEDIUM, 4 LOW |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue (spec-fixer に渡して needs-fix を解消)

## Summary

設計の中核（1-PR モデル転換 / Phase 0 pre-flight / slug の canonical 化 / getJobSlug helper / register_branch slug 連動）は dogfooding-006 で露呈した defect 群への構造的応答として **方向性は正しい**。feasibility は doctor pattern との整合と module-analysis の妥当な構造判断（archive-pr.ts 削除、preflight.ts 単一 module、getJobSlug の helper 分離）で 8 点。しかし以下 3 点が承認阻止要因:

1. **slug nullability の文書間 divergence**（request.md / proposal.md / design.md と spec.md / tasks.md で `string` vs `string \| null` が二重化）— legacy 互換のために null 許容が canonical なのに、上位文書が non-null と書く矛盾を残したまま実装に流すと、implementer が legacy state 経路で type error を踏む
2. **`specrunner ps --all` flag の未定義**（Scenario には現れるが Requirement 本文に登場しない）— implementer 解釈が分岐し、test fixture も合意点を持てない
3. **Phase 2 push 失敗パスの未明文化**— review-lessons の "失敗パスの責務委譲を Requirement + Scenario で明文化" の再発リスクそのもの

加えて MEDIUM 9 件のうち 5 件は review-lessons の preventive item（`git checkout -B` 強制、`git diff --cached --quiet` 文言非依存、`gh --json` 強制、register_branch slug input validation、--admin 適用条件）で、いずれも過去の defect カテゴリと一致する。spec-fixer ループで 1-2 iter での解消が見込める性質の指摘群。

architect / spec-reviewer / pattern-reviewer の所見は **互いに補強関係**にあり、認証/認可/データフロー観点の security 検査は workflow options で enabled に含まれていないため対象外（spec-change の性質上、外部 attack surface 変更が無いので skip 判断は妥当）。
