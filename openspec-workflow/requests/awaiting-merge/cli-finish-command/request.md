# CLI finish コマンド — PR merge 後の deterministic な後片付け

## Meta

- **type**: new-feature
- **date**: 2026-05-01
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - module-architect
  - pattern-reviewer

## 背景

SpecRunner は dogfooding-005 (2026-04-30) で self-host pipeline E2E が初成功し、PR を生成できるようになった。しかし**生成した PR を閉じる手段が CLI 側に存在しない**ため、生成 PR が積み上がる状況が発生している（現時点で PR #48 readme-status-section が OPEN のまま）。

openspec-workflow には対応する `request-merge` skill があり、PR merge → openspec archive → awaiting-merge → merged 遷移 → archive PR 作成 + auto-merge → worktree / branch 削除を多段で実行する。しかしこのスキルは以下を前提とする:

1. **ローカル Claude Code セッションが対話的に実行**する
2. **ローカル worktree が存在する**（agent が main worktree から派生した子 worktree で作業した）
3. **conflict-resolver / openspec-archive-change など LLM agent を auto-fire** できる

SpecRunner は **Anthropic Managed Claude Agents** 上でエージェントを実行するため、これらの前提が成立しない:

- ローカル worktree は存在しない（agent はリモート環境で動作、feature branch は remote にのみ push される）
- LLM を呼び出すコストと複雑度が finish の本質を超える
- 後片付けは job state ファイルから機械的に再現可能であるべき（deterministic、再実行可能）

そのため、**CLI 単体で完結する deterministic な finish コマンド**を新設する必要がある。

## 目的

`specrunner finish <jobId>` で、PR merge 完了後の後片付けを LLM 不要で deterministic に実行する。具体的には:

1. job state ファイルから PR / branch / slug を解決する
2. PR の状態を検知し、安全にマージ可能な場合のみ merge する
3. openspec change folder を archive ディレクトリへ移動する
4. requests/awaiting-merge/<slug> を requests/merged/<slug> へ移動する
5. archive PR を作成して auto-merge し、main 反映を self-PR merge イベント経由で完了する
6. job state を archived 状態へ更新する
7. 安全に進めない状況（rebase 必要 / checks failing 等）は escalation で停止し、人間判断に委ねる

## 要件

### 1. CLI シグネチャ

```
specrunner finish <jobId> [--force] [--cleanup-only] [--slug <slug>]
```

| 引数 / フラグ | 説明 |
|--------------|------|
| `<jobId>` | 対象 job の UUID。state ファイル `~/.local/state/specrunner/jobs/<jobId>.json` を読む |
| `--slug <slug>` | jobId が不明な場合の fallback（state ファイルを slug で検索） |
| `--force` | OPEN_CHECKS_FAILING 状態の PR を admin merge 強行する |
| `--cleanup-only` | PR が既に MERGED 状態の場合に merge ステップをスキップして archive 以降のみ実行する |

### 2. 入力解決

1. `<jobId>` が指定された場合: state ファイルを読み、`pullRequest.number`, `branch`, `request.path` を取得する
2. `--slug` が指定された場合: state ファイル群を走査して `request.path` から該当 slug を持つ state を探す
3. いずれも未指定: `openspec-workflow/requests/awaiting-merge/` に 1 つだけ slug が存在すればそれを採用、複数あればエラー停止

### 3. PR 状態検知と分岐

`gh pr view <PR> --json state,mergeStateStatus,statusCheckRollup,headRefName` を実行し、以下に正規化する:

| gh 出力 | 正規化状態 | 通常時の挙動 | `--force` 時の挙動 |
|---------|----------|-------------|--------------------|
| `state=OPEN, mergeStateStatus=CLEAN` | OPEN_MERGEABLE | merge へ進む | 同左 |
| `state=OPEN, mergeStateStatus=BEHIND` | OPEN_BEHIND | escalation（rebase 案内） | escalation（同左） |
| `state=OPEN, mergeStateStatus=DIRTY` | OPEN_CONFLICTS | escalation（手動解消案内） | escalation（同左） |
| `state=OPEN, mergeStateStatus=BLOCKED` または `statusCheckRollup` に failure | OPEN_CHECKS_FAILING | escalation（修正 / `--force` 案内） | admin merge 強行 |
| `state=MERGED` | MERGED | `--cleanup-only` 相当で archive へ進む | 同左 |
| `state=CLOSED` | CLOSED | エラー停止（"use specrunner cancel"） | 同左 |

### 4. PR merge

- 通常: `gh pr merge <PR> --squash --delete-branch`
- `--force` で OPEN_CHECKS_FAILING: `gh pr merge <PR> --squash --delete-branch --admin`
- `--delete-branch` により remote feature branch も同時削除される

### 5. archive 操作（ローカル git）

main worktree 内（CLI は main worktree から起動される）で以下を実行:

```
git fetch origin main
git checkout -b chore/archive-<slug> origin/main
```

**openspec/changes 操作（事前判定 + subprocess 呼び出し）**:

| 前提 | 操作 |
|------|------|
| `openspec/changes/<slug>/` 不在 | archive 全体スキップ |
| `openspec/changes/<slug>/specs/` に delta spec あり | `openspec archive <slug>` （subprocess） |
| `openspec/changes/<slug>/specs/` に delta spec なし | `openspec archive <slug> --skip-specs` （subprocess） |

**requests dir 移動**:

```
git mv openspec-workflow/requests/awaiting-merge/<slug> openspec-workflow/requests/merged/<slug>
```

**commit**:

```
git commit -m "chore: archive <slug>"
```

冪等性: `merged/<slug>/` が既に存在し `awaiting-merge/<slug>/` が不在の場合は mv 操作をスキップする。

### 6. archive PR 作成 + auto-merge

