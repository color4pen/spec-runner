# Design: `--no-worktree` モードで worktree を作らず cwd で run / resume を実行する

## Context

`specrunner run` / `resume` は `LocalRuntime.setupWorkspace`（`src/core/runtime/local.ts`）で `git worktree add` により隔離作業ディレクトリ（`.git/specrunner-worktrees/<slug>-<jobId8>/`）を作り、feature branch で pipeline を実行する。worktree の有無に依存するのは以下の限定箇所である:

- `LocalRuntime.setupWorkspace`：worktree 作成・branch 作成・sidecar 書き込み・request.md commit。
- `LocalRuntime.buildDeps` の `storeFactory` と `slugStoreOpts()`：`workspace.worktreePath` が無いと throw / undefined を返す。
- `LocalRuntime.registerCleanup` / `teardown`：失敗時 worktree remove/prune。
- exit-guard（`src/core/lifecycle/exit-guard.ts`）：`.git/specrunner-worktrees/` を走査して job を特定する。
- archive orchestrator（`src/core/archive/orchestrator.ts`）Phase 2：worktree remove/prune。
- resume の store 解決（`src/core/command/resume.ts` の `resolveStateStoreByJobId`）：machine-local sidecar index に依存する。

pipeline の各 step は `deps.cwd` のみで作業する（`commitAndPush` / `commitFinalState` も `deps.cwd`）。したがって「worktree を作らず cwd を `deps.cwd` として返す」分岐を `setupWorkspace` に足せば、pipeline 本体は無改修で動く。

CI 環境では worktree は不要で有害ですらある:
- CI は毎回使い捨ての clean checkout であり worktree 再利用に意味がない。
- resume は前回 worktree の発見に sidecar を要するが、CI の ephemeral runner に sidecar は残らない。
- CI runner は feature branch を checkout 済みで来られる。

### 制約

- worktree モード（デフォルト）の既存挙動・既存テストを一切変えない。
- branch 命名規則 `change/<slug>-<jobId8>` は維持する（変更しない）。
- state.json の slug-mode シリアライズ（`stateToStateJson`）は machine-local フィールド（`worktreePath` / `pid` / `session`）を strip する。archive が別プロセス・別 checkout（merge 後の main）から判別するための情報は、strip されない portable フィールドに載せる必要がある。

## Goals / Non-Goals

**Goals**:

- `run` / `job start` / `resume` に `--no-worktree` フラグを追加する。
- `--no-worktree` 時、`setupWorkspace` が worktree を作らず cwd を作業ディレクトリとして返す。run は base branch の clean checkout 上で `git checkout -b` により feature branch を作る。resume は既存 feature branch checkout を前提に何も作らない。
- `--no-worktree` 時、実行前に working tree が clean であることを必須にする。
- no-worktree で実行された job を後続 archive（別プロセス）が判別し、Phase 2 の worktree remove/prune をスキップできるようにする。feature branch 削除は通常通り行う。
- no-worktree 時、sidecar の `worktreePath` を null とし、`pid` / `jobId` は通常通り記録する。
- no-worktree 時、exit-guard が worktree 走査に依存せず cwd の state から job を特定する。
- no-worktree 時、resume の state store 解決を sidecar に依存せず cwd 直接にする。

**Non-Goals**:

- `CI=true` 環境変数による `--no-worktree` 自動判定（別途）。
- branch 命名規則の変更。
- CI workflow yaml サンプル（別 request `ci-workflow-sample`）。
- dispatcher / 開発ランナーの構築。
- managed runtime への影響（managed は元々 worktree を使わない。本変更は LocalRuntime に閉じる）。

## Decisions

### D1: `--no-worktree` を boolean フラグとして run / job start / resume に追加し、`WorkspaceOptions.noWorktree` まで配線する

CLI（`src/cli/command-registry.ts`）の `run` / `job start` / `job resume` に `no-worktree: { type: "boolean" }` を追加し、各 handler が `noWorktree` を options に乗せる。`runRunCore` / `runResumeCore`（`src/cli/run.ts` / `src/cli/resume.ts`）→ `PipelineRunCommand` / `ResumeCommand` の options → `prepare()` が `WorkspaceOptions.noWorktree` に設定する。`WorkspaceContext` / `WorkspaceOptions`（`src/core/port/runtime-strategy.ts`）に `noWorktree?: boolean` を追加する。

