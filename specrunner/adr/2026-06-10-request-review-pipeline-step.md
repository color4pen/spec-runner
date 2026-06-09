# ADR-20260610: request-review をパイプラインの最初のステップとして統合し `request review` コマンドを廃止する

**Date**: 2026-06-10
**Status**: accepted

## Context

`request review` はスタンドアロンの CLI コマンドとして `OneShotQueryClient` 経由で実行されており、verdict（approve / needs-discussion / reject）を標準出力に吐くだけだった。`run` コマンドはパイプラインを `design` ステップから開始していたため、ユーザーは `run` の前に手動で `request review` を呼ぶ必要があり、`issue → generate → review → run` の流れが分断されていた。

一方で `design` 以降のパイプラインステップは `AgentRunner` + `report_result` tool 経由の typed verdict で統一されており、review だけが別方式で動いていた。

加えて draft（`specrunner/drafts/<slug>/request.md`）は `run` 時に change folder へ **move**（コピー後削除）されていたため、needs-discussion で止まった後に draft を修正して `resume` で再開する手段がなかった。

## Decision

### D1: RequestReviewStep を judge 型 AgentStep として実装する

spec-review / conformance と同型の `AgentStep`（`kind: "agent"`）として `src/core/step/request-review.ts` に実装する。`AgentRunner` + `REQUEST_REVIEW_REPORT_TOOL` 経由の typed verdict を使い、既存の executor / artifact / commit-push / rules 解決の機構をそのまま再利用する。CliStep として prose parse に依存する案（`OneShotQueryClient` 継続利用）は要件である typed verdict に反するため採用しない。

### D2: 3 値 verdict を Verdict 型を拡張せず扱う

`Verdict` union は pipeline.ts の history status 判定で exhaustive switch に消費されている。ここに approve / needs-discussion / reject を追加すると影響範囲が広い。代わりに `RequestReviewReportResult.verdict` を `"approve" | "needs-discussion" | "reject"` の専用 union で定義し、遷移表の `on: string` 文字列一致で振り分ける。`finalizeStep` は `verdict as Verdict` でキャストして格納するが、その verdict を読むのは遷移表の文字列比較のみ。pipeline.ts の未知 verdict 処理は `warning` にフォールバックするため安全。

approve / needs-discussion を approved / needs-fix に潰す案は reject と needs-discussion の区別を失うため却下。

### D3: パイプラインの開始ステップを `design` から `request-review` に変更する

`STANDARD_DESCRIPTOR.startStep` と `PipelineRunCommand.prepare()` の `startStep` を `STEP_NAMES.REQUEST_REVIEW` に変更する。遷移は `approve → design`、`needs-discussion / reject / error → escalate`。role は `gate`（fixer ループを持たない checkpoint）とし、「各 phase に creator/reviewer 各 1」という不変条件を侵さない。

`run` だけで review → design → ... → pr-create が一気通貫で走り、needs-discussion 時は draft を修正して `resume` で再開できる。

### D4: draft を run 時に削除せず copy semantics に変更し、archive 時に削除する

needs-discussion / reject で止まった後に draft を修正して `resume` で再開するには、draft が run〜archive 間に残存する必要がある。そのため run 時の move（コピー後削除）を copy（削除しない）に変更する。draft は archive まで「修正可能な single source」として残る。

resume 時に `specrunner/drafts/<slug>/request.md` が存在すれば change folder の `request.md` へ上書きコピーする（全 resume で無条件）。request.md はパイプライン中に変更されないため無条件再コピーは安全（architect 評価済み）。

archive 時に `specrunner/drafts/<slug>/` を削除し、git tracked なら archive commit に同梱する。

resume 時に `deps.request.content` が再コピー前の旧内容になりうる問題は、request-review が on-disk の `request.md` を agent に Read させることで回避する。再コピーは setupWorkspace（agent 実行前）で完了するため、agent が読む時点では編集済み draft が反映されている。

### D5: `request review` コマンドを廃止する

review はステップ化されたため一回限りのスタンドアロンコマンドは不要。`src/core/command/request-review.ts` と `src/core/request/reviewer.ts` を削除し、`command-registry.ts` から `review` サブコマンドを除去する。`OneShotQueryClient` 自体は `request generate` が使い続けるため残す。

