# `StepContext.repo` フィールドを廃止し空文字ハードコードを構造解消する

## Meta

- **type**: spec-change
- **slug**: codex-agent-runner-repo-ctx
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

`AgentRunner` 3 実装 (Claude / Codex / Managed) のうち、`stepCtx.repo` の埋め込みは現状以下の状態:

- `src/adapter/claude-code/agent-runner.ts:79` → `{ owner: "", name: "" }` 空文字ハードコード
- `src/adapter/codex/agent-runner.ts` → `{ owner: "", name: "" }` 空文字ハードコード
- `src/adapter/managed-agent/agent-runner.ts:315` → `this.repo` で正しく値伝搬

`stepCtx.repo` を実際に読んでいる箇所は **1 箇所のみ** (`src/core/step/spec-review.ts:117`)。それも `repository: ${deps.repo.owner}/${deps.repo.name}` 文字列を組み立てて、`{{REPOSITORY}}` プレースホルダー経由で AI プロンプトの "Repository: <value>" 行 (`src/prompts/spec-review-system.ts:85`) に埋め込んでいるだけ。

プロンプト内で `Repository:` は単なる文脈表示 (Change folder / Request type と同列) であり、AI が repository 名を使って具体的な操作 (API / URL 組み立て / PR 参照) を行う設計にはなっていない。spec-review プロンプトから `Repository:` 行を消しても review の品質は変わらない。

つまり Claude / Codex 経路では AI に `"/"` という壊れた住所が刷り込まれている状態であり、そのために存在する `stepCtx.repo` フィールド自体が責務不明の死蔵状態。

関連 issue: #229

## 目的

`stepCtx.repo` フィールドを削除し、各 runner / spec-review プロンプトから `repo` 連鎖を構造的に取り除く。空文字を埋める / state から流す等の対症療法ではなく、フィールド自体を廃止することで「Claude / Codex 経路で壊れた住所が AI に渡る」実害と「死蔵フィールドが 3 runner に存在する」設計負債を同時解消する。

## 設計判断

