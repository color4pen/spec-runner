# Test Cases: `job attach --branch` — remote branch から quiescent job を attach する

## Summary

- **Total**: 36 cases
- **Automated** (unit/integration): 35 (unit: 32, integration: 3)
- **Manual**: 1
- **Priority**: must: 32, should: 4, could: 0

---

## TC-001: 明示 branch のみを fetch する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は明示 branch の remote checkpoint を fetch して読む > Scenario: 明示 branch のみを fetch する

---

## TC-002: tree から slug を導出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は明示 branch の remote checkpoint を fetch して読む > Scenario: tree から slug を導出する

---

## TC-003: attach 可能な change folder が tree に存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は明示 branch の remote checkpoint を fetch して読む > Scenario: attach 可能な change folder が tree に存在しない

---

## TC-004: 自己整合でない checkpoint を拒否し、何も作らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は checkpoint tree の自己整合を検証してから初めてローカル状態を作る > Scenario: 自己整合でない checkpoint を拒否し、何も作らない

---

## TC-005: awaiting-resume のみを attach 対象とする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は checkpoint tree の自己整合を検証してから初めてローカル状態を作る > Scenario: awaiting-resume のみを attach 対象とする

---

## TC-006: 検証成功後にのみローカル状態を作る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は checkpoint tree の自己整合を検証してから初めてローカル状態を作る > Scenario: 検証成功後にのみローカル状態を作る

---

## TC-007: worktree が checkpoint commit を持つ

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach は feature branch HEAD（checkpoint commit）から worktree を materialize する > Scenario: worktree が checkpoint commit を持つ

---

## TC-008: 既存 resume 系 plan の挙動は不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は feature branch HEAD（checkpoint commit）から worktree を materialize する > Scenario: 既存 resume 系 plan の挙動は不変

---

## TC-009: sidecar の形状

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach は liveness sidecar を pid=null で再構築する > Scenario: sidecar の形状

---

## TC-010: attach は自動 resume しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach と resume は別動詞であり、attach 後に resume が無改変で成立する > Scenario: attach は自動 resume しない

---

## TC-011: attach → resume が成立する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach と resume は別動詞であり、attach 後に resume が無改変で成立する > Scenario: attach → resume が成立する

---

## TC-012: attach 用 error code が ERROR_CODES と ErrorCode union に存在する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: typed error 分類を追加する

**GIVEN** `src/errors.ts` を import した状態
**WHEN** `ERROR_CODES` オブジェクトと `ErrorCode` 型を参照する
**THEN** `CHECKPOINT_NOT_FOUND` / `CHECKPOINT_NOT_ATTACHABLE` / `ATTACH_FETCH_FAILED` / `ATTACH_RUNTIME_UNSUPPORTED` の 4 つが `ERROR_CODES` に存在し、`ErrorCode` union に含まれる

---

## TC-013: attach 用 factory 関数が正しい code を持つ SpecRunnerError を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: typed error 分類を追加する

**GIVEN** 各 factory 関数（`checkpointNotFoundError` / `checkpointNotAttachableError` / `attachFetchFailedError` / `attachRuntimeUnsupportedError`）を呼び出せる状態
**WHEN** 各 factory に適切な引数を渡す
**THEN** それぞれ `SpecRunnerError` インスタンスが返り、`.code` が対応する `ERROR_CODES` 定数と一致する

---

## TC-014: composeSplitLayoutFromContent が valid な入力で state を復元する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: 内容ベースの projection compose を追加する

**GIVEN** 正常な `state.json` 文字列と `events.jsonl` 文字列（改行区切り JSONL）
**WHEN** `composeSplitLayoutFromContent(stateJson, eventsJsonl)` を呼ぶ
**THEN** `{ state, corruption }` が返り、`state` が正しく復元され `corruption === null` である

---

## TC-015: composeSplitLayoutFromContent が journal 破損時に corruption を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: 内容ベースの projection compose を追加する

**GIVEN** 正常な `state.json` と不正な JSON を含む `events.jsonl`（corruption を引き起こす内容）
**WHEN** `composeSplitLayoutFromContent(stateJson, eventsJsonl)` を呼ぶ
**THEN** `corruption !== null` が返る（throw ではなく corruption object として報告される）

---

## TC-016: composeSplitLayoutFromContent が空 events 文字列を空 fold として扱う

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: 内容ベースの projection compose を追加する

**GIVEN** 正常な `state.json` と空文字列 `""` の `eventsJsonl`
**WHEN** `composeSplitLayoutFromContent(stateJson, "")` を呼ぶ
**THEN** イベントが 0 件の fold として扱われ、`state` が復元され `corruption === null` である

---

## TC-017: 既存の composeSplitLayout / loadSplitLayout テストが無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: 内容ベースの projection compose を追加する

**GIVEN** T-02 の振替リファクタ（`composeSplitLayout` を `composeSplitLayoutFromContent` 委譲に変更）を適用した状態
**WHEN** 既存の `composeSplitLayout` / `loadSplitLayout` / `JobCatalog` 系テストを実行する
**THEN** すべて無改変（テストコードの変更なし）で green になる