local main への直 push は禁止する（branch protection rule との整合）。すべての main 反映は self-PR merge イベント経由とする。

```
git push -u origin chore/archive-<slug>
gh pr create --title "chore: archive <slug>" \
             --body "Automated archive PR from specrunner finish." \
             --head chore/archive-<slug> --base main
gh pr merge --auto --squash --delete-branch <archive PR URL>
```

`--auto` が利用不可な repo（auto-merge 機能 OFF）の場合は即時 merge `gh pr merge --squash --delete-branch <PR URL>` で fallback する。

### 7. job state 更新

- `status` を `archived` に更新する（`JobStatus` 型に新ステータスを追加）
- `history` に "finish completed" エントリを append する

### 8. escalation 出力フォーマット

escalation 時は以下を stdout に明示する:

- 失敗ステップ名（"PR state detection" / "feature PR merge" / "archive PR creation" 等）
- 検知された状態（`OPEN_BEHIND` 等）
- 推奨される人間操作（"git rebase origin/main && git push --force-with-lease" 等）
- 再実行コマンド（`specrunner finish <jobId>` または `--force` 付き）

exit code は **non-zero**（escalation = 失敗扱い）とする。

### 9. 冪等性

`finish` は何度実行しても同じ結果になるべき:

- PR が MERGED 済み + awaiting-merge dir が merged dir へ移動済み + main に archive commit が既に存在する場合: "fully finished, nothing to do" を出力して exit 0
- 部分的に進んだ状態（feature PR merged だが archive 未完了等）から resume できる

## 受け入れ基準

- [ ] `specrunner finish <jobId>` で OPEN_MERGEABLE な PR を最後まで処理しきれる
- [ ] OPEN_BEHIND / OPEN_CONFLICTS で escalation を出力し、`--force` を提示する
- [ ] OPEN_CHECKS_FAILING + `--force` で admin merge 強行できる
- [ ] MERGED 済み PR を `--cleanup-only` または通常実行で archive まで進められる
- [ ] CLOSED PR は cancel 案内付きでエラー停止する
- [ ] `openspec/changes/<slug>/` の有無 / delta spec の有無で archive 動作が 3 通りに分岐する
- [ ] archive 操作は `chore/archive-<slug>` ブランチで commit され、archive PR 経由で main に反映される（local main 直 commit / 直 push しない）
- [ ] 冪等性: 同じ job に対する 2 回目の finish は no-op になる
- [ ] 部分実行状態（feature merged 済みだが archive 未完了等）から resume できる
- [ ] job state の `status` が `archived` に更新され、history が追記される
- [ ] `JobStatus` 型に `archived` が追加され、既存 state ファイルとの後方互換性が維持される
- [ ] エラー / escalation 時の stdout フォーマットが test で検証される（cli-stdout-snapshot 系の test に追加）
- [ ] LLM 呼び出しは一切発生しない（pure CLI、deterministic）

## 補足

### 外部依存（request_md_external_constraints メモリに準拠）

- **`gh` CLI**: pr-create と同じパターン。`gh pr view`, `gh pr merge`, `gh pr create` を subprocess で呼び出す。auth は `specrunner login` で OAuth device flow を通したトークンを使う
- **`openspec` CLI**: archive subprocess。`openspec archive <slug> [--skip-specs]`
- **`git` CLI**: local archive ブランチ作成 / mv / commit / push。`node:child_process.spawn` で呼び出す（pr-create runner と同じ）
- **GitHubClient port**: 現時点では拡張不要（gh CLI で完結）。ただし pattern-reviewer の指摘次第で `mergePullRequest` などの拡張を ADR で評価する余地はある

### Managed Agent 環境特有の省略

openspec-workflow `request-merge` から以下を省略する:

| openspec-workflow にあるが finish では省略 | 理由 |
|------------------------------------------|------|
| 実行コンテキスト検証（worktree 内拒否） | worktree が存在しない |
| Step 7: session artifacts 統合（observations.jsonl / MEMORY.md merge） | worktree が存在しない |
| Step 8: ローカル worktree / feature branch 削除 | どちらも存在しない（feature branch は remote のみ、`--delete-branch` で remote 側も同時削除） |
| Step 6.5-pre: pending-changes 集約 | spec-runner は plugin-author repo ではない（consumer repo） |
| conflict-resolver auto-fire（Step 3.5 / Step 4-recovery） | escalation で人間判断に委ねる |

### Self-bootstrap 不可

finish 自身は手動 merge する必要がある（self-merge 不可、chicken-and-egg）。dogfooding-006 として、finish が main に merge された後、PR #48 (readme-status-section) を最初の finish ターゲットにする予定。

### 主要な設計分岐点（ADR で残すべき項目）

1. archive 反映方式: archive PR 経由 vs main 直 push（→ archive PR 経由を選択、理由は audit trail / branch protection 整合 / future-proof）
2. GitHubClient port 拡張 vs gh CLI 継続: pr-create 同様に gh CLI 継続（→ port 拡張は不要、ADR で根拠を残す）
3. escalation philosophy: LLM auto-recovery を入れない理由（→ deterministic CLI の責務境界、再実行容易性）
4. requests dir の遷移先: `merged/` を採用（`done/` は legacy、最近の openspec-workflow conventions に整合）
5. JobStatus に新ステータス `archived` を追加するか、既存 `success` で十分か（→ `archived` を新設、archive 完了の明示的な terminal 状態として）

### 関連 PR / 過去失敗

- #42 propose-stub-and-slug: slug 生成の divergence
- #44 workspace-mount-and-propose-boundary: branch propagation
- #46 review-exit-contract: review-side exit contract 統一

これらは PR 関連 / state 周りの過去失敗で、pattern-reviewer の参照対象になる。
