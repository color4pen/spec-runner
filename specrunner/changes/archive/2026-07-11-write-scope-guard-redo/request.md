# claude-code adapter の workspace write guard を実測済み構成で再実装する（#766 redo）

## Meta

- **type**: spec-change
- **slug**: write-scope-guard-redo
- **base-branch**: main
- **adr**: true

## 背景

#766（file-tool-write-scope）は Edit / Write の workspace 外書き込みを canUseTool で deny する guard を導入したが、`permissionMode: "dontAsk"` の意味論誤認（「pre-approve されていない tool を canUseTool に聞かずに deny する」モードであることの見落とし）により、(a) report_result MCP tool が SDK 層で deny され全 run が escalation 停止、(b) Edit / Write は allowedTools で pre-approve 済みのため canUseTool が一度も発火せず guard は無効、という二重欠陥のまま merge され、#768 で revert された。失敗の詳細は `specrunner/changes/archive/2026-07-10-file-tool-write-scope/` に記録されている。

本 request は revert 後の再実装である。前回の根本原因が「SDK 挙動の静的読解を『実測』と記録した」ことにあるため、**今回は SDK 挙動を事前に probe で実測済み**であり（下記「SDK 実測事実」）、implementer はこの事実を再認定せず、再現確認と実装に集中する。加えて probe スクリプトを成果物として repo に残し、同種の再発（外部 SDK への主張が検証なしでゲートを通過する）を防ぐ。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:349-351` — step agent の query options は `allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]` / `disallowedTools: ["Agent", "Task"]` / `permissionMode: "bypassPermissions"`（#768 revert 後の状態）
- 同ファイル — `sandbox: buildWorkspaceSandbox(cwd)` は導入済み（#761）だが `allowUnsandboxedCommands` は未設定 = `dangerouslyDisableSandbox` escape hatch は現在有効
- 同ファイル 343-369 — reportTool 構成時、`createSdkMcpServer({ name: "specrunner_report", tools: [{ name: toolSpec.name, ... }] })` で MCP server を作り query options の `mcpServers.specrunner_report` に渡す。tool 名は `ctx.policy.reportTool.name` から動的
- `tests/unit/adapter/claude-code/agent-runner.test.ts` — TC-023 で `permissionMode === "bypassPermissions"` を凍結中（本 request で意図的に更新する唯一の既存 assertion）
- `tests/unit/adapter/claude-code/query-one-shot.test.ts` — one-shot 系の凍結テスト（sandbox なし・bypassPermissions）は #768 でも保持済み。one-shot は本 request でも不変
- `specrunner/reviewers/cross-boundary-invariants.md:4-8` — paths は `src/core/pipeline/**, src/core/step/**, src/state/**, src/store/**` のみで、#766 のような adapter 層の変更には発火しない

## SDK 実測事実（@anthropic-ai/claude-agent-sdk ^0.2.128、2026-07-10 に実 query の probe で確定済み。再認定不要）

1. `bypassPermissions`: canUseTool は**一度も呼ばれない**（全 tool 自動許可）
2. `dontAsk`: allowedTools に無い tool を **canUseTool に委譲せず deny** する（deny message: "denied because Claude Code is running in don't ask mode"）。headless runner に不適
3. `default` + tool が allowedTools に**無い**: canUseTool が permission handler として**発火する**。headless でもハングせず、deny 時は `{behavior: "deny", message}` の message が agent に届き、agent は継続できる
4. allowedTools に載せた tool は pre-approve され **canUseTool を素通りする**（= guard を効かせたい tool を allowedTools に載せてはならない）
5. in-process MCP tool の許可名は `mcp__<serverName>__<toolName>` 形式（例: `mcp__specrunner_report__report_result`）。allowedTools に載せれば `default` モードで pre-approve され即実行される
6. 検証済み構成（3 シナリオ green）: `default` + allowedTools=[Read, Bash, Grep, Glob, MCP report tool 名] + canUseTool=workspace guard で、(i) workspace 外 Write → canUseTool 発火・deny・ファイル書き込みなし、(ii) workspace 内 Write → 発火・allow・書き込み成功、(iii) report_result → 即実行

## 要件

1. step agent の query options を検証済み構成に変更する: `permissionMode: "default"`、`allowedTools` から `Edit` / `Write` を除外し、reportTool 構成時は `mcp__specrunner_report__<toolSpec.name>` を allowedTools に追加する
2. `canUseTool` に workspace guard を設定する: `Edit` / `Write` の `file_path` が cwd 配下の外を指す場合に deny（message は worktree 内で作業すべき旨を含む）、それ以外の tool・workspace 内 Edit/Write はすべて allow。非 string / 欠落 `file_path` は allow（tool 自身の入力エラーに委ねる）
3. `buildWorkspaceSandbox` に `allowUnsandboxedCommands: false` を追加し、`dangerouslyDisableSandbox` escape hatch を無効化する（#766 の AC4 評価を踏襲: step agent の Bash 用途はローカル完結で、`git push` は StepExecutor 側で agent query の外にある）
4. **probe 成果物の義務**: SDK 挙動（上記実測事実 3・4・5・6 の再現）を確認する probe スクリプトを repo に置き（配置は design 判断。例: `scripts/probes/`）、その**実行の生ログ**を design.md に記録する。SDK docs / 型定義 / bundled source の読解を実測の代替として記録してはならない
5. `specrunner/reviewers/cross-boundary-invariants.md` の paths に `src/adapter/**` を追加する（#766 を一度もレビューしなかった走査穴を塞ぐ）
6. one-shot 系（query-one-shot.ts）と codex adapter は挙動不変
7. query options の regression 固定: 「allowedTools に Edit / Write が含まれない」「reportTool 構成時に MCP tool 名が含まれる／未構成時は含まれない」「permissionMode が "default"」をテストで凍結する

## スコープ外

- ネットワーク制限（`sandbox.network`）
- Read 系ツールのパス制限
- one-shot 系への guard / sandbox 適用
- deny の代わりに redirect（パス書き換え）する方式（#766 で却下済み: 成果物の所在が不透明になる）
- 検出側 backstop（main-checkout-write-detection）の変更
- resume 系の修正（別 request: resume-member-step-routing）

## 受け入れ基準

- [ ] workspace 外パスへの Edit / Write が deny され message が返ることを canUseTool 単体テストで固定する
- [ ] workspace 内 Edit / Write と他 tool（Read / Bash / MCP tool 名）が allow されることを単体テストで固定する
- [ ] query options の凍結: allowedTools に Edit / Write 非含有、reportTool 構成時の MCP tool 名含有、permissionMode "default" をテストで固定する
- [ ] probe スクリプトが repo に存在し、design.md にその実行生ログ（3 シナリオの verdict 行を含む）が記録されている
- [ ] cross-boundary-invariants の paths に `src/adapter/**` が含まれている
- [ ] one-shot 系の既存凍結テストが無変更で green
- [ ] 既存テストのうち更新するのは TC-023 の permissionMode assertion 1 行のみ。それ以外は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: `permissionMode: "default"` + Edit/Write を allowedTools から除外 — canUseTool を発火させる唯一の実測確認済み構成。headless では canUseTool が対話プロンプトの代替 handler になる（実測事実 3）
- **採用**: MCP report tool を allowedTools で pre-approve — canUseTool 経由でも allow されるが、pre-approve の方が権限判定の関与点が減り、report 経路（pipeline の生命線）を guard 実装の変更から隔離できる
- **却下**: `dontAsk` — 実測事実 2 のとおり canUseTool に委譲せず deny する。#766 の事故原因
- **却下**: `bypassPermissions` + canUseTool 併用 — 実測事実 1 のとおり canUseTool が呼ばれず guard が inert になる。#766 のもう一つの欠陥と同型
- **却下**: Edit / Write を allowedTools に残したまま guard を期待する案 — 実測事実 4 のとおり素通りする
- **採用**: probe スクリプトの成果物化 — 「外部 SDK への主張は実行痕跡を伴う」を本変更の受け入れ条件にする。conformance が存在を照合できる形（ファイル + design.md の生ログ）にする
