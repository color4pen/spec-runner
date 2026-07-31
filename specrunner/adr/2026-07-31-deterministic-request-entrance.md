# `request prompt` 新設と `OneShotQueryClient` port 廃止 — 入口の決定化

## Status

Accepted (2026-07-31)

## Context

`specrunner/adr/2026-05-22-one-shot-query-client-port.md` が確立した `OneShotQueryClient` port は、
core 層が adapter を直 import する違反を解消するために導入された。この port の消費者は
`request generate` コマンドの生成一本鎖のみであり、それ以外の消費者は存在しない。

`architecture/adr/2026-07-31-deterministic-request-entrance.md`（accepted、D1–D3）が
上位構造決定として以下を確立した:

- **D1（構造）**: `OneShotQueryClient` port を廃止し、port surface を縮小する
- **D2（構造）**: 起票入口の知識提供は「CLI が静的アセットを出力」する方式に一本化する
- **D3（構造）**: B-18 — `src/core/request/` および request 系 command 経路から LLM 系 port /
  adapter への import を禁止し、import 検査テストで強制する

本 ADR はその実装追随として、specrunner CLI コードベース側の設計判断を記録する。

### 廃止前の構造

```
request generate "<text>"
  └─ command-registry (generate handler)
       └─ executeCreate (request-create.ts)
            └─ manager.create (manager.ts)
                 └─ generator.generate (generator.ts)
                      ├─ REQUEST_GENERATE_SYSTEM_PROMPT (request-generate-system.ts)
                      └─ OneShotQueryClient.run() [port]
                           └─ ClaudeCodeOneShotQueryClient (adapter/claude-code/)
                                └─ queryOneShot (query-one-shot.ts)
```

この構造の問題：起票の文脈は CLI の外側（利用者の LLM セッション）にある。
`request generate` は文脈を持たない CLI 内 LLM に雛形を埋めさせており、
「起票知識を静的にセッションへ注入する」知識注入モデルと二重になっていた。
また port surface に one-shot 専用 seam が追加され続ける構造的圧力になっていた。

### 既存の共有関数

雛形は既に `src/core/command/request.ts` の `buildScaffoldTemplate` が単一ソースとして
`executeTemplate`（`request template`）と `executeNew`（`request new`）で消費されていた。

## Decision

### D1: `request prompt` は決定的な静的出力コマンドとして新設する

新モジュール `src/core/command/request-prompt.ts` を追加し、同期関数 `executePrompt(): number` を
export する。`executePrompt` は以下の 3 部構成のプロンプトを stdout へ書き、0 を返す:

- (a) **起票規律** — type 選択基準（設計変更を含む場合は bug-fix より spec-change / new-feature）、
  受け入れ基準の書き方（機械検証可能・歯の名指し）、スコープ外の明記、
  外部 SDK/API 制約の明示義務、slug の日付 prefix 禁止
- (b) **雛形** — `buildScaffoldTemplate(...)` が生成する雛形本文（`request template` と同一ソース）
- (c) **自己検証指示** — `specrunner request validate <file>` で自己検証する指示

CLI 側は `request.subcommands.prompt` を追加し、handler は `process.exit(executePrompt())` のみ
（flags なし、`requiresRepo` なし、config ロードなし、client 生成なし）。

出力には repo 固有資源（`architecture/` 等）を名指ししない。

### D2: 雛形の知識源は `buildScaffoldTemplate` に単一化する

雛形本文（必須セクション・書式）の単一ソースは `src/core/command/request.ts` の
`buildScaffoldTemplate`（現状位置のまま、移動しない）とする。`request-prompt.ts` は
`./request.js` から `buildScaffoldTemplate` を import して消費し、独自の雛形本文を再定義しない。

`request-generate-system.ts` が内包していた「必須セクション順序・書式」の知識は
`buildScaffoldTemplate` を経由する `request prompt` の出力に収束させ、二重定義を排除する。

単一性の歯: `request-prompt.ts` が `buildScaffoldTemplate` を `./request.js` から
import することを unit test（import 構造検査）で固定する。

### D3: 生成一本鎖と port / adapter 実装を削除する

削除対象:

| ファイル | 説明 |
|---|---|
| `src/core/command/request-create.ts` | `executeCreate` |
| `src/core/request/generator.ts` | `generate` / `buildGeneratePrompt` |
| `src/prompts/request-generate-system.ts` | 生成 system prompt |
| `src/core/port/one-shot-query-client.ts` | port interface |
| `src/adapter/claude-code/one-shot-query-client.ts` | `ClaudeCodeOneShotQueryClient` |

編集対象:

- `src/core/request/manager.ts` — `create` / `generator` / `OneShotQueryClient` import を削除。
  `list` / `resolve` は残す。
- `src/core/port/index.ts` — `OneShotQueryClient` 系 re-export 行を削除。
- `src/cli/command-registry.ts` — `generate` サブコマンド・USAGE 行・`executeCreate` /
  `ClaudeCodeOneShotQueryClient` import を削除。

### D4: `"request-generate"` usage リテラルは残置する

`src/core/usage/types.ts` の `CommandInvocation.command` union の `"request-generate"` は
削除しない。過去の usage.json（`request-generate` エントリを含む）の読み取り互換を維持する。
廃止済み `"request-review"` リテラルが同 union に残置されている前例に倣う。

### D5: `queryOneShot`（adapter 内部実行基盤）は削除しない

`src/adapter/claude-code/query-one-shot.ts` は本 change の削除対象に含めない。
この関数は port の型に依存せず独自型を定義しており、port 削除で type エラーにならない。
削除すると独自 unit test 群（`query-one-shot.test.ts` / `provider-sdk-loader.test.ts`）の
削除と CODEOWNERS-gated な `arch-allowlist.ts` の編集を誘発し、「generate 系テスト削除を
除き既存テスト無変更」要件に反する。

