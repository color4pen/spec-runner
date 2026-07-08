# Tasks: fast pipeline のガード構成データを自己保護する

## T-01: config 自身を forbidden surface として宣言する

- [ ] `.specrunner/config.json` の `pipeline.fast.forbiddenSurfaces` 配列に、既存 3 surface に
      加えて `{ "id": "guard-config", "paths": [".specrunner/config.json"] }` を追加する
- [ ] 既存 3 surface（`public-types` / `persisted-format` / `state-transitions`）の宣言は変更しない
- [ ] JSON として妥当（schema の `id` 非空文字列・`paths` 非空配列制約を満たす）であることを確認する

**Acceptance Criteria**:
- `pipeline.fast.forbiddenSurfaces` に id `guard-config`・path `.specrunner/config.json` の surface が
  存在する
- `validateConfig` が config に対してエラーを投げない
- 既存 surface の id / paths が保持されている

## T-02: dogfooding テストに guard-config surface の宣言を固定する

- [ ] `tests/unit/core/pipeline/resolve-scope.test.ts` の dogfooding describe
      （実 `.specrunner/config.json` を読むブロック）に、`guard-config` surface の宣言を固定する
      assert を追加する
- [ ] id 固定は `surfaces.some((s) => s.id === "guard-config")` の加算安全な形で書く
- [ ] path 固定は `surfaces.find((s) => s.id === "guard-config")?.paths` が
      `.specrunner/config.json` を含むことを assert する
- [ ] 既存 3 surface の assert・`toHaveLength(3)` を用いるローカル fixture 依存の assert は変更しない

**Acceptance Criteria**:
- guard-config surface の id と path を固定する assert が dogfooding describe に追加されている
- 既存 dogfooding assert は無変更で green
- ローカル fixture（`makeConfigWithSurfaces`）に対する `toHaveLength(3)` の 2 箇所は無変更で green

## T-03: fixture テストで config 変更の breach 検出を固定する

- [ ] `tests/unit/core/step/fast-scope-checkpoint.test.ts` の `makeFastConfig()` fixture に
      `guard-config`（path `.specrunner/config.json`）surface を追加し、実 config と対応させる
- [ ] 既存 breach テスト形式に従い、changed files に `.specrunner/config.json` を与えたとき
      conformance checkpoint の verdict が escalation になることを固定するテストを追加する
- [ ] 同テストで scope finding（origin `scope`・resolution `decision-needed`）が 1 件合成される
      ことを併せて固定する
- [ ] 既存 breach / no-breach / checkpoint 単一性テストは変更しない

**Acceptance Criteria**:
- changed files = `[".specrunner/config.json"]` かつ config 由来 scope で conformance を駆動すると
  `verdict === "escalation"` になるテストが green
- そのケースで origin `scope`・resolution `decision-needed` の finding が 1 件合成される
- 既存の fixture テスト群は無変更で green

## T-04: specrunner worktree 判定 helper を追加する

- [ ] `src/core/worktree/detection.ts` に、cwd が specrunner の job worktree
      （`.git/specrunner-worktrees/` 配下）かを判定する helper（例: `detectSpecrunnerWorktree(cwd)`）
      を追加する
- [ ] cwd を `fs.realpath` で正規化してから path segment を評価し、`.git` の直後に
      `specrunner-worktrees` segment が現れる場合に「内側」と判定する
- [ ] 「内側」のとき、`.git` の親ディレクトリを main checkout root として併せて返す
- [ ] realpath 失敗（存在しない cwd 等）や該当なしのときは「内側でない」を返す（fail-open）
- [ ] 既存 `detectWorktree` は変更しない（別関数として追加する）

**Acceptance Criteria**:
- `<root>/.git/specrunner-worktrees/<slug>-<id>` および その配下を cwd に与えると「内側」と判定し、
  main root として `<root>` を返す
- main checkout（`.git` がディレクトリ）や無関係パスを与えると「内側でない」を返す
- `detectWorktree` の既存テストは無変更で green

## T-05: ResumeCommand.prepare() に worktree ガードを組み込む

- [ ] `src/core/command/resume.ts` の `prepare()` 最上部（`cwd` 確定直後・`resolveJobStateBySlug`
      および `loadConfig` より前）で T-04 の helper を呼ぶ
- [ ] 「内側」のとき、`worktreeGuardError("job resume", mainCheckoutPath)` のメッセージと hint を
      `logError` / `stderrWrite` で出力し、内部 `PrepareError(2, ...)` を投げて exit 2 で中断する
- [ ] main checkout（内側でない）のときは何もせず従来フローを継続する（no-op）
- [ ] job state 解決・state 遷移・config 読み込みなどの副作用がガード拒否時に走らないことを保証する

**Acceptance Criteria**:
- worktree 内 cwd の resume は、job state を解決せず・config を読まず・state を遷移させずに
  exit 2 で中断する
- 出力に worktree 拒否メッセージと main checkout 再実行案内（hint）が含まれる
- main checkout からの resume はガードを素通りする

## T-06: worktree resume 拒否と main checkout 継続をテストで固定する

- [ ] `tests/unit/core/command/resume.test.ts`（または CLI レベルのテスト）に、tempDir 配下へ実在
      する `.git/specrunner-worktrees/<slug>-<id>` ディレクトリを作成し、そこを cwd として resume を
      起動するテストを追加する
- [ ] 拒否テストは exit 非 0（2）を assert し、stderr が
      `/cannot be run from inside a worktree/i` と `/Run from the main worktree/i` に一致することを
      固定する（main-path の完全一致には依存しない）
- [ ] 拒否時に job state 解決・config 読み込みへ進んでいない（ガードが最上部で発火する）ことを、
      exit code とメッセージで観測可能な形で固定する
- [ ] main checkout（`cwd: tempDir`）からの resume が従来どおり動作することは、既存テストが
      無変更で green であることで担保する（新規テスト追加不要）

**Acceptance Criteria**:
- worktree 内 cwd resume のテストが exit 2・worktree 拒否メッセージ・main checkout 案内を固定して green
- main checkout からの resume を対象とする既存テストが無変更で green
- テストは worktree cwd を実在ディレクトリとして作成し、realpath prefix に依存しない assert を用いる

## T-07: 検証

- [ ] `bun run typecheck` が green
- [ ] `bun run test` が green（既存 resume / worktree-guard / resolve-scope / fast-scope-checkpoint
      テストの regression が無いこと）

**Acceptance Criteria**:
- `typecheck && test` が green
- 既存テストは本 change で無変更のまま green（受け入れ基準の「既存テスト無変更で green」を満たす）
