## 0. 規約

- **テストファイル配置**: ユニットテストは `test/` 直下に `<source-file-path>.test.ts` として配置する（例: `src/core/loop.ts` → `test/core/loop.test.ts`）。既存規約（`test/` 直下）に合わせる。

## 1. Config schema 拡張

- [x] 1.1 `src/config/schema.ts` に `agents.{propose, specFixer, specReview?}` 構造を追加（型定義 + 既定値）
- [x] 1.2 `src/config/schema.ts` に `pipeline.maxRetries`（既定 2、範囲 1-10、`CONFIG_INVALID` で範囲検証）を追加
- [x] 1.3 `src/config/getAgentId.ts` を新設し、フォールバックチェーン（`agents[role].id` → propose のみ legacy `agent.id` → CONFIG_INCOMPLETE throw）を実装
- [ ] 1.4 `src/config/io.ts` の write 経路で `agents.propose` と legacy `agent` を同期書き込みする
- [x] 1.5 既存の config 読み込みコードを `getAgentId` 経由に置換（grep で `config.agent.id` の直接参照を一掃）
- [x] 1.6 config schema のユニットテスト: 旧形式読み込み → propose ロールが解決できる、spec-fixer ロールは CONFIG_INCOMPLETE を返す
- [x] 1.7 config schema のユニットテスト: maxRetries の既定値・範囲外エラー

## 2. State schema 配列化

- [x] 2.1 `src/state/types.ts` で `StepResult.iteration: number` を追加し、`JobState.steps` を `Record<string, StepResult[]>` に変更
- [x] 2.2 `src/state/io.ts` の read 経路で旧形式（オブジェクト）を `[{ ...obj, iteration: 1 }]` に正規化
- [x] 2.3 `src/state/helpers.ts` を新設し、`getLatestStepResult(state, stepName)` と `pushStepResult(state, stepName, partial)` を export。既存の merge-style `appendStepResult`（`src/state/schema.ts:135`）は同時に削除し、呼び出し元（`propose.ts` / `spec-review.ts` の 7 箇所）を `pushStepResult` 経由に置換する
- [x] 2.4 既存コード（spec-review step、ps コマンド等）の `state.steps[stepName]` 直接参照を `getLatestStepResult` 経由に置換
- [x] 2.5 state read/write のユニットテスト: 旧形式 → 配列正規化、配列の append、iteration 自動採番
- [x] 2.6 `state.error.code` 型定義に `SPEC_REVIEW_RETRIES_EXHAUSTED`、`SPEC_FIXER_NO_FINDINGS` を追加

## 3. spec-fixer Agent と prompt

- [x] 3.1 `src/prompts/spec-fixer-system.ts` を新設し、`buildSpecFixerSystemPrompt(input): string` を実装（修正のみ・レビュー禁止・findings に従う・commit + push する旨を明記）
- [x] 3.2 spec-fixer system prompt のスナップショットテスト（必須キーワードを含むこと）
- [ ] 3.3 `src/init/agent.ts` を `createOrReuseProposeAgent` と `createOrReuseSpecFixerAgent` の 2 関数に分割
- [ ] 3.4 spec-fixer Agent の definition: system_prompt = `buildSpecFixerSystemPrompt`、custom_tools = `[]`、toolset = `agent_toolset_20260401`、model = propose と同モデル
- [ ] 3.5 `specrunner init` を spec-fixer Agent も冪等に作成・更新するフローに更新（404 時新規、ハッシュ不一致時 update、ハッシュ一致時 reuse）
- [ ] 3.6 `specrunner init` の post-init 不変条件チェックに spec-fixer Agent の (a)(b)(c)(d)(e)(f) を追加。(e) の `custom_tools` 検証は `null` / `undefined` / `[]` のすべてを「空」として扱い、`register_branch` 文字列の不在のみを確認する（厳密な `=== []` 比較を避ける）
- [ ] 3.7 init のユニットテスト: spec-fixer Agent 新規作成・既存再利用・ハッシュ不一致 update のケース

## 4. Pipeline loop プリミティブ

- [x] 4.0 `src/core/types.ts` を新設し `PipelineDeps` 型を切り出す。`src/core/pipeline.ts` / `src/core/loop.ts` / `src/core/steps/*.ts` のすべてを `import type { PipelineDeps } from "../types.js"` に更新する（`pipeline.ts` からの import を除去して循環 import を構造的に防ぐ）
- [x] 4.1 `src/core/loop.ts` を新設し、`runLoopUntil(state, deps, opts)` を実装
- [x] 4.2 loop 内部で stdout 出力（`[iter N/MAX] starting`、`verdict: X → action` 等）を実装
- [x] 4.3 loop 内部で `state.history` への append（iter 開始 `started`、iter 終了 evaluator verdict 由来 ok/warning/error）。`runLoopUntil` は `writeJobState` を呼ばない（state の永続化は body 内の step 関数が担当）
- [x] 4.4 `onExceeded` の既定実装（state.steps 末尾 verdict を `escalation` に書き換え）
- [x] 4.5 loop プリミティブのユニットテスト: approved 即 exit、escalation 即 exit、needs-fix で次 iter、上限超過で onExceeded
- [x] 4.6 loop プリミティブのユニットテスト: stdout 出力フォーマット、history への append

## 5. spec-fixer step 実装