- **Rationale**: 実行モードの選択は呼び出し側（CLI / CI）の関心であり、フラグとして明示的に渡すのが素直。state からの推論は run 時には未確定なので不可。配線は既存の `json` フラグと同じ経路を踏襲でき、新しい seam を増やさない。
- **Alternatives considered**:
  - 新 `RuntimeStrategy`（NoWorktreeRuntime）を作る：worktree 以外の振る舞い（agent 実行・commit・step lifecycle）は LocalRuntime と完全に同一であり、戦略を分けると大量の重複かサブクラス化を招く。architect 評価でも「`setupWorkspace` の分岐で実装」が選好。却下。

### D2: `setupWorkspace` に no-worktree 分岐を追加し、cwd をそのまま作業ディレクトリとして返す

`opts.noWorktree === true` のとき、`setupWorkspace` は冒頭で他の全分岐より先に no-worktree パスへ入る。

- **run パス**（`existingWorktreePath` が undefined）: working tree clean を検証（D3）→ `git checkout -b <branchName>` で feature branch を作成・切替（base branch の clean checkout 上で実行される前提）→ `WorkspaceContext = { cwd: this.cwd, worktreePath: undefined, branch: branchName }`。request.md の change folder へのコピー・git add・commit・draft 削除は worktree 版と同じロジックを `this.cwd` 上で実行する。bootstrapState の seed と branch の state 記録も cwd の slug store に対して行う。
- **resume パス**（`existingWorktreePath` が指定 / null いずれでも noWorktree なら）: working tree clean を検証（D3）→ worktree 作成・recreate は行わず `WorkspaceContext = { cwd: this.cwd, worktreePath: undefined }` を返す。sidecar の pid refresh のみ行う（D6）。

`git fetch origin` は no-worktree run では行わない（CI checkout が fresh である前提。worktree 版は `origin/main` から worktree を切るため fetch するが、no-worktree は現在の HEAD = base branch から branch を切る）。

- **Rationale**: pipeline step は `deps.cwd` だけで動くため、worktree か cwd かは `WorkspaceContext.cwd` の差し替えで吸収できる。run が `checkout -b` を使うのは要件 2 の明示指定どおりで、隔離が無い前提に最も素直。
- **Alternatives considered**:
  - no-worktree でも `origin/main` を fetch して reset する：CI checkout は既に fresh であり、reset は CI が checkout した内容を壊しうる。要件 2 の「clean checkout 上で checkout -b」に反するため却下。

### D3: no-worktree は実行前に working tree clean を必須とする

no-worktree 分岐の冒頭で `git status --porcelain`（`cwd`）を実行し、出力が非空なら停止する。新エラーコード `WORKTREE_DIRTY`（`src/errors.ts`）を追加し、factory `worktreeDirtyError()` を用意する。`setupWorkspace` から throw され、`CommandRunner.execute` の setupWorkspace 失敗ハンドラが job を `failed` に遷移させて exit 1 を返す（既存経路を流用）。

- **Rationale**: worktree は隔離空間なので dirty でも安全だが、no-worktree は cwd を直接操作するため未コミット変更・untracked が pipeline の commit/push に混入する。clean を入口で保証すれば隔離無しでも安全。CI は毎回 clean なので自然に通る。
- **Alternatives considered**:
  - dirty を許容し stash する：stash の復元失敗や agent 生成物との干渉で状態が複雑化。要件 3 が明示的に「エラーとする」を指定しているため却下。
  - preflight（`src/cli/run.ts`）で検査する：resume には preflight が無く二重実装になる。`setupWorkspace` 分岐に集約する方が単一箇所。

### D4: no-worktree 判別は JobState の portable フィールド `noWorktree: boolean` で永続化する（要件 4）

`JobState`（`src/state/schema.ts`）に optional `noWorktree?: boolean` を追加する。`stateToStateJson` の machine-local strip 対象（`worktreePath` / `pid` / `session`）には**含めない**ため、slug-mode でも state.json に書き出され、feature branch に commit され、PR merge で main に載る。archive は Phase 0 で読む state からこのフラグを得る。