1. **`stepCtx.repo` は不要**: 唯一の利用箇所 (spec-review.ts:117) は AI プロンプトの挨拶的文脈表示に値を流しているだけ。spec-runner 内部処理は cwd の git/gh で完結し、ad-hoc な owner/name メタを持ち回る必要は薄い (関連: #247 gh CLI 脱却を見据えた場合も、専用 GitHub クライアントモジュール導入時に再設計すれば十分。本 request の scope では先送り)
2. **AI プロンプトの `Repository:` 行も削除**: フィールド削除と同時にプロンプトから当該行を抜く。spec-review の動作・出力品質に影響しないことは prompt の構造から確認済
3. **`StepContext` 型から `repo: OriginInfo` を削除**: 型定義レベルでフィールドを消す。3 runner の組み立て箇所からも `repo:` を削除する
4. **`state.repository` は維持**: state 永続化側に存在する `JobState.repository` は resume 時の identity / 互換のため触らない。あくまで `StepContext` 層からの削除
5. **`managed-agent` runner の `this.repo` field の扱い**: `stepCtx.repo` への代入が消える結果、`this.repo` の他用途 (e.g. session metadata) が無ければ削除候補。本 request 内で参照を grep し、他参照あれば残し、無ければ削除する

## 要件

### 1. AI プロンプトの `Repository:` 行を削除

`src/prompts/spec-review-system.ts` の `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` (L82-) から `Repository: {{REPOSITORY}}` 行 (L85) を削除する。

L191 の `.replace(/{{REPOSITORY}}/g, input.repository)` も削除する。

`SpecReviewPromptInput` 型 (L103) から `repository: string` フィールド (L105) を削除する。

### 2. spec-review.ts の呼び出し側を更新

`src/core/step/spec-review.ts:117` で `buildSpecReviewInitialMessage()` に渡す引数から `repository: ${deps.repo.owner}/${deps.repo.name}` を削除する。

### 3. `StepContext` 型から `repo` フィールドを削除

`src/core/types.ts:25` の `repo: OriginInfo;` 行を削除する。

`PipelineDeps` は `StepContext` を継承しているため自動的に追従する。

### 4. 各 runner から `repo:` 代入を削除

- `src/adapter/claude-code/agent-runner.ts:79` の `repo: { owner: "", name: "" }` 行を削除
- `src/adapter/codex/agent-runner.ts` の同等行を削除
- `src/adapter/managed-agent/agent-runner.ts:315` の `repo: this.repo` 行を削除

### 5. `managed-agent` の `this.repo` field 整理

`src/adapter/managed-agent/agent-runner.ts` の `this.repo` (L81 declaration) の他用途を grep:

- 他参照なし → field 自体および constructor 引数の `repo` も削除
- 他参照あり (e.g. session metadata 用) → field は残し、`stepCtx` 代入のみ削除

調査結果に応じて削除範囲を判断する (request 修正者の判断、追加質問不要)。

### 6. `OriginInfo` 型と取得ロジックの扱い

`OriginInfo` 型 (`src/core/types.ts` 等で定義) は `state.repository` / preflight などで引き続き使われるため**削除しない**。`StepContext` からの参照のみ消す。

### 7. 呼び出し側のコンパイル整合性

`StepContext.repo` を参照する他箇所が無いことを `grep -rn "stepCtx\.repo" src/` で確認し、検出されたものは個別に対処 (test fixture の生成箇所等が想定対象)。

**注意**: `grep "deps\.repo"` は `src/adapter/managed-agent/agent-runner.ts:87` の `this.repo = deps.repo` (= `ManagedAgentRunnerDeps.repo` 経由、constructor 引数) でヒットする。これは `StepContext.repo` とは別系統で、要件 5 の判断 (= `this.repo` field を維持するか削除するか) に従う。本検証 grep の対象外。

### 8. test

- `bun run typecheck` が通る (型から `repo` が消えても他に影響しない)
- spec-review step の既存 unit test が変更後も pass (Repository 行の有無に依存していないこと)
- 3 runner の既存 unit test が `repo` 削除後も pass
- pipeline-integration test が pass

### 9. spec authority への反映

以下を **MODIFIED** で更新する:

- `specrunner/specs/agent-runner-port/spec.md` (存在すれば): `StepContext` 仕様で `repo` field を持つ記述があれば削除
- `specrunner/specs/spec-review-session/spec.md` (存在すれば): AI プロンプトに repository 情報を渡す記述があれば削除

該当 capability の存在は調査の上、無ければ spec MODIFIED は不要 (ADDED で新規作る必要は無し)。

## スコープ外

- `state.repository` / `JobState.repository` の削除 (resume / identity 用に維持)
- `OriginInfo` 型自体の削除 (preflight / state 経路で利用継続)
- 専用 GitHub クライアントモジュールの導入 (#247 gh CLI 脱却の文脈で別 request)
- `DynamicContext` 全体の解体 (= 動的注入を平文化する方向は別議論。本 request は `repo` フィールド廃止のみ)
- spec-review プロンプトの他要素 (`Change folder` / `Request type` / `Enabled options`) の見直し

## 受け入れ基準

- [ ] `src/prompts/spec-review-system.ts` から `Repository: {{REPOSITORY}}` 行と replace 処理、`repository` 型 field が削除されている
- [ ] `src/core/step/spec-review.ts:117` の `repository:` 引数が削除されている
- [ ] `src/core/types.ts` の `StepContext` から `repo: OriginInfo` が削除されている
- [ ] 3 runner (`claude-code` / `codex` / `managed-agent`) の `stepCtx` 組み立てから `repo:` 代入が削除されている
- [ ] `managed-agent` の `this.repo` field 整理が完了している (他参照 grep 結果に応じて削除 or 維持の判断が記録されている)
- [ ] `grep -rn "stepCtx\.repo" src/` が 0 件 (test fixture 含む)。`deps.repo` パターンは `ManagedAgentRunnerDeps.repo` (managed-agent runner の constructor 引数) でヒットしうるが、これは StepContext.repo とは別系統のため許容範囲
- [ ] `state.repository` / `OriginInfo` 型は維持されている
- [ ] `bun run typecheck && bun run test` が green
- [ ] 該当 spec capability が存在する場合は MODIFIED で更新されている

## Workflow Options

- enabled: []
