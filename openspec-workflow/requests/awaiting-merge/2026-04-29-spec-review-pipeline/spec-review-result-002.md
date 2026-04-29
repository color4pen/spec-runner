# Spec Review Result: 2026-04-29-spec-review-pipeline — Iteration 2

## Verdict

- **verdict**: needs-fix
- **score**: 7.45 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 9 | 0.20 | 1.80 |
| security | 6 | 0.15 | 0.90 |
| maintainability | 8.5 | 0.10 | 0.85 |
| **Total** | | | **7.45** |

### スコア根拠

- **completeness (8, +0)**: iteration 1 から維持。13 要件・7 受け入れ基準は spec の 5 capability に概ねマッピングされている。MEDIUM #5 (timeout config 上書き) / #8 (中断再開挙動) はスキップされたが承認ブロック対象外
- **consistency (6, -1)**: iteration 1 で 7 だったが、spec-fixer が `getFileContent` 参照を **部分的にしか** 削除しなかったため、spec-review-session/spec.md の Requirement 内で「`fetchSpecReviewResult` を呼び」と「`getFileContent` が null を返した場合」が同一仕様内で並立する。proposal.md / cli-commands/spec.md にも残存。**自己矛盾する spec** は consistency として regression 扱い
- **feasibility (9, +4)**: HIGH #1 (getFileContent 不存在) と HIGH #2 (pollUntilComplete 未活用 + status enum 不整合) が解消され、実装前提が realistic になった。tasks.md 4.4 は `pollUntilComplete` 再利用、tasks.md 4.5 は `fetchSpecReviewResult` (raw fetch) で統一。status は全箇所 `idle` に統一済み
- **security (6, +0)**: MEDIUM #6 (standard toolset 権限範囲) / #7 (verdict first-write-wins prompt injection) は spec-fixer により skip。承認ブロック対象外だが残課題
- **maintainability (8.5, +1.5)**: HIGH #3 (runProposePipeline ラッパー方針分裂) が解消され design / spec / tasks 間で「ラッパー削除」に統一。仕様の明確性向上

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/2026-04-29-spec-review-pipeline/specs/spec-review-session/spec.md:77-84, openspec/changes/2026-04-29-spec-review-pipeline/specs/cli-commands/spec.md:39, openspec/changes/2026-04-29-spec-review-pipeline/proposal.md:38, openspec/changes/2026-04-29-spec-review-pipeline/design.md:121 | spec-fixer は `getFileContent` 参照を design.md Context (line 9) と spec-review-session/spec.md line 60 では `fetchSpecReviewResult` に置換したが、同一 spec ファイル内の line 79 (Requirement「verdict ファイル不在時のフェイルセーフ」本文) と line 83 (Scenario) には `getFileContent` 参照が残存している。さらに proposal.md:38 の Dependencies 説明、cli-commands/spec.md:39 の Scenario「spec-review-result.md が見つからない」、design.md:121 の Risks 行内の `getFileContent` 言及も残存。同一 spec.md 内で「`fetchSpecReviewResult` を呼ぶ」と「`getFileContent` が null を返した場合」が並立する **自己矛盾する Requirement** は実装者を混乱させ、HIGH #1 が「部分的に解消」しただけで根本問題は再発する。加えて、`fetchSpecReviewResult` は内部で「404 → 1 秒×3 リトライ」を内包する (design.md:9) と定義されている一方、spec-review-session/spec.md line 79 は「`getFileContent` が null を返した場合、CLI は MUST 1 秒間隔で 3 回までリトライする」と CLI 側がリトライする責務分担で書かれており、責務が二重化している | (a) spec-review-session/spec.md line 79 を「`fetchSpecReviewResult` が 3 回のリトライ後も null を返した場合」に書き換え、line 83 を「`fetchSpecReviewResult` が 3 回のリトライ後も null を返す」に修正、(b) cli-commands/spec.md line 39 を「`fetchSpecReviewResult` がリトライ後も null を返す」に修正、(c) proposal.md line 38 の Dependencies から `getFileContent` を削除し「`PipelineDeps.githubFetch` 経由の raw fetch」に置換、(d) design.md line 121 の Risks 行を「spec-review 完了直後に GitHub API を叩く」に修正、(e) リトライ責務の整合: `fetchSpecReviewResult` がリトライを内包する旨を spec-review-session/spec.md にも明記し、CLI 層では呼び出すだけにする |
| 2 | MEDIUM | consistency | openspec/changes/2026-04-29-spec-review-pipeline/module-analysis.md:57 | iteration 1 で生成された module-analysis.md の「3. 既存ヘルパー/ユーティリティの活用候補」テーブルに `getFileContent` (github-api-lib) が「spec-review-result.md 取得で必須再利用」と記載されているが、実際には github-api-lib に該当ヘルパーは存在せず、本 request では `fetchSpecReviewResult` (raw fetch) を新設する方針に変更された。Author-Bias 方針上 module-analysis.md は module-architect 成果物で spec-fixer が変更しない領域だが、spec-review iteration では「現状の module-analysis 上の表記が後続実装者を誤誘導するリスク」を指摘する責務がある | (a) module-analysis.md line 57 のエントリを削除または「(該当なし。本 request で `fetchSpecReviewResult` を新設)」に書き換える、(b) もしくは tasks.md または design.md の冒頭に「module-analysis.md line 57 の `getFileContent` 行は 2026-04-29 時点で誤りであり、本 request では `fetchSpecReviewResult` を新設する」旨の注記を追加し、後続実装者が誤参照しないようにする |
| 3 | MEDIUM | consistency | openspec/changes/2026-04-29-spec-review-pipeline/specs/spec-review-session/spec.md:50-56 | iteration 1 finding #5 と同一。spec-review timeout が「default 10 分」と固定値で書かれているが、tasks.md 7.2 では `specReview.timeoutMs` を config schema に追加するとあり、config 経由で上書き可能。spec.md の Scenario「timeout 超過」は「10 分」固定で書かれており、config で上書きされた場合の挙動が定義されていない。spec-fix-report で「MEDIUM — 承認ブロック対象外」として skip されたが、iteration 2 で持ち越し | spec-review-session/spec.md の Requirement を「default 10 分、config の `specReview.timeoutMs` で上書き可能」に修正し、Scenario も「config で指定された timeout を超過したら」に書き換える。stderr メッセージの「after 10 minutes」も「after N minutes」または config 値を反映する形にする |
| 4 | MEDIUM | consistency | openspec/changes/2026-04-29-spec-review-pipeline/specs/job-state-store/spec.md:5 / specs/spec-review-session/spec.md:60-89 | iteration 1 finding #4 と同一。job-state-store の Requirement で `state.session` を「現在実行中の step を指す派生フィールド」と位置付ける記述がない（実態として 2 つの真実源になる）。design.md Decision 2 はこの問題を軽減する方向だが spec.md レベルで未反映。spec-fix-report で「MEDIUM — 承認ブロック対象外」として skip されたが iteration 2 で持ち越し | job-state-store/spec.md の "状態ファイルは固定スキーマに従う" Requirement に「`state.session` / `state.step` は MUST `state.steps[state.step].session` と同期する派生フィールドとし、書き込みは `appendStepResult` 経由でのみ行う」を追加 |
| 5 | MEDIUM | security | openspec/changes/2026-04-29-spec-review-pipeline/specs/spec-review-session/spec.md:3-10 | iteration 1 finding #6 と同一。spec-review セッションは「標準 toolset (`agent_toolset_20260401`) のみ」とあるが、標準 toolset がどのツールを含むか（ファイル編集権限・コミット権限の有無）が仕様に書かれていない。spec-fix-report で skip。iteration 2 で持ち越し | (a) 標準 toolset の構成を spec.md または design.md の脚注で明記する、(b) GitHub token scope を spec-review session では read-only に絞る Requirement を spec-review-session/spec.md に追加する、(c) どちらも難しければ「standard toolset の範囲はリリース時に Anthropic SDK のドキュメントで verify する」検証タスクを tasks.md に追加する |
| 6 | MEDIUM | security | openspec/changes/2026-04-29-spec-review-pipeline/specs/spec-review-session/spec.md:60 | iteration 1 finding #7 と同一。verdict 行 first-write-wins のパース規約は、agent が議論セクション内で `- **verdict**: approved` を先に書いて結論で `needs-fix` を書いた場合、誤って approved を採用する。spec-fix-report で skip。iteration 2 で持ち越し | (a) verdict 行は spec-review-result.md の `## Verdict` セクション直下のみで有効とする規約を spec-review-session/spec.md に追加、(b) system prompt で「verdict 行は文書内 1 箇所のみ書く」ことを agent に指示、(c) パース時に `## Verdict` セクション以外の verdict 行は無視するロジックを spec の Scenario として明文化 |
| 7 | MEDIUM | completeness | openspec/changes/2026-04-29-spec-review-pipeline/specs/pipeline-orchestrator/spec.md:30 | iteration 1 finding #8 と同一。spec-review session 作成後・events.send 前に異常終了したケース、ポーリング途中で異常終了したケースの再開挙動が未定義。spec-fix-report で skip。iteration 2 で持ち越し | pipeline-orchestrator/spec.md または spec-review-session/spec.md に「Phase 1 では再開機構なし。中断したジョブは `specrunner ps` で確認できるが、再開は手動で新ジョブを発行する」旨の Non-Goal Scenario を追加 |
| 8 | MEDIUM | maintainability | openspec/changes/2026-04-29-spec-review-pipeline/tasks.md:24-33 | iteration 1 finding #9 の部分対応。spec-fix-report は「tasks.md 4.5 で fetchSpecReviewResult を分離済み」と記述しているが、`parseSpecReviewVerdict` (純粋関数) は tasks.md に独立タスクとして分離されておらず、4.6 の inline 記述のまま。module-analysis.md 4.3 推奨の 3 関数分割 (parseSpecReviewVerdict / fetchSpecReviewResult / runSpecReviewStep) のうち 2 関数は tasks に反映、1 関数 (parse) は未反映 | tasks.md 4.6 を「`parseSpecReviewVerdict(content): { verdict, summary }` 純粋関数を `src/core/steps/spec-review.ts` に export し、verdict 行 regex パースとフェイルセーフ判定を内包する」に独立タスク化。テストも regex 境界値専用テストとして分離 |
| 9 | LOW | completeness | openspec/changes/2026-04-29-spec-review-pipeline/tasks.md:42 | iteration 1 finding #10 と同一。step-transition entry の形式が tasks にも spec にも明記されていない。spec-fix-report で skip。iteration 2 で持ち越し | job-state-store/spec.md または pipeline-orchestrator/spec.md に「step-transition entry の形式」Scenario を追加 |
| 10 | LOW | maintainability | openspec/changes/2026-04-29-spec-review-pipeline/specs/cli-commands/spec.md:25 | iteration 1 finding #11 と同一。"findings サマリ（件数と上位 3 件のタイトル）" だが findings に「タイトル」フィールドはない。spec-fix-report で skip。iteration 2 で持ち越し | "findings サマリ（件数と上位 3 件の Description）" に修正 |
| 11 | LOW | consistency | openspec/changes/2026-04-29-spec-review-pipeline/proposal.md:22-25 / specs/propose-pipeline/spec.md | iteration 1 finding #12 と同一。proposal.md の "単独パイプラインから" の MODIFIED 意図が specs/propose-pipeline/spec.md の Requirement に反映されていない。spec-fix-report で skip。iteration 2 で持ち越し | propose-pipeline/spec.md に Migration セクションまたは rationale を追記 |

