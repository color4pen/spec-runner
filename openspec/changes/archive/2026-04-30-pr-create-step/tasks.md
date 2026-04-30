## 1. Schema / Types Extension

- [x] 1.1 `StepName` union に `"pr-create"` を追加 (`src/state/schema.ts`)
- [x] 1.2 `JobState` 型に `pullRequest?: { url: string; number: number; createdAt: string }` field を追加 (`src/state/schema.ts` または該当箇所)
- [x] 1.3 既存の state 型 export を確認し、`JobStateStore.load()` が legacy state（pullRequest 欠落）を `pullRequest === undefined` で読めることを担保
- [x] 1.4 `AgentStepName` の Exclude 句を `Exclude<StepName, "verification" | "pr-create">` に拡張する (`src/state/schema.ts`) — `pr-create` は `kind: "cli"` で agent を持たないため `AgentRegistry` から除外する必要がある

## 2. request.md Parser 拡張

- [x] 2.1 `ParsedRequest` 型に `sections: { 背景?: string; 目的?: string }` field を追加 (`src/parser/request-md.ts`)
- [x] 2.2 `## 背景` / `## 目的` 見出し配下の本文を抽出する正規表現ロジックを実装（次の `## 見出し` 直前または EOF まで）
- [x] 2.3 見出し不在時は対応 field を `undefined` で返す挙動を実装
- [x] 2.4 `tests/unit/parser/request-md.test.ts` に sections 抽出のシナリオを追加（両方存在 / 片方存在 / 両方不在）

## 3. pr-create Runner 実装

- [x] 3.1 `src/core/pr-create/runner.ts` を新設し `runPrCreate(input)` を export
- [x] 3.2 `gh pr list --head <branch> --base <baseBranch> --state all --json url,number,state` を spawn する実装（既存 PR 検出）— JSON 配列長 0 を PR 不在と判定。stderr 文言依存は禁止
- [x] 3.3 検出結果の JSON 配列の先頭要素 state を見て OPEN / MERGED / CLOSED 分岐を実装（OPEN は `existing-open`、それ以外は `error` を返す）
- [x] 3.4 PR が存在しない場合に `gh pr create --title <title> --body-file <tempfile> --base <baseBranch> --head <branch>` を spawn し URL/number を抽出する。`--body` 引数渡しは使用しない。`fs.writeFile()` でボディを一時ファイルに書き出し、コマンド完了後（成否問わず）に削除する
- [x] 3.5 gh CLI failure 時に `{ status: "error", reason: "gh-failure", message: <stderr> }` を返す
- [x] 3.6 `tests/unit/core/pr-create/runner.test.ts` を新設し 4 シナリオをカバー（新規作成 / 既存 OPEN / 既存 MERGED / gh CLI 失敗）

## 4. PR Body Template

- [x] 4.1 `src/core/pr-create/body-template.ts` を新設し `renderPrTitle(parsedRequest)` と `renderPrBody({ parsedRequest, jobState })` を export
- [x] 4.2 `## Summary` セクション（背景 + 目的 verbatim）の生成ロジック
- [x] 4.3 `## Workflow` テーブル（spec-review / verification / code-review の最終 iteration verdict）の生成ロジック
- [x] 4.4 `## Test plan` セクション（result-file path への checkbox）の生成ロジック
- [x] 4.5 末尾 signature `🤖 Generated with SpecRunner` を付与
- [x] 4.6 `tests/unit/core/pr-create/body-template.test.ts` を新設し fixture-based snapshot を作成

## 5. PrCreateStep 実装

- [x] 5.1 `src/core/step/pr-create.ts` を新設し `PrCreateStep` を `CliStep` として export
- [x] 5.2 `name === "pr-create"`, `kind === "cli"`, agent field なしを実装
- [x] 5.3 `resultFilePath(state)` で `openspec/changes/<slug>/pr-create-result.md` を返す
- [x] 5.4 `parseResult(content)` で `## Status: success | failed` を regex 抽出し verdict にマップ
- [x] 5.5 `run(state, deps)` で runner 呼び出し → state.pullRequest 更新 → result file 書き出しを実装
- [x] 5.6 `tests/unit/step/pr-create.test.ts` を新設し CliStep interface 適合性 + parseResult を検証

