## 1. State schema 拡張

- [x] 1.1 `src/state/schema.ts` に `StepName` (`"propose" | "spec-review"`) と `StepResult` 型を追加し、`JobState.steps: Record<StepName, StepResult>` を optional として追加
- [x] 1.2 `validateJobState` で `steps` 欠落時に `{}` で補う後方互換ロジックを実装
- [x] 1.3 `appendStepResult(state, stepName, partial)` 純粋関数を追加し、step ごとの session/verdict/findingsPath/completedAt/error をマージ更新できるようにする
- [x] 1.4 schema 単体テストを追加（既存の v1 ファイル読み込み・新規 steps フィールド書き込み・appendStepResult のテスト）

## 2. ステップ関数の分離 (propose の refactor)

- [x] 2.1 `src/core/steps/` ディレクトリを作成
- [x] 2.2 既存 `runProposePipeline` の中身を `src/core/steps/propose.ts` の `runProposeStep(state, deps)` に移動し、step 完了時に `state.steps["propose"]` を append するロジックを追加
- [x] 2.3 既存 `src/core/pipeline.ts` の `runProposePipeline` を削除し、`src/cli/run.ts` の呼び出しを `runPipeline` に置換（内部 API のため後方互換要件なし。task 6.1 と連動）
- [x] 2.4 既存テストが通ることを確認し、必要に応じて step 単位テストに書き換える

## 3. spec-review system prompt

- [x] 3.1 `src/prompts/spec-review-system.ts` を新設し、`buildSpecReviewSystemPrompt(input: { slug, repository, requestType, enabled })` 関数を export
- [x] 3.2 system prompt に architect + spec-reviewer の役割、verdict 3 値、verdict 行フォーマット (`- **verdict**: <value>`)、findings テーブル形式、修正提案を含めない指示を含める
- [x] 3.3 ユーザー入力を `<user-request>...</user-request>` で囲む XML タグ規約を実装
- [ ] 3.4 prompt 単体テスト（戻り値に必須キーワードが含まれることを assert）

## 4. spec-review step 実装

- [x] 4.1 `src/core/steps/spec-review.ts` を新設し、`runSpecReviewStep(state, deps)` を実装
- [x] 4.2 セッション作成 (`sessions.create`) — 標準 toolset のみ、custom tools なし、リソースに対象 repo
- [x] 4.3 初回メッセージ送信 (`events.send`) — change folder パス・request type・enabled・verdict ファイル出力先を含む
- [x] 4.4 `pollUntilComplete(client, sessionId, undefined, { timeoutMs: config.specReview.timeoutMs, sleepFn: deps.sleepFn })` を呼び出してポーリングを実装する（`src/core/completion.ts:58` の既存実装を再利用。新規ポーリングロジックは書かない）。完了判定は既存の `isProposeComplete`（`status === "idle"`）、`terminated` 検知は既存の `isSessionTerminated` を使用する
- [x] 4.4a SDK verification メモ: `BetaManagedAgentsSession.status` の完了値は `"idle"` (`completion.ts:30` で確認済み)。spec-review-session/spec.md を `"idle"` に統一済み。旧 `"ended"` 表記は削除。
- [x] 4.5 `fetchSpecReviewResult(deps, slug, branch): Promise<string | null>` を実装する（`PipelineDeps.githubFetch` を使った raw fetch で `openspec/changes/<slug>/spec-review-result.md` を取得。404 は 1 秒間隔で 3 回リトライ。`getFileContent` ヘルパーは本リポジトリに存在しないため使用しない）
- [x] 4.6 verdict 行を正規表現 `/^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m` でパース
- [x] 4.7 verdict 不在/パース失敗時のフェイルセーフ（`escalation` + stderr warning）を実装
- [x] 4.8 state.steps["spec-review"] へ session/verdict/findingsPath/completedAt を append
- [x] 4.9 各エラーパス（`SESSION_TIMEOUT` / `SESSION_TERMINATED` / `SPEC_REVIEW_RESULT_NOT_FOUND`）で適切な `state.status` / `error.code` を設定
- [x] 4.10 spec-review step 単体テスト（mock client + mock fetch で各ケースを網羅）

## 5. パイプラインオーケストレーター

- [x] 5.1 `src/core/pipeline.ts` に `runPipeline(jobState, deps)` を新設し、`[runProposeStep, runSpecReviewStep]` を順次呼び出す
- [x] 5.2 各 step 完了後に `writeJobState(state)` を呼び persist（fresh-per-task の中断耐性）
- [x] 5.3 propose 失敗時に spec-review をスキップする分岐
- [x] 5.4 spec-review verdict が `needs-fix` または `escalation` の場合、以降の step を呼ばずに state を返す（Phase 1 では実質 no-op）
- [x] 5.5 step 遷移時に `state.step` を更新し、history に `step-transition` entry を append
- [x] 5.6 runPipeline 統合テスト（propose 正常 + spec-review approved/needs-fix/escalation の 3 シナリオ）

## 6. CLI 配線

- [x] 6.1 `src/cli/run.ts` の既存 `runProposePipeline` 呼び出しを `runPipeline` に置換
- [x] 6.2 spec-review verdict を stdout に出力するロジックを追加（`approved` / `needs-fix` + findings サマリ / `escalation` + 理由）
- [x] 6.3 spec-review-result.md の summary パース（findings 件数と上位 3 件）を best-effort で実装
- [x] 6.4 `SPEC_REVIEW_RESULT_NOT_FOUND` 時に exit code 1 + stderr メッセージを出す
- [x] 6.5 既存の propose 失敗 exit code は維持（後方互換）

## 7. 設定値の追加

- [x] 7.1 spec-review ポーリング間隔 (`specReview.pollIntervalMs`, default 10000) を config schema に追加
- [x] 7.2 spec-review timeout (`specReview.timeoutMs`, default 600000) を config schema に追加
- [ ] 7.3 config 読み込みテストを追加

## 8. 統合テスト

- [x] 8.1 `tests/integration/pipeline.spec.ts` (新規 or 既存拡張) で propose → spec-review approved の end-to-end happy path を mock client / mock GitHub fetch で検証
- [x] 8.2 propose 成功 + spec-review needs-fix のケース
- [x] 8.3 propose 成功 + spec-review escalation のケース
- [x] 8.4 propose 成功 + spec-review-result.md 不在 (`SPEC_REVIEW_RESULT_NOT_FOUND`) のケース
- [x] 8.5 propose 失敗時に spec-review がスキップされることを assert
- [x] 8.6 中断耐性: propose 完了後・spec-review 開始前に `writeJobState` が呼ばれていることを assert

## 9. ドキュメント

- [ ] 9.1 README または CLI usage doc に spec-review verdict の出力フォーマット例を追記
- [ ] 9.2 ADR-20260424-session-pipeline-design.md に Phase 1 の spec-review 接続完了を追記（status: implemented）
- [ ] 9.3 状態ファイルの schema 変更（`steps` フィールド追加）を docs に反映

## 10. 検証 / 仕上げ

- [x] 10.1 `bun test` 全 PASS
- [x] 10.2 `bun run typecheck` PASS
- [ ] 10.3 `bun run lint` PASS
- [ ] 10.4 手動スモークテスト: ローカルで `specrunner run <request.md>` を実行し propose → spec-review が直列で動くことを確認
- [ ] 10.5 `openspec validate spec-review-pipeline --strict` PASS
