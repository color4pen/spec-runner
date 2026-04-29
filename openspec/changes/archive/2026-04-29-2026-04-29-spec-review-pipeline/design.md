## Context

CLI core pipeline (PR #19) は propose セッション 1 段だけを実行する単一ステップ pipeline (`runProposePipeline`) として実装されている。状態ファイルは `step: "propose"` 固定で、session info は 1 つしか保持できない。

本 request では「propose 完了 → spec-review 自動起動」という最初の multi-step 遷移を実装する。ADR-20260424（4 セッション直列モデル）と ADR-20260429（fresh-per-task dispatcher）が示すとおり、後続 request では implementer / code-review も同じ枠組みで接続する予定であり、今回の設計は「最初の 2 step」を作るのではなく「N step に拡張可能な構造」を作る必要がある。

spec-review セッションは Custom Tool を使わず、verdict はブランチ上の `openspec/changes/<slug>/spec-review-result.md` に書かれる。CLI 側は `sessions.retrieve()` ポーリングで完了検知し、GitHub API（`PipelineDeps.githubFetch` を使った raw fetch）でファイル取得 → verdict 行をパースする (ADR-20260427: CLI-first architecture)。

`getFileContent` ヘルパーは本リポジトリには存在しない（github-api-lib への参照は誤り）。GitHub API アクセスは `src/core/pipeline.ts:243-304` と同じく `PipelineDeps.githubFetch` を使った raw fetch で行う。`fetchSpecReviewResult(deps, slug, branch): Promise<string | null>` を `src/core/steps/spec-review.ts` に実装し、404 は null 返却・1 秒×3 リトライを内包する。

## Goals / Non-Goals

**Goals:**
- propose 完了後に spec-review セッションが自動起動される
- N step に拡張可能な `runPipeline` オーケストレーターを確立する（fresh-per-task dispatcher の構造）
- spec-review verdict (`approved` / `needs-fix` / `escalation`) を機械的にパースし、状態ファイルと exit code に反映する
- 状態ファイルが step ごとに session info / verdict / findings path を保持できる
- Custom Tool なし・SSE 不要（`sessions.retrieve()` ポーリング）

**Non-Goals:**
- spec-fixer 自動起動（needs-fix のリトライ）
- implementer / code-review セッション接続
- 学習層・decision logging
- security-reviewer / pattern-reviewer の並列起動（Phase 2）
- spec-review verdict の集約ロジック（複数レビュアー統合）— 今回は単一エージェントが verdict を出す

## Decisions

### Decision 1: `runPipeline` を新設し step 関数の合成にする

**選択**: `src/core/pipeline.ts` に `runPipeline` を新設し、step 関数 (`runProposeStep`, `runSpecReviewStep`) を順次実行する。各 step は `(state, deps) => Promise<JobState>` シグネチャに統一する。

**代替案**:
- A: `runProposePipeline` を直接拡張（spec-review ロジックを末尾追加）
- B: `runPipeline` を新設し step 関数を合成 ← 採用

**理由**:
- A は短期的には小さい変更だが、implementer / code-review の追加で関数が肥大化する。pipeline.ts のテストも step 単位で書けない
- B は最初は overhead が出るが、step を `src/core/steps/` 配下に分離できテスト容易性・拡張性が高い。fresh-per-task dispatcher の意図と一致する

**実装メモ**:
- 既存の `runProposePipeline` の中身は `src/core/steps/propose.ts` の `runProposeStep` に移動する
- `runProposePipeline` は削除し、`src/cli/run.ts` の唯一の call site を `runPipeline` 呼び出しに置換する（内部 API のため後方互換要件なし）
- `runPipeline` は verdict 分岐を含む。`needs-fix` / `escalation` の時点で次 step に進まず終了する

### Decision 2: Step 関数の verdict は戻り値ではなく state に書く

**選択**: 各 step は `JobState` を返す。verdict は `state.history` の末尾 entry に `message` として記録 + `state.error` または別フィールドに保持する。`runPipeline` は state を読んで分岐する。

**代替案**:
- A: step が `{ state, verdict }` のような複合戻り値を返す
- B: state に閉じる ← 採用

**理由**:
- A は型を増やすが、ポーリング再開（Phase 2）で state ファイルだけから復元できなくなる。ファイル単一の source of truth を崩す
- B は state ファイルを完全な journal にできる。`specrunner ps` でも verdict を表示可能

**実装メモ**:
- `JobState` に `steps: Record<string, StepResult>` を追加する
- `StepResult` = `{ session: SessionInfo, verdict: "approved" | "needs-fix" | "escalation" | null, findingsPath: string | null, error: ErrorInfo | null }`
- `state.session` / `state.step` は「現在実行中の step」を指すフィールドとして残す（後方互換）

### Decision 3: spec-review 完了検知は `sessions.retrieve()` ポーリング

**選択**: SSE は使わず、`pollUntilComplete`（`src/core/completion.ts:58`）を `{ timeoutMs: config.specReview.timeoutMs }` で再利用する。完了判定は既存の `isProposeComplete`（`status === "idle"`）を使用する。`status === "terminated"` は既存の `isSessionTerminated` で検知する。

**代替案**:
- A: SSE で `idle + end_turn` を検知（propose と同じ方式）
- B: `pollUntilComplete` 再利用 ← 採用

**理由**:
- request.md でも「SSE 不要」と明記されている
- `pollUntilComplete` は timeout / sleepFn 注入 / 指数バックオフ / jitter / abort / `terminated` 検知を既に備えており、新規ポーリング実装は不要
- propose で確立した SSE break-after-completion 問題（user MEMORY 参照）を spec-review でも踏み直す必要がない
- SDK の `BetaManagedAgentsSession.status` の完了値は `"idle"`（`completion.ts:30` で確認済み）。`ended` は SDK に存在しないため使用しない

**実装メモ**:
- `pollUntilComplete(client, sessionId, undefined, { timeoutMs: config.specReview.timeoutMs, sleepFn: deps.sleepFn })` で呼び出す
- timeout は propose と独立した config 値（default 10 分）
- `terminated` / timeout 例外は既存の `sessionTerminatedError` / `sessionTimeoutError` で処理済み

### Decision 4: verdict ファイルは GitHub API で取得し、行頭マッチでパース

**選択**: ポーリング完了後、`fetchSpecReviewResult(deps, slug, branch)` で `PipelineDeps.githubFetch` を使って `openspec/changes/<slug>/spec-review-result.md` を取得し、行頭の `- **verdict**:` を正規表現 `/^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m` でパースする。`fetchSpecReviewResult` は 404 時に 1 秒間隔で 3 回リトライし、それでも null なら `SPEC_REVIEW_RESULT_NOT_FOUND`。

**代替案**:
- A: YAML front-matter として verdict を保持 → js-yaml でパース
- B: 行頭マッチ ← 採用

**理由**:
- A は依存追加が必要。markdown レビューファイルに front-matter を強制すると spec-review エージェントの自由度が下がる
- B は依存なし。verdict 行は規約として review-standards.md に定義済み（`- **verdict**: approved` 等）
- ファイルが見つからない / verdict 行が見つからない場合は `escalation` 扱い + stderr 警告で fail-safe

**実装メモ**:
- ファイル取得失敗（404）は `error.code = "SPEC_REVIEW_RESULT_NOT_FOUND"`、verdict は `escalation` 扱いで終了
- verdict 行が複数ある場合は最初の 1 行を採用（last-write-wins ではなく first-write-wins。誤解を避けるため）
- summary （findings 件数等）は best-effort でパースし、stdout に出力。失敗してもパイプライン全体は失敗させない

### Decision 5: spec-review system prompt は単一ファイルにテンプレート化

**選択**: `src/prompts/spec-review-system.ts` に `buildSpecReviewSystemPrompt(input)` を export する。input は `{ slug, repository, requestType }`。テンプレートは architect + spec-reviewer の二役を 1 セッションで担う旨を明記する。

**代替案**:
- A: 役割ごとに別ファイル（architect.ts / spec-reviewer.ts）
- B: 単一ファイル ← 採用（Phase 1）

**理由**:
- Phase 1 では 1 セッション 1 prompt。Phase 2 で並列化する際に分離すれば良い
- propose-system.ts と同じ構造で読みやすい

**実装メモ**:
- 初回メッセージには change folder のパス、request type、有効化された opt-in フラグを含める（propose と同じ規約）
- ユーザー入力は `<user-request>...</user-request>` で囲む（プロンプトインジェクション対策）

## Risks / Trade-offs

- **Risk**: `runPipeline` 新設に伴う既存 propose pipeline テストの mass refactor → **Mitigation**: `runProposePipeline` 呼び出しを `runPipeline` に置換し、既存テストは `runProposeStep` 単体テスト + `runPipeline` 統合テストに書き換える。smoke test は維持する
- **Risk**: spec-review エージェントが verdict 行を正規フォーマットで書かない → **Mitigation**: system prompt で verdict 行のフォーマットを明示し、example を含める。パース失敗時は `escalation` 扱いで fail-safe
- **Risk**: ポーリングが 10 分を超えてもセッションが終わらない → **Mitigation**: timeout 観測で `SESSION_TIMEOUT` を設定。ユーザーは `specrunner ps` で session.id を取得し、Anthropic console から確認可能
- **Risk**: GitHub API rate limit（spec-review 完了直後に `fetchSpecReviewResult` を叩く） → **Mitigation**: 1 ジョブあたり 1 回しか叩かないので rate limit には到達しない。401 は `GITHUB_TOKEN_EXPIRED` で既存ハンドリングを再利用
- **Risk**: spec-review-result.md の生成タイミングと session idle のタイミング不整合（push 完了前に status が idle になる） → **Mitigation**: ポーリングで `idle` を観測した直後に `fetchSpecReviewResult` が 404 を返した場合、1 秒間隔で 3 回リトライ。それでも失敗なら `SPEC_REVIEW_RESULT_NOT_FOUND` で escalation

## Open Questions

- spec-review のポーリング間隔 default は 10 秒で良いか（propose の SSE と粒度が違う点をユーザーがどう感じるか）
- `JobState.steps` フィールドの追加は破壊的変更か？ → 既存の状態ファイルは `version: 1` のまま、`steps` は optional として読み込み時に空オブジェクトで補う
- spec-review の system prompt が architect 役を含むことで、spec の修正提案まで書いてしまうケースをどう扱うか → Phase 1 では verdict と findings のみが評価対象。修正は次 request の spec-fixer に委譲する旨を prompt に明記する
