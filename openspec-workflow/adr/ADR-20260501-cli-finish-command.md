# ADR-20260501-cli-finish-command

## Status

superseded（2026-05-02）

> **Superseded by**: `finish-redesign` request — 1-PR モデルへの転換（archive を feature branch に commit してから feature PR を merge）。新 ADR は Step 7 で生成予定。
>
> 本 ADR の **D1（archive PR 経由 / `chore/archive-<slug>` branch / `gh pr merge --auto`）** は dogfooding-006 で empty-diff archive PR / orphan branch / partial-failure resume 不整合を露呈し、構造的に廃止された。`createArchivePr` / `prepareArchiveBranch` / `pushAndCreateArchivePr` / `checkArchivePrAlreadyMerged` 関数群と `chore/archive-<slug>` branch、`merged/` 中間ディレクトリも廃止対象。
>
> **D2（gh CLI 継続）** / **D3（escalation philosophy）** / **D5（`archived` terminal state）** / **D6（入力解決の優先順位）** / **D7（PR 状態 6 種正規化）** / **D8（subprocess wrapper の再利用）** / **D9（`JobStatus` location）** は 1-PR モデルでも引き継がれる予定。**D4（`merged/` ディレクトリ）** は `awaiting-merge` → `merged` の 2 段遷移自体が 1-PR モデルでは不要になるため、新 ADR で再評価される。

## Context

SpecRunner は dogfooding-005 (2026-04-30) で self-host pipeline E2E が初成功し、PR を生成できるようになった。しかし**生成した PR を閉じる手段が CLI 側に存在せず**、PR が積み上がる状況が発生していた（PR #48 readme-status-section が OPEN のまま）。

参照可能な前例として openspec-workflow に `request-merge` skill があり、PR merge → openspec archive → awaiting-merge → merged 遷移 → archive PR 作成 + auto-merge → worktree / branch 削除を多段で実行する。ただしこの skill は次の前提を持つ:

1. ローカル Claude Code セッションが対話的に実行される
2. ローカル worktree が存在する（agent が main worktree から派生した子 worktree で作業した）
3. conflict-resolver / openspec-archive-change など LLM agent を auto-fire できる

SpecRunner では agent が Anthropic Managed Agents 環境で動くため worktree は存在せず、feature branch も remote にしか push されない。`request-merge` の前提は成立しない。さらに後片付けは job state ファイルから機械的に再現できるべきで、LLM 駆動は責務超過かつ非決定的になる。

本 change はこの gap を埋める **CLI 単体で完結する deterministic finish** を新設する。設計上、以下 9 つの設計分岐点が ADR として残すに値する。

1. archive 反映方式（archive PR vs main 直 push）
2. GitHubClient port 拡張 vs gh CLI 継続
3. escalation philosophy（LLM auto-recovery を入れない）
4. requests dir 遷移先（`merged/` vs legacy `done/`）
5. JobStatus に `archived` を新設するか
6. 入力解決の優先順位
7. PR 状態の正規化テーブルを 6 種に固定
8. subprocess wrapper の再利用方針
9. `JobStatus` 型の確定 location

## Decisions

### D1. archive 反映方式: archive PR 経由（main 直 push 禁止）

**選択**: `chore/archive-<slug>` ブランチで commit → push → `gh pr create` → `gh pr merge --auto --squash --delete-branch` で main に反映する。`--auto` 利用不可な repo では即時 merge fallback。

**却下した代替案**: main 直 commit / 直 push

**理由**:
- 将来 spec-runner repo に branch protection rule を導入する方針と整合する
- audit trail（archive PR の履歴）が残る
- `request-merge` skill との対称性。openspec-workflow 側でも archive は PR 経由
- CLI が直 push 前提だと branch protection 導入時に破綻する

### D2. GitHubClient port 拡張 vs gh CLI 継続