## 6. Pipeline Transitions 書き換え

- [x] 6.1 `STANDARD_TRANSITIONS` から `{ step: "code-review", on: "approved", to: "end" }` を削除
- [x] 6.2 `{ step: "code-review", on: "approved", to: "pr-create" }` を追加
- [x] 6.3 `{ step: "pr-create", on: "success", to: "end" }` を追加
- [x] 6.4 `{ step: "pr-create", on: "error", to: "escalate" }` を追加
- [x] 6.5 `loopNames` 既定値を維持（`["spec-review", "verification", "code-review"]`、pr-create は含めない）
- [x] 6.6 `LOOP_ERROR_CODES` には pr-create を **追加しない**（loop ではないため）
- [x] 6.7 `tests/unit/core/pipeline/pipeline.transitions.test.ts` の既存テストを以下の通り更新し、3 つの新 transition をカバーするケースを追加する:
  - TC-012 の `{ step: "code-review", on: "approved", to: "end" }` エントリを `{ step: "code-review", on: "approved", to: "pr-create" }` に書き換える（describe ブロック内の `codeReviewEdges` 配列の該当行）
  - `code-review --approved→ end` が NOT present であることを検証する assertion を追加する（`STANDARD_TRANSITIONS.find(t => t.step === "code-review" && t.on === "approved" && t.to === "end")` が `undefined` を返すこと）
  - TC-030 の行数アサーション `expect(STANDARD_TRANSITIONS.length).toBe(19)` を `toBe(22)` に更新する（19 行 + pr-create 3 行 = 22 行）
  - `code-review --approved→ pr-create`、`pr-create --success→ end`、`pr-create --error→ escalate` の 3 新 transition が STANDARD_TRANSITIONS に存在することを検証するケースを追加する

## 7. CLI Wiring

- [x] 7.1 `src/core/pipeline/run.ts` の `steps` Map（`runPipeline` 内、現行 L40-49）に `PrCreateStep` を追加する — `src/cli/run.ts` は `runPipeline()` を呼び出すだけの薄い呼び出し層であり変更不要
- [x] 7.2 `src/cli/init.ts` は変更不要であることを確認（kind=cli のため `AgentRegistry.fromSteps()` のハードコード配列に `PrCreateStep` を追加しない。pr-create は配列に含めないことで registry に登録されない）
- [x] 7.3 `tests/unit/core/pipeline/run.test.ts`（または該当 wiring test）に pr-create が steps Map に含まれることを検証するケースを追加（`src/core/pipeline/run.ts` の steps Map に 9 entries 含まれること）

## 8. Test 全体 / Snapshot 更新

- [x] 8.1 既存 unit test を全 PASS させる（regression 0 件）
- [x] 8.2 CLI snapshot が `--update-snapshot` なしで PASS することを確認（必要に応じて pipeline diagram snapshot を更新）
- [x] 8.3 verification phase（lint / typecheck / test）を実行し全 PASS を確認

## 9. Test Cases Generator (オプション enabled)

- [x] 9.1 `test-case-generator` skill の output を `openspec/changes/pr-create-step/test-cases.md` に配置（ワークフローオプション enabled に基づく）
- [x] 9.2 must シナリオが pr-create-step / pr-create-runner spec の Scenario と整合していることを確認

## 10. ADR (オプション enabled)

- [x] 10.1 `openspec-workflow/adr/ADR-20260430-pr-create-step-design.md` を作成
- [x] 10.2 ADR に以下の決定を記録:
  - kind=cli 採用判断（vs kind=agent）
  - merge 戦略（OPEN は idempotent / MERGED CLOSED は escalation）
  - PR base branch を `main` 固定にする方針
  - PR body template を request.md ベースで独立生成する方針（commit messages を流用しない）
  - 失敗時 retry なし即 escalation の方針
- [x] 10.3 ADR を `openspec-workflow/adr/index.md` に登録（既存運用がある場合）

## 11. Documentation / Cleanup

- [x] 11.1 `proposal.md` / `design.md` / `specs/**` の整合性を最終確認
- [x] 11.2 `openspec validate --strict pr-create-step` を実行し PASS することを確認
- [x] 11.3 commit message を分割（schema 拡張 / runner / step / transition / wiring / tests）で push
