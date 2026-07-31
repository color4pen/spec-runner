# Design: request 入口の決定化 — `request prompt` 新設と `request generate` 廃止

## Context

構造 ADR `architecture/adr/2026-07-31-deterministic-request-entrance.md`（accepted）が
`OneShotQueryClient` port の廃止と「LLM 到達境界を job 実行経路に閉じる」決定（D1–D3）を正本化した。
本 change はその実装追随であり、`architecture/divergence-status.md:12` に記録された既知乖離
（`components.md` は廃止後の port surface を記述するが src には port・adapter 実装・生成一本鎖が残存）を解消する。

起票の文脈は CLI の外側（利用者の LLM セッション）にあり、CLI の責務は規律・雛形という静的な知識を
そこへ渡すこと（知識注入モデル）。現状の `request generate` は文脈を持たない CLI 内 LLM に雛形を
埋めさせる構造で、このモデルと二重になっている。入口を「セッションが書く」に一本化し、CLI は起票知識を
静的に提供する。

現状コード（検証済み）:

- `src/cli/command-registry.ts:389` — `generate` サブコマンド（`ClaudeCodeOneShotQueryClient` を new して
  `executeCreate` へ渡す）。`src/cli/command-registry.ts:76` の USAGE に `request generate "<text>"` の案内。
- 生成一本鎖: `command-registry(generate)` → `executeCreate`（`src/core/command/request-create.ts`）→
  `manager.create`（`src/core/request/manager.ts`）→ `generator.generate`（`src/core/request/generator.ts`）→
  `OneShotQueryClient`（port: `src/core/port/one-shot-query-client.ts`、impl:
  `src/adapter/claude-code/one-shot-query-client.ts`）。生成 system prompt は
  `src/prompts/request-generate-system.ts`。
- 雛形は既に共有関数 `buildScaffoldTemplate`（`src/core/command/request.ts`）を `request template`
  （`executeTemplate`）と `request new`（`executeNew`）が消費している。
- port の消費者は上記生成一本鎖のみ（`OneShotQueryClient` を import する production ファイルは
  command-registry / request-create / manager / generator / port の一本鎖と barrel `src/core/port/index.ts:5`）。
- `src/adapter/claude-code/query-one-shot.ts`（`queryOneShot`）は adapter 内部実行基盤で、port の型に依存せず
  独自の `QueryOneShotOptions` / `QueryOneShotResult` を定義し `ModelUsage` のみを core から import する。
  production 消費者は `ClaudeCodeOneShotQueryClient` 一箇所のみだが、独自の unit test 群
  （`tests/unit/adapter/claude-code/query-one-shot.test.ts` / `tests/unit/adapter/provider-sdk-loader.test.ts`）を持つ。

## Goals / Non-Goals

**Goals**:

- 決定的な `request prompt` サブコマンドを新設し、起票知識（規律 + 雛形 + 検証指示）を静的に stdout へ出力する。
- `request generate` とその一本鎖（port・adapter impl 含む）を削除する。
- 雛形の知識源を単一（`buildScaffoldTemplate`）に保ち、`request prompt` もそれを消費する。
- B-18（入口の LLM 系 port / adapter import 禁止）の歯を `tests/unit/architecture/` に実装する。
- docs / CLI usage を新入口に追随させる。

**Non-Goals**:

- `request new` / `request template` / `request validate` の出力の意味変更（知識源共有化に伴う内部リファクタは可）。
- pipeline 側 step prompt（`src/prompts/` の他ファイル）の変更。
- `architecture/model.md` §4 への B-18 記載（out-of-loop。merge 後に人間が昇格する）。
- usage 集計スキーマの変更（`"request-generate"` リテラルは残置）。
- `src/adapter/claude-code/query-one-shot.ts`（`queryOneShot`）の削除（D5 参照）。

## Decisions

### D1: `request prompt` は決定的な静的出力コマンドとして新設する

新モジュール `src/core/command/request-prompt.ts` を追加し、同期関数 `executePrompt(): number` を export する。
`executePrompt` は起票規律（散文）+ `buildScaffoldTemplate(...)` の雛形 + `request validate` 自己検証指示を
連結した 1 枚のプロンプトを stdout へ書き、0 を返す。CLI 側は `request.subcommands.prompt` を追加し、
handler は `process.exit(executePrompt())` のみ（flags なし、`requiresRepo` なし、config ロードなし、
client 生成なし）。

- **Rationale**: ADR D2「入口が提供する知識は CLI が静的アセットとして所有し、出力するのみ」に対応。
  config ロード・認証・LLM を入口から外すことで、install 直後（`init`/`login` 前）でも起票フローが完結する。