**選択**: gh CLI を `node:child_process.spawn` で呼び続ける。`GitHubClient` port には `mergePullRequest` / `viewPullRequest` を追加しない。

**却下した代替案**: `GitHubClient` port を拡張し Octokit ベース実装を追加する

**理由**:
- pr-create runner（[ADR-20260430-pr-create-step-design](ADR-20260430-pr-create-step-design.md)）の前例があり一貫する
- 既存 OAuth トークンを gh CLI が透過的に利用するため auth 機構の再構築が不要
- finish は `view` / `merge` / `create` のみで、port 拡張は over-engineering（YAGNI）
- pattern-reviewer の指摘や consumer 増加で port 化が必要になった時点で別 ADR で評価する余地は残す

### D3. escalation philosophy: LLM auto-recovery を入れない

**選択**: rebase / conflict 解消 / checks failing 修正は人間に委ねる。CLI は検知 + 推奨アクション + 再実行コマンドの提示のみ行う。

**却下した代替案**: conflict-resolver / build-fixer skill を LLM 経由で auto-fire する（openspec-workflow と同パターン）

**理由**:
- finish の本質は「PR merge 後の deterministic な後片付け」。LLM を呼んだ瞬間に non-deterministic になる
- 再実行容易性が損なわれる（同じ jobId で同じ結果になる保証が崩れる）
- escalation を「失敗」ではなく「人間判断に委ねる正常終了形態」と位置づけ、stdout フォーマットを統一して再実行コマンドを必ず提示する
- SpecRunner の責務境界として「operational tooling では LLM 不使用」を [ADR-20260430-external-dependency-policy](ADR-20260430-external-dependency-policy.md) と整合させる

### D4. requests dir 遷移先: `merged/` を採用（`done/` は不採用）

**選択**: `openspec-workflow/requests/awaiting-merge/<slug>` → `openspec-workflow/requests/merged/<slug>`。

**却下した代替案**: 旧 conventions の `done/<slug>`

**理由**:
- 最近の openspec-workflow は `awaiting-merge` → `merged` の遷移を標準としている
- `done/` は legacy 名で `request-merge` skill の現行実装とも乖離する
- `merged` は PR の terminal state と語彙が一致し、状態の同型性が読みやすい

### D5. JobStatus に terminal state `archived` を新設する

**選択**: `JobStatus` union に `archived` を追加し、archive 完了で `success → archived` を遷移させる。

**却下した代替案**: `success` のまま据え置く（archive 完了と区別しない）

**理由**:
- archive まで完了した job と PR merged だが archive 未完了の job は意味が違う（後者は resume 可能な部分完了状態）
- 状態を区別しないと `specrunner ps` で finish 対象を見つけにくい
- 後方互換性は既存の `success` ファイルがそのまま読める形で担保（exhaustive-switch を全 consumer で確認）
- 新規 finish 完了時のみ `archived` を書き、バックフィル script は提供しない

### D6. 入力解決の優先順位: jobId → --slug → awaiting-merge 自動検出

**選択**: 3 段階で対象 job を解決する。
1. `<jobId>` 指定: state ファイル直読み
2. `--slug` 指定: state ファイル群を走査して該当 slug の最新 `updatedAt` を採用
3. いずれも未指定: `awaiting-merge/` に slug が 1 つだけならそれを採用、複数あればエラー停止

**却下した代替案**: jobId のみ受理（fallback なし）

**理由**:
- jobId は最も曖昧性がない第一解決手段
- `--slug` は state file が壊れているケースの fallback として実用上必要
- 自動検出は dogfooding-006 のような「単一 PR が滞留している小規模 repo」での UX 改善（typing なしで動く）
- 複数 slug 検出時は安全側に倒して停止する（誤った slug を archive するリスクを排除）

### D7. PR 状態を 6 種の正規化状態に固定する

**選択**: `gh pr view --json state,mergeStateStatus,statusCheckRollup,headRefName` の結果を CLI 内部で 6 種に正規化する。

