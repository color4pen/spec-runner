# Design: report tool を alwaysLoad にして ToolSearch 経由の cache 全破棄を止める

## Context

report tool（`report_result`）は SDK MCP server（`createSdkMcpServer`）として登録されているが、`alwaysLoad` を指定していないため deferred loading になっている。

deferred tool は agent が初めてそのツールを使う直前に `ToolSearch` を呼んで schema を取得する。この `ToolSearch` 呼び出しが tools 配列を書き換え、tools 定義は prompt cache の prefix（会話より前）に位置するため、書き換わった時点で prefix 全体が無効化される。

report は run の最終盤に呼ばれるため、context が最大に膨らんだ時点での全量 cache write 再送になる。2026-07-07〜2026-08-05 の集計では opus session 93/99 本（94%）で発生し、無駄になった cache write は 16.10M token（opus の cache write 総量 33.47M の 48%、月 $101 相当）。

**現状コード**:

- `agent-runner.ts:531-533` — `createMcpServerFn({ name, tools })` を呼んでおり `alwaysLoad` を渡していない
- `agent-runner.ts:529` — `this.injectedCreateMcpServerFn` を factory として使用（テスト注入可能）
- `sdk.d.ts:434` — `CreateSdkMcpServerOptions.alwaysLoad?: boolean` が存在し、true で全 tool を常時ロード

## Goals / Non-Goals

**Goals**:

- `createMcpServerFn` に `alwaysLoad: true` を渡し、report tool が deferred にならないようにする
- `alwaysLoad: true` が渡っていることを unit test で固定する
- report server が in-process の SDK MCP server であることを unit test で固定する（外部プロセス起動による 5 秒ブロックが構造上成立しないことを保証）

**Non-Goals**:

- 実 run の transcript 観測（CI 外で人が確認）
- opus/sonnet 挙動差の機序解明
- report tool 以外の MCP server / tool の loading 方針変更
- 起動時間の wall-clock 実測比較

## Decisions

### D1: `createSdkMcpServer` 呼び出しに `alwaysLoad: true` を追加

`agent-runner.ts:531-533` の `createMcpServerFn` 呼び出し箇所に `alwaysLoad: true` を追加する。

**Rationale**: report server が公開する tool は `report_result` 1 つだけ。server 単位の `alwaysLoad: true` は per-tool 指定と等価であり、呼び出し箇所が 1 か所で済む。

**Alternatives considered**:
- per-tool の `tool({ alwaysLoad })`（`sdk.d.ts:431`）— tool が 1 つしかない現状では server 単位と結果が同じで、追う箇所が増えるだけ。将来 report server に tool が複数になり一部だけ deferred にしたい時点で切り替えれば足りる。
- config による切り替え — report tool は全 agent step が run の最後に必ず呼ぶ。deferred にして得をする状況が存在せず、切り替え軸を作っても死蔵枝になる。
- `ToolSearch` を `disallowedTools` に加える — report tool が deferred のままだと schema 取得できず報告不能になる。deferred 解消が先。

### D2: `alwaysLoad: true` が渡ることを unit test で assert

既存の `makeMockCreateMcpServerFn()` / `_createMcpServerFn` 注入経路を使い、受け取った options を捕捉して `alwaysLoad: true` を assert するテストを追加する。`alwaysLoad` を外すと fail することを確認できる。

**Rationale**: 型システムは optional field の省略を咎めない。テストによる固定がなければ将来の編集で `alwaysLoad` が消えても気づかない。

### D3: report server が in-process であることを unit test で固定

`queryOptions.mcpServers` に登録される report server が `createSdkMcpServer` の生成物（`{ type: "sdk", name, instance }` 型）であり、stdio 形式（`command`/`args` を持つ）でも SSE/HTTP 形式（`url` を持つ）でもないことを assert する。

**Rationale**: `alwaysLoad: true` の副作用として SDK doc が挙げる「MCP server の接続完了まで起動が最大 5 秒ブロックされる」は外部プロセス起動またはネットワーク接続を伴う server にのみ生じる。in-process であることを構造として固定しておくことで、将来 report server を外部プロセス化する変更が入れば同じテストが落ちて再検討の契機になる。

## Risks / Trade-offs

**[Risk] turn 1 の prompt に report tool schema が常に載る**

→ sonnet session 実測で `ToolSearch` 直後の cache write は 300〜1,000 token 程度。回避している 166k token（中央値）に対して 3 桁小さく、許容可能。

**[Risk] `alwaysLoad: true` による起動ブロック**

→ D3 で in-process 構造を固定することで緩和。in-process の SDK MCP server に接続待ちが生じる経路は存在しない。

## Open Questions

なし。設計判断は request.md の architect 評価で確定済み。
