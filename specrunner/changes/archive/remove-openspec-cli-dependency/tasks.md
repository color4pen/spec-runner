# Tasks: remove-openspec-cli-dependency

## T-01: paths.ts のパス定数切り替え

- [x] `src/util/paths.ts` の `CHANGES_DIR` を `"openspec/changes"` → `"specrunner/changes"` に変更
- [x] `SPECS_DIR` のコメントに「R3 で廃止予定。collectSpecsList() で空配列固定済み」を追記
- [x] `tests/util/paths.test.ts` のアサーション値を `specrunner/changes` に更新
- [x] JSDoc の Example コメントを `specrunner/changes/...` に更新

**受け入れ基準**: `changeFolderPath("my-change")` が `"specrunner/changes/my-change"` を返す

## T-02: propose prompt の template 化

- [x] `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` を書き換え:
  - openspec CLI ワークフロー（Step 1-5）を全削除
  - 以下の artifact checklist 方式に置換:
    - `specrunner/changes/<slug>/design.md` — 技術設計
    - `specrunner/changes/<slug>/tasks.md` — 実装タスク（checkbox 形式）
    - `specrunner/changes/<slug>/specs/<capability>/spec.md` — delta spec（該当時）
  - proposal.md を生成対象から除去
  - openspec CLI を使わない旨の禁止事項を更新
  - `npx openspec` への言及を全削除
- [x] Delta Spec Format Rules（L99-151 相当）はそのまま維持する
- [x] Self-review checklist を維持する（openspec validate の代替防御）
- [x] `PROPOSE_INITIAL_MESSAGE_TEMPLATE` から proposal.md の言及を除去
- [x] `tests/prompts/propose-system.test.ts` を更新（openspec CLI 関連のアサーション削除、新 artifact list のアサーション追加）

**受け入れ基準**: PROPOSE_SYSTEM_PROMPT に `openspec` / `npx openspec` / `proposal.md` の文字列が含まれない

## T-03: finish archive-openspec の除去

- [x] `src/core/finish/archive-openspec.ts` を削除
- [x] `src/core/finish/orchestrator.ts` から `archiveOpenspec` の import と呼び出しを除去
- [x] Phase 1 の `runPhase1Archive` から openspec archive ロジックを削除
- [x] `tests/finish-archive-openspec.test.ts` を削除

**受け入れ基準**: `archiveOpenspec` への参照がコードベースに残っていない

## T-04: change folder アーカイブの実装

- [x] `src/core/finish/archive-change-folder.ts` を新規作成:
  - `archiveChangeFolder({ slug, cwd, spawn, fs })` を export
  - `specrunner/changes/<slug>/` → `specrunner/changes/archive/<slug>/` への git mv
  - change folder が存在しない場合は skip（`{ ok: true, skipped: true }`）
  - git mv 失敗時は escalation を返す
  - archive 後に `git add specrunner/changes/` を実行
- [x] `orchestrator.ts` の Phase 1 に `archiveChangeFolder()` 呼び出しを追加（`moveRequestsDir()` の前に実行）
- [x] `tests/finish-archive-change-folder.test.ts` を新規作成:
  - change folder 存在 → git mv 成功
  - change folder 不在 → skip
  - git mv 失敗 → escalation
  - specs/ あり/なしの分岐は不要（archive は単純な mv）

**受け入れ基準**: finish Phase 1 が `specrunner/changes/<slug>/` を `specrunner/changes/archive/<slug>/` に移動する

## T-05: preflight から openspec validate を除去

- [x] `src/core/finish/preflight.ts` の `runChecks5and6()` から Check 6（openspec validate）のコードブロックを削除
- [x] 関数名を `runChecks5and6` → `runCheck5` にリネーム（Check 6 消滅のため）
- [x] Check 7 の `checkBinaries` 呼び出しから `"openspec"` を除去（`["gh", "git"]` のみ）
- [x] ファイルヘッダーの TC コメントから Check 6/7 の openspec 関連を更新
- [x] `tests/unit/core/finish/preflight.test.ts` から openspec validate 関連テストケースを削除/更新

**受け入れ基準**: preflight が `openspec` コマンドを spawn しない

## T-06: doctor openspec check の除去

- [x] `src/core/doctor/checks/runtime/openspec.ts` を削除
- [x] `src/core/doctor/checks/index.ts` から `openspecCheck` の import と `allChecks` 配列登録を除去
- [x] re-export セクションから `openspecCheck` を除去
- [x] Runtime コメントを `(4)` → `(3)` に更新
- [x] `src/core/doctor/checks/repo/openspec-project-md.ts` の `required: true` → `required: false` に変更
- [x] hint メッセージを更新（`openspec init` への言及を除去）
- [x] `tests/core/doctor/checks/runtime/openspec.test.ts` を削除

