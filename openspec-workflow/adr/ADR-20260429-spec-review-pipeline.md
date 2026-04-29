# ADR-20260429: Spec-Review Pipeline — N-step オーケストレーターと fresh-per-task dispatcher の最初の実装

**Date**: 2026-04-29
**Status**: accepted

## Context

ADR-20260427-cli-core-pipeline で `specrunner run` の propose 1 段（`runProposePipeline`）が確立した。本 request はこれを多段化し、propose 完了後に spec-review セッションを自動起動する初の multi-step 遷移を実装する。

ADR-20260424-session-pipeline-design（4 セッション直列モデル）と ADR-20260429-positioning-vs-gsd-and-openspec（fresh-per-task dispatcher）が示すとおり、後続 request では implementer / code-review も同じ枠組みで接続する予定であり、今回の設計は「最初の 2 step」を作るのではなく「N step に拡張可能な構造」を作る必要がある。

spec-review セッションは Author-Bias Elimination の最初の境界（設計者 ≠ レビュアー）を成立させる。Custom Tool は不要で、verdict はブランチ上のファイル（`spec-review-result.md`）に書かれる。CLI 側はポーリング完了後に GitHub API で読み取る（ADR-20260427-cli-first-architecture と整合）。

spec-review 3 イテレーションの結果、`getFileContent` (github-api-lib) は本リポジトリに存在しないことが判明し、`PipelineDeps.githubFetch` を使った raw fetch + 専用ヘルパ `fetchSpecReviewResult` で取得する設計に確定した。SDK の `BetaManagedAgentsSession.status` の完了値は `"idle"` であり（`completion.ts:30` で確認済み）、`"ended"` は SDK に存在しない。

## Decision

### D1. `runPipeline` を新設し step 関数の合成にする（N-step 拡張可能な構造）

`src/core/pipeline.ts` に `runPipeline` を新設し、step 関数 (`runProposeStep`, `runSpecReviewStep`) を順次実行する。各 step は `(state, deps) => Promise<JobState>` シグネチャに統一する。`runPipeline` は step 順次実行と verdict 分岐のみを担い、`needs-fix` / `escalation` の時点で次 step に進まず終了する。

### D2. `runProposePipeline` ラッパーを削除し単一 entry point に集約

既存 `runProposePipeline` の中身は `src/core/steps/propose.ts` の `runProposeStep` に移動し、`runProposePipeline` 自体は削除する。`src/cli/run.ts` の唯一の call site を `runPipeline` 呼び出しに置換する。内部 API のため後方互換要件なし。fresh-per-task dispatcher の構造を作るため、step 単位のテスト容易性と拡張性を優先する。

### D3. spec-review は Custom Tool 不要、ファイル経由 verdict のみ

spec-review セッションには Custom Tool を登録しない。verdict はブランチ上の `openspec/changes/<slug>/spec-review-result.md` に書かれ、CLI 側がポーリング完了後に GitHub API で取得する。Custom Tool 不要のため、SSE 接続も不要となる。verdict 行は正規表現 `/^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m` で行頭マッチパースし、first-write-wins 規約とする。

### D4. `pollUntilComplete` を spec-review でも再利用（重複ポーリング撲滅）

spec-review 完了検知は SSE を使わず、既存の `pollUntilComplete`（`src/core/completion.ts:58`）を `{ timeoutMs: config.specReview.timeoutMs }` で再利用する。完了判定は既存の `isProposeComplete`（`status === "idle"`）、`terminated` 検知は既存の `isSessionTerminated` を使用する。timeout は propose と独立した config 値（default 10 分）。

### D5. SDK status enum の完了判定は `"idle"`（`"ended"` は存在しない）

Anthropic SDK v0.91.0 の `BetaManagedAgentsSession.status` の完了値は `"idle"` のみであり、`"ended"` は SDK に存在しない（`completion.ts:30` で確認済み）。propose と spec-review の両方で同じ判定基準を使い、SDK バージョンアップ時の影響を `sdk/sessions.ts` ラッパに局所化する。

### D6. `JobState.steps: Record<StepName, StepResult>` で N-step state を管理

各 step は `JobState` を返す。verdict は state に書く（複合戻り値ではない）。`JobState` に `steps: Record<string, StepResult>` を追加し、`StepResult = { session, verdict, findingsPath, fileContent, error }` で各 step の履歴を保持する。`state.session` / `state.step` は「現在実行中の step」を指す派生フィールドとして残す（後方互換）。既存 state ファイル（`steps` 欠落）は読み込み時に `{}` で補う。

### D7. spec-review verdict ファイル取得は `fetchSpecReviewResult` 専用ヘルパに集約

`getFileContent` (github-api-lib) は本リポジトリに存在しない。GitHub API アクセスは `PipelineDeps.githubFetch` を使った raw fetch とし、`fetchSpecReviewResult(deps, slug, branch): Promise<string | null>` を `src/core/steps/spec-review.ts` に実装する。404 は null 返却 + 1 秒間隔で 3 回リトライを内部仕様として閉じ込める（CLI 層と fetch helper 層のリトライ責務分担を明確化）。

