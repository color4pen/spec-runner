# CI向け `--no-worktree` 実行モードの導入

**Date**: 2026-06-07
**Status**: accepted
**Related**: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（LocalRuntime 設計の上位決定）

## Context

`specrunner run` / `resume` は `LocalRuntime.setupWorkspace` で `git worktree add` により `.git/specrunner-worktrees/<slug>-<jobId8>/` を作り、feature branch で隔離実行する。この設計はローカル開発では有効だが、CI 環境では構造的な問題がある：

- CI は使い捨ての checkout であり worktree の再利用に意味がない
- resume の store 解決は machine-local sidecar index に依存するが、CI の ephemeral runner に sidecar は残らない
- CI runner が feature branch を checkout 済みで来る場合、worktree は不要で有害

pipeline の各 step は `deps.cwd` のみで作業する（`commitAndPush` / `commitFinalState` も `deps.cwd`）。したがって「worktree を作らず cwd を作業ディレクトリとして返す」分岐を `setupWorkspace` に追加すれば、pipeline 本体は無改修で動く。

## Decision

### D1: `--no-worktree` を boolean フラグとして run / job start / resume に追加し `WorkspaceOptions.noWorktree` まで配線する

`WorkspaceOptions` / `WorkspaceContext`（`src/core/port/runtime-strategy.ts`）に `noWorktree?: boolean` を追加し、CLI → handler → `PipelineRunCommand` / `ResumeCommand` → `setupWorkspace` まで配線する。worktree モードがデフォルトで変わらない。

**Rationale**: 実行モードの選択は呼び出し側（CLI / CI）の関心であり、フラグとして明示的に渡すのが素直。run 開始時点では state は未作成であり state からの推論は不可。配線は既存の `--json` フラグと同じ経路を踏襲し新たな seam を増やさない。

### D2: `setupWorkspace` に no-worktree 分岐を追加し cwd をそのまま作業ディレクトリとして返す（新 RuntimeStrategy は作らない）

`opts.noWorktree === true` のとき `setupWorkspace` は冒頭の排他分岐に入る。

- **run パス**: clean 検証（D3）→ `git checkout -b <branchName>` で feature branch を作成・切替 → `WorkspaceContext = { cwd, worktreePath: undefined, branch }`。request.md のコピー・git add・commit・bootstrapState の slug store 書き込みは worktree 版と同じロジックを `this.cwd` 上で実行する。
- **resume パス**: clean 検証（D3）→ worktree 作成・recreate を行わず `WorkspaceContext = { cwd, worktreePath: undefined }` を返す。sidecar の pid refresh のみ行う。

`git fetch origin` は no-worktree run では行わない（CI checkout が fresh の前提。worktree 版は `origin/main` から worktree を切るため fetch するが、no-worktree は現在 HEAD = base branch から branch を切る）。

**Rationale**: pipeline step は `deps.cwd` だけで動くため、worktree か cwd かは `WorkspaceContext.cwd` の差し替えで吸収できる。新規 `NoWorktreeRuntime`（RuntimeStrategy）を作ると agent 実行・commit・step lifecycle など worktree 以外の振る舞いがすべて重複するかサブクラス化を招く。`setupWorkspace` の限定分岐が最小変更で回帰リスクが低い。

### D3: no-worktree は実行前に working tree が clean であることを必須とする

no-worktree 分岐の冒頭で `git status --porcelain` を実行し非空なら `WORKTREE_DIRTY` エラーで停止する（`src/errors.ts` に追加）。`setupWorkspace` から throw され、既存の setupWorkspace 失敗ハンドラが job を `failed` に遷移させて exit 1 を返す。

**Rationale**: worktree は隔離空間なので dirty でも安全だが、no-worktree は cwd を直接操作するため未コミット変更・untracked が pipeline の commit/push に混入する。clean を入口で保証すれば隔離なしでも安全。CI は毎回 clean checkout なので自然に通る。

### D4: no-worktree の判別は JobState の portable フィールド `noWorktree: boolean` で永続化する

`JobState`（`src/state/schema.ts`）に `noWorktree?: boolean` を追加する。machine-local strip 対象（`worktreePath` / `pid` / `session`）には含めないため、slug-mode でも `specrunner/changes/<slug>/state.json` に書き出され、feature branch に commit され、PR merge で main に載る。archive は Phase 0 で読む state からこのフラグを得る。