| 正規化状態 | 通常 | `--force` |
|----------|------|----------|
| OPEN_MERGEABLE | merge | merge |
| OPEN_BEHIND | escalation | escalation |
| OPEN_CONFLICTS | escalation | escalation |
| OPEN_CHECKS_FAILING | escalation | admin merge |
| MERGED | archive へ | archive へ |
| CLOSED | エラー停止（cancel 案内） | エラー停止 |

**却下した代替案**: gh の `mergeStateStatus`（CLEAN / DIRTY / BEHIND / BLOCKED / HAS_HOOKS / UNSTABLE / UNKNOWN 等）を直接分岐に使う

**理由**:
- gh の状態モデルは GitHub の内部実装に追従して変動する
- 6 種に固定すれば、未知の `mergeStateStatus` 値が追加されても safe default（`OPEN_CHECKS_FAILING` 扱い）に倒せる
- test fixture が 6 状態網羅で済み、cli-stdout-snapshot 系 test の境界が明確

### D8. subprocess wrapper の再利用

**選択**: pr-create runner と同じ `node:child_process.spawn` wrapper を流用する。stdout / stderr capture と exit code チェックを共通化する。

**却下した代替案**: ストリーミング処理 / 専用 wrapper

**理由**:
- pr-create runner で実績がある
- finish の subprocess（gh / git / openspec）はすべて秒単位で完了しストリーミングは不要
- 共通化で重複を避けつつ、各 step の意味的責務（gh / git / openspec）は呼び出し側に閉じる

### D9. `JobStatus` 型の確定 location

**選択**: `JobStatus` は `src/state/schema.ts` の union として一元定義済みのものに `archived` を追加する。`src/lib/jobs/state.ts` というパスは存在しない（過去の draft で混乱があった）。

**理由**:
- 一元定義 + 全 consumer の exhaustive-switch を TypeScript の型システムで強制する
- consumer は `src/cli/ps.ts` 等。schema.ts を起点に grep して全箇所を更新する
- パス confusion を ADR で固定し、再発を防ぐ

## Consequences

### Positive

- `specrunner finish <jobId>` 単体で PR merge 後の後片付けが LLM 不要で deterministic に完了する
- 6 状態の固定により gh の schema 変動に対する耐性を持つ
- archive PR 経由により branch protection 導入時にも破綻しない
- 冪等性（同じ jobId への 2 回目の finish は no-op）と部分実行 resume が成立する
- `specrunner ps` で `archived` を terminal state として識別できる
- pr-create runner と同じ subprocess pattern で認知負荷が低い

### Negative

- escalation 時に LLM auto-recovery を持たないため openspec-workflow と比較して人間操作が増える（rebase / conflict 解消 / checks failing 修正は手動）
- `gh pr merge --auto` 利用不可な repo では即時 merge fallback に依存し、それも失敗した場合は escalation 停止する
- gh CLI の出力 schema 変更に追従するメンテナンス義務が残る（minimal type 定義 + safe default で緩和）
- self-bootstrap 不可（chicken-and-egg）。本 change の最初の merge は手動

### Risks

- **gh CLI 出力 schema 変更**: 想定外フィールドは `OPEN_CHECKS_FAILING` 相当の safe default にフォールバックし、test で 6 状態すべてを fixture から再現する
- **auto-merge 利用不可な repo**: `gh pr merge --auto` が即失敗 → 即時 merge fallback → それも失敗時は escalation 停止し、人間に手動 merge を促す
- **git mv の atomicity**: SIGINT 中断時の中間状態は次回 finish 実行時の冪等チェック（`merged/<slug>/` 存在確認）で resume する
- **dogfooding-006 で finish 自身を finish できない**: 最初は手動 merge。merge 後すぐに PR #48 を最初の finish ターゲットとして dogfooding-006 を実行

### Known Design Debt