run 時に `prepare()` が `jobState.noWorktree = true` を設定し、`bootstrapState`（= 同一 jobState 参照）として `setupWorkspace` が cwd slug store に seed する。

- **Rationale**: archive（別プロセス・merge 後 main checkout）は `JobStateStore.list(cwd)` → `specrunner/changes/<slug>/state.json` から state を読む。フラグを portable フィールドに載せれば、worktree の有無という machine-local 情報に依存せず、merge を跨いで判別できる。`commitAndPush` は各 step 境界で `git add -A` するため state.json は feature branch に push 済みで、merge で main に到達する。
- **Alternatives considered**:
  - sidecar（liveness.json）にフラグを持たせる：sidecar は gitignore された machine-local で CI の別 runner / merge 後 main には存在しない。archive が読めないため却下。
  - branch 名の規約で判別する：branch 命名規則変更は scope 外、かつ脆い文字列規約に依存する。却下。

### D5: no-worktree 時の JobStateStore 解決は cwd 直接（`{ slug, stateRoot: cwd }`）にして sidecar index 依存を断つ（要件 6 の resume 側根拠）

`LocalRuntime` 内の store 解決を worktreePath 不在時に cwd へフォールバックさせる:

- `buildDeps` の `storeFactory`: `const stateRoot = workspace.worktreePath ?? workspace.cwd;` を使い throw しない。
- `slugStoreOpts()`: `this.workspace?.worktreePath ?? this.workspace?.cwd` を stateRoot に使う（registerCleanup / signal handler / cleanup が cwd state を読み書きできる）。

resume（`src/core/command/resume.ts`）は `--no-worktree` 時、stale 回復 persist と running 遷移 persist の store を `resolveStateStoreByJobId`（sidecar 依存）ではなく `new JobStateStore(jobId, cwd, { slug, stateRoot: cwd })` で解決する。

- **Rationale**: `resolveStateStoreByJobId` は `resolveJobIdToSlug`（machine-local sidecar index）から始まり、sidecar が無いと null を返して persist がスキップされる。CI ephemeral runner には sidecar が無いため、no-worktree resume では cwd の `specrunner/changes/<slug>/state.json`（feature branch checkout）を直接対象にする必要がある。slug は CLI / 解決済み state から既知。
- **Alternatives considered**:
  - `resolveStateStoreByJobId` に cwd canonical フォールバックを常時追加する：sidecar 入口で early-return する現構造を崩し worktree モードの解決順序に影響する。no-worktree に限定した分岐の方が回帰リスクが低い。却下。

### D6: sidecar は `worktreePath: null`、`pid` / `jobId` は通常記録（要件 5）

`writeLivenessSidecar` の引数を `worktreePath: string | null` に拡げ、no-worktree 時は null を渡す。JSON は `{ pid, session: null, worktreePath: null, jobId }`。

- **Rationale**: worktreePath は隔離パスを指すフィールドで、no-worktree には存在しない。pid は同一 workspace 内 resume の stale 判定に有用なので残す。要件 5 の明示どおり。
- **Alternatives considered**: sidecar を書かない案：同一 workspace 内での pid liveness が失われ、`isStaleRunning` が age fallback に落ちる。要件 5 が「pid / jobId は通常通り記録」を指定するため却下。

### D7: exit-guard は no-worktree 時 cwd の state から job を直接特定する（要件 6）

`createExitGuardHandler(repoRoot, jobId, opts?)` に `opts?: { noWorktree?: boolean; slug?: string }` を追加する。`CommandRunner.execute` の `beforeExit` 登録で `workspaceOpts.noWorktree` と `slug` を渡す。no-worktree 時は `.git/specrunner-worktrees/` 走査をスキップし、`new JobStateStore(jobId, repoRoot, { slug, stateRoot: repoRoot })` で state を読み、running なら interruption 記録 + `awaiting-resume` 遷移を行う。

- **Rationale**: no-worktree には走査対象の worktree dir が存在しない。現状でも global scan へフォールバックして動くが、要件 6 は worktree 走査に依存せず cwd state から直接特定することを求める。slug 既知なら cwd 直接解決が確定的で速い。
- **Alternatives considered**: global scan フォールバックに委ねる：`JobStateStore.list` 全走査は遅く、複数 active job 環境で対象を取り違える余地がある。明示分岐を採る。

