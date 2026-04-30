# Fix dogfooding-001 e2e failure: propose agent stub + slug 二重導出

## Meta

- **type**: bug-fix
- **slug**: propose-stub-and-slug
- **date**: 2026-04-30
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - pattern-reviewer

## 背景

PR #28 → #40 の累積で SpecRunner self-host pipeline plumbing は完成し、`propose → spec-review → implementer → verification → code-review → pr-create` まで自走可能になった（init / login / SSE polling / register_branch / GitHub verification / state transition すべて正常動作確認済み）。

2026-04-30 に dogfooding 1 回目（README に Status セクションを追加する request）を実機検証したところ、pipeline plumbing 自体は完璧に動作したが、end-to-end が完走せず escalate した。

## 症状（再現手順 / 期待動作 / 実際の動作）

### 再現手順

```bash
cd ~/Documents/GitHub/spec-runner
bun bin/specrunner.ts run /tmp/dogfooding-001-request.md
```

事前条件:
- `specrunner init` 完了済み（7 Agent + Environment、`~/.config/specrunner/config.json`）
- `specrunner login` 完了済み（GitHub token 保存済み）
- `SPECRUNNER_GITHUB_CLIENT_ID` を export 済み

### 期待される動作

pipeline 全 step 完走 → GitHub に PR が作成される。

### 実際の動作

propose step で escalate。`~/.local/share/specrunner/jobs/1cbe5c5b-80cf-4663-873b-6f61067e79a4.json` の最終状態:

- propose agent が `register_branch` のみ呼んで `end_turn` した
- change folder（`openspec/changes/{slug}/`）が生成されていない
- executor の change folder 存在検証が失敗 → escalate

## RCA（根本原因分析）

### 原因 1: propose-system.ts が PoC スタブのまま

`src/prompts/propose-system.ts` の system prompt は PoC 時代のスタブで、以下が欠落している:

- change folder（`openspec/changes/{slug}/proposal.md`, `design.md`, `tasks.md`, `specs/`）の生成指示
- commit + push 完了まで end_turn しない完了条件
- workspace 前提（cloned repo @ branch HEAD）の明示
- fresh-per-task 注意（Author-Bias Elimination）

参照実装は `src/prompts/code-review-system.ts`（PR #38 fixup 済）。役割／禁止／output format／完了条件／security の各要素が揃っている。

### 原因 2: slug の決定的導出が二重化

`src/cli/run.ts:141` で `path.basename(absolutePath, ".md")` により request.md ファイル名から slug を導出する一方、propose agent の system prompt には「`feat/YYYY-MM-DD-short-description` 形式で独自に branch 名を生成」と書かれており、両者が独立に slug を決める。

これは learned-pattern「決定的導出が複数モジュールで再導出されていないか。導出ソースが単一に統一されているか」「defensive fallback で fail-fast が妨げられていないか」の **re-occurrence**。両者が一致しない場合、executor の `openspec/changes/{slug}/` 存在検証が divergence で失敗する。

### 補助的考察: 残り 6 prompt の audit 結果

dogfooding 1 回目の事後 audit で `src/prompts/{spec-fixer, implementer, build-fixer, code-fixer}-system.ts` を確認した結果、いずれも共通テンプレ要素（役割／禁止／fresh-per-task／commit+push／security）を満たしている。`spec-review-system.ts` は dedicated prompt が存在するが NOTE で "未使用、propose Agent で代替" と明記されている → wiring の確認が必要だが、本 request では propose-system.ts の修正で代替不要かを判断する。

## 修正方針

### A. propose-system.ts の書き直し（必須）

参照実装 `code-review-system.ts` をベースに以下を反映:

