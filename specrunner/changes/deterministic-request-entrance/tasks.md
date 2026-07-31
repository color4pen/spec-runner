# Tasks: request 入口の決定化 — `request prompt` 新設と `request generate` 廃止

<!--
実装順序の指針:
  T-01（request prompt 実装）→ T-02（CLI 配線: prompt 追加 / generate 除去）→ T-03（生成一本鎖削除）
  → T-04（B-18 の歯）→ T-05（request prompt テスト）→ T-06（残存参照ガード）
  → T-07（既存テスト整合・生成系テスト削除）→ T-08（docs 追随）→ T-09（最終検証）。
禁止範囲: `request new` / `request template` / `request validate` の出力の意味は不変。
`src/adapter/claude-code/query-one-shot.ts` は削除しない（design.md D5）。
`src/core/usage/types.ts` の `"request-generate"` リテラルは残置する（design.md D4）。
-->

## T-01: `request prompt` の決定的コマンドを実装する

- [ ] `src/core/command/request-prompt.ts` を新設し、同期関数 `executePrompt(): number` を export する。
      内部で 1 枚の起票プロンプト文字列を組み立て、`stdoutWrite`（`src/logger/stdout.js`）で stdout に書き、
      `0` を返す。プロンプト構造テストのため、組み立て純関数（例 `buildRequestPrompt(): string`）を切り出して
      export してもよい。
- [ ] プロンプトは次の 3 部を連結する:
      - (a) 起票規律（散文）: type 選択基準（設計の追加・変更を含むなら bug-fix でなく spec-change / new-feature）、
        受け入れ基準は機械検証可能な文で書き必要な歯を名指しする、スコープ外の明記、
        外部 SDK / API 制約は起票者が明示する、slug は日付 prefix を付けない、
        および出力先が `specrunner/drafts/<slug>.md` である旨。
      - (b) 雛形: `./request.js` から `buildScaffoldTemplate` を import して呼び出した結果を埋め込む
        （title / slug / type はプレースホルダで渡す。独自の雛形本文を再定義しない）。
      - (c) 自己検証指示: 起票後に `specrunner request validate <file>` で検証する指示。
- [ ] LLM 呼び出し・ファイル書き込み・認証・config ロード・ネットワークアクセスを一切行わない。
      `one-shot-query-client` / `loadConfigWithOverlay` / `config/store` / `credentials` 系を import しない。
- [ ] 出力に repo 固有資源（`architecture/` 等）を名指ししない。

**Acceptance Criteria**:
- `executePrompt()` が exit code 0 を返し、stdout に非空文字列を書く。
- 出力は `## Meta` `## 背景` `## 現状コードの前提` `## 要件` `## スコープ外` `## 受け入れ基準` を含む。
- 出力は type 選択規律（設計を含むなら spec-change / new-feature の趣旨）と `specrunner request validate` の
  自己検証指示を含む。
- 出力に `architecture/` が現れない。
- `typecheck` が green。

## T-02: CLI に `request prompt` を配線し `request generate` を除去する

- [ ] `src/cli/command-registry.ts` の `request.subcommands` に `prompt` を追加する
      （flags なし、`requiresRepo` なし、handler は `process.exit(executePrompt())`）。`executePrompt` を import。
- [ ] 同ファイルの `generate` サブコマンド（`src/cli/command-registry.ts:389` 付近）を削除する。
- [ ] USAGE 文字列（`src/cli/command-registry.ts:76` 付近）の `request generate "<text>"` 行を削除し、
      Request commands に `request prompt` の 1 行を追加する。
- [ ] generate 削除で不要になる import を除去する: `executeCreate`（`request-create.js`）、
      `ClaudeCodeOneShotQueryClient`（`adapter/claude-code/one-shot-query-client.js`）、
      `SpecRunnerConfig`（generate handler 専用の unused type import）。`loadConfigWithOverlay` は
      `job ls` 経路で使用継続のため残す。

**Acceptance Criteria**:
- `specrunner request prompt` が exit 0 で起票プロンプトを stdout に出力する。
- `specrunner request generate "<text>"` が `Unknown request subcommand: generate` を stderr に出力し exit 2。
- USAGE に `request generate` が現れず `request prompt` が現れる。
- `typecheck` が green。