### D8: archive Phase 2 は `state.noWorktree` で worktree remove/prune をスキップする（要件 7）

`runArchiveOrchestrator`（`src/core/archive/orchestrator.ts`）Phase 0 で `state.noWorktree` を捕捉し、Phase 2 のガードを `if (worktreePath && !noWorktree)` にする。`runMergeThenArchive` 経由でも同じ orchestrator を通るため両経路で有効。sidecar / managed marker 削除と feature branch 削除（local + remote）は従来通り実行する。

- **Rationale**: 要件 7 どおり worktree 撤去のみスキップし branch 削除は維持する。`resolveWorktreePathForArchive` は no-worktree でも convention path（`buildWorktreePath`）を返しうるため、worktreePath の有無ではなく明示フラグでガードする方が誤動作・警告ノイズが無い。
- **Alternatives considered**: worktreePath 不在で判別する：convention fallback が非 null を返すため不可。明示フラグで判別する。

### D9: no-worktree resume の世代跨ぎ再開は既存の stale 回復に委ねる

別 runner（fresh checkout）での resume では、最後に push 済みの state（`running`、`pid` は slug-mode strip で null）を読む。`isStaleRunning`（`src/core/resume/safety.ts`）は「pid 無し + sidecar 無し → stale」と判定し `awaiting-resume` へ回復してから再開する。同一 workspace 内 resume では exit-guard が書いた `awaiting-resume` をそのまま読む。

- **Rationale**: 既に `resume-liveness-pid-update` で「sidecar 欠如 = CI fresh checkout → stale」判定が入っており、no-worktree CI 再開はこの経路で成立する。新たな state push 機構は不要。
- **Alternatives considered**: exit-guard で awaiting-resume を commit+push する：プロセス終了経路での push は不安定で、stale 回復で同等の結果が得られるため不要。却下。

### D10: worktree モードと worktree guard は不変（要件 8）

`opts.noWorktree` が偽のとき `setupWorkspace` は現行コードパスを 1 行も変えない。bin の worktree guard（`bin/specrunner.ts`）も変更しない。no-worktree は通常 checkout（`.git` が directory）から呼ばれるため guard は自然に通過する。

- **Rationale**: 既存テスト全 green の受け入れ基準を満たすには、デフォルト経路を物理的に触らない分岐配置が最も安全。guard は「worktree の中で実行するな」という別目的の防御であり no-worktree と直交する。

## Risks / Trade-offs

- [no-worktree run が誤って feature branch / dirty な checkout 上で呼ばれる] → **Mitigation**: D3 の clean 必須で dirty を弾く。branch については `git checkout -b` が既存 branch 名で失敗する（jobId 付きで一意なので通常衝突しない）。run は base branch 上で呼ばれる前提を spec/acceptance で明示。
- [archive が merge 前の checkout で state を読み `noWorktree` を取り違える] → **Mitigation**: `noWorktree` は portable フィールドで feature branch に commit 済み。merge 後 main にも載るため、merge 前後どちらの checkout でも値は一致する。
- [no-worktree 時の store 解決分岐の追加による回帰] → **Mitigation**: 分岐は `noWorktree` / worktreePath 不在に限定し、worktree モードの解決順序は不変。worktree モード既存テストで回帰検知。
- [legacy state に `noWorktree` が無い] → **Mitigation**: optional フィールドで absent は `undefined`（= worktree モード扱い）。`validateJobState` に必須化を入れない。

## Open Questions

なし。要件 4 の永続化手段は D4（portable state フィールド）で確定。

## Migration Plan

- 後方互換: `noWorktree` は optional。既存 state / 既存 worktree job は absent → worktree モードとして従来どおり動く。
- ロールバック: 本変更の revert で CLI フラグ・分岐とも除去でき、state スキーマ非互換は発生しない（`noWorktree` を無視する旧コードでも state は読める）。
- 利用者向け: `specrunner run --no-worktree <slug>` / `specrunner resume --no-worktree <slug>` を CI（feature branch checkout 済み・clean）で使う。ローカルの人手運用はフラグ無しの worktree モードを継続。
