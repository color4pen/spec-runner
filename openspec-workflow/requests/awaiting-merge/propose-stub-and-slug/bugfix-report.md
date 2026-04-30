# Bugfix Report: propose-stub-and-slug

## Meta

- **reported**: 2026-04-30
- **severity**: normal
- **status**: resolved

## Symptom

- **何が起きたか**: dogfooding-001 e2e で propose step が escalate。propose agent が `register_branch` のみ呼んで `end_turn` し、`openspec/changes/{slug}/` が生成されないまま完了報告 → executor の change folder 存在検証で失敗。
- **発生条件**: `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` 実行（init / login / SPECRUNNER_GITHUB_CLIENT_ID 設定済み）。
- **エラーメッセージ**: executor 側の change folder 存在検証エラー（`openspec/changes/{slug}/` 不在）。job state: `~/.local/share/specrunner/jobs/1cbe5c5b-80cf-4663-873b-6f61067e79a4.json`。

## Reproduction

- **再現手順**:
  1. `cd ~/Documents/GitHub/spec-runner`
  2. `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md`
  3. propose step が register_branch のみで end_turn → executor が change folder 不在で escalate
- **再現結果**: 再現済み（dogfooding 1 回目で観測。本 request では code 直読みで再確認）

## Fix

- **修正内容**:
  - **A. propose-system.ts 全面書き直し**: PoC スタブから共通テンプレ準拠の prompt へ。役割／workspace 前提／禁止事項／出力フォーマット（proposal.md/design.md/tasks.md/specs/）／完了条件（commit + push + register_branch まで end_turn しない）／fresh-per-task／security guard を追加。
  - **B. slug 一元化**:
    - `src/parser/request-md.ts`: `ParsedRequest.slug: string` を追加。Meta セクションの `- **slug**: <value>` を必須抽出、欠落時 `REQUEST_MD_INVALID` で fail-fast。
    - `src/cli/run.ts:141`: `path.basename(absolutePath, ".md")` fallback を削除。`request.slug` を pipeline に渡す。
    - `buildInitialMessage(content, slug, branch?)` シグネチャに slug/branch を追加。propose user message テンプレートに `{{SLUG}}` / `{{BRANCH}}` を注入し、agent に「CLI 提供値を使え。独自生成禁止」を明示。
    - SessionClient port / adapter / sse-stream に slug を流し、`runSseStream` 内で `buildInitialMessage(requestContent, slug, branch)` 呼び出しに変更。
  - **D. OAuth client_id fail-fast**: `getGithubClientId()` の `?? "Iv23liasdfGHclient0001"` placeholder fallback を削除。env 未設定／空文字時に `GITHUB_CLIENT_ID_MISSING` を throw。
- **変更ファイル**:
  - `src/prompts/propose-system.ts`（全面書き直し + buildInitialMessage シグネチャ拡張）
  - `src/parser/request-md.ts`（ParsedRequest.slug 追加・必須抽出）
  - `src/cli/run.ts`（path.basename 削除・request.slug 使用）
  - `src/core/port/session-client.ts`（streamEvents opts に slug/branch）
  - `src/adapter/anthropic/session-client.ts`（slug/branch forward）
  - `src/adapter/anthropic/sse-stream.ts`（SseStreamDeps.slug/branch + buildInitialMessage 呼び出し）
  - `src/core/step/executor.ts`（runProposeStyleStep が streamEvents に slug 渡し）
  - `src/core/step/propose.ts`（buildMessage が deps.slug を渡す）
  - `src/auth/constants.ts`（fail-fast 化）
  - `src/errors.ts`（GITHUB_CLIENT_ID_MISSING コード追加）
  - tests: `parser.test.ts`, `github-device.test.ts`, `pipeline.test.ts`, `pipeline-integration.test.ts`, `spec-review-step.test.ts`, `cli-stdout-snapshot.test.ts`, `error-codes.test.ts`, `unit/core/step/types.test.ts`, `unit/step/{executor,implementer,code-review,code-fixer,verification,build-fixer,pr-create}.test.ts`, `unit/core/pipeline/pipeline.transitions.test.ts`, `unit/core/pr-create/body-template.test.ts`, `core/step/step-interface.test.ts`, `core/pipeline/pipeline.test.ts`, `core/steps/spec-review.test.ts`（ParsedRequest fixture に slug 追加 + 新規テスト 5 件）

## Verification

- **修正確認**: 再現手順で確認 → e2e dogfooding は別途実機検証（本 fix の受け入れ基準）。コードレベルでは buildInitialMessage の slug/branch 注入と parser の slug 必須抽出を新規テストで検証済。
- **リグレッション**: Build ✓ | Type ✓ | Lint — (Bun 環境に lint 設定なし) | Test ✓ (469 → 474, +5 新規, regression 0)