## T-03: 生成一本鎖と port / adapter 実装を削除する

- [ ] 次のファイルを削除する:
      `src/core/command/request-create.ts` /
      `src/core/request/generator.ts` /
      `src/prompts/request-generate-system.ts` /
      `src/core/port/one-shot-query-client.ts` /
      `src/adapter/claude-code/one-shot-query-client.ts`。
- [ ] `src/core/request/manager.ts` から `create` 関数と `generator` / `OneShotQueryClient` の import を削除する。
      `list` / `resolve` は残す（`request list` 経路が消費）。
- [ ] `src/core/port/index.ts` の `OneShotQueryClient` / `OneShotQueryOptions` / `OneShotQueryResult`
      re-export 行（`src/core/port/index.ts:5`）を削除する。
- [ ] `src/core/usage/types.ts:11` の `"request-generate"` リテラルは削除しない（過去 usage 読み取り互換）。
- [ ] `src/adapter/claude-code/query-one-shot.ts` は削除しない（design.md D5）。

**Acceptance Criteria**:
- 上記 5 ファイルが存在しない。
- `src/core/request/manager.ts` に `create` / `generator` / `OneShotQueryClient` が現れない。
- `CommandInvocation.command` union に `"request-generate"` が残っている。
- `src/adapter/claude-code/query-one-shot.ts` が存在する。
- `typecheck` が green（全 import 解決）。

## T-04: B-18 の import 検査テスト（歯）を追加する

- [ ] `tests/unit/architecture/` に新テストファイル（例
      `request-entrance-llm-boundary.test.ts`）を追加する。既存 `module-boundary.test.ts` の
      grep-based 様式（`execSync` で `grep -rn` / `grep -rE`、exit code 1 = 0 件 = 成功）に従う。
- [ ] 検査対象スコープ: `src/core/request`（ディレクトリ再帰）および `src/core/command/request-*.ts`（glob）。
- [ ] 禁止 import を各スコープで 0 件であることを検査する:
      - LLM 系 port モジュール: `port/agent-runner`（`AgentRunner`）/ `port/session-client`（`SessionClient`）/
        `port/anthropic-client`（`AnthropicClient`）
      - adapter: `adapter/claude-code/` / `adapter/managed-agent/` / `adapter/codex/` / `adapter/dispatching/`
- [ ] テスト内コメントに「sabotage（入口に該当 import を仕込む）で red になる歯」である旨を明記する。

**Acceptance Criteria**:
- 実装完了状態でテストが green（0 件）。
- `src/core/request/` または `src/core/command/request-*.ts`（例: `request-prompt.ts`）に
  LLM 系 port / adapter の import を 1 行仕込むと当該テストが red になる（sabotage で歯の実在を確認できる）。
- 既存 `core-invariants.test.ts` / `module-boundary.test.ts` は無変更で green。

## T-05: `request prompt` の内容・決定性テストを追加する

- [ ] `request prompt` の出力内容テストを追加する（`executePrompt` / `buildRequestPrompt` を直接呼ぶ）:
      必須 6 セクション名、type 選択規律の文言、`specrunner request validate` 自己検証指示、
      `architecture/` を含まないこと、を固定する。
- [ ] 決定性テストを追加する: `executePrompt()` が exit 0 を返し stdout へ出力すること。加えて
      `src/core/command/request-prompt.ts` のソースが `one-shot-query-client` / `loadConfigWithOverlay` /
      `config/store` / `credentials` を import しないこと（source-level assertion）で
      network / LLM / 認証を伴わないことを固定する。
- [ ] 単一ソーステスト（import 構造）: `request-prompt.ts` が `./request.js` の `buildScaffoldTemplate` を
      import しており独自雛形本文を定義しないこと、`request template`（`executeTemplate`）も同一
      `buildScaffoldTemplate` を消費することを固定する。行動面の裏づけとして、`request prompt` 出力が
      `buildScaffoldTemplate(...)` の出力（雛形本文）を部分文字列として含むことを assert してよい。

