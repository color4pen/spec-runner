# report tool を alwaysLoad にして ToolSearch 経由の cache 全破棄を止める

## Meta

- **type**: bug-fix
- **slug**: report-tool-always-load
- **base-branch**: main
- **adr**: false

## 背景

report tool（`report_result`）は SDK MCP server として登録されているが、`alwaysLoad` を指定していないため deferred loading になっている。agent は完了報告の直前に `ToolSearch` を呼んで schema を取得する必要があり、この呼び出しが tools 配列を書き換える。tools 定義は prompt cache の prefix（会話より前）に位置するため、書き換わった時点で prefix 全体が無効化され、次の turn がその step の全 context を cache write として送り直す。

報告は run の最終盤に起きるので、context が最大に膨らんだ時点での全量再送になる。

2026-07-07 〜 2026-08-05 の SDK transcript 集計では、opus session 99 本のうち 93 本（94%）でこの全破棄が発生し、無駄になった cache write は 16.10M token（opus の cache write 総量 33.47M の 48%）だった。1 session につき厳密に 1 回、中央値 166k token。発生した 93 件すべてで直前の turn が `ToolSearch` を呼んでいる。opus の cache write 単価 $6.25/M で月 $101、1 job あたり $1.08 に相当する。

sonnet session（1,350 本）は同一の `ToolSearch` を呼びながら 1 本しか発生していない。**モデル間の差の機序は未特定である。**ただし引き金が `ToolSearch` であることは 93/93 で一致しており、`ToolSearch` の呼び出し自体をなくせば機序に依存せず解消する。

`ToolSearch` は report tool の schema 取得のためだけに呼ばれている。他の allowedTools は deferred ではないため、report tool を常時ロードにすれば `ToolSearch` を呼ぶ動機が消える。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:531-533` — `createMcpServerFn({ name, tools })` を呼んでおり、`alwaysLoad` を渡していない。
- `src/adapter/claude-code/agent-runner.ts:582-585` — `allowedTools` は `["Read", "Grep", "Glob"]` に report tool の MCP 名を加えた 4 つ。このうち deferred なのは MCP 経由の report tool のみ。
- `src/adapter/claude-code/agent-runner.ts:529` — `createSdkMcpServer` は `this.injectedCreateMcpServerFn` で差し替え可能で、`_createMcpServerFn` として `AgentRunnerDeps` から注入される（`:392`, `:399`, `:429`）。
- `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts:115-119` — `makeMockCreateMcpServerFn()` が既に存在し、`:396` で `_createMcpServerFn` に注入されている。
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:434` — `CreateSdkMcpServerOptions` に `alwaysLoad?: boolean` が存在する。true で「全 tool が常に prompt に含まれ、tool search の裏に deferred されない」。同 `:431` に per-tool の `tool({ alwaysLoad })` も存在する旨の記述がある。

## 要件

1. `agent-runner.ts` の `createMcpServerFn` 呼び出しに `alwaysLoad: true` を渡す。report server が持つ tool は report tool 1 つのみのため、server 単位の指定で足りる。
2. `_createMcpServerFn` に渡る options に `alwaysLoad: true` が含まれることを unit test で固定する。既存の mock 注入経路（`makeMockCreateMcpServerFn` / `_createMcpServerFn`）を使い、渡された options を捕捉して assert する。
3. 設定による切り替えは設けない。常時 true とする。
4. report server が in-process の SDK MCP server であることを unit test で固定する。`alwaysLoad: true` の副作用として SDK doc が挙げる「MCP server の接続完了まで起動が最大 5 秒ブロックされる」は、外部プロセス起動またはネットワーク接続を伴う server にのみ生じる。in-process であることが固定されていれば、この副作用は構造上成立しない。

## スコープ外

