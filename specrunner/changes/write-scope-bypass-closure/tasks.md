# Tasks: write-scope bypass closure

実装対象は `src/core/step/write-scope.ts`（D5）と `src/core/step/commit-push.ts`
（D2/D3/D4/D6/D7）に限定する。`src/errors.ts` の `writeScopeViolationError` は既存を再利用し、新規
error code は追加しない。各タスクは design.md の Decision を参照する。

## T-01: scoped 自己 commit 規則を write-scope 単一ソースに追加（D5）

- [ ] `src/core/step/write-scope.ts` に純関数
      `findScopedCommitViolations(slug: string, changedPaths: string[], declaredWritePaths: string[], managedPaths: string[]): string[]`
      を追加する。返り値は `changedPaths − declaredWritePaths − managedPaths`（宣言 writes にも
      pipeline 管理 path にも属さない変更 path の集合）。
- [ ] `managedPaths` は引数注入で受け、`write-scope.ts` は `src/util/paths.ts` 以外の src/ を import
      しない（leaf module 制約を維持）。
- [ ] `tests/unit/step/write-scope.test.ts` に本関数の単体テストを追加する（宣言 path 除外 / 管理
      path 除外 / 宣言外 path 検出 / 空入力）。

**Acceptance Criteria**:
- `findScopedCommitViolations` が宣言 writes と managed path を除外し、それ以外の変更 path のみ返す。
- `tests/unit/architecture/write-scope-invariants.test.ts` の TC-010（leaf module 制約）が green のまま。
- 追加した単体テストが green。

## T-02: quarantine を commit 差分レンジ対応に一般化（D6）

- [ ] `quarantineViolationEvidence`（`commit-push.ts`）に任意の diff レンジ指定を受ける口を足す
      （例: 省略可能な `{ base, head }`）。指定時は各違反 path につき `git diff <base> <head> -- <path>`
      を退避し、未指定時は現行どおり `git diff HEAD -- <path>` を退避する。
- [ ] untracked / diff 空時の raw content fallback とディレクトリ生成・退避ファイル命名
      （`write-scope-violation-<step>-<ts>.md`）は現行の挙動を維持する。
- [ ] 既存の guarded / scoped 残余の呼び出しは未指定（worktree 差分）で無改変とする。

**Acceptance Criteria**:
- レンジ指定時に `git diff <base> <head> -- <path>` の内容が退避ファイルに記録される。
- 既存の quarantine-01 / quarantine-02 テストが無改変で green（未指定経路の挙動保存）。

## T-03: commit レンジの変更 path 列挙ヘルパ（D2, fail-closed）

- [ ] `commit-push.ts` に `headBeforeStep..HEAD` の net 変更 path を列挙するヘルパを追加する
      （`git diff --name-only --no-renames <base> <head>` を `infra.spawnFn` 経由で実行）。
- [ ] git error（`gitExec` が null）の場合は `null` を返し、呼び出し側が fail-closed に扱えるようにする
      （空配列と区別する）。成功時は改行分割・trim・空行除去した path 配列を返す。

**Acceptance Criteria**:
- git 正常時に変更 path 配列を返し、git error 時に `null` を返す。
- rename は `--no-renames` により変更 path として列挙される（getWorktreeChangedPaths と対称）。

## T-04: scoped commit の pathspec 化と staged 判定の scope 統一（D3）

- [ ] scoped mode の commit を `git commit -m "<step>: <slug>" -- <宣言 writes + pipeline 管理 path>`
      にする。guarded mode は従来どおり pathspec なし（index 全体）を維持する。
- [ ] 「staged 変更の有無」判定を、scoped は `git diff --cached --quiet -- <同 pathspec>`、guarded は
      `git diff --cached --quiet`（pathspec なし）で行う。
- [ ] scoped で stagePaths が空の場合、index 全体を commit する fallback を発生させない。commit 経路を
      スキップし、HEAD 前進検出（T-05）のみ行う。
- [ ] mode 依存の情報（commit pathspec / mode / 宣言 path / 管理 path）を `commitAndPushTail` へ渡す
      構造にする（D7）。

**Acceptance Criteria**:
- scoped commit の pathspec に許可外の事前 stage path が現れない。
- guarded commit は pathspec なし（`-A` 相当・index 全体）を維持する。
- 既存 TC-003 / TC-004 / TC-006 / TC-022 が（pathspec 追加を許容する形で）green。
- scoped で stagePaths 空のとき commit が呼ばれない（TC-017 が green）。

## T-05: agent 自己 commit の検査（D2, D7）

- [ ] `commitAndPushTail` の HEAD 前進検出経路（staged 変更なし + `headBeforeStep !== HEAD`）で、
      T-03 のヘルパにより `headBeforeStep..HEAD` の変更 path を列挙する。
- [ ] 列挙が `null`（git error）なら push せず fail-closed で halt する。
- [ ] 変更 path を mode 別規則で検査する: scoped → `findScopedCommitViolations`(T-01)、guarded →
      既存 `findWriteScopeViolations`。
- [ ] 違反があれば `quarantineViolationEvidence` にレンジ `{ base: headBeforeStep, head: HEAD }`
      (T-02) を渡して退避し、`writeScopeViolationError(step, branch, violations, quarantinePath)` を
      throw する。**`pushOnly` は呼ばない**。違反 commit は local に残す（`git reset` しない）。
- [ ] 違反が無ければ現行どおり検出ログを出して `pushOnly` する（挙動保存）。

**Acceptance Criteria**:
- guarded / scoped とも、自己 commit に違反 path が含まれると push されず `WRITE_SCOPE_VIOLATION` halt。
- 違反の無い自己 commit は現行どおり push される（TC-018 が green のまま）。
- 列挙失敗時に push されず halt する。