- **type 引数は取らない**: type の選択は (a) の規律に従いセッションが判断する。雛形の type フィールドは
  プレースホルダ（`request template` が title / slug をプレースホルダで出力するのと同型）で渡す。
- **repo 固有資源を参照しない**: 出力に `architecture/` 等を名指ししない（既存の
  「CLI 組み込み prompt は repo 固有資源を参照しない」原則を踏襲）。
- **Alternatives considered**:
  - generate を headless 生成用に温存 — 消費者が存在せず起票知識の出口が二重化するため却下（ADR 代替案 1）。
  - 出力に repo 固有知識を含める — 固有知識は rules 注入で渡す既存原則に反するため却下（ADR 代替案）。

### D2: 雛形の知識源は `buildScaffoldTemplate` に単一化する

雛形本文（必須セクション・書式）の単一ソースは `src/core/command/request.ts` の `buildScaffoldTemplate`
（現状のまま、移動しない）。`request prompt`（`request-prompt.ts`）はこれを `./request.js` から import して
消費する。`request-generate-system.ts` が内包していた「必須セクション順序・書式」の知識は、
この雛形へ収束させ二重定義を残さない。

- **Rationale**: 雛形は既に `executeTemplate` / `executeNew` が `buildScaffoldTemplate` を共有しているため、
  同一関数を `executePrompt` も消費すれば単一ソースが保たれる。新たな抽出モジュールを設けるより既存共有点を
  再利用する方が知識の重複を増やさない。
- **単一性の歯**: `request-prompt.ts` が `buildScaffoldTemplate` を `./request.js` から import すること、
  および独自雛形を定義しないことを import 構造テストで固定する（受け入れ基準の「同一モジュール消費」に対応）。
- **Alternatives considered**: 雛形を新規 leaf モジュールへ移設し 3 者が import する案 — 移設は
  `tests/unit/core/command/request.test.ts` の import 元変更を招き「既存テスト無変更」に反するため却下。

### D3: 生成一本鎖と port / adapter impl を削除する

削除:

- `src/core/command/request-create.ts`（`executeCreate`）
- `src/core/request/generator.ts`（`generate` / `buildGeneratePrompt`）
- `src/prompts/request-generate-system.ts`
- `src/core/port/one-shot-query-client.ts`（port）
- `src/adapter/claude-code/one-shot-query-client.ts`（`ClaudeCodeOneShotQueryClient`）

編集:

- `src/core/request/manager.ts` — `create` と `generator` / `OneShotQueryClient` の import を削除。
  `list` / `resolve`（`request list` 経路が消費）は残す。
- `src/core/port/index.ts:5` — `OneShotQueryClient` / `OneShotQueryOptions` / `OneShotQueryResult` の
  re-export 行を削除（barrel の他の消費者なし）。
- `src/cli/command-registry.ts` — `generate` サブコマンドを削除、`executeCreate` /
  `ClaudeCodeOneShotQueryClient` / `SpecRunnerConfig`（generate handler 専用の unused import）を削除、
  USAGE の `request generate` 行を削除。

- **Rationale**: ADR D1「port surface を 5 つに縮小し、claude-code adapter が実装する port は
  `AgentRunner` のみにする」。port は生成一本鎖専用 seam であり、他の消費者がない。
- **Alternatives considered**: `OneShotQueryClient` を汎用 one-shot seam として維持 — 用途の仮置きは
  port surface を太らせるだけで、必要時に構造 ADR とともに再導入すれば足りるため却下（ADR 代替案 2）。

### D4: `"request-generate"` usage リテラルは残置する

`src/core/usage/types.ts:11` の `CommandInvocation.command` union の `"request-generate"` は削除しない。

- **Rationale**: 過去の usage.json（`request-generate` エントリを含む）の読み取り互換を維持する。
  廃止済み `"request-review"` リテラルが同 union に残置されている前例に倣う。usage 集計スキーマは変更しない。

### D5: `queryOneShot`（adapter 内部実行基盤）は削除しない

`src/adapter/claude-code/query-one-shot.ts` は本 change の削除対象に含めない。

- **Rationale**: ADR（`構造的含意`）と request 要件 2 が列挙する削除対象は「port + claude-code adapter 実装
  （＝ `one-shot-query-client.ts`）+ core 一本鎖」であり、`query-one-shot.ts` は enumerated chain に含まれない。
  `queryOneShot` は port の型に依存せず独自型を定義するため、port 削除で type エラーにならない。
  削除すると独自 unit test 群（`query-one-shot.test.ts` / `provider-sdk-loader.test.ts`）の削除と
  CODEOWNERS-gated な `arch-allowlist.ts:360`（`CWD-query-one-shot-di-default`）の編集を誘発し、
  「generate 系テスト削除を除き既存テスト無変更」に反する。