**Rationale**: archive は別プロセス・merge 後 main checkout から `JobStateStore.list(cwd)` で state を読む。sidecar は gitignore された machine-local であり CI の別 runner / merge 後 main には存在しない。branch 名の規約依存は命名規則変更で崩れる。portable state フィールドが唯一の安定した判別手段。

### D5: no-worktree 時の JobStateStore 解決は cwd 直接にして sidecar index 依存を断つ

`buildDeps` の `storeFactory`: `const stateRoot = workspace.worktreePath ?? workspace.cwd` として throw しない。`slugStoreOpts()`: `this.workspace?.worktreePath ?? this.workspace?.cwd` を stateRoot に使う。resume（`src/core/command/resume.ts`）の `--no-worktree` 時は `resolveStateStoreByJobId`（sidecar 依存）を使わず `new JobStateStore(jobId, cwd, { slug, stateRoot: cwd })` で解決する。

**Rationale**: `resolveStateStoreByJobId` は machine-local sidecar index から始まり、sidecar が無いと null を返して persist がスキップされる。CI ephemeral runner に sidecar は無いため、no-worktree resume では feature branch checkout 上の `state.json` を直接対象にする必要がある。

### D6: sidecar は `worktreePath: null`、`pid` / `jobId` は通常記録する

`writeLivenessSidecar` の引数を `worktreePath: string | null` に拡げ、no-worktree 時は null を渡す。

**Rationale**: `worktreePath` は隔離パスを指すフィールドで no-worktree には存在しない。pid は同一 workspace 内 resume の stale 判定に有用なので残す。

### D7: exit-guard は no-worktree 時 cwd の state から job を直接特定する

`createExitGuardHandler` に `opts?: { noWorktree?: boolean; slug?: string }` を追加する。no-worktree 時は `.git/specrunner-worktrees/` 走査をスキップし `new JobStateStore(jobId, repoRoot, { slug, stateRoot: repoRoot })` で state を読む。

**Rationale**: no-worktree には走査対象の worktree dir が存在しない。`JobStateStore.list` 全走査は遅く、複数 active job 環境で対象を取り違える余地がある。slug 既知なら cwd 直接解決が確定的で速い。

### D8: archive Phase 2 は `state.noWorktree` で worktree remove/prune をスキップする

`runArchiveOrchestrator` Phase 0 で `state.noWorktree` を捕捉し、Phase 2 のガードを `if (worktreePath && !noWorktree)` にする。feature branch 削除（local + remote）と sidecar / managed marker 削除は従来通り実行する。

**Rationale**: `resolveWorktreePathForArchive` は convention fallback で no-worktree でも非 null の path を返しうる。worktreePath の有無ではなく明示フラグでガードする方が誤動作・警告ノイズが無い。

### D9: no-worktree resume の世代跨ぎ再開は既存の stale 回復に委ねる

別 runner（fresh checkout）での resume では `isStaleRunning`（pid 無し + sidecar 無し → stale）が `awaiting-resume` へ回復してから再開する。新たな state push 機構は不要。

**Rationale**: `resume-liveness-pid-update` で「sidecar 欠如 = CI fresh checkout → stale」判定が既に入っており、no-worktree CI 再開はこの経路で成立する。

### D10: worktree モードとデフォルト動作は不変

`opts.noWorktree` が偽のとき `setupWorkspace` は現行コードパスを 1 行も変えない。bin の worktree guard（`bin/specrunner.ts`）も変更しない。

**Rationale**: 既存テスト全 green の受け入れ基準を満たすには、デフォルト経路を物理的に触らない分岐配置が最も安全。

## Alternatives Considered

### Alternative 1: D2 — 新規 `NoWorktreeRuntime`（RuntimeStrategy）を作る

- **Pros**: LocalRuntime と明確に分離でき、no-worktree 固有の振る舞いが一箇所に集まる
- **Cons**: agent 実行・commit・step lifecycle など worktree 以外の振る舞いがすべて重複するかサブクラス化を招く。LocalRuntime の修正が常に NoWorktreeRuntime にも波及する管理コストが生じる
- **Why not**: request.md の architect 評価でも「`setupWorkspace` の分岐で実装」が選好されており、重複コストに見合う分離効果がない。却下

