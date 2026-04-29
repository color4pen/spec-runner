# Spec Review Result: 2026-04-29-spec-review-pipeline — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.7 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 3

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 7 | 0.25 | 1.75 |
| feasibility | 5 | 0.20 | 1.00 |
| security | 6 | 0.15 | 0.90 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **6.75** |

### スコア根拠

- **completeness (8)**: request.md の 13 要件・7 受け入れ基準は spec の 5 capability に概ねマッピングされている。ただし step-transition history entry / spec-review timeout 設定値の上書き経路で軽い穴あり
- **consistency (7)**: 既存 v1 状態ファイル後方互換は明示されている。pipeline-orchestrator の verdict 分岐と cli-commands の exit code は整合。ただし design.md が「ラッパーを残す」「getFileContent は github-api-lib にある」と述べる一方で、リポジトリ実態と乖離
- **feasibility (5)**: `getFileContent` 不存在問題が tasks.md にも spec.md にも反映されておらず、実装者が前提を誤認するリスクがある。pollUntilComplete 再利用が tasks.md に書かれていない
- **security (6)**: `<user-request>` XML タグ規約は仕様化されているが、GitHub token scope の境界・standard toolset の範囲（ファイル編集権限）が未定義
- **maintainability (7)**: state.session / state.step を派生フィールドとする方針は design.md には書かれているが spec.md レベルでの位置付けが弱い

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | feasibility | openspec/changes/2026-04-29-spec-review-pipeline/design.md:9 / tasks.md:28 | 設計とタスクが `getFileContent(token, owner, repo, path, ref)` を「github-api-lib にある既存ヘルパー」として参照しているが、本リポジトリには存在しない。`src/core/pipeline.ts:243-304` は raw `fetch` で GitHub API を直叩きしており、ラッパー関数は未実装。実装者は spec の前提に従って未実装のヘルパーを呼ぼうとするか、無断で raw fetch にフォールバックする | (a) `src/lib/github.ts`（または `src/git/github-content.ts`）を新設し `getFileContent(githubFetch, token, owner, name, path, ref): Promise<string \| null>` を実装するタスクを tasks.md に追加する、もしくは (b) design.md と tasks.md・spec.md を修正して「raw fetch を使う」方針に揃える。いずれかを選択し、design / tasks / spec の 3 文書間で参照表現を統一する |
| 2 | HIGH | feasibility | openspec/changes/2026-04-29-spec-review-pipeline/tasks.md:27 | tasks.md 4.4 が「10 秒間隔・10 分 timeout・`ended`/`terminated` 検知」のポーリングを spec-review.ts に新規実装する内容になっているが、`src/core/completion.ts:58` の `pollUntilComplete` が同等機能（timeout / sleep 注入 / 指数バックオフ / abort / `terminated` 検知）を既に提供している。design.md / module-analysis.md は再利用を推奨しているが、tasks に伝わっていない。さらに、`pollUntilComplete` の完了判定は `status === "idle"` であり、spec-review-session/spec.md は `status === "ended"` を要求する。SDK の status enum が `idle` なのか `ended` なのかが verification されていない | tasks.md 4.4 を「`pollUntilComplete` を再利用する」と書き換え、必要であれば `pollUntilComplete` に `isComplete?: (s) => boolean` 引数を追加するサブタスクを足す。同時に SDK の `BetaManagedAgentsSession.status` の取りうる値を確認する verification タスクを 4.x に追加し、spec-review-session/spec.md の `ended` / `idle` 表記をいずれか一方に統一する。両方とも `idle` であれば spec.md の記述を修正、`ended` が正なら propose 側の `isProposeComplete` の修正が必要 |
| 3 | HIGH | consistency | openspec/changes/2026-04-29-spec-review-pipeline/design.md:42-44 / specs/propose-pipeline/spec.md:18-29 | design.md Decision 1 の「実装メモ」が「後方互換のため `runProposePipeline` は薄いラッパーとして残す（または call site を `runPipeline` 呼び出しに置換）」と両論併記している一方、specs/propose-pipeline/spec.md の Requirement「propose は runPipeline 配下の最初の step として実装される」は MUST レベルでラッパー残置を要求している。tasks.md 2.3 もラッパー維持を指示。一方 module-architect 決定は「ラッパーを残さず完全置換」を推奨。設計判断が固まっておらず、実装者がどちらを採用すべきか判断できない | spec / design / tasks のいずれか一つの結論に固定する。推奨: ラッパーを削除し `runProposePipeline` 名は廃止 (内部 API のため互換要件なし) → spec.md の "後方互換 wrapper" Scenario を削除し、design.md Decision 1 実装メモを「ラッパーを残さない」に修正、tasks.md 2.3 を削除、tasks.md 6.1 を「`runProposePipeline` 呼び出しを削除し `runPipeline` で置換」に修正 |
| 4 | MEDIUM | consistency | openspec/changes/2026-04-29-spec-review-pipeline/specs/job-state-store/spec.md:5 / specs/spec-review-session/spec.md:60-89 | job-state-store の Requirement で `state.session` を「現在実行中の step を指す派生フィールド」と位置付ける記述がない（実態として 2 つの真実源になる）。design.md Decision 2 と module-analysis.md 4.2 はこの問題を指摘済みだが、spec.md レベルでは `state.session: SessionInfo \| null` と `state.steps[name].session: SessionInfo` の関係性が未定義 | job-state-store/spec.md の "状態ファイルは固定スキーマに従う" Requirement に「`state.session` / `state.step` は MUST `state.steps[state.step].session` と同期する派生フィールドとし、書き込みは `appendStepResult` 経由でのみ行う」を追加。または `state.session` / `state.step` を deprecated とする旨を spec に明記し、Phase 2 で削除する方針を Migration セクションに記述する |
| 5 | MEDIUM | completeness | openspec/changes/2026-04-29-spec-review-pipeline/specs/spec-review-session/spec.md:50-56 | spec-review timeout が「default 10 分」と固定値で書かれているが、tasks.md 7.2 では `specReview.timeoutMs` を config schema に追加するとあり、上書き経路は config 経由になっている。spec.md の Scenario「timeout 超過」も「10 分」固定で書かれており、config で上書きされた場合の挙動が定義されていない | spec-review-session/spec.md の Requirement を「default 10 分、config の `specReview.timeoutMs` で上書き可能」に修正し、Scenario も「config で指定された timeout を超過したら」に書き換える。stderr メッセージの「after 10 minutes」も「after N minutes」または config 値を反映する形にする |
| 6 | MEDIUM | security | openspec/changes/2026-04-29-spec-review-pipeline/specs/spec-review-session/spec.md:3-10 | spec-review セッションは「標準 toolset (`agent_toolset_20260401`) のみ」とあるが、標準 toolset がどのツールを含むか（ファイル編集権限・コミット権限の有無）が仕様に書かれていない。Custom Tool なしの設計判断は「修正提案を含めない」prompt 規約に依存しており、もし標準 toolset がファイル編集を含むと、prompt injection で change folder 改変が成立する可能性がある | (a) 標準 toolset の構成を spec.md または design.md の脚注で明記する、(b) GitHub token scope を spec-review session では read-only に絞る Requirement を spec-review-session/spec.md に追加する、(c) どちらも難しければ「standard toolset の範囲はリリース時に Anthropic SDK のドキュメントで verify する」検証タスクを tasks.md に追加する |
| 7 | MEDIUM | security | openspec/changes/2026-04-29-spec-review-pipeline/specs/spec-review-session/spec.md:60 | verdict 行 first-write-wins のパース規約 `/^- \*\*verdict\*\*:\s*(approved\|needs-fix\|escalation)\s*$/m` は、agent が議論セクション内で `- **verdict**: approved` のような行を先に書いて、結論で `- **verdict**: needs-fix` を書いた場合、誤って approved を採用してしまう。コードブロック内の擬似 verdict 行も同様の問題を生む。`<user-request>` 内に攻撃者が verdict 行を仕込んでも、agent がそれを mirror して書いた場合に成立する prompt injection の入口になる | (a) verdict 行は spec-review-result.md の `## Verdict` セクション直下のみで有効とする規約を spec-review-session/spec.md に追加、(b) system prompt で「verdict 行は文書内 1 箇所のみ書く」ことを agent に指示、(c) パース時に `## Verdict` セクション以外の verdict 行は無視するロジックを spec の Scenario として明文化 |
| 8 | MEDIUM | completeness | openspec/changes/2026-04-29-spec-review-pipeline/specs/pipeline-orchestrator/spec.md:30 | pipeline-orchestrator の Requirement「runPipeline は state ファイルを single source of truth として扱う」の Scenario 「中断後の状態確認」では「propose 完了後・spec-review 開始前に CLI が異常終了する」ケースが書かれているが、spec-review session 作成後・events.send 前に異常終了したケース、ポーリング途中で異常終了したケースの再開挙動（Phase 2 想定でも、Phase 1 の挙動は明示すべき）が未定義 | pipeline-orchestrator/spec.md または spec-review-session/spec.md に「Phase 1 では再開機構なし。中断したジョブは `specrunner ps` で確認できるが、再開は手動で新ジョブを発行する」旨の Non-Goal Scenario を追加する。または、再開時に session.id を spec-review session として再利用するか・新規作成するかの方針を明記する |
| 9 | MEDIUM | maintainability | openspec/changes/2026-04-29-spec-review-pipeline/tasks.md:24-33 | tasks.md 4.1-4.9 が「`runSpecReviewStep`」関数 1 つに「セッション作成・初回メッセージ・ポーリング・GitHub API 取得・404 リトライ・regex パース・state 更新・エラー分岐」をすべて詰め込む構造になっている。module-analysis.md 4.3 は `parseSpecReviewVerdict` / `fetchSpecReviewResult` / `runSpecReviewStep` への 3 分割を推奨しているが、tasks には反映されていない。テストが「mock client + mock fetch + mock sleep」の 3 重 mock になり、regex 境界値テストが書きづらくなる | tasks.md 4.1 を「`src/core/steps/spec-review.ts` を新設し、以下 3 関数を export する: `parseSpecReviewVerdict(content): VerdictParseResult` (純粋関数)、`fetchSpecReviewResult(deps, slug, branch): Promise<string \| null>` (404 リトライ込み)、`runSpecReviewStep(state, deps): Promise<JobState>`」に書き換える。4.5-4.7 の小タスクを `parseSpecReviewVerdict` / `fetchSpecReviewResult` の単体テストとして分離 |
| 10 | LOW | completeness | openspec/changes/2026-04-29-spec-review-pipeline/tasks.md:38-43 | tasks.md 5 (パイプラインオーケストレーター) のうち 5.5 「`step-transition` entry を append」は spec の job-state-store/spec.md にも書かれているが、実装の具体的な entry 形式（`step` フィールドに何を入れるか、`message` の形式）が tasks にも spec にも明記されていない | job-state-store/spec.md または pipeline-orchestrator/spec.md に「step-transition entry の形式」Scenario を追加: 例として `{ step: "step-transition", status: "ok", message: "propose -> spec-review" }` 等を明示 |
| 11 | LOW | maintainability | openspec/changes/2026-04-29-spec-review-pipeline/specs/cli-commands/spec.md:25-26 | "findings サマリ（件数と上位 3 件のタイトル）" と書かれているが、findings に「タイトル」フィールドはなく、review-standards.md の Findings Format には Description カラムしかない | "findings サマリ（件数と上位 3 件の Description）" に修正、または review-standards.md と整合する別のサマリ形式（例: Severity ごとの件数のみ）に変更 |
| 12 | LOW | consistency | openspec/changes/2026-04-29-spec-review-pipeline/proposal.md:22-25 / specs/spec-review-session/spec.md (全体) | proposal.md は capability `spec-review-session` を ADDED capability として宣言しているが、spec.md は MUST / SHALL の Requirement のみで構成されており、proposal.md の "propose-pipeline は単独パイプラインから pipeline-orchestrator 配下の最初の step に位置付けを変更する" 記述に対応する MODIFIED の意図（"単独パイプラインから" の状態）が specs/propose-pipeline/spec.md の MODIFIED Requirement の文面に明示的に反映されていない | propose-pipeline/spec.md の "propose パイプラインは状態マシンで進捗を管理する" の説明文に「Phase 0 では単独パイプラインだったが本 request 以降 runPipeline 配下の最初の step」旨の rationale を追記、または Migration セクションを capability spec に追加 |