- **実 run の transcript 観測による確認**。「修正後の opus session に `ToolSearch` 呼び出しが存在しない」「1 turn 目以外に `cache_read_input_tokens === 0` の turn が出現しない」の 2 点は、`~/.claude/projects/` に残る SDK transcript を修正後の実 run で読まないと確認できず、この request の CI 内では検証できない。本 request は要件 2 の unit test までを完了条件とし、transcript 観測は本 request のマージ後の最初の opus 走行で人が確認する。
- **opus と sonnet で挙動が分かれる機序の解明**。`alwaysLoad: true` は `ToolSearch` の発生自体をなくすため、機序が未特定のままでも解消する。機序の調査は本 request では行わない。
- **report tool 以外の MCP server / tool の loading 方針**。現状 deferred なのは report tool のみ。
- **起動時間（wall-clock）の実測比較**。修正前後の agent 起動時間を計測して比較することは行わない。時間を閾値で assert するテストは実行環境の負荷で揺れ、CI で不安定になる。代わりに要件 4 で「report server が in-process の SDK MCP server であること」を構造として固定する。5 秒ブロックは外部プロセス起動またはネットワーク接続を伴う server の接続待ちであり、in-process であればその待ちが発生する経路自体が存在しない。実測は「速いこと」を毎回確認するのに対し、構造の固定は「遅くなる経路が無いこと」を一度で確認する。

## 受け入れ基準

- [ ] `src/adapter/claude-code/agent-runner.ts` の `createMcpServerFn` 呼び出しが `alwaysLoad: true` を含む
- [ ] `_createMcpServerFn` に渡された options が `alwaysLoad: true` を含むことを assert する unit test が存在し、`alwaysLoad` を外すと fail する
- [ ] report tool が設定されていない step（`ctx.policy?.reportTool` が undefined）では従来通り MCP server を生成しないことが、既存または新規のテストで固定されている
- [ ] `queryOptions.mcpServers` に載る report server が `createSdkMcpServer` の生成物であり、外部プロセス起動を伴う stdio 形式（`command` / `args` を持つ）でも、ネットワーク接続を伴う SSE / HTTP 形式（`url` を持つ）でもないことを assert するテストが存在する
- [ ] `src/adapter/claude-code/__tests__/` の既存テストが無変更で green（report tool の登録経路の振る舞いを変えていないこと）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

**採用: server 単位の `alwaysLoad: true`。**

`createSdkMcpServer` の options に `alwaysLoad: true` を渡す。report server が公開する tool は `report_result` 1 つだけなので、server 単位と per-tool 指定は等価であり、呼び出し箇所が 1 つで済む server 単位を採る。

**却下: per-tool の `tool({ alwaysLoad })`（`sdk.d.ts:431`）。**

tool が 1 つしかない現状では server 単位と結果が同じで、tool 定義側に指定を散らす分だけ読み手が追う箇所が増える。将来 report server に tool が増え、かつ一部だけ deferred にしたくなった時点で切り替えればよい。

**却下: config による切り替え（`alwaysLoad` を設定可能にする）。**

report tool は全 agent step が run の最後に必ず呼ぶ。deferred にして得をする状況が存在しないため、切り替え軸を作っても選ばれない方の枝が死蔵される。設定項目は step ごとの挙動差を生み、cache 挙動の再現性を下げる。

**却下: `ToolSearch` を `disallowedTools` に加える。**

report tool が deferred のままだと schema を取得できず、報告そのものができなくなる。deferred を解消するのが先で、`ToolSearch` の禁止は手段として逆。

**受容するトレードオフ: turn 1 の prompt に report tool の schema が常に載る。**

sonnet session で `ToolSearch` 直後の cache write を実測すると 300〜1,000 token 程度であり、回避している 166k token（中央値）に対して 3 桁小さい。

**確認済みリスク: SDK doc が挙げる「MCP server の接続完了まで起動がブロックされる（上限 5 秒）」。**

report server は `createSdkMcpServer` による in-process の SDK MCP server で、外部プロセス起動もネットワーク接続も伴わない。ブロックは外部 server への接続待ちであるため、in-process である限り待ちが発生する経路が存在しない。

このリスクの扱いとして 2 案を検討した。

**採用: 構造の固定（要件 4）。**「report server が in-process である」ことをテストで assert する。時間に依存しないため CI で安定し、将来 report server を外部プロセス化する変更が入れば同じテストが落ちて再検討の契機になる。

**却下: 起動時間の wall-clock 実測。**修正前後の起動時間を測って比較する案。閾値で assert すると実行環境の負荷で揺れて CI が不安定になり、閾値を緩めれば検出力が無くなる。また実測は測った瞬間の値しか保証せず、後から外部 server 化された場合に検出できない。構造の固定の方が対象期間が長い。
