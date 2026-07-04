# Tasks: designLayer 有効時に未 push の設計コミットを run 前に警告する

<!-- 各タスクは書く直前に対象を grep / Read で再検証すること。file:line は shift し得るため symbol で照合する。 -->

## T-01: `WorkspaceOptions` に `designLayerEnabled` を追加する

- [ ] `src/core/port/runtime-strategy.ts` の `WorkspaceOptions` に任意フィールド `designLayerEnabled?: boolean` を追加する。doc コメントで「run path 専用。true のとき setupWorkspace が local base の未 push（ahead）を検出して warning を出す。resume は設定しない」旨を記す。
- [ ] port 層に config 型を持ち込まない（`ResolvedDesignLayer` を import せず boolean のみ）。

**Acceptance Criteria**:
- `WorkspaceOptions` に `designLayerEnabled?: boolean` が存在する。
- `bun run typecheck` green。

## T-02: `pipeline-run.ts` で `designLayerEnabled` を解決して `workspaceOpts` に渡す

- [ ] `src/core/command/pipeline-run.ts` に `resolveDesignLayerConfig` を `../../config/schema.js` から import する。
- [ ] `prepare()` の返り値 `workspaceOpts`（`baseBranch: request.baseBranch` を詰めている箇所）に `designLayerEnabled: resolveDesignLayerConfig(config).enabled` を追加する。`config` は `this.preflightResult` 由来の既存変数を使う。
- [ ] `src/core/command/resume.ts` の `workspaceOpts` は変更しない（resume は ahead 検出対象外）。

**Acceptance Criteria**:
- run path の `workspaceOpts` に `designLayerEnabled` が入り、値が `resolveDesignLayerConfig(config).enabled` と一致する。
- resume path の `workspaceOpts` は `designLayerEnabled` を持たない（未変更）。
- `bun run typecheck` green。

## T-03: `LocalRuntime.setupWorkspace` run path に ahead（未 push）検出を追加する

- [ ] `src/core/runtime/local.ts` の `setupWorkspace()` run path、既存 behind-warning ブロック（`git rev-list HEAD..${remoteBaseRef} --count` → `stderrWrite(... behind ...)`）の**直後**に ahead 検出を追加する。
- [ ] `opts?.designLayerEnabled === true` のときのみ `this.spawnFn("git", ["rev-list", \`${remoteBaseRef}..${baseBranch}\`, "--count"], { cwd: this.cwd })` を実行する。enabled でないときは rev-list を spawn しない。
- [ ] `exitCode === 0` かつ `parseInt(stdout.trim(), 10)` が NaN でなく `> 0` のときのみ `stderrWrite` で warning を出す。それ以外は無出力。
- [ ] warning 文言は自己完結で、安定 substring `ahead of ${remoteBaseRef}`（= `ahead of origin/<baseBranch>`）を含み、以下を伝える: designLayer 有効で local `<baseBranch>` が N commit(s) ahead（未 push）であること／worktree は `${remoteBaseRef}` から作られるため request が引用する設計要素（`[[id]]` / ADR）を欠く可能性があること／`git push origin ${baseBranch}` してから run する対処。
- [ ] behind-warning ブロックの判定・文言・出力条件は変更しない。

**Acceptance Criteria**:
- `designLayerEnabled` 未指定/false のとき、ahead 用 `git rev-list origin/<base>..<base>` が spawn されない。
- `designLayerEnabled: true` かつ ahead > 0 のとき `ahead of origin/<base>` と push 手順を含む warning が stderr に出る。
- ahead 判定が非 0 exit / ahead 0 のとき warning は出ない。
- `bun run typecheck` green。

## T-04: docs に worktree base と push 順序を追記する

- [ ] `docs/request-authoring.md` の「設計要素引用 — 設計レイヤとの紐付け（任意）」節に、以下 2 点を追記する:
  - job の worktree は `origin/<baseBranch>` を base に作られること。
  - designLayer 連携時は、request が引用する設計要素を含むコミットを `origin/<baseBranch>` へ **push してから run** すること（未 push だと worktree がそれらを欠き、request-review が引用を解決できず escalation し得る。run 前に非ブロッキング warning が出る旨も併記してよい）。
- [ ] 記述は成果物単体で読める平文にする（会話・経緯を含めない）。

**Acceptance Criteria**:
- `docs/request-authoring.md` に「worktree の base = `origin/<baseBranch>`」と「設計コミットを push してから run」の記述が存在する。

## T-05: テストで ahead-warning を固定し、behind-warning の不変を確認する

- [ ] `tests/unit/core/runtime/local.test.ts` の `buildMockSpawnFn` を拡張し、`rev-list` 呼び出しを range で振り分ける: range が `HEAD..` で始まる（behind）→ 既存 `behindCount` / `behindExitCode`、range が `origin/` で始まる（ahead）→ 新規 `aheadCount` / `aheadExitCode`（既定 0）。既存 behind テストの戻り値・呼び出し回数が変わらないことを保つ。
- [ ] テスト: `designLayerEnabled: true` かつ `aheadCount > 0` で `setupWorkspace` を呼ぶと、stderr に `ahead of origin/main` を含む warning が出る（`process.stderr.write` spy で照合、既存 behind テストと同じ手法）。
- [ ] テスト: `designLayerEnabled` を渡さない（または false）で `aheadCount > 0` のとき、`ahead of origin/main` warning が出ず、かつ ahead 用 `git rev-list origin/main..main` が calls に現れない。
- [ ] テスト: `designLayerEnabled: true` かつ `aheadCount = 0` のとき warning が出ない。
- [ ] 既存 TC-LR-008 の behind テスト（`behind origin/main` の出る/出ない）を無変更で green に保つ（mock 拡張は後方互換に行う）。

**Acceptance Criteria**:
- 上記 3 つの新規テストが green。
- 既存 behind 系テストが**無変更**で green。
- ahead 判定の spawn 有無（enabled 有無での分岐）が calls 検査で固定される。

## T-06: 検証ゲート

- [ ] `bun run typecheck` green。
- [ ] `bun run test` green（新規テスト含む、既存差分なし）。
- [ ] `bun run lint` green（lint 設定がある場合）。
- [ ] `bun run build` 成功。

**Acceptance Criteria**:
- `typecheck && test` がすべて green。
- 既存テストの差分は無い（本 change の新規テスト追加のみ）。