`ClaudeCodeOneShotQueryClient` 削除後、`queryOneShot` は production 未参照（test からのみ
参照）となる。これは B-18 に違反しない — B-18 は `src/core/request/` と
`src/core/command/request-*.ts` からの import edge を禁じるものであり、
adapter 層に休眠関数が残ること自体は禁じない。

### D6: B-18 の歯を `tests/unit/architecture/` に追加する

新テスト `tests/unit/architecture/request-entrance-llm-boundary.test.ts` を追加する。
既存 `core-invariants.test.ts` / `module-boundary.test.ts` の grep-based 様式に従い、
以下の 2 スコープ × 7 パターンの import を 0 件であることを検査する:

スコープ:
- `src/core/request/`（ディレクトリ配下）
- `src/core/command/request-*.ts`（glob）

禁止 import パターン:
- LLM 系 port: `port/agent-runner` / `port/session-client` / `port/anthropic-client`
- adapter: `adapter/claude-code/` / `adapter/managed-agent/` / `adapter/codex/` / `adapter/dispatching/`

sabotage（入口へ該当 import を仕込む）で red になることを受け入れ基準とする。

## Alternatives Considered

### Alternative 1: `request generate` を headless 生成用に温存する

`request generate` を CI / headless 環境でのバッチ起票用に残す。

- **Pros**: 既存スクリプトとの互換性を維持できる
- **Cons**: `OneShotQueryClient` の消費者が引き続き存在し port surface の縮小が阻害される。
  起票知識の出口が「CLI 内 LLM 生成」と「セッションへの静的注入」に二重化される。
  headless 消費者は現実には存在しない（確認済み）
- **Why not**: 仮想の将来用途のために port surface を太らせることは、
  必要時に構造 ADR とともに再導入できる構造を選ぶ方針に反する

### Alternative 2: `OneShotQueryClient` を汎用 one-shot seam として維持する

port interface を残し、将来の one-shot 用途（テスト生成など）の基盤として温存する。

- **Pros**: 将来の one-shot 用途に再利用できる
- **Cons**: 現時点の消費者ゼロでの port 維持はインターフェース表面のみを肥大化させる。
  「port は消費者ゼロになった時点で廃止候補」という原則（`2026-05-31-structure-rulings.md`）に反する
- **Why not**: 必要時に構造 ADR とともに再導入すれば足りる

### Alternative 3: `request prompt` の出力に repo 固有知識を含める

出力プロンプトに `architecture/` へのパスや repo 固有の規律を組み込む。

- **Pros**: 起票者が repo 固有の文脈を別途取得する手間が省ける
- **Cons**: CLI 組み込み prompt が repo 固有資源を参照する構造になり、
  「CLI 組み込み prompt は repo 固有資源を参照しない。固有知識は rules 注入で渡す」
  既存原則（`project_no_project_local_refs_in_cli`）に違反する
- **Why not**: 固有知識は rules 注入で渡す既存原則を踏襲する

### Alternative 4: 雛形を新規 leaf モジュールへ移設し 3 者が import する

`buildScaffoldTemplate` を新モジュール（例: `src/core/request/scaffold.ts`）へ移設し、
`request prompt` / `request template` / `request new` の三者が import する。

- **Pros**: 雛形の単一ソース性が import 構造から一目瞭然になる
- **Cons**: 移設により `tests/unit/core/command/request.test.ts` の import 元変更が必要になり
  「既存テスト無変更」要件に反する。`buildScaffoldTemplate` は既に
  `src/core/command/request.ts` で共有されており追加の移設は不要
- **Why not**: 既存共有点の再利用が最小変更で単一ソースを保てる

## Consequences

### Positive

- port surface が縮小し、claude-code adapter が実装する port は `AgentRunner` のみになる
  （上位 ADR D1 の達成）
- 起票入口から LLM 呼び出し・認証・config ロードが除去され、install 直後でも起票フローが完結する
- B-18 import 検査テスト（14 件）により、入口への LLM 系 import が机上ミスとして混入しても
  機械的に検出される
- `request-generate-system.ts` の廃止により、雛形の知識出口が `buildScaffoldTemplate` に
  統一される（知識の二重定義が解消される）
- `OneShotQueryClient` の創設 ADR（2026-05-22）に対称する廃止記録が残る

### Negative / Trade-offs

- headless の request 生成が不可能になる（ADR で受容済み）
- `src/adapter/claude-code/query-one-shot.ts`（`queryOneShot`）が production 未参照の
  dead code として残る（D5 の意図的なスコープ境界）

### Known Gaps / Future Work

- `architecture/model.md` §4 への B-18 記載（out-of-loop 領域のため本 change では行わない。
  merge 後に人間が昇格する）
- `queryOneShot` の将来的な撤去は one-shot 用途が消滅確定した時点で別 request で行う

## References

- Request: `specrunner/changes/deterministic-request-entrance/request.md`
- Design: `specrunner/changes/deterministic-request-entrance/design.md`
- Spec: `specrunner/changes/deterministic-request-entrance/spec.md`
- Architecture ADR（上位正本）: `architecture/adr/2026-07-31-deterministic-request-entrance.md`
- Related（port 創設）: `specrunner/adr/2026-05-22-one-shot-query-client-port.md`
- Related（port 廃止の傍証）: `specrunner/adr/2026-05-31-structure-rulings.md`
- Related（知識注入モデル）: `specrunner/adr/2026-05-21-rules-md-cli-embed.md`