---

## TC-018: resolveCheckpointSlug が state.json を持つ change folder が 0 件のとき CHECKPOINT_NOT_FOUND を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: `origin/<branch>` tree から checkpoint を読むリーダを追加する

**GIVEN** `git ls-tree` 出力に `archive` / `canceled` を除くと state.json を持つ change folder が 0 件になる spawn stub
**WHEN** `resolveCheckpointSlug(spawnFn, cwd, ref)` を呼ぶ
**THEN** `CHECKPOINT_NOT_FOUND` code を持つ error が throw される。filesystem への書き込みはない

---

## TC-019: resolveCheckpointSlug が state.json を持つ change folder が 2 件以上のとき CHECKPOINT_NOT_FOUND を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: `origin/<branch>` tree から checkpoint を読むリーダを追加する

**GIVEN** `git ls-tree` 出力に 2 件以上の有効 change folder が存在する spawn stub
**WHEN** `resolveCheckpointSlug(spawnFn, cwd, ref)` を呼ぶ
**THEN** `CHECKPOINT_NOT_FOUND` code を持つ error が throw される（曖昧として拒否）

---

## TC-020: readCheckpointFromRef が events.jsonl 不在のとき eventsJsonl="" を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: `origin/<branch>` tree から checkpoint を読むリーダを追加する

**GIVEN** `git show <ref>:specrunner/changes/<slug>/events.jsonl` が not-found を返す spawn stub
**WHEN** `readCheckpointFromRef(spawnFn, cwd, ref)` を呼ぶ
**THEN** `eventsJsonl === ""` が返り、state.json / treeFiles は正常に返る

---

## TC-021: checkpoint-ref.ts が src/core/ または src/adapter/ を import しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / T-10 > 層制約

**GIVEN** `src/git/checkpoint-ref.ts` のソースコード
**WHEN** import 文を検査する
**THEN** `src/core/` および `src/adapter/` からの import が存在しない（`src/util/git-exec` / `src/util/paths` / `src/errors` のみ許可）

---

## TC-022: verifyCheckpoint が request.md を treeFiles に含まない場合に CHECKPOINT_NOT_ATTACHABLE を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: checkpoint 検証述語を追加する

**GIVEN** valid な stateJson / eventsJsonl / identity だが、`treeFiles` に `specrunner/changes/<slug>/request.md` が含まれない入力
**WHEN** `verifyCheckpoint(input)` を呼ぶ
**THEN** `CHECKPOINT_NOT_ATTACHABLE` code を持つ error が throw される（検証項目 d 不成立）

---

## TC-023: verifyCheckpoint が repository / branch / slug identity 不一致のとき CHECKPOINT_NOT_ATTACHABLE を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: checkpoint 検証述語を追加する

**GIVEN** state の `repository.owner` / `repository.name` / `branch` / `getJobSlug` 結果が引数と一致しない入力（各パターン個別）
**WHEN** `verifyCheckpoint(input)` を呼ぶ
**THEN** `CHECKPOINT_NOT_ATTACHABLE` code を持つ error が throw される（検証項目 e 不成立）

---

## TC-024: verifyCheckpoint が journal 破損のとき CHECKPOINT_NOT_ATTACHABLE を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: checkpoint 検証述語を追加する

**GIVEN** `corruption !== null` を引き起こす eventsJsonl（不正 JSONL）を持つ入力
**WHEN** `verifyCheckpoint(input)` を呼ぶ
**THEN** `CHECKPOINT_NOT_ATTACHABLE` code を持つ error が throw される（検証項目 b 不成立）

---

## TC-025: verifyCheckpoint は filesystem に何も書かない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: checkpoint 検証述語を追加する

**GIVEN** valid / invalid どちらの入力でも `verifyCheckpoint` を呼べる状態
**WHEN** `verifyCheckpoint(input)` を呼ぶ（成功・失敗両パス）
**THEN** 呼び出し前後で filesystem（worktree / sidecar / state.json）への書き込みが一切発生しない

---

## TC-026: attach-from-checkpoint arm が manager.create を正しい引数で呼ぶ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: feature branch HEAD 起点の materialization plan variant と arm を追加する

**GIVEN** stub の `MaterializerHost`（manager.create / writeLivenessSidecar をスパイ）と `{ kind: "attach-from-checkpoint", checkpointRef: "origin/feat/x", branchName: "feat/x" }` plan
**WHEN** `WorkspaceMaterializer.materialize(slug, jobId, plan, host)` を呼ぶ
**THEN** `host.manager.create` が `(cwd, slug, jobId, "origin/feat/x", "feat/x", setupPlan)` の引数で呼ばれる（第 4 引数 = checkpointRef、第 5 引数 = branchName）

---

## TC-027: attach-from-checkpoint arm が writeLivenessSidecar を pid=null で呼ぶ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: feature branch HEAD 起点の materialization plan variant と arm を追加する

