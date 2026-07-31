# Spec: request 入口の決定化 — `request prompt` 新設と `request generate` 廃止

構造 ADR `architecture/adr/2026-07-31-deterministic-request-entrance.md`（accepted, D1–D3）の
実装追随。本 spec は「何を出力するか」の振る舞い（コマンドの新設・廃止・出力契約）を定義する。
層・port・依存方向は ADR が正典で、B-18 の歯（import 検査）は本 change で実装する。

## Requirements

### Requirement: `request prompt` は決定的な起票プロンプトを stdout に出力する

CLI は `specrunner request prompt` サブコマンドを提供し、外部 LLM セッションが
`specrunner/drafts/<slug>.md` へ request.md を起票するための自己完結プロンプトを 1 枚、
stdout に出力して exit 0 を返す MUST。このコマンドは LLM 呼び出し・ファイルシステムへの書き込み・
認証・config ロード・ネットワークアクセスを一切伴わない決定的コマンドである MUST。

出力プロンプトは次の 3 部で構成される MUST:

- (a) **起票規律** — 少なくとも次を含む:
  - type の選択基準（設計の追加・変更を含むなら bug-fix でなく spec-change / new-feature を選ぶ）
  - 受け入れ基準は機械検証可能な文で書き、必要な歯（テスト・検査）を名指しする
  - スコープ外を明記する
  - 外部 SDK / API の制約は起票者が明示する
  - slug は日付 prefix（`YYYY-MM-DD-`）を付けない
- (b) **雛形** — `request template` と同一ソース（`buildScaffoldTemplate`）が生成する雛形本文。
  必須セクション `## Meta` / `## 背景` / `## 現状コードの前提` / `## 要件` / `## スコープ外` /
  `## 受け入れ基準` を含む。
- (c) **自己検証指示** — 起票後に `specrunner request validate <file>` で自己検証する指示。

出力は repo 固有資源（`architecture/` 等）を名指ししない MUST。

#### Scenario: request prompt が必須セクションと規律と検証指示を出力する

**Given** `request prompt` の出力文字列（`executePrompt` / `buildRequestPrompt` の生成結果）
**When** テストが出力文字列を検査する
**Then** 出力は `## Meta` `## 背景` `## 現状コードの前提` `## 要件` `## スコープ外` `## 受け入れ基準` の
6 セクション名、type 選択規律の文言、`specrunner request validate` の自己検証指示を部分文字列として含む

#### Scenario: request prompt が認証・ネットワークなしで決定的に完了する

**Given** 認証情報も config も存在しない環境
**When** `specrunner request prompt` を実行する（`executePrompt()` を呼ぶ）
**Then** LLM 呼び出し・認証・config ロード・ファイル書き込みを伴わずに stdout へ出力し exit 0 を返す

### Requirement: 雛形の知識源は単一である

`request prompt` と `request template`（および `request new`）は、雛形本文を生成する単一の共有関数
`buildScaffoldTemplate`（`src/core/command/request.ts`）を消費する MUST。雛形の必須セクション・書式の
知識を二重に定義してはならない。

#### Scenario: request prompt と request template が同一の雛形ソースを消費する

**Given** `request prompt` コマンドモジュールと `request template` コマンドモジュールのソース
**When** テストが両者の import 構造を検査する
**Then** 両者は同一モジュール（`src/core/command/request.ts`）の `buildScaffoldTemplate` を import しており、
`request prompt` は独自の雛形本文を再定義していない

### Requirement: `request generate` とその一本鎖は廃止される

CLI サブコマンド `request generate`、その usage 案内、および実装の一本鎖
（`executeCreate` / `manager.create` / `generator.ts` / `request-generate-system.ts` /
`OneShotQueryClient` port / claude-code adapter 実装）は削除される MUST。
`specrunner request generate` の起動は「未知のサブコマンド」として拒否される MUST。

過去 usage データ読み取り互換のため、`CommandInvocation.command` union の `"request-generate"`
リテラル（`src/core/usage/types.ts`）は残置する MUST（廃止済み `"request-review"` の前例踏襲）。

#### Scenario: request generate が未知サブコマンドとして拒否される

**Given** restructure 後の CLI
**When** `specrunner request generate "<text>"` を実行する
**Then** stderr に `Unknown request subcommand: generate` を出力し exit 2 で終了する

#### Scenario: 廃止シンボルへの参照が src / docs に残らない

**Given** `src/` および `docs/` 配下の全ファイル
**When** テストが `OneShotQueryClient` / `request-generate-system` / `request generate` の参照を grep する
**Then** いずれの参照も 0 件である（`src/core/usage/types.ts` の `"request-generate"` リテラルのみ例外）

### Requirement: request 系入口は LLM 系 port / adapter を import しない（B-18 の歯）

`src/core/request/` 配下、および request 系 command 経路（`src/core/command/request-*.ts`）は、
LLM 系 port（`AgentRunner` / `SessionClient` / `AnthropicClient`）およびその adapter
（`src/adapter/claude-code/` / `src/adapter/managed-agent/` / `src/adapter/codex/` /
`src/adapter/dispatching/`）を import しない MUST。この不変条件は `tests/unit/architecture/` の
import 検査テスト（歯）で強制される MUST。

> `model.md` §4 への B-18 昇格は out-of-loop 領域のため本 change では行わない（merge 後に人間が昇格する）。

#### Scenario: 入口に LLM 系 import を仕込むと red になる

**Given** B-18 の import 検査テスト
**When** `src/core/request/` または `src/core/command/request-*.ts` のいずれかに LLM 系 port / adapter の
import を追加する（sabotage）
**Then** import 検査テストが red になる

### Requirement: docs と CLI usage が新しい入口を案内する

`docs/request-authoring.md` と CLI usage 文字列は `request generate` の案内を含まず、
`request prompt` の位置づけ（起票知識をセッションへ静的に注入する入口）を案内する MUST。

#### Scenario: usage と docs に generate 案内が残らず prompt が案内される

**Given** `src/cli/command-registry.ts` の USAGE 文字列と `docs/request-authoring.md`
**When** テスト / レビューが両者を検査する
**Then** `request generate` の案内が存在せず、`request prompt` が Request commands に列挙され、
docs が `request prompt` の知識注入としての位置づけを案内している
