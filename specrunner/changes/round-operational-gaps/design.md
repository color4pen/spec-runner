# Design: round-operational-gaps

## Context

並列 run で custom reviewer round に 2 つの欠落が実発現した。

**欠落 1: `pr-create-result.md` が `pipelineManagedPaths` に未登録** (#898)

`pipelineManagedPaths(slug)` は現在 `[state.json, events.jsonl, usage.json, bite-evidence-result.md]` の 4 つを返す。`pr-create-result.md` はこのリストに含まれず、findings 系の除外パターン `*-result-*.md` にも一致しない（`-result.md` で終わるため）。

結果として、pr-create 実行後に round が再走する経路（全 skip escalation からの resume 等）で `partitionRoundChanges` が pr-create-result.md を `offending` と判定し、`ROUND_NONDECLARED_CHANGE` で誤 halt する。実例は job 27f57112（operator の手 commit で回避）。

`pipelineManagedPaths` は単一ソースとして機能し、以下の 2 つの callsite に効く:
1. `partitionRoundChanges` — offending 除外（round halt 防止）
2. `commit-push.ts` scoped mode の `existingManaged` — scoped 合成の commit 対象

#888 で bite-evidence-result.md を同じ方法で修正した先例がある。

**欠落 2: `cross-boundary-invariants.md` の `activationPaths` に runtime/verification が無い** (#896)

frontmatter `paths` の現状: `src/core/pipeline/** / src/core/step/** / src/state/** / src/store/** / src/adapter/**` の 5 つ。`src/core/runtime/**` と `src/core/verification/**` が欠落している。

runtime 層（bootstrap / workspace materialization — synthesizedCommits 台帳や worktree 生成という横断不変の参加者）と verification 層（coverage gate 等）のみを変更する request では全 member が skip し、全 skip 非 green 規則により escalation halt する。実例は job 27f57112 / 6283b476。

## Goals / Non-Goals

**Goals**:
- `pipelineManagedPaths` に `prCreateResultPath` を追加し、pr-create-result.md が offending 扱いされる false halt を根絶する
- `cross-boundary-invariants.md` frontmatter に `src/core/runtime/**` と `src/core/verification/**` を追加し、runtime/verification 専変更での全 skip escalation を解消する
- 上記修正を回帰テストで固定する

**Non-Goals**:
- scale-tolerance の activationPaths 見直し
- 全 skip escalation の resume UX 改善
- reviewer 定義の schema 変更

## Decisions

**D1: `pipelineManagedPaths` 単一ソースへの追加（採用済み）**

`src/core/pipeline/round-git-scope.ts:104` の `pipelineManagedPaths` に `prCreateResultPath(slug)` を 1 行追加する。

理由: pipelineManagedPaths は offending 除外と scoped 合成の両方に同時に効く単一ソースであり、callsite を変更せずに済む。#888 の bite-evidence-result.md と同一の修正パターン。

却下案:
- **除外パターン緩和（`*-result*.md`）**: 適用範囲が広がり、意図しないファイルの除外（検査の盲点）を生む。管理パスの明示列挙が fail-closed であるため却下。
- **命名変更（`pr-create-result-001.md` 化）**: 既存 archive・参照との互換を壊す割に得るものがない。

**D2: `cross-boundary-invariants.md` frontmatter への glob 追加（外科的修正）**

frontmatter `paths` に `src/core/runtime/**` と `src/core/verification/**` の 2 行を追加する。本文（観点・判定基準）は変更しない。

理由: reviewer 定義は job bootstrap 時に state へ snapshot されるため、修正は修正後に起動する job から有効になる。実行中 job への遡及は設計上なく、修正の即時性と安全性に問題はない。

**D3: テスト戦略**

#888 の bite-evidence 回帰テストと同型で pr-create-result.md の回帰テストを追加する。

- 既存 `pipelineManagedPaths` describe の `toHaveLength(4)` を `toHaveLength(5)` に更新し、`PR_CREATE_RESULT` の containment assertion を追加する
- 新 describe: "pr-create-result.md のみが dirty な round で offending が空" を partitionRoundChanges で固定する
- 破壊確認: `pipelineManagedPaths` から `prCreateResultPath` を除去すると上記テストが fail することを destruction confirmation コメントで記録する

## Risks / Trade-offs

[Risk] `prCreateResultPath` のインポートを `round-git-scope.ts` に追加する必要がある → 単純な import 追加であり、既存の `biteEvidenceResultPath` と同一ファイル内のため影響範囲は最小。

[Risk] reviewer 定義変更は修正後 job から有効 → 実行中 job への遡及なしは設計上既知。operator の運用対応（state snapshot 追記）が現行 job の回避手段として機能していた通り、修正後 job では不要になる。

## Open Questions

なし。architect 評価済み設計を採用している。