**GIVEN** TC-026 と同じ stub 構成
**WHEN** `WorkspaceMaterializer.materialize(slug, jobId, plan, host)` を呼ぶ
**THEN** `host.writeLivenessSidecar` が第 4 引数 `null`（pid=null）で呼ばれる

---

## TC-028: attach-from-checkpoint arm が seed / update / recopy を呼ばない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: feature branch HEAD 起点の materialization plan variant と arm を追加する

**GIVEN** TC-026 と同じ stub 構成（`updateJobState` / `bootstrapState` seed / `recopyDraftToChangeFolder` をスパイ）
**WHEN** `WorkspaceMaterializer.materialize(slug, jobId, plan, host)` を呼ぶ
**THEN** `updateJobState` / `bootstrapState` seed / `recopyDraftToChangeFolder` がいずれも呼ばれない（checkpoint tree が既に真実を含むため）

---

## TC-029: setupWorkspace が attachCheckpoint オプション指定時に attach-from-checkpoint plan を使う

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06: `WorkspaceOptions.attachCheckpoint` と setupWorkspace の attach 分岐を追加する

**GIVEN** stub の materializer を持つ `LocalRuntime` と `{ attachCheckpoint: { branch: "feat/x", checkpointRef: "origin/feat/x" } }` の opts
**WHEN** `runtime.setupWorkspace(slug, jobId, opts)` を呼ぶ
**THEN** materializer が `{ kind: "attach-from-checkpoint", checkpointRef: "origin/feat/x", branchName: "feat/x" }` plan で呼ばれ、noWorktree / existingWorktreePath / new-run の分岐には入らない

---

## TC-030: runAttachVerification が git fetch 失敗のとき ATTACH_FETCH_FAILED を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07: attach orchestrator を追加する

**GIVEN** `git fetch origin <branch>` が非ゼロ終了する spawn stub
**WHEN** `runAttachVerification({ cwd, branch, spawnFn, expectedRepo })` を呼ぶ
**THEN** `ATTACH_FETCH_FAILED` code を持つ error が throw される

---

## TC-031: runAttachVerification の検証失敗パスで filesystem に何も作られない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07: attach orchestrator を追加する

**GIVEN** fetch は成功するが verifyCheckpoint が `CHECKPOINT_NOT_ATTACHABLE` を throw する spawn stub
**WHEN** `runAttachVerification({ cwd, branch, spawnFn, expectedRepo })` を呼ぶ
**THEN** `CHECKPOINT_NOT_ATTACHABLE` が throw され、worktree / sidecar / job state が一切作られていない（stub materializer / spy で確認）

---

## TC-032: job attach --branch が command-registry に正しいフラグで登録されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: `job attach` CLI を追加し command-registry に登録する

**GIVEN** `src/cli/command-registry.ts` を参照できる状態
**WHEN** `job` サブコマンドの `attach` エントリを確認する
**THEN** `attach` が `guardedSubcommands` に含まれ、flags に `branch: { type: "string" }` が存在し、USAGE に `job attach --branch <branch>` が記載されている

---

## TC-033: job attach で --branch フラグ未指定のとき exit 2 で終了する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: `job attach` CLI を追加し command-registry に登録する

**GIVEN** `specrunner job attach`（`--branch` なし）を実行できる CLI 環境
**WHEN** `--branch` フラグを省略してコマンドを実行する
**THEN** exit code 2 でエラー終了し、`--branch` が必須である旨のメッセージが表示される

---

## TC-034: worktree 内からの job attach が guard で拒否される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08: `job attach` CLI を追加し command-registry に登録する

**GIVEN** `detectSpecrunnerWorktree(cwd)` が worktree を検出する cwd で `runAttach` を呼べる状態
**WHEN** `runAttach({ branch: "feat/x", cwd: <worktree-path>, logLevel })` を呼ぶ
**THEN** worktree guard が発火し、`worktreeGuardError` に相当するエラーで終了する（fetch・verify・materialize は実行されない）

---

## TC-035: managed runtime 設定で job attach が ATTACH_RUNTIME_UNSUPPORTED を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08: `job attach` CLI を追加し command-registry に登録する

**GIVEN** `config.runtime !== "local"`（managed runtime）を返す config stub
**WHEN** `runAttach({ branch: "feat/x", cwd, logLevel })` を呼ぶ
**THEN** `ATTACH_RUNTIME_UNSUPPORTED` code を持つ error が throw / 表示され、fetch・verify・materialize は実行されない

---

## TC-036: typecheck と全テストスイートが green（既存 resume plan テスト含む）

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-10: 全体品質ゲート

**GIVEN** すべての実装タスク（T-01 ～ T-09）が完了した状態
**WHEN** `bun run typecheck && bun test` を実行する
**THEN** typecheck が error なしで完了し、全テスト（既存の `resume-recreated` / `resume-without-recorded-worktree` plan テストを含む）が無改変で green になる

## Result

```yaml
result: completed
total: 36
automated: 35
manual: 1
must: 32
should: 4
could: 0
blocked_reasons: []
```