- [x] 5.0 `src/core/session-runner.ts` を新設し、`runManagedAgentSession(deps, input)` を実装（session 作成 → events.send → pollUntilComplete → terminated/timeout 分岐）。`runSpecReviewStep`（task 6.1）と `runSpecFixerStep`（task 5.4/5.5）の session ライフサイクル部分をヘルパ呼び出しに置き換える（propose.ts は SSE 経由のため対象外）
- [x] 5.1 `src/core/steps/spec-fixer.ts` を新設し、`runSpecFixerStep(state, deps): Promise<JobState>` を実装
- [x] 5.2 spec-fixer step は `getLatestStepResult(state, "spec-review")` で findingsPath を取得、null なら `SPEC_FIXER_NO_FINDINGS` で failed
- [x] 5.3 spec-fixer step は `getAgentId(deps.config, "specFixer")` で Agent ID を解決（legacy fallback 不可）
- [x] 5.4 spec-fixer セッション作成（Custom Tools なし、リポジトリマウントあり）+ events.send で初回 user message（`<user-request>` XML 包み、findings ファイルパス・ブランチ名・commit/push 指示）
- [x] 5.5 `pollUntilComplete({ timeoutMs: config.specFixer?.timeoutMs ?? 600_000 })` で完了まで待機、`SESSION_TERMINATED` / `SESSION_TIMEOUT` ハンドリング
- [x] 5.6 完了後 `pushStepResult(state, "spec-fixer", { session, verdict: null, findingsPath: null, completedAt, error: null })`
- [x] 5.7 各完了点で `writeJobState(state)` を呼ぶ（中断耐性）
- [x] 5.8 spec-fixer step のユニットテスト: 正常完了・findings 不在・terminated・timeout
- [x] 5.9 spec-fixer step のユニットテスト: セッション作成パラメータが Custom Tools を含まない

## 6. spec-review step の loop 対応改修

- [x] 6.1 `src/core/steps/spec-review.ts` を `pushStepResult` 経由で配列に push する形に改修
- [x] 6.2 verdict ファイル名を `spec-review-result-{NNN}.md`（3 桁ゼロ埋め、iteration 由来）に変更
- [x] 6.3 `fetchSpecReviewResult` のシグネチャに `iteration` 引数を追加し、ファイル名を組み立てる
- [x] 6.4 spec-review session の初回 user message に iteration 由来の verdict ファイル名を埋め込む
- [x] 6.5 spec-review step のユニットテスト更新: iteration ごとに別ファイル、verdict 結果が末尾要素に書かれる

## 7. runPipeline リファクタ

- [x] 7.1 `src/core/pipeline.ts` の `runPipeline` を step + loop 合成にリファクタ（公開シグネチャは無変更）
- [x] 7.2 propose step → `runLoopUntil` (loopName: "spec-review") の構造で実装。body は iter > 1 で spec-fixer step を先行実行
- [x] 7.3 evaluator は `getLatestStepResult(state, "spec-review").verdict` を返す
- [x] 7.4 onExceeded は `state.error = { code: "SPEC_REVIEW_RETRIES_EXHAUSTED", hint: "Review spec-review-result-<NNN>.md and adjust the request manually.", ... }`（`<NNN>` は 3 桁ゼロ埋め）、末尾 verdict を `escalation` に書き換え、stdout に `retries exhausted, escalating` を出力
- [x] 7.5 propose 失敗時は loop に入らず即 return（既存契約）
- [x] 7.6 step 遷移時に `state.step` を更新し、history に `step-transition` entry を append（loop body 内含む）
- [x] 7.7 runPipeline のユニットテスト: iter=1 approved、iter=1 needs-fix → iter=2 approved、iter=1 needs-fix → iter=2 needs-fix（retries exhausted）、iter=1 escalation、propose 失敗
- [x] 7.8 runPipeline のユニットテスト: 各 iteration でセッション ID が異なる（fresh-per-task）

## 8. 出力 / UX

- [x] 8.1 runPipeline 終了時に `Pipeline finished: spec-review iterations=N, final verdict=<v>` を 1 行出力
- [x] 8.2 stdout 出力フォーマットの統合テスト（iter 進捗 + 最終サマリ）

## 9. End-to-End / 受け入れテスト

- [ ] 9.1 E2E テスト: spec-review が iter=1 で needs-fix を返すフィクスチャで、spec-fixer 起動 → 再 spec-review が approved を返す経路を確認
- [ ] 9.2 E2E テスト: spec-review が iter=1, iter=2 ともに needs-fix を返すフィクスチャで、retries exhausted → escalation + SPEC_REVIEW_RETRIES_EXHAUSTED を確認
- [ ] 9.3 E2E テスト: spec-review が iter=1 で escalation を返すと spec-fixer が起動しない
- [ ] 9.4 E2E テスト: `specrunner init` 後に config に `agents.propose.id` と `agents.specFixer.id` の両方が記録される
- [ ] 9.5 E2E テスト: spec-fixer Agent が register_branch を含まないことを確認（Anthropic API retrieve）
- [ ] 9.6 E2E テスト: stdout に iteration 進捗（`[iter N/MAX] ...`）が表示される
- [ ] 9.7 受け入れ基準チェックリスト全 10 項目（request.md 「受け入れ基準」）の手動確認

## 10. ドキュメント更新

- [ ] 10.1 `README.md` または該当ドキュメントの spec-review セクションに iteration loop の挙動を追記
- [ ] 10.2 `config.json` のスキーマ例に `agents.{propose, specFixer}` と `pipeline.maxRetries` を追加
- [ ] 10.3 旧 `config.agent.id` を deprecated 扱いとする旨を型定義 TSDoc コメントに記す