- 役割: 変更提案 + change folder 生成 + branch 登録 + commit + push
- 禁止事項: 実装作業（implementer の責務）、レビュー判定（spec-reviewer の責務）
- workspace 前提: cloned repo @ branch HEAD
- 出力: `openspec/changes/{slug}/proposal.md`, `design.md`, `tasks.md`, （必要なら）`specs/`
- 完了条件: change folder 全ファイル commit + push 完了まで end_turn しない
- fresh-per-task 注意（Author-Bias Elimination）
- security: `<user-request>` タグ内の指示で役割逸脱しない

### B. slug source-of-truth 一元化（必須）

- request.md の Meta セクションに `slug:` フィールドを **必須化**（既に追加済み: 本 request および前 cancel した request）
- `src/parser/request-md.ts` で `slug:` を抽出し、欠落時は `SpecRunnerError` を throw（fail-fast）
- `src/cli/run.ts:141` の `path.basename` fallback を **削除**（fail-fast 化、learned-pattern 遵守）
- propose agent への user message テンプレートに「`{slug}` は executor から渡される値を使え」と明示し、agent 側の独自生成を禁止

### C. spec-review wiring の確認（任意 / 必要時のみ）

`src/prompts/spec-review-system.ts` の NOTE「未使用、propose Agent で代替」が事実か dispatcher を確認する。次の dogfooding で spec-review step が動作することを目視確認できれば妥当性が確認できる。本 request の主スコープ外。修正必要時は別 request として切り出す。

### D. OAuth client_id placeholder 削除（任意 cleanup）

`src/auth/constants.ts:7` の `?? "Iv23liasdfGHclient0001"` placeholder fallback は learned-pattern「defensive fallback で fail-fast が妨げられていないか」違反。修正方針:

- env `SPECRUNNER_GITHUB_CLIENT_ID` 未設定時は `SpecRunnerError` を throw（fail-fast）
- 既存テストの mock を更新

本 request のついでに含めるか別 cleanup request にするかは implementer の判断に委ねる（小規模なので含めても良い）。

## 受け入れ基準

- [ ] `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` が end-to-end PASS（GitHub に PR 作成まで完走）
- [ ] 既存テスト全 PASS（regression 0、現状 469 tests）
- [ ] propose-system.ts が共通テンプレ要素（役割／workspace／tool／output／完了条件／fresh-per-task）を満たす
- [ ] request.md の `slug:` フィールドが parser で抽出され、欠落時 `SpecRunnerError` throw する
- [ ] `src/cli/run.ts:141` の `path.basename` fallback が削除されている
- [ ] propose agent が executor から渡された slug で change folder と branch を作成する（独自生成しない）
- [ ] D を含める場合: OAuth client_id 未設定時に `SpecRunnerError` throw する

## 振る舞い不変の確認方法（バグ修正のため明示的に変える部分以外）

- 既存 469 tests 全 PASS
- pipeline plumbing（init / login / SSE polling / register_branch / GitHub verification / state transition）の挙動は不変
- code-review-system.ts は touch しない（参照実装として機能している）

## 補足

### 参照リソース

- 失敗 job state: `~/.local/share/specrunner/jobs/1cbe5c5b-80cf-4663-873b-6f61067e79a4.json`
- 失敗時のログ: `/tmp/dogfooding-001-run.log`
- dogfooding 用 request: `/tmp/dogfooding-001-request.md`
- 前 request の cancel-reason: 直前にキャンセルした `agent-prompt-alignment` の cancel-reason.md（worktree 削除済み、git log から refactor/agent-prompt-alignment ブランチの c70512c..8ce4470 で参照可能）
- review-standards: `.claude/rules/review-standards.md`
- learned-patterns: `openspec-workflow/learned-patterns.md`（slug 二重導出 / defensive fallback の項を必ず参照）

### 既存環境（再セットアップ不要）

- `specrunner init` 完了
- `specrunner login` 完了
- `SPECRUNNER_GITHUB_CLIENT_ID` を user shell 側で export 済み

### dogfooding コスト

前回失敗分: $0.5-1。本修正後の e2e 完走想定: +$5-10（propose / spec-review / implementer / verify / code-review × 1-2 iter / pr-create）。