## Iteration Comparison

### Improvements

- **HIGH #2 解消**: tasks.md 4.4 が `pollUntilComplete` 再利用に書き換えられ、spec-review-session/spec.md と design.md の status enum が `"idle"` で完全に統一された。SDK の status 値 (`completion.ts:30`) と一致
- **HIGH #3 解消**: design.md Decision 1 / tasks.md 2.3 / propose-pipeline/spec.md の 3 文書間で「`runProposePipeline` を削除し `runPipeline` に置換」に統一。両論併記が解消
- **feasibility +4**: 実装前提が realistic になり、実装者が誤った helper を呼ぼうとする典型リスクは大幅に減少
- **maintainability +1.5**: 仕様の意思決定が明確化（ラッパー削除確定）

### Regressions

- **consistency -1**: HIGH #1 (getFileContent) は **部分的にしか解消されなかった**。spec-fixer は design.md Context (line 9) / Decision 4 (line 84) / spec-review-session/spec.md line 60 で `fetchSpecReviewResult` に置換したが、同一 spec.md 内の line 79・line 83 (Requirement「verdict ファイル不在時のフェイルセーフ」本文と Scenario) と cli-commands/spec.md line 39 (Scenario「spec-review-result.md が見つからない」) と proposal.md line 38 (Dependencies) と design.md line 121 (Risks) には `getFileContent` 参照が残存。**自己矛盾する spec.md 内 Requirement** は新規 HIGH consistency 指摘として浮上。これは iteration 1 #1 の不完全解消に由来する regression と判定