## Iteration Comparison

（iteration 1 のため空欄）

### Improvements
- N/A

### Regressions
- N/A

### Unchanged Issues
- N/A

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.75 | needs-fix | 初回レビュー。HIGH 3 件（feasibility 2、consistency 1）、MEDIUM 6 件、LOW 3 件 |

## Convergence

- **trend**: improving | plateaued | regressing → 初回のため判定なし
- **recommendation**: continue (spec-fixer が HIGH を解消すれば iteration 2 で承認可能性高い)

### 停滞検出ルール

- `plateaued` (前回との差が ±0.3 以内) が 2 iteration 連続した場合、`verdict` を `escalation` にする
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する

## Summary

仕様の網羅性は高く（completeness 8）、request.md の要件は概ね 5 capability に分配されている。ただし feasibility と consistency に修正必須の指摘がある。

主な問題は (1) `getFileContent` が既存ヘルパーとして参照されているが本リポジトリには存在しないため実装前提が破綻している点、(2) `pollUntilComplete` 再利用判断が design / module-analysis に書かれているのに tasks.md に反映されておらず実装で二重化リスクがある点（加えて SDK の status enum が `idle` / `ended` で未統一）、(3) `runProposePipeline` ラッパーを残すか削除するかが design / spec / tasks / module-analysis 間で分裂している点、の 3 つ。

加えて security 観点では (a) 標準 toolset の権限範囲、(b) verdict 行 first-write-wins の prompt injection 耐性、を仕様レベルで強化する余地がある。

これら HIGH 3 件を解消すれば iteration 2 で approved に到達する見込み。spec-fixer は最低限 finding #1, #2, #3 を解消することを推奨。