**受け入れ基準**: `allChecks` に openspec runtime check が含まれない。`openspecProjectMdCheck.required === false`

## T-07: dynamic-context の specs 廃止

- [x] `src/git/dynamic-context.ts` の `collectSpecsList()` を空配列固定にする（関数本体を `return [];` に置換）
- [x] `collectSpecsList` の JSDoc に「baseline spec は消費者不在のため廃止。R3 で関数自体を削除予定」を追記
- [x] `tests/git/dynamic-context.test.ts` の specs 関連テストを更新（空配列を期待）

**受け入れ基準**: `collectSpecsList()` が常に `[]` を返す

## T-08: 全 prompt から proposal.md 参照を除去

- [x] `src/prompts/spec-review-system.ts`:
  - L81 の `proposal.md, design.md, tasks.md, specs/` → `design.md, tasks.md, specs/` に変更
  - request.md を review 対象として追記（change folder 内に同居するため）
- [x] `src/prompts/test-case-gen-system.ts`:
  - L9 の `proposal.md, design.md and tasks.md` → `request.md, design.md and tasks.md` に変更
  - L15-16 の `reads proposal.md, design.md and tasks.md` → `reads request.md, design.md and tasks.md`
  - L187 の `Read ${changeFolder}/proposal.md` → `Read ${changeFolder}/request.md` に変更
- [x] `src/prompts/code-review-system.ts`: proposal.md への参照がないことを確認（変更不要）
- [x] `src/prompts/implementer-system.ts`: proposal.md への参照がないことを確認（変更不要）
- [x] `tests/prompts/dynamic-context-prompts.test.ts` を確認し、proposal.md 関連アサーションがあれば更新

**受け入れ基準**: `grep -r "proposal\.md" src/prompts/` がヒットしない

## T-09: request.md の change folder コピー

- [x] `src/core/runtime/local.ts` の `setupWorkspace()` に request.md の change folder コピーを追加:
  - `changeFolderPath(slug)` を import
  - request.md コピー後、`path.join(worktreePath, changeFolderPath(slug), "request.md")` にもコピー
  - `specrunner/changes/<slug>/` ディレクトリを `mkdir -p` で事前作成
  - コピー先をステージング対象に含める
- [x] `src/core/runtime/managed.ts` にも同様のコピー処理を追加
- [x] テストで request.md が change folder 内にもコピーされることを検証

**受け入れ基準**: pipeline 起動後に `specrunner/changes/<slug>/request.md` が存在する

## T-10: init.ts の openspec パッケージ除去

- [x] `src/cli/init.ts` の `ENVIRONMENT_PACKAGES_NPM` から `"@fission-ai/openspec"` を除去
- [x] 空配列 `[]` にするか、配列定数自体を削除する

**受け入れ基準**: managed runtime の Environment 作成時に openspec がインストールされない

## T-11: propose maxTurns の削減

- [x] `src/core/step/propose.ts` の `maxTurns: 20` → `maxTurns: 15` に変更
- [x] コメントを `openspec CLI → template-driven design` に更新

**受け入れ基準**: `ProposeStep.maxTurns === 15`

## T-12: orchestrator.ts の dry-run plan 更新

- [x] `orchestrator.ts` の `outputDryRunPlan()` から `archive openspec changes +` の文言を除去
- [x] archive-plan を `archive change folder + move active to merged` に更新

**受け入れ基準**: dry-run 出力に `openspec` の文字列が含まれない

## T-13: finish orchestrator.ts の branch-checkout.ts 参照更新

- [x] `src/core/finish/branch-checkout.ts` 内の openspec 関連コメントがあれば更新

**受け入れ基準**: コメントに `openspec archive` への言及がない

## T-14: step ファイルのコメント更新

- [x] `src/core/step/propose.ts` L50-51 のコメント `openspec CLI` → `template-driven design` に更新
- [x] 他の step ファイル（spec-review.ts, spec-fixer.ts, implementer.ts, build-fixer.ts, code-review.ts, code-fixer.ts）の `propose-openspec-cli-and-step-model-config` への言及は design reference であるため維持（ADR 名の変更はスコープ外）

**受け入れ基準**: propose.ts のコメントが実態と整合する

## T-15: typecheck & test の green 確認

- [x] `bun run typecheck` が成功する
- [x] `bun run test` が成功する
- [x] `grep -r "openspec" src/ | grep -v "//\|/\*\|\.md\|project\.md\|openspec-workflow\|propose-openspec-cli"` で実行パス上の openspec 残存参照がないことを確認

**受け入れ基準**: ビルドとテストが green。コード実行パスから `openspec` コマンド呼び出しが消滅
