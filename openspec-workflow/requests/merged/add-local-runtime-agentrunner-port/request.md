# AgentRunner port 抽出 + Claude Code SDK local runtime 追加

## Meta

- **type**: new-feature
- **date**: 2026-05-05
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - module-architect

## 背景

spec-runner は現在 Anthropic Managed Agents API のみをサポートしている。全ての agent step（propose / spec-review / implementer / build-fixer / code-review / code-fixer / spec-fixer）は managed agent の session lifecycle（createSession → sendUserMessage → pollUntilComplete / streamEvents）に依存している。

この構造には 2 つの課題がある:

1. **コスト**: session ごとの cache write が全体コストの 30% を占め、per-PR $3-5 の従量課金が個人利用には厳しい
2. **結合度**: executor.ts が managed agent の session protocol に直接依存しており、別の runtime に差し替えられない

Claude Code SDK (`@anthropic-ai/claude-code`) を使えば、MAX プラン定額内でローカル実行が可能になる。同じ pipeline を managed agent（従量課金・cloud isolated）と local Claude Code（定額・ローカル実行）で切り替えて使いたい。

## 目的

executor.ts から session lifecycle を `AgentRunner` port として抽出し、managed agent adapter と Claude Code SDK adapter を差し替え可能にする。

## 要件

### Phase 1: AgentRunner port 抽出（リファクタ・動作変更なし）

1. `src/core/port/agent-runner.ts` に `AgentRunner` interface を定義する
   - `run(context: AgentRunContext): Promise<AgentRunResult>` の単一メソッド
   - `AgentRunContext`: step, branch（INPUT）, slug, cwd, requestContent, config
   - `AgentRunResult`: completionReason, resultContent（adapter が取得済み）, sessionId?
2. executor.ts から session lifecycle ロジック（~250 LOC）を切り出す
   - propose-style / polling-style の分岐は AgentRunner adapter 内に吸収される
   - executor は `runner.run()` を呼んで結果を parse + state 更新するだけ
3. `src/adapter/managed-agent/agent-runner.ts` に `ManagedAgentRunner` を実装
   - 既存の SessionClient を内部で利用（SessionClient interface は変更しない）
   - register_branch custom tool handling を adapter 内に移動（core/tools/ → adapter/managed-agent/tools/）
4. adapter/anthropic/ → adapter/managed-agent/ に rename（intent clarity）
5. 全既存テストが green であること（動作変更なし）

### Phase 2: Claude Code SDK adapter 実装

6. `src/adapter/claude-code/agent-runner.ts` に `ClaudeCodeRunner` を実装
   - `@anthropic-ai/claude-code` の `query()` を利用
   - cwd に worktree path を渡し、step の prompt (buildMessage) をそのまま渡す
   - agent が直接 git 操作するため register_branch / propagation 不要
   - result file は agent 完了後に `fs.readFile()` で読む
7. branch は CLI が `feat/<slug>` を決定して prompt に注入する（agent が生成しない）
8. requiresCommit guard は `git status` / `git log` でローカル検証

### Phase 3: config + CLI 統合

9. config schema に `runtime: "managed" | "local"` を追加（default: "managed"）
10. CLI entry point で config.runtime に基づいて adapter を選択・注入
11. `specrunner init --runtime local` で config に runtime を書くだけ（API 呼び出しゼロ）
    - AgentSyncer は `runtime === "managed"` の場合のみ実行
12. `specrunner init --runtime managed` は既存動作と同一

### Phase 4: propose step の local 対応

13. local mode では propose step が直接 `git checkout -b feat/<slug>` + commit + push する
    - register_branch custom tool は不要
    - branch 名は CLI が決定済みなので prompt に含める
14. executor の GitHub verification（verifyPath / verifyBranch）は AgentRunner adapter 内で吸収
    - managed: GitHub API 経由
    - local: fs.existsSync / git branch --list で確認

### 共通

15. prompts/ は runtime-neutral に保つ。runtime 固有の git 操作 instruction は adapter が `additionalInstructions` として inject する
16. GitHubClient port は local mode では pr-create 時のみ使用される

## 受け入れ基準

- [ ] Phase 1 完了後、全既存テストが green（`bun run typecheck && bun test`）
- [ ] Phase 1 完了後、managed mode で既存 dogfood と同一動作（regression なし）
- [ ] Phase 2 完了後、`runtime: "local"` で polling-style step（spec-review 等）が Claude Code SDK 経由で実行される
- [ ] Phase 3 完了後、`specrunner init --runtime local` が API 呼び出しなしで完了する
- [ ] Phase 4 完了後、propose → implementer → verification → code-review の pipeline が local mode で完走する
- [ ] adapter/managed-agent/ と adapter/claude-code/ が完全に独立（相互 import なし）
- [ ] executor.ts が ~300-400 LOC に削減され、session lifecycle ロジックを含まない

## 補足

### 設計判断（architect 確認済み）

- **branch は INPUT**: slug から決定論的に導出。register_branch が「agent が教えてくれる」モデルから「CLI が決めて渡す」モデルへ変更（PR #42 slug single-source-of-truth の延長）
- **resultContent は AgentRunner が返す**: managed は GitHub API で取得、local は fs.readFile。ResultReader port は切らない（AgentRunner に吸収）
- **adapter 命名**: anthropic/ → managed-agent/（SDK vendor 名ではなく runtime model 名）
- **register_branch は adapter に移動**: managed agent の session protocol の一部であり core の concern ではない
- **verifyPath も adapter に吸収**: hexagonal-lite と整合

### 関連 issue

- #70: branch 名に jobId を含める — Phase 4 の branch 決定ロジックと関連
- #17: Agent / Environment の自動管理 — local mode では不要になる

### コスト構造の変化見込み

| | managed mode | local mode |
|---|---|---|
| per-PR cost | $3-5（従量課金） | $0（MAX プラン定額内） |
| startup overhead | session 作成 + cache write 30% | ほぼゼロ |
| 品質 | Sonnet 4.5 | MAX プランで利用可能なモデル |
| 環境分離 | cloud sandbox | ローカル worktree |