review-feedback-002.md で MEDIUM/LOW として記録されたが本 PR スコープ外で持ち越した構造的課題:

- **`buildGhFailureMessage` の duplication（MEDIUM）**: `src/core/gh/error.ts:10` の export と `src/core/pr-create/runner.ts:201` の internal copy が並存。次 cleanup PR で `pr-create/runner.ts:145,159` を import に置き換え local function を削除する
- **`isFeaturePrAlreadyMerged` の dead code（MEDIUM）**: `src/core/finish/idempotency.ts:23-25` が export されているが orchestrator は inline で `prState === "MERGED"` をチェックしている。削除 or orchestrator 側の inline 判定を helper 呼び出しに置き換える
- **`isAutoMergeUnavailable` の stderr scraping（MEDIUM）**: `src/core/finish/archive-pr.ts:21-31` が gh stderr の substring（"auto-merge", "branch protection", "not enabled", "not supported"）に依存。`gh repo view --json autoMergeAllowed` で proactive 検出に置き換える、または非 0 exit で無条件 fallback、最低でも pinned gh version range を明記する
- **spawn 呼び出し順序の test 不在（MEDIUM）**: `tests/finish-orchestrator.test.ts` が `exitCode === 0` + 単一 substring の assert に留まり、`git checkout -b chore/archive-<slug>` → `openspec archive` → `git mv` → `git push` の順序回帰を検出できない。`vi.mocked(spawn).mock.calls` のインデックス比較を追加する。`prepareArchiveBranch` の `-B` fallback test も同時に追加
- **`-b` then `-B` の 2-call dance（MEDIUM）**: `archive-pr.ts:95-116` は `git checkout -B branchName origin/main` の 1 call で等価に縮約できる。spawn round-trip 削減と recovery path 単純化のため次 PR で置き換える
- **resolve-target の auto-detected slug error message（LOW）**: `src/core/finish/resolve-target.ts:170-176` で auto-detected slug が state にヒットしないケースで generic な `--slug` error を返す。"Auto-detected slug '<X>' from awaiting-merge but no matching job state was found" 等の固有メッセージに分岐させる
- **legacy `createArchivePr` のコメント不足（LOW）**: `archive-pr.ts:223` 付近に "legacy combined entry — only used by unit tests; orchestrator uses the 3-function split" のコメントを追加する
- **`git commit` の "nothing to commit" stderr 検出（LOW）**: `src/core/finish/move-requests-dir.ts:73-82` の locale brittle な substring match を `git diff --cached --quiet` の事前判定に置き換える

これらは次 cleanup PR またはフォローアップ change で対処する想定。

## Migration Plan

1. **Phase 1（本 change）**: `specrunner finish` を CLI に追加し、手動 merge する（self-bootstrap 不可のため）
2. **Phase 2（dogfooding-006）**: PR #48 readme-status-section を最初の finish ターゲットとして E2E 検証する
3. **Phase 3（既存 success state の取り扱い）**: 既存の `status="success"` の job state は据え置き。新規 finish 完了時のみ `archived` を書き込む。バックフィル script は提供しない
4. **Rollback**: 新規追加のみで既存挙動を破壊しないため、CLI を 1 つ前のバージョンに戻すだけで完了。state schema 拡張も後方互換のため state file の手当ては不要

## Related

- [ADR-20260430-pr-create-step-design](ADR-20260430-pr-create-step-design.md) — pr-create step の subprocess pattern と gh CLI 採用。本 ADR の D2 / D8 はこれと整合
- [ADR-20260430-external-dependency-policy](ADR-20260430-external-dependency-policy.md) — operational tooling では LLM 不使用 / gh CLI 不要・GitHubClient port で代替の方針。D2 / D3 はこれと整合
- openspec-workflow `request-merge` skill — 設計の参照元。本 change は worktree / LLM auto-fire 前提を Managed Agents 環境向けに削ぎ落とした版
