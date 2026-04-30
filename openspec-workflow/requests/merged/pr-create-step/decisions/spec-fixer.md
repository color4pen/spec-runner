# Spec Fixer Decisions — pr-create-step

## Finding #1 (HIGH / consistency): AgentStepName Exclude 句の拡張

`pipeline-orchestrator/spec.md` の ADDED Requirements に `AgentStepName = Exclude<StepName, "verification" | "pr-create">` への変更を明記する :: `pr-create` は `kind: "cli"` で agent を持たない CLI-resident step であるため `AgentStepName` から除外しなければ `AgentRegistry` が誤って pr-create を agent role として扱う型が成立してしまい、init.ts が不要な agent を要求するバグを誘発する。`tasks.md` §1 に対応タスクを追加する。

## Finding #2 (HIGH / consistency): steps Map 登録の指示先ファイル誤り

`tasks.md` §7.1 と `pr-create-step/spec.md` の Requirement 本文を `src/core/pipeline/run.ts` に修正する :: 実際に steps Map を構築しているのは `src/core/pipeline/run.ts:40-49` であり `src/cli/run.ts` は `runPipeline()` を呼び出すだけの薄い呼び出し層である。誤ったファイルを指示すると実装者が `src/cli/run.ts` を修正して pr-create が pipeline に登録されないまま Unknown transition で escalate する致命的な実装ミスを誘発する。`step-execution-architecture/spec.md` の記述も合わせて訂正する。

## Finding #3 (HIGH / consistency): 既存テストの regression 対応タスク欠落

`tasks.md` §6.7 に既存テストの更新指示を明示的に列挙する :: 現行 `pipeline.transitions.test.ts` の TC-012 は `code-review --approved→ end` を assert しており、本 change で transition が `pr-create` 経由に変わると必ず regression する。tasks.md で「既存テスト更新」を列挙しないと verification phase が必ず failed になり build-fixer ループへ無駄に突入する。`pipeline-orchestrator/spec.md` の Acceptance Criteria にも regression 対象テストを列挙する。

## Finding #4 (HIGH / feasibility): gh pr view の脆弱な PR 検出を gh pr list に変更

`pr-create-runner/spec.md` の Requirement を `gh pr list --head <branch> --base <baseBranch> --state all --json url,number,state` ベースに変更し、JSON 配列長 0 を PR 不在と判定する方式に改訂する :: `gh pr view <branch>` によるブランチ名指定は限定的なケースでしか動作せず、stderr 文言依存の判別は brittle である。`gh pr list` + JSON 配列長ゼロ判定は公式 idempotent パターンであり、エッジケース（PR 不在 / 既存 PR 混在）を確実に処理できる。