## Alternatives Considered

### Alternative 1: review を CliStep として OneShotQueryClient 経由で継続する

- **Pros**: 変更量が小さい。既存の `reviewer.ts` を流用できる
- **Cons**: typed verdict（report_result tool 経由）が使えず、prose parse に依存し続ける。StepExecutor の finalizeStep と統合できない
- **Why not**: 要件「AgentRunner + report_tool 経由の typed verdict」に反する

### Alternative 2: Verdict 型に approve / needs-discussion / reject を追加する

- **Pros**: 型安全に verdict を扱える
- **Cons**: `Verdict` を exhaustive switch で消費しているコード（pipeline.ts 等）への影響が広い
- **Why not**: architect 評価で却下済み。遷移表の `on: string` 経路に閉じることで影響を 1 ステップに局所化する

### Alternative 3: approve / needs-discussion を approved / needs-fix に統一する

- **Pros**: 既存 `Verdict` union に収まる
- **Cons**: needs-discussion と reject を区別できなくなり、遷移先の分岐ができない
- **Why not**: 3 値の区別は要件（設計変更の余地あり vs 即却下）のために必要

### Alternative 4: resume 再コピーを ResumeCommand.prepare() に置く

- **Pros**: resume の責務と場所が揃う
- **Cons**: worktree は prepare 時点で未生成（setupWorkspace で再作成）のため、コピー先が存在しない
- **Why not**: setupWorkspace に置くことで worktree 存在が保証される

### Alternative 5: 再コピーを needs-discussion 検知時のみ行う

- **Pros**: 不要な再コピーを避けられる
- **Cons**: 判定ロジックが必要になり、request.md がパイプライン中に変更されない事実を考えると恩恵がない
- **Why not**: 全 resume で無条件再コピーが最も単純であり安全（architect 評価済み）

### Alternative 6: request-review を reviewer ロールとして登録する

- **Pros**: 「レビュー系ステップ」として意味的に自然
- **Cons**: 「各 phase に reviewer は 1 つ」という不変条件と衝突する。reviewer ロールは fixer ループを前提とした設計であり、fixer を持たない request-review とは構造が合わない
- **Why not**: gate ロールを採用することで不変条件を維持しつつ「fixer ループなし checkpoint」を正確に表現できる

### Alternative 7: resume 時に `deps.request` を再コピー後に再パースして差し替える

- **Pros**: resume 全体で `deps.request.content` が常に最新になる
- **Cons**: `PrepareResult` を貫く request オブジェクトを再構築する必要があり、prepare 層への侵襲が大きい
- **Why not**: request-review の prompt で agent に on-disk の `request.md` を直接 Read させる方が局所的。他ステップは `deps.request.content` を使い続けるため影響がない

## Consequences

### Positive

- `specrunner run <slug>` だけで review → design → ... → pr-create の全フローが走る
- needs-discussion で止まった後、draft を修正して `resume` で再開できる
- review が typed verdict（report_result tool）に移行し、prose parse による escalation フォールバックが排除される
- スタンドアロンコマンドをパイプラインステップへ格上げするパターンが確立される

### Negative

- `request review <slug>` コマンドは廃止される（「Unknown request subcommand: review」で exit 2）
- run 後も draft が `request ls` に表示される（archive まで残存する仕様）
- executor が `REQUEST_REVIEW_REPORT_TOOL` の identity に結合する（既存の `isJudgeStep` パターンと同じ局所化）

### Known Debt

- `src/core/usage/types.ts` 等に残る旧 `"request-review"` コマンド文字列（draft usage 追跡用）の整理は別 request で実施

## References

- Request: `specrunner/changes/request-review-pipeline-step/request.md`
- Design: `specrunner/changes/request-review-pipeline-step/design.md`
- Spec: `specrunner/changes/request-review-pipeline-step/spec.md`
- Related: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`（report_result tool / typed verdict 基盤）
- Related: `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor / startStep 管理）
- Related: `specrunner/adr/2026-05-24-drafts-directory-structure.md`（drafts ディレクトリ構造）
