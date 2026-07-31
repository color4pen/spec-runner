# request 入口の決定化 — `request prompt` 新設と `request generate` 廃止

## Meta

- **type**: spec-change
- **slug**: deterministic-request-entrance
- **base-branch**: main
- **adr**: true

## 背景

構造 ADR `architecture/adr/2026-07-31-deterministic-request-entrance.md`（accepted）が、`OneShotQueryClient` port の廃止と「LLM 到達境界を job 実行経路に閉じる」決定（D1–D3）を正本化した。本 request はその実装追随であり、`architecture/divergence-status.md` に記録された既知乖離を解消する。

起票の文脈は CLI の外側（利用者の LLM セッション）にあり、CLI の責務は規律・雛形という静的な知識をそこへ渡すことにある（知識注入モデル）。現状の `request generate` は文脈を持たない CLI 内 LLM に雛形を埋めさせる構造で、このモデルと二重になっている。入口を「セッションが書く」に一本化し、CLI は起票知識を静的に提供する。

## 現状コードの前提

- `src/cli/command-registry.ts:389` — `generate` サブコマンド（`--stdin` flag、`ClaudeCodeOneShotQueryClient` を new して `executeCreate` へ渡す）。同ファイルの usage 文字列に `request generate "<text>"` の案内がある
- `src/core/command/request-create.ts:6` — `executeCreate(text, opts, client: OneShotQueryClient)`
- `src/core/request/manager.ts:5,10` — `create` が `generator.generate(text, cwd, client)` を呼ぶ
- `src/core/request/generator.ts:5,20` — `REQUEST_GENERATE_SYSTEM_PROMPT` を import し one-shot query で request.md を生成。`appendInvocation`（usage 記録）を呼ぶ
- `src/prompts/request-generate-system.ts` — 起票の規格知識（必須セクション順序・書式）を内包する system prompt（約 90 行、`buildSystemPrompt` skeleton 使用）
- `src/core/port/one-shot-query-client.ts` / `src/adapter/claude-code/one-shot-query-client.ts` — port とその唯一の実装。**この port の消費者は上記 generate 一本鎖のみ**（他に利用者なし、確認済み）
- `src/core/usage/types.ts:11` — `CommandInvocation.command` union は `"request-review" | "request-generate" | "job"`。`request-review` は廃止済みコマンドの literal 残置（過去 usage データ読み取り互換）の前例
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` — request-generate-system の skeleton を固定するエントリを持つ
- `architecture/components.md` — port 表・adapter 表は既に廃止後の状態を記述（#938）。src が乖離側

## 要件

1. **`request prompt` サブコマンドを新設する**。stdout に、外部 LLM セッションが `specrunner/drafts/<slug>.md` へ request.md を起票するための自己完結プロンプトを 1 枚出力する。内容は (a) 起票規律 — type の選択基準（設計追加を含むなら bug-fix でなく spec-change / new-feature）、受け入れ基準は機械検証可能な文で書き必要な歯を名指しする、スコープ外の明記、外部 SDK/API 制約は起票者が明示する、slug は日付 prefix を付けない — (b) `request template` と同一ソースの雛形 (c) 起票後に `specrunner request validate <file>` で自己検証する指示、の 3 部構成。repo 固有資源（`architecture/` 等）への参照は含めない。LLM 呼び出し・ファイル書き込み・認証・config ロードを伴わない決定的コマンドとする
2. **`request generate` を廃止する**。CLI サブコマンド・usage 案内・`executeCreate`・`manager.create`・`generator.ts`・`request-generate-system.ts`・`OneShotQueryClient` port・claude-code adapter 実装の一本鎖を削除する。`CommandInvocation.command` の `"request-generate"` literal は過去データ読み取り互換のため残置する（`request-review` の前例踏襲）
3. **起票知識の単一ソース化**。request-generate-system.ts が内包していた規格知識（必須セクション・書式）は共有モジュールへ抽出し、`request prompt` と `request template` / `request new` が同一ソースを消費する。知識の二重定義を残さない
4. **B-18 の歯**（ADR-20260731 D3）。`tests/unit/architecture/` に import 検査を追加する: `src/core/request/` および request 系 command 経路（`src/core/command/request-*.ts`）から、LLM 系 port（`AgentRunner` / `SessionClient` / `AnthropicClient`）とその adapter（`src/adapter/claude-code/` / `src/adapter/managed-agent/` / `src/adapter/codex/` / `src/adapter/dispatching/`）への import を禁止する。既存 `core-invariants.test.ts` / `module-boundary.test.ts` の様式に従う
5. **docs 追随**。`docs/request-authoring.md` と CLI usage 文字列から generate を除去し、`request prompt` の位置づけ（セッションへの知識注入）を案内する

## スコープ外

- `request new` / `request template` / `request validate` の挙動変更（知識源の共有化に伴う内部リファクタは可、出力の意味変更は不可）
- pipeline 側 step prompt（`src/prompts/` の他ファイル）の変更
- `architecture/model.md` §4 への B-18 記載（out-of-loop 領域のため pipeline は書き込まない。merge 後に人間が昇格する）
- usage 集計スキーマの変更

## 受け入れ基準

- [ ] B-18 の import 検査テストが `tests/unit/architecture/` に存在し、`src/core/request/` または `src/core/command/request-*.ts` に LLM 系 port / adapter の import を仕込むと red になる（歯の実在を sabotage で確認できる）
- [ ] `request prompt` の stdout に、雛形の必須セクション（Meta / 背景 / 現状コードの前提 / 要件 / スコープ外 / 受け入れ基準）、type 選択規律、`request validate` の自己検証指示が含まれることをテストで固定する
- [ ] `request prompt` が network / LLM / 認証なしで exit 0 する（決定的）ことをテストで固定する
- [ ] 雛形の知識源が単一であること（`request prompt` と `request template` が同一モジュールを消費）を import 構造で保証する
- [ ] `src/` と `docs/` に `OneShotQueryClient` / `request-generate-system` / `request generate` への参照が残らない（`src/core/usage/types.ts` の `"request-generate"` literal のみ例外）
- [ ] prompt-skeleton drift-guard から request-generate エントリが除去され green
- [ ] generate 系テストの削除を除き、既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 入口の知識提供は「静的出力をセッションへ注入」する方式（ADR-20260731 D2）。起票の文脈を持つのはセッション側であり、CLI 内 LLM 生成は文脈欠落と知識出口の二重化を招く
- **採用**: `"request-generate"` literal の残置。廃止済み `request-review` と同じ扱いで過去 usage ファイルの読み取り互換を維持する
- **却下**: generate を headless 生成用に温存 — 消費者が存在せず、起票知識の出口が二重になる（ADR 代替案 1）
- **却下**: `OneShotQueryClient` を汎用 one-shot seam として維持 — 用途の仮置きは port surface を太らせるだけで、必要時に構造 ADR とともに再導入すれば足りる（ADR 代替案 2）
- **却下**: `request prompt` の出力に repo 固有知識を含める — CLI 組み込み prompt は repo 固有資源を参照しない。固有知識は rules 注入で渡す既存原則に従う