**Acceptance Criteria**:
- 内容テストが上記 6 セクション名 + type 規律 + validate 指示の存在を assert して green。
- 決定性テストが exit 0 を assert し、`request-prompt.ts` に LLM / config / 認証 import が無いことを assert して green。
- 単一ソーステストが `request prompt` と `request template` の `buildScaffoldTemplate` 共有を import 構造で assert して green。

## T-06: 残存参照ガードテストを追加する

- [ ] `src/` と `docs/` を対象に `OneShotQueryClient` / `request-generate-system` /
      `request generate`（スペース区切り）を grep し 0 件であることを検査するテストを追加する
      （既存 grep-based 様式に従う。テストファイルは `src/` / `docs/` の外＝`tests/` 配下に置き自己マッチを避ける）。

**Acceptance Criteria**:
- `src/` と `docs/` に上記 3 パターンの参照が 0 件で green。
- `src/core/usage/types.ts` の `"request-generate"` リテラルはこの 3 パターンにマッチせず残存できる。

## T-07: 既存テストを整合させる（生成系テスト削除・参照除去）

- [ ] 生成専用テストを削除する:
      `tests/unit/command/request-create.test.ts` /
      `tests/unit/core/request/generator.test.ts` /
      `tests/prompts/request-generate-system.test.ts`。
- [ ] prompt-skeleton drift-guard（`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`）から
      request-generate エントリを除去する: `REQUEST_GENERATE_SYSTEM_PROMPT` の import（:68）、
      `ALL_15_AGENT_PROMPTS` の該当エントリ（:121）、TC-025 ブロック（:747–770）、列挙コメント（:104）の
      request-generate 記載。TC-028 の `ALL_15_AGENT_PROMPTS.length` 期待を 14 に更新する
      （必要に応じて定数名も 14 を反映するよう更新）。
- [ ] `request-generate-system.ts` を import する prompt-coverage テストから該当エントリを除去する:
      `tests/unit/rules-md.test.ts`（:23 import / :36 エントリ）/
      `tests/unit/prompts/common-context-catch.test.ts`（:23 import / :36 エントリ、および :43 の
      `expect(ALL_AGENT_PROMPTS.length).toBe(11)` を `toBe(10)` に更新する）/
      `tests/unit/prompts/fragment-coverage.test.ts`（:25 import / :40 エントリ）。
- [ ] `tests/unit/cli/removed-commands.test.ts`: `request-create.js` の `vi.mock` 行（:38）を除去し、
      `specrunner request generate` が `Unknown request subcommand: generate` を出力し exit 2 になる TC を追加する
      （既存 TC-36 / TC-41 と同型）。
- [ ] usage テスト（`tests/core/usage/store.test.ts` / `tests/core/usage/usage-summary.test.ts`）は
      `"request-generate"` リテラルを使用するが変更しない（リテラル残置と両立）。

**Acceptance Criteria**:
- 削除した 3 テストファイルが存在しない。
- drift-guard が request-generate エントリ無しで green（TC-028 の count = 14）。
- prompt-coverage 3 テスト・removed-commands テストが green。
- 生成系テスト削除・上記参照除去を除き、既存テストは無変更で green。

## T-08: docs / usage を新入口に追随させる

- [ ] `docs/request-authoring.md` に `request prompt` の案内を追記する: セッションへ起票知識（規律 + 雛形 +
      検証指示）を静的に注入する入口であること、`specrunner request prompt` の出力をセッションに渡して
      `specrunner/drafts/<slug>.md` を起票する運用を案内する。`request generate` は案内しない。
- [ ] CLI usage（T-02 で対応済み）に `request prompt` が案内され `request generate` が無いことを再確認する。

**Acceptance Criteria**:
- `docs/request-authoring.md` に `request prompt` の案内があり `request generate` の案内が無い。
- `docs/` に `OneShotQueryClient` / `request-generate-system` / `request generate` の参照が無い（T-06 と整合）。

## T-09: 最終検証

- [ ] `typecheck && test` を実行し green を確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- B-18 テストの sabotage 確認（T-04）が red を返すことを一度確認してから元に戻す。
