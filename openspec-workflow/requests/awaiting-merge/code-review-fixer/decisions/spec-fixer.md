# Spec Fixer Decisions — code-review-fixer

## Applied (spec-review-result-001.md findings)

- LOOP_ERROR_CODES の型を `LoopErrorShape`（関数型）に合わせる :: Finding #1 (HIGH): 既存実装 `src/core/pipeline/types.ts:17-21` の `message: (n: number) => string` / `hint: (nnn: string) => string` と契約を一致させ、型エラーおよび非対称実装を防止する
- Scenario 内の `state.error` の message / hint 表記を関数呼び出し前提に更新する :: Finding #1 との一貫性。Scenario が plain string を期待していると実装時に混乱が生じるため
- Requirement 本文の型注釈 `{ message: string; hint: string }` を `{ message: (n: number) => string; hint: (nnn: string) => string }` に修正する :: Finding #1 の根本原因はここの型記述が実装と食い違うことにある
- tasks.md §7.3 の message / hint サンプルを関数表現に揃える :: Finding #8 (LOW): Finding #1 と同根。片方だけ直すと食い違いが残るため一括対応
- Scenario「Standard pipeline transitions are expressed as table rows」の重複 list を「the rows enumerated in this Requirement」に圧縮する :: Finding #6 (LOW): transition rows の二重管理は片方更新忘れ時に矛盾する。最小変更で解消
- delta の transition list 内の `propose --approved→ spec-review` を `propose --success→ spec-review` に修正する :: Finding #7 (LOW): (b) 採用（別 request 扱い）の指示に従い、delta が書く箇所のみ正しい `success` で記述する。既存 spec（`openspec/specs/pipeline-orchestrator/spec.md:42`）は触らない
- CodeFixerStep 要件に「前段 code-review 結果が空なら `SpecRunnerError(CODE_FIXER_NO_REVIEW_RESULT)` を throw」を追加する :: Finding #2 (MEDIUM): 既存 build-fixer の `BUILD_FIXER_NO_VERIFICATION_RESULT` パターンと対称にする。module-analysis.md R4 でも推奨済み
- tasks.md §6 に `CODE_FIXER_NO_REVIEW_RESULT` エラーコード新設タスク（6.8）と unit test タスク（6.9）を追記する :: Finding #2 の実装タスク化
- agent-syncer/spec.md の ADDED Requirements（role-specific な redundant 要件）を削除し、既存 Requirement の Scenario として 1 件追加する :: Finding #3 (MEDIUM): role を増やすたびに ADDED Requirement が積み重なる anti-pattern を排除。既存の generic Requirement でカバー済みの範囲を重複記述しない
- design.md D1 の diff コマンドを `git diff main...<branch>` から `git diff main...HEAD` に修正する :: Finding #4 (MEDIUM): spec は `main...HEAD` で記述済み。design.md との表記揺れを解消。`HEAD` はエージェント実行時に常に解決可能で `<branch>` 注入不要
- design.md D4 の message / hint 記述を関数型表現に合わせる :: Finding #4 と #1 との一貫性。design.md が spec と食い違う記述を持つと implementer が迷う
- CodeReviewStep 要件に「buildMessage は base ref として main を埋め込む」invariant を追加する :: Finding #5 (MEDIUM): design.md Open Questions で決定済みの `main` 固定が spec / tasks に未記述。将来の sub-branch workflow で base が無音切り替えされるリスクを防止
- `parseResult` の fallback 表記から "with diagnostic" を削除する :: Finding #9 (LOW): 既存実装（`spec-review.ts:90-92`）は `verdict ?? "escalation"` であり diagnostic は付いていない。spec を実装に合わせる
- Scenario「SpecReviewStep delegates to parseReviewVerdict」の grep-based invariant を unit test / spy 方式に緩める :: Finding #10 (LOW): grep ベースの不変条件は維持コストが高く、regex 変形でも通過可能。spy / mock 方式に換えることでテストの意図を明確化

## Skipped

なし（MEDIUM 以下を全て適用。タスクの指示で全 findings を対応対象とした）