### D8. spec-review system prompt は単一ファイル、architect + spec-reviewer 二役兼務

`src/prompts/spec-review-system.ts` に `buildSpecReviewSystemPrompt(input)` を export する（input: `{ slug, repository, requestType }`）。Phase 1 は 1 セッション 1 prompt で architect + spec-reviewer を兼務。Phase 2 で並列化する際に分離する。修正提案は次 request の spec-fixer に委譲する旨を prompt に明記する。

## Alternatives Considered

### Alternative A: `runProposePipeline` を直接拡張（spec-review ロジックを末尾追加）

- **Pros**: 短期的には小さい変更
- **Cons**: implementer / code-review の追加で関数が肥大化し、step 単位のテストが書けなくなる。fresh-per-task dispatcher の意図と乖離する
- **Why not**: D1 の通り、N-step 拡張を見越した step 関数合成を採用

### Alternative B: SSE で `idle + end_turn` を検知（propose と同じ方式）

- **Pros**: propose と同じ完了検知ロジックを再利用できる
- **Cons**: spec-review は Custom Tool 不要のため SSE 接続自体が不要。SSE break-after-completion 問題（user MEMORY 参照）を spec-review でも踏み直すリスク。実装複雑度が増える
- **Why not**: D3 / D4 の通り、Custom Tool が不要な spec-review では `pollUntilComplete` 再利用が最適

### Alternative C: verdict を YAML front-matter として保持し、js-yaml でパース

- **Pros**: 構造化されたメタデータを扱える
- **Cons**: 依存追加が必要。markdown レビューファイルに front-matter を強制すると spec-review エージェントの自由度が下がる
- **Why not**: D3 の通り、行頭マッチで依存ゼロのパースを採用。verdict 行は review-standards.md で規約化済み

### Alternative D: step が `{ state, verdict }` の複合戻り値を返す

- **Pros**: 型レベルで verdict が明示される
- **Cons**: ポーリング再開（Phase 2）で state ファイルだけから復元できなくなる。ファイル単一の source of truth が崩れる
- **Why not**: D6 の通り、state を完全な journal にすることで `specrunner ps` でも verdict を表示可能にする

### Alternative E: 役割ごとに別 prompt ファイル（architect.ts / spec-reviewer.ts）

- **Pros**: 役割分離が明確
- **Cons**: Phase 1 では 1 セッション 1 prompt で十分。並列化前に分離するのは YAGNI
- **Why not**: D8 の通り、Phase 1 は単一ファイルで開始し、Phase 2 並列化時に分離

## Consequences

### Positive

- **N-step 拡張可能な構造**: D1 の `runPipeline` により、implementer / code-review を後続 request で同じ枠組みで接続できる
- **重複ポーリング実装の撲滅**: D4 で既存 `pollUntilComplete` を再利用することで、SSE break-after-completion 問題を spec-review で踏み直さない
- **single source of truth**: D6 で state ファイルを N-step の完全な journal にし、`specrunner ps` で verdict 表示や Phase 2 の再開機構の基盤を作る
- **Author-Bias Elimination の最初の境界成立**: D3 + D8 で spec-review セッションが propose セッションと独立して verdict を出す構造を確立
- **fresh-per-task dispatcher の最初の実装**: D1 + D2 で「propose 完了 → 別セッションを起こして spec-review を実行」のパターンが確立し、後続の implementer / code-review に展開可能
- **責務境界の明確化**: D7 でリトライロジックを `fetchSpecReviewResult` 内部に閉じ込め、CLI 層は呼び出し側の挙動のみを定義する

### Negative

- **`runProposePipeline` 削除に伴う既存テストの mass refactor**: D2 で `runProposePipeline` を削除する方針だが、code-review iter 2 時点で `tests/pipeline.test.ts` に 8 call sites が残存（finding #3 として記録）。Phase 1 では deprecated wrapper を一時残置する判断もあり得る
- **single-prompt の表現力制約**: D8 で architect + spec-reviewer を 1 セッションで兼務することで、エージェントが両役割を切り替える際に findings の質にばらつきが出る可能性
- **verdict first-write-wins の prompt injection リスク**: D3 の正規表現マッチは fenced code block 内の `- **verdict**:` 行も拾う。system prompt と運用規約で緩和するが、構造的解決は Phase 2

### Risks