- **帰結**: `ClaudeCodeOneShotQueryClient` 削除後、`queryOneShot` は production 未参照となる（test からのみ参照）。
  これは B-18 に違反しない — B-18 は `src/core/request/` と `src/core/command/request-*.ts` からの import edge を
  禁じる不変条件であり、adapter 層に休眠関数が残ること自体は禁じない。LLM 到達境界（import edge）は入口から消える。
- **Alternatives considered**: `query-one-shot.ts` も削除して adapter を最小化 — スコープ外の test 削除と
  allowlist 編集を招くため却下。将来 one-shot 用途が消滅確定した時点で別 request で撤去する。

### D6: B-18 の歯を `tests/unit/architecture/` に追加する

新テスト（例: `tests/unit/architecture/request-entrance-llm-boundary.test.ts`）を追加する。
既存 `core-invariants.test.ts` / `module-boundary.test.ts` の grep-based 様式に従い、
`src/core/request/`（ディレクトリ）および `src/core/command/request-*.ts`（glob）を対象に、
次の import を 0 件であることを検査する:

- LLM 系 port: `agent-runner`（`AgentRunner`）/ `session-client`（`SessionClient`）/
  `anthropic-client`（`AnthropicClient`）
- adapter: `adapter/claude-code/` / `adapter/managed-agent/` / `adapter/codex/` / `adapter/dispatching/`

- **Rationale**: ADR D3 が B-18 の歯の実装を本 change に委ねている。sabotage（入口へ該当 import を仕込む）で
  red になることが受け入れ基準。
- **注意**: `request-*.ts` glob は `request.ts`（ハイフンなし）を含まないが、request 要件がこの pattern を
  明示しているため踏襲する。`request.ts`（`executeTemplate` / `executeValidate`）も入口だが LLM import を
  持たないため実害はない。

### D7: 残存参照ガードと docs / usage 追随

- 残存参照ガードテスト: `src/` と `docs/` を対象に `OneShotQueryClient` / `request-generate-system` /
  `request generate`（スペース区切りの CLI 起動形）を grep し 0 件を検査する。これら 3 パターンは
  `src/core/usage/types.ts` の `"request-generate"`（ハイフン、system 無し、スペース無し）にはマッチしないため
  D4 の残置と両立する。
- `docs/request-authoring.md` に `request prompt`（セッションへの起票知識注入）の案内を追記する。
  現状 generate の記述は無いため主作業は追記。
- CLI usage に `request prompt` を Request commands として列挙する。

## Risks / Trade-offs

- **[Risk] `request generate` を import/mock する既存テストが壊れる** → 生成専用テスト
  （`tests/unit/command/request-create.test.ts` / `tests/unit/core/request/generator.test.ts` /
  `tests/prompts/request-generate-system.test.ts`）は削除。`request-generate-system.ts` を import する
  prompt-coverage テスト（drift-guard / `tests/unit/rules-md.test.ts` /
  `tests/unit/prompts/common-context-catch.test.ts` / `tests/unit/prompts/fragment-coverage.test.ts`）は
  当該エントリのみ除去。`tests/unit/cli/removed-commands.test.ts` の `request-create.js` mock 行を除去し、
  `request generate` の未知サブコマンド TC を追加。これらは削除モジュールへの参照除去という機械的追随であり、
  drift-guard の受け入れ基準が同種の編集を明示的に要求している。

- **[Risk] `queryOneShot` が production 未参照の dead code として残る** → D5 の通り意図的なスコープ境界。
  exported 関数かつ test から参照されるため typecheck / lint / coverage を破らない。将来別 request で撤去可能。

- **[Risk] drift-guard の `ALL_15_AGENT_PROMPTS`（15 前提）が 14 になり count assertion が壊れる** →
  エントリ除去に合わせて TC-028 の length 期待を 14 へ更新し、列挙コメントから request-generate を除く
  （必要なら定数名も 14 を反映するよう更新）。PIPELINE_MAP（16 step）は request-generate を含まないため無影響。

- **[Trade-off] headless の request 生成が不可能になる** → ADR で受容済み。必要時は port 再設計 + 構造 ADR を要する。

## Open Questions

なし（設計判断は ADR と request の architect 評価で確定済み）。
