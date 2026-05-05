# Implementer Decisions

## Phase 1 — AgentRunner port 抽出

- `src/core/port/agent-runner.ts` に AgentRunner interface を定義する :: design.md D1 に従い単一 run() メソッドのみを持つ port を作る
- `src/adapter/anthropic/` を `src/adapter/managed-agent/` に git mv する :: design.md D6 の adapter rename。履歴を保持するため git mv を使用
- AgentRunContext は PipelineDeps の client フィールドを含まない :: TC-002 要件。runtime 固有 SDK 型を port に漏らさないため
- executor.ts の runProposeStyleStep / runPollingStyleStep ロジックを ManagedAgentRunner.run() 内に移植する :: design.md D5。StepExecutor から session protocol を切り離す
- register_branch を src/adapter/managed-agent/tools/ に移動する :: design.md D3。managed-agent adapter の SSE protocol 固有ツールは adapter 内に閉じる
- executor.ts の verifyBranch / verifyPath / getFileContent / requiresCommit guard も adapter 内に移す :: module-analysis.md 懸念点。executor の guard が残ると同責務が2層に分裂する SRP 違反になるため
- ManagedAgentRunner.run() 内を prepareSession / exchange / verifyArtifacts / fetchResult の 4-stage 内部ヘルパーに分割する :: module-analysis.md 4-A。250 LOC 相当のメソッドの cohesion を内部分割で担保
- ProposeStep から toolHandlers を削除せず adapter 側で注入する形に変える :: design.md D3 / TC-018。ProposeStep 自体は runtime-neutral を保つが adapter が注入する
- PipelineDeps.client を optional にする :: module-analysis.md 4-D。local runtime で SessionClient 不要なため required から外す
- AgentRunContext.branch を「CLI canonical branch」として adapter が ctx.branch を canonical とし ctx.state.branch を読まない :: design.md D4 / TC-021

## Phase 2 — Claude Code SDK adapter 実装

- @anthropic-ai/claude-code SDK の型定義を確認してから実装する :: constraints.md「外部 SDK に依存する設計は実装前に .d.ts を確認する」
- ClaudeCodeRunner.run() 内も同じ 4-stage 構造とする :: module-analysis.md。両 adapter の structural homology を保ちサブポート抽出を容易にする
- ClaudeCodeRunner は query() 結果から result file を fs.readFile で取得する :: design.md D2。GitHub API を呼ばない

## Phase 3 — config + CLI 統合

- SpecRunnerConfig に runtime: "managed" | "local" フィールドを追加する :: design.md D7
- applyMigration が runtime 未設定を "managed" に正規化する :: TC-032
- validateConfig が "managed" | "local" 以外を CONFIG_INVALID で拒絶する :: TC-034
- local runtime では validateConfig が apiKey 必須チェックをスキップする :: TC-033 / TC-041
- CLI composition root で config.runtime を読み適切な AgentRunner を注入する :: design.md D8
- init --runtime local で AgentSyncer.syncAll() をスキップする :: TC-038

## Phase 4 — propose step の local 対応

- propose 完了後に CLI canonical branch をそのまま state.branch に保持する :: design.md D4 の「CLI 値 canonical」原則
- ClaudeCodeRunner の additionalInstructions に git checkout -b 指示を含める :: TC-026
- prompts/ は runtime-neutral のまま維持する :: design.md D9 / TC-043

## テスト実装判断

- ClaudeCodeRunner に _spawnFn を injectable dep として追加する :: bun の vitest runner では vi.mock("node:child_process") が同一ワーカー内の全ファイルに影響する。モジュールレベル mock の汚染を避けるため、spawn を constructor inject する設計に変更
- git exec も spawnFn で統一する（execFile の別注入は廃止）:: cli.test.ts が execFile も mock するため、execFile を別途注入しても polluted になる。spawn で git を呼ぶ実装に変更し、injectable dep を spawn 一本に統一
- TC-028/TC-029 は real git ではなく makeGitSimulatingSpawnFn で シミュレートする :: 実 git subprocess がモック汚染で使えないため、git stdout をシミュレートする fake spawn 実装を test helper として提供
- vitest.config.ts に pool: "forks" を追加する :: デフォルト設定ではモック汚染が発生するため、fork プールで分離を試みる（完全解決ではないが partial 改善）
- @anthropic-ai/claude-code SDK 不在のため CLI subprocess 方式に切り替える :: SDK が環境にないため、CLAUDE_BIN env var で指定した claude バイナリを spawn で呼ぶ実装を採用。interface は変わらず