- **[R1] verdict 行のフォーマット崩れ**: spec-review エージェントが正規フォーマットで書かない場合、パース失敗で `escalation` 扱いとなり、ユーザーが手動で確認する必要がある → **Mitigation**: system prompt で verdict 行のフォーマットを明示し example を含める
- **[R2] ポーリング 10 分超過**: `SESSION_TIMEOUT` で fail。ユーザーは `specrunner ps` で session.id を取得し、Anthropic console から確認可能 → **Mitigation**: `specReview.timeoutMs` を config で上書き可能にする
- **[R3] spec-review-result.md の push 完了前に session が `idle` になる**: ファイル取得で 404 が返る → **Mitigation**: D7 の `fetchSpecReviewResult` が 1 秒間隔で 3 回リトライ。それでも失敗なら `SPEC_REVIEW_RESULT_NOT_FOUND` で escalation
- **[R4] 中断再開挙動が未定義**: spec-review session 作成後・events.send 前に異常終了したケース、ポーリング途中で異常終了したケースの再開挙動が Phase 1 では未定義 → **Mitigation**: Phase 1 では「中断したジョブは新ジョブを発行する」運用、再開機構は Phase 2
- **[R5] `state.session` と `state.steps[step].session` の二重管理**: D6 で派生フィールドとして残置するが、書き込み経路を `appendStepResult` 経由に集約しないと drift 発生リスク → **Mitigation**: state schema レベルで派生フィールドの位置付けを明文化（spec-review iter 3 finding #3 で指摘）

### Known Design Debt（review-feedback / spec-review で指摘されたが Phase 1 スコープ外）

以下は spec-review iter 3 / code-review iter 2 で MEDIUM / LOW として残った技術負債。次の change で対処を推奨する:

- **(M1) module-analysis.md:57 の `getFileContent` エントリ残存**: Author-Bias 方針上 spec-fixer 不可侵。実装フェーズで module-architect 再生成または archive 時の参考資料扱いとする (spec-review iter 3 #1)
- **(M2) spec-review timeout の config 上書き挙動**: spec.md に「default 10 分、config で上書き可能」が未反映。Scenario の文言更新が必要 (spec-review iter 3 #2)
- **(M3) `state.session` 派生フィールドの位置付け明文化**: job-state-store/spec.md に「`state.session` / `state.step` は MUST `state.steps[state.step].session` と同期する派生フィールド」を追加 (spec-review iter 3 #3)
- **(M4) standard toolset の権限範囲**: spec-review セッションの `agent_toolset_20260401` の権限が仕様未明記。read-only への絞り込み or 検証タスク追加 (spec-review iter 3 #4)
- **(M5) verdict first-write-wins の prompt injection 緩和**: `## Verdict` セクション直下のみ有効化する規約 / fenced code block stripping を Phase 2 で導入 (spec-review iter 3 #5, code-review iter 2 #5)
- **(M6) 中断再開挙動の Non-Goal 明記**: pipeline-orchestrator/spec.md に「Phase 1 では再開機構なし」の Scenario 追加 (spec-review iter 3 #6)
- **(M7) `parseSpecReviewVerdict` 純粋関数のタスク分離**: tasks.md 4.6 から独立タスク化、regex 境界値テスト分離 (spec-review iter 3 #7)
- **(M8) `runProposePipeline` deprecated wrapper の完全削除**: D2 の意図に対し、code-review iter 2 時点で `tests/pipeline.test.ts` に 8 call sites が残存。`runProposeStep` 直接 import に migrate 必要 (code-review iter 2 #3)
- **(M9) verdict-output ロジックのテスト分離**: `outputSpecReviewVerdict` + `parseSpecReviewFindingsSummary` を `src/cli/verdict-output.ts` に抽出してユニットテスト分離 (code-review iter 2 #1)
- **(M10) propose-fail propagation のアサーション強化**: TC-026 で `result.error?.code` の expected 値アサーション追加 (code-review iter 2 #2)
- **(M11) prompt injection 緩和（spec-review system prompt）**: `<user-request>` を data として扱う旨を system prompt に明記 (code-review iter 2 #4)
- **(L1) step-transition entry の形式仕様化**: job-state-store/spec.md または pipeline-orchestrator/spec.md に Scenario 追加 (spec-review iter 3 #8)
- **(L2) findings サマリ "タイトル" 表記誤記**: cli-commands/spec.md:25 の "タイトル" を "Description" に修正 (spec-review iter 3 #9)
- **(L3) propose-pipeline migration rationale**: propose-pipeline/spec.md に Migration セクション追記 (spec-review iter 3 #10)

## 参照

- [ADR-20260424-session-pipeline-design.md](ADR-20260424-session-pipeline-design.md) — 4 セッション直列モデル（spec-review 位置付け）
- [ADR-20260427-cli-first-architecture.md](ADR-20260427-cli-first-architecture.md) — Custom Tool なしで完結する設計
- [ADR-20260427-cli-core-pipeline.md](ADR-20260427-cli-core-pipeline.md) — 前 request、propose 1 段の構造的決定
- `openspec/changes/2026-04-29-spec-review-pipeline/proposal.md` — 本 change の提案
- `openspec/changes/2026-04-29-spec-review-pipeline/design.md` — 詳細設計（Decision 1-5）
- `openspec-workflow/requests/active/2026-04-29-spec-review-pipeline/spec-review-result-003.md` — spec-review approved (8.05)
- `openspec-workflow/requests/active/2026-04-29-spec-review-pipeline/review-feedback-002.md` — code-review approved (7.30)