### Unchanged Issues

- iteration 1 の MEDIUM #4 / #5 / #6 / #7 / #8 / #9 / LOW #10 / #11 / #12 は spec-fixer により全て skip。承認ブロック対象外のため iteration 2 でも持ち越し（finding #3-#11 に再掲）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.75 | needs-fix | 初回レビュー。HIGH x3 (getFileContent 不存在 / pollUntilComplete 未活用 / runProposePipeline 方針分裂) |
| 2 | 7.45 | needs-fix | HIGH #2 / #3 完全解消、HIGH #1 部分解消で残存 (consistency regression)。feasibility +4, maintainability +1.5, consistency -1 |

## Convergence

- **trend**: improving (前回 6.75 → 今回 7.45、+0.70)
- **recommendation**: continue (HIGH #1 のみ解消すれば iteration 3 で approved に到達する見込みだが、リトライ上限 2 回のため Step 4 の判断次第)

### 停滞検出ルール

- `plateaued` (前回との差が ±0.3 以内) が 2 iteration 連続した場合、`verdict` を `escalation` にする
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する
- 今回は **improving** (+0.70) のため停滞・退行検出には該当しない

### リトライ上限の判断

iteration 2 で score 7.45 (>= pass threshold 7.0) だが HIGH ≥ 1 のため `needs-fix`。retries 1/2 (今回が 2 回目のレビュー、修正は 1 回実施)。リトライ上限は 2 回 (`max=2`) のため、Step 4 で spec-fixer をもう 1 回呼ぶ余地があるが、HIGH #1 が「同種の見落とし系」なので spec-fixer の網羅性が改善されない場合は `escalation` の判断もありうる。

**推奨**: HIGH #1 の修正範囲が機械的（grep + 置換）で確定的なため、iteration 3 のリトライを推奨。spec-fixer に「HIGH #1 関連の `getFileContent` 全置換を `grep -rn 'getFileContent' openspec/changes/2026-04-29-spec-review-pipeline/` で機械的に確認すること」と明示指示する。

## Summary

iteration 1 から 0.70 改善 (6.75 → 7.45)、threshold 7.0 を超えたが HIGH 1 件のため `needs-fix`。

主要進展:
- HIGH #2 (pollUntilComplete + status enum) と HIGH #3 (runProposePipeline ラッパー方針) は完全解消
- feasibility が 5 → 9 に大幅改善

残課題:
- HIGH #1 (getFileContent 不存在) は **部分的にしか解消されず**、spec-review-session/spec.md 内で `fetchSpecReviewResult` (line 60) と `getFileContent` (line 79, 83) が並立する自己矛盾、および proposal.md / cli-commands/spec.md / design.md Risks の残存参照を修正する必要がある
- リトライ責務が二重化 (`fetchSpecReviewResult` 内のリトライ vs CLI のリトライ) しており、整合性のために spec の責務分担を一意化すべき

iteration 3 で HIGH #1 の網羅的修正 (grep ベースの全置換) を行えば approved に到達する見込み。spec-fixer への指示: 「`getFileContent` を `openspec/changes/2026-04-29-spec-review-pipeline/` 配下から完全削除し、リトライ責務を `fetchSpecReviewResult` 内に統一すること。grep -rn で残存ゼロを確認後、修正完了とする」。
