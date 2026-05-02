## Why

SpecRunner は dogfooding-005 で self-host pipeline E2E が成功し PR を生成できるようになったが、**生成した PR を閉じる手段が CLI 側に存在しない**ため OPEN PR が積み上がる（現時点で PR #48 が滞留）。openspec-workflow の `request-merge` skill は「ローカル Claude Code セッションが対話的に worktree 内で動く」ことを前提とするが、SpecRunner は Anthropic Managed Agents 上で実行するためローカル worktree が存在せず、LLM 駆動の後片付けは責務超過かつ非決定的になる。CLI 単体で完結する deterministic な finish コマンドが必要である。

## What Changes

- 新コマンド `specrunner finish <jobId> [--force] [--cleanup-only] [--slug <slug>]` を追加し、PR merge 後の後片付けを LLM なしで実行する
- jobId / slug / awaiting-merge dir 走査の 3 段階で対象 job を解決する入力解決ロジックを追加する
- `gh pr view` の `state` / `mergeStateStatus` / `statusCheckRollup` を 6 種の正規化状態（OPEN_MERGEABLE / OPEN_BEHIND / OPEN_CONFLICTS / OPEN_CHECKS_FAILING / MERGED / CLOSED）にマップする PR 状態検知器を追加する
- `gh pr merge --squash --delete-branch` を subprocess で呼び出す feature PR merge ステップを追加する（`--force` で `--admin` を付与）
- `openspec/changes/<slug>/specs/` の有無で `openspec archive <slug>` または `openspec archive <slug> --skip-specs` を分岐実行する archive ステップを追加する
- `git mv awaiting-merge/<slug> merged/<slug>` で requests dir を遷移させる
- `chore/archive-<slug>` ブランチを切り archive PR を作成して auto-merge する（local main への直 push は禁止）
- job state の `JobStatus` 型に `archived` を追加し、history に finish エントリを append する
- escalation 時の stdout フォーマット（失敗ステップ / 検知状態 / 推奨人間操作 / 再実行コマンド）を統一し、exit code を non-zero にする
- 同 jobId への 2 回目の finish が no-op になる冪等性、および部分実行状態からの resume 能力を保証する
- LLM 呼び出しは一切行わない（pure CLI、deterministic）

## Capabilities

### New Capabilities

- `cli-finish-command`: `specrunner finish` サブコマンドの引数 / 入力解決 / PR 状態検知 / merge 実行 / openspec archive 連携 / archive PR 作成 / job state 遷移 / escalation フォーマット / 冪等性に関する SHALL/MUST 要件と Scenario を網羅する

### Modified Capabilities

- `job-state-store`: `JobStatus` 型に `archived` を追加し、既存 state ファイル（`success` 等）との後方互換読み出しを維持する要件を追加する
- `cli-commands`: `specrunner` サブコマンド一覧に `finish` を追加し、既存サブコマンドとの一貫性（exit code / stdout / config 解決）を維持する要件を追加する

## Impact

- **影響コード**: `src/cli/commands/finish.ts`（新規）、`src/cli/index.ts` のサブコマンド登録、`src/lib/jobs/state.ts`（`JobStatus` 型拡張）、`src/lib/git/*` および `src/lib/github/*`（gh CLI subprocess wrapper の再利用 / 拡張）
- **外部依存**: `gh` CLI（既存 OAuth トークン経由）、`openspec` CLI（archive subcommand）、`git` CLI（mv / commit / push）。いずれも `node:child_process.spawn` で呼び出す（pr-create runner と同パターン）
- **API**: `GitHubClient` port は現状拡張不要（gh CLI で完結）。pattern-reviewer の判断次第で `mergePullRequest` 拡張を将来的に ADR 評価する余地を残す
- **state 互換性**: 既存 jobs/*.json は `status=success` のまま読めること。`archived` は新規 finish 完了時のみ書き込まれる
- **CI / branch protection**: archive 反映は archive PR 経由のみ。local main への直 push は禁止（branch protection との整合）
- **Self-bootstrap 不可**: 本 change 自体は手動 merge が必要。merge 後に PR #48 を最初の dogfooding-006 ターゲットにする