### Alternative 2: D3 — dirty な working tree を stash してから実行する

- **Pros**: dirty な checkout でも no-worktree が使える
- **Cons**: stash 復元失敗や agent 生成物との干渉で状態が複雑化する
- **Why not**: 要件 3 が「エラーとする」を明示しており、stash による黙示的な state 操作は要件と矛盾する。却下

### Alternative 3: D3 — clean 検証を `setupWorkspace` ではなく preflight（`src/cli/run.ts`）で行う

- **Pros**: run の開始前に早期検出できる
- **Cons**: resume には preflight が無く、同じ検証を `setupWorkspace` と preflight の二箇所に実装することになる
- **Why not**: `setupWorkspace` 分岐に集約する方が単一箇所で保守できる。却下

### Alternative 4: D4 — sidecar（liveness.json）に `noWorktree` フラグを持たせる

- **Pros**: 実装が最小
- **Cons**: sidecar は gitignore された machine-local。CI の別 runner / merge 後 main に存在せず archive が読めない
- **Why not**: archive の判別要件（別プロセス・merge 後 main checkout）を満たせない。却下

### Alternative 5: D4 — branch 名の規約でモードを判別する

- **Pros**: 既存フィールドへの追加が不要
- **Cons**: 命名規則変更は scope 外。文字列規約への依存は脆く、規則変更で即座に壊れる
- **Why not**: 脆い文字列規約に依存する判別は保守性を損なう。却下

### Alternative 6: D5 — `resolveStateStoreByJobId` に cwd canonical フォールバックを常時追加する

- **Pros**: no-worktree 専用分岐が不要になる
- **Cons**: sidecar 入口で early-return する現構造を崩し、worktree モードの解決順序に影響する
- **Why not**: worktree モードへの回帰リスクが生じる。no-worktree に限定した分岐の方が安全。却下

### Alternative 7: D7 — exit-guard は no-worktree 時も global scan（`JobStateStore.list`）フォールバックに委ねる

- **Pros**: exit-guard に no-worktree 分岐を追加しなくて済む
- **Cons**: `JobStateStore.list` 全走査は遅く、複数の active job が存在する環境で対象を取り違える余地がある
- **Why not**: slug 既知なら cwd 直接解決が確定的で速い。スキャン依存を残す理由がない。却下

### Alternative 8: D8 — archive Phase 2 の worktree スキップを `worktreePath` 不在で判別する

- **Pros**: 明示フラグの追加が不要
- **Cons**: `resolveWorktreePathForArchive` は convention fallback（`buildWorktreePath`）で no-worktree でも非 null の path を返しうるため、不在判別が機能しない
- **Why not**: convention fallback により false negative が生じる。明示フラグ（`state.noWorktree`）での判別が唯一確実。却下

### Alternative 9: D9 — exit-guard で `awaiting-resume` 遷移を commit+push する

- **Pros**: fresh checkout での resume 時に sidecar が無くても state が push 済みになっている
- **Cons**: プロセス終了経路での push は不安定であり、ネットワークエラー等で state が失われるリスクがある
- **Why not**: stale 回復（`isStaleRunning`: pid 無し + sidecar 無し → stale → awaiting-resume）で同等の結果が得られる。不安定な exit 時 push は不要。却下

## Consequences

### Positive

- CI 環境で worktree を作らずに `specrunner run --no-worktree <slug>` / `specrunner resume --no-worktree <slug>` が動く
- pipeline 本体（各 step）は `deps.cwd` で動くため無改修で両モードに対応できる
- `noWorktree` は optional フィールドで後方互換。既存 state（フィールド absent）は worktree モードとして従来通り動く
- worktree モードの既存テストが全て green のまま

### Negative / Known Debt

- no-worktree が誤って dirty な checkout 上で呼ばれた場合はエラーで停止する（CI では問題ないが人手操作でのミスは起こりうる）
- no-worktree の store 解決が worktree モードと異なるコードパスを持つため、将来の store 解決変更で両方を更新する必要がある
- `CI=true` 環境変数による自動判定は scope 外（後日対応）

## References

- Request: `specrunner/changes/no-worktree-mode/request.md`
- Design: `specrunner/changes/no-worktree-mode/design.md`
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`