## T-06: scoped 残余違反を halt 化（D4）

- [ ] scoped mode の staging 後 residual 検査で `findWriteScopeViolations` が違反を返した場合、現行の
      quarantine + `git clean -f` / `git checkout HEAD` 復元の **後に** `writeScopeViolationError` を
      throw して halt する（続行しない）。
- [ ] quarantine 退避先を error に渡し、halt メッセージに退避先が含まれるようにする。
- [ ] 復元（checkpoint への混入防止）は throw の前に行う（guarded の two-step restore と対称）。

**Acceptance Criteria**:
- scoped 残余違反（例: judge step の request.md 改変）で `WRITE_SCOPE_VIOLATION` halt になる。
- 復元後に throw され、commit / push は実行されない。
- halt メッセージに退避先パスが含まれる。

## T-07: 隣接コメント / docstring の追随（正典と実装の整合）

- [ ] `commitAndPush` / `commitAndPushTail` / `commitFinalState` の docstring を、拡張後の検査面
      （worktree + index + 自己 commit）と scoped 残余 halt 化・自己 commit 違反時の local commit 保持
      挙動に合わせて更新する。
- [ ] 会話の経緯を含めず、成果物単体で読める記述にする。

**Acceptance Criteria**:
- docstring が実装の挙動（scoped 残余 halt / 自己 commit 検査 / pathspec commit）と一致する。

## T-08: 意図された挙動変更に伴う既存テスト期待の更新

- [ ] `tests/unit/step/commit-push-write-scope.test.ts` の TC-023 群を、scoped 残余違反が **halt する**
      期待へ更新する（現行の「resolves + commit/push 実行」→「rejects with WRITE_SCOPE_VIOLATION、
      commit/push 未実行」）。復元（clean/checkout）が throw 前に呼ばれる点は維持。
- [ ] 同ファイル quarantine-03 を、scoped 残余で **throw する**（退避ファイル生成 + stderr note の後に
      halt）期待へ更新する。
- [ ] 更新は D4 の意図された挙動変更に限定し、他テストの期待を変えない。

**Acceptance Criteria**:
- TC-023 / quarantine-03 が halt 期待で green。
- 上記以外の write-scope / pipeline テストは無改変で green。

## T-09: 新規単体テスト（mock spawn・分岐網羅）

- [ ] scoped 事前 stage 混入: 許可外 path が commit の pathspec に含まれないことを固定する。
- [ ] guarded 自己 commit 違反（request.md 含む）: push されず `WRITE_SCOPE_VIOLATION` halt を固定する。
- [ ] scoped 自己 commit 違反（宣言外 path 含む）: push されず `WRITE_SCOPE_VIOLATION` halt を固定する。
- [ ] 違反の無い自己 commit（guarded: source のみ / scoped: 宣言 path のみ）: push される挙動保存を固定。
- [ ] 自己 commit 検査の列挙失敗（`git diff --name-only` が git error）: push されず halt を固定する。
- [ ] 自己 commit 違反の quarantine に該当 commit 差分が退避され、halt メッセージに退避先が含まれる
      ことを固定する。
- [ ] mock（`makeGitSpawnFn`）が `git diff --cached --quiet` と `git diff --name-only <base> <head>` の
      subcommand 衝突を扱えることを確認する（自己 commit 経路は staged なし=exit0 + range stdout の
      単一 `diff` レスポンスで両立する。必要なら args で分岐する matcher を追加する）。

**Acceptance Criteria**:
- 上記 6 シナリオが green。
- 既存 helper（`makeGitSpawnFn` / `makeScopedStep` / `makeGuardedStep` / `makeCommitPushInfra`）を
  流用する。

## T-10: real-git 統合テスト（3 経路の破壊確認）

- [ ] `test-materialize-boundary.test.ts` の `makeRealGitNoPushSpawnFn`（push のみ intercept、他は実 git
      へ委譲）パターンに倣い、実 git の temp repo で 3 経路を検証する統合テストを追加する。
- [ ] 経路 1（index 混入）: 許可外ファイルを事前 `git add` した状態で scoped commit を実行し、
      `git show --name-only HEAD`（または `git diff HEAD~1 HEAD --name-only`）で commit tree に許可外
      ファイルが **含まれない** ことを検証する。
- [ ] 経路 2（自己 commit 無検査 push）: 実 git で agent 自己 commit を作り request.md を含む場合に
      `commitAndPush` が halt し push が起きない（intercept された push が呼ばれない）ことを検証する。
- [ ] 経路 3（復元続行）: scoped judge step が request.md を改変した状態で halt し、worktree の
      request.md が HEAD へ復元されることを検証する。
- [ ] 各経路について、対応する修正（T-04 / T-05 / T-06）を revert すると当該テストが fail することを
      **破壊確認** としてテストコメントに記録する。

**Acceptance Criteria**:
- 3 経路の統合テストが実 git で green。
- 各テストに破壊確認（revert 時に red になる根拠）がコメントで記録されている。

## T-11: 検証（typecheck && test）と architecture 不変

- [ ] `bun run typecheck && bun run test` が green。
- [ ] `tests/unit/architecture/write-scope-invariants.test.ts`（write-scope leaf / commit-push が
      `stagingModeFor`・`findWriteScopeViolations` を単一ソース経由で呼ぶ）が green。
- [ ] `tests/unit/step/write-scope-rules-consistency.test.ts` が green。

**Acceptance Criteria**:
- `typecheck && test` が green。
- write-scope 単一ソース経由の architecture 不変が維持されている。
