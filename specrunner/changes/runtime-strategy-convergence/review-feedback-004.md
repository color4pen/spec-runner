# Code Review Feedback — iteration 004

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ条件チェック

| 条件 | 結果 | 確認方法 |
|------|------|---------|
| production に `RuntimeStrategy & PipelineDepsBuilder` が 0 件 | ✅ | ratchet TC-008 + grep + passing tests |
| `CommandRunner` と subclass が full `RuntimeStrategy` に依存しない | ✅ | runner.ts, pipeline-run.ts, resume.ts 読み込み |
| production の required lifecycle 処理に optional call/存在確認がない | ✅ | runner.ts:111/193–195, pipeline-run.ts:142 読み込み |
| `RealRuntimeStrategy` が 0 件 | ✅ | ratchet TC-009/031 + grep |
| `Pick` ベースの導出 shim が 0 件 | ✅ | ratchet TC-010/011 + grep |
| `as unknown as RuntimeStrategy` が 0 件 | ✅ | ratchet TC-012 + grep（0 件確認） |
| test fake は typed builder/helper で必要 contract を満たす | ✅ | pipeline-sole-committer-e2e.test.ts 読み込み |
| Local/Managed 双方について contract test がある | ✅ | command-lifecycle-contract.test.ts 読み込み（TC-027〜030） |
| architecture ratchet がある | ✅ | runtime-strategy-ratchet.test.ts 読み込み |
| SpecRunner 上の既存 verification が green | ✅ | verification-result.md 確認（build/typecheck/test/lint 全 passed） |
| ユーザー向け挙動・出力・終了コードに差分がない | ✅（コード） | runner.ts ライフサイクル順序・teardown 挙動を読み込みで確認 |

### test-cases.md TC カバレッジ確認

| TC | Priority | 結果 | 確認内容 |
|----|----------|------|---------|
| TC-001 | must | ✅ | `runner.ts:111` が `assertProviderReadiness` を `prepare()` より前に存在確認なしで呼び出す |
| TC-002 | must | ✅ | `ProviderReadinessCapability.assertProviderReadiness` が required（`command-runtime.ts:36`、`?` なし） |
| TC-003 | must | ✅ | `pipeline-run.ts:142` が `bootstrapJob`（line 145）より前に `assertNoDuplicateLiveJob` を呼び出す |
| TC-004 | must | ✅ | `runner.ts:193–195` が `existingWorktreePath === undefined` のとき無条件で `reloadJobState` を呼び出す |
| TC-005 | must | ✅ | `runner.ts:193` が `existingWorktreePath !== undefined`（resume path）のとき `reloadJobState` をスキップ |
| TC-006 | must | ✅ | `scope-check.ts:53` が `deps.changedFiles.canDeriveChangedFiles()` を直接呼び出す（line 48 の null ガードで保護） |
| TC-007 | must | ✅ | `runtime-capability-gate.ts:82` が `runtime.canDeriveChangedFiles()` を直接呼び出す |
| TC-008 | must | ✅ | ratchet が `RuntimeStrategy & PipelineDepsBuilder` を production src で 0 件アサート |
| TC-009 | must | ✅ | ratchet が `RealRuntimeStrategy` を src/ 全ファイルで 0 件アサート |
| TC-010 | must | ✅ | `deriveCommitInspectionCapability` / `deriveRevisionContentCapability` 削除済み；ratchet 監視 |
| TC-011 | must | ✅ | `Pick<RuntimeStrategy` が production src に 0 件；ratchet 監視 |
| TC-012 | must | ✅ | `as unknown as RuntimeStrategy` がテストファイルに 0 件；ratchet 監視；grep 確認 |
| TC-013 | must | ✅ | `command-lifecycle-contract.test.ts:56` で `LocalRuntime` を `RuntimeFacade` へ代入（コンパイル時型検査） |
| TC-014 | must | ✅ | `command-lifecycle-contract.test.ts:69` で `ManagedRuntime` を `RuntimeFacade` へ代入（コンパイル時型検査） |
| TC-015 | must | ✅ | `runtime-strategy-ratchet.test.ts` が 7 つの禁止パターンを全件 0 アサート |
| TC-016 | must | 手動 | 自動検証不可（後述） |
| TC-017 | should | ✅ | `command-runtime.ts` の 4 capability interface は全メソッド required（`?` なし）で定義されている |
| TC-018 | should | ✅ | `RuntimeFacade` が 4 capability + PipelineDepsBuilder + ChangedFilesCapability の intersection（`command-runtime.ts:141–146`） |
| TC-019 | must | ✅ | `runner.ts` に `RuntimeStrategy` import なし；`CommandRunner` コンストラクタは 4-capability intersection |
| TC-020 | must | ✅ | `pipeline-run.ts` が `RuntimeFacade` を import；`RuntimeStrategy` import なし |
| TC-021 | should | ✅ | `resume.ts` が `RuntimeFacade` を import；`RuntimeStrategy` import なし |
| TC-022 | must | ✅ | `runtime-strategy.ts` の interface メソッド定義に `?` なしを grep で確認 |
| TC-023 | should | ✅ | `factory.ts:36` の戻り値型が `RuntimeFacade`；`RuntimeStrategy & PipelineDepsBuilder` 参照なし |
| TC-024 | should | ✅ | `bootstrap.ts:26` の `BootstrapResult.runtime` が `RuntimeFacade` 型 |
| TC-025 | could | ✅ | `local.ts` / `managed.ts` の `buildDeps()` が `listCommitChangedFiles.bind(this)` / `readRevisionContent.bind(this)` を直接使用；shim 呼び出しなし |
| TC-026 | should | ✅ | `pipeline-sole-committer-e2e.test.ts` が typed `RoundGitEffectsCapability` / `StepIoValidationCapability` オブジェクトを使用；`as unknown as RuntimeStrategy` が 0 件 |
| TC-027 | should | ✅ | contract test が Local（probe 呼び出し、ready で resolve、not-ready で throw）と Managed（no-op）を検証 |
| TC-028 | should | ✅ | contract test が Local / Managed ともに `assertSlugUnoccupied` 委譲パスを検証 |
| TC-029 | should | ✅ | contract test が Local（store なしで throw）と Managed（`"reloadJobState not implemented for managed runtime"` throw）を検証 |
| TC-030 | should | ✅ | contract test が Local（`true` 返却）と Managed（`false` 返却）を検証 |
| TC-031 | must | ✅ | ratchet が `RealRuntimeStrategy` を tests/ でも 0 件アサート |
| TC-032 | must | ✅ | `bun run typecheck` passed（verification-result.md: 9.9s, exit 0） |
| TC-033 | must | ✅ | `bun run test` passed（verification-result.md: 72.7s, exit 0） |
| TC-034 | should | ✅ | `bun run lint` passed（verification-result.md: 9.4s, exit 0） |

### ファイル別確認内容

**`src/core/command/runner.ts`**  
コンストラクタ引数が `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`。`RuntimeStrategy` import なし。`assertProviderReadiness`（line 111）と `reloadJobState`（line 195）がともに `?.` なし・存在確認なしで呼び出されている。`arch-allowlist.ts` に `assertProviderReadiness(process.env` を B-6 known-safe として追記済み。

**`src/core/command/pipeline-run.ts`**  
`RuntimeFacade` 型で `runtime` を受け取り。`RuntimeStrategy` import なし。`assertNoDuplicateLiveJob`（line 142）を `bootstrapJob`（line 145）より前に直接呼び出し。

**`src/core/command/resume.ts`**  
`RuntimeFacade` 型で `runtime` を受け取り。`RuntimeStrategy` import なし。

**`src/core/runtime/factory.ts`**  
戻り値型が `RuntimeFacade`（line 36）。`RuntimeStrategy & PipelineDepsBuilder` 参照なし。

**`src/cli/bootstrap.ts`**  
`BootstrapResult.runtime` が `RuntimeFacade` 型（line 26）。

**`src/core/pipeline/runtime-capability-gate.ts`**  
`canDeriveChangedFiles()` を直接呼び出し（line 82、`?.` なし）。パラメーター型は `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` — `ChangedFilesCapability` からの絞り込みであり、禁止パターン `Pick<RuntimeStrategy` には非該当。

**`src/core/port/runtime-strategy.ts`**  
`RuntimeStrategy` interface の全メソッドが required（`?` なし）。`assertProviderReadiness`・`assertNoDuplicateLiveJob`・`reloadJobState`・`canDeriveChangedFiles` を対象に grep で確認済み。

**`src/core/port/command-runtime.ts`**（新規）  
4 capability interface と `RuntimeFacade` type alias を定義。全メソッドが required。JSDoc に Local / Managed の動作差異を明記。

**`src/core/runtime/local.ts` / `managed.ts`**  
`buildDeps()` が `commitInspection` / `revisionContent` を直接 bound method で構築。shim 関数の呼び出しなし。`reloadJobState`・`assertNoDuplicateLiveJob`・`assertProviderReadiness` が直接実装されている。

**`src/core/port/__tests__/runtime-strategy-ratchet.test.ts`**（新規）  
7 つの禁止パターン（TC-008〜012、TC-031、canDeriveChangedFiles?. ratchet）を全件 0 アサート。self-exclusion 処理あり。

**`src/core/runtime/__tests__/command-lifecycle-contract.test.ts`**（新規）  
TC-013/014（コンパイル時型代入）と TC-027〜030（Local / Managed 挙動差異）を網羅。

**`tests/pipeline-sole-committer-e2e.test.ts`**  
`RoundGitEffectsCapability` / `StepIoValidationCapability` を直接構築。`as unknown as RuntimeStrategy` / `as never` キャストが 0 件。

## 検証できなかった項目

- **TC-016（manual）: ユーザー向け挙動に差分がない** — `specrunner run` / `specrunner resume` の実際の CLI 実行は本レビューでは未確認。コードレベルではライフサイクル順序・teardown 挙動・エラーパスが変更前後で同一であることを runner.ts 読み込みで確認したが、エンドツーエンドの動作確認は手動テストが必要。

## 低優先度の観察事項

### OBS-1: `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` の使用

`runtime-capability-gate.ts:71` の `assertRuntimeSupportsScope` パラメーター型が `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` となっている。`ChangedFilesCapability` からの絞り込みであり、禁止パターン `Pick<RuntimeStrategy` には非該当。ratchet も `Pick<RuntimeStrategy` のみを監視しており、この用法は正当なTypeScript型絞り込みである。対応不要だが、将来 `CanDeriveChangedFilesCapability` のような named interface として切り出すことも検討できる。

### OBS-2: `PipelineDeps.changedFiles` が optional のまま

`types.ts:133` の `changedFiles?: ChangedFilesCapability` は依然 optional 型。Local / Managed ともに `buildDeps()` で常に注入するため型は保守的。R2a からの設計で R2c のスコープ外。スペック要件（capability interface 内の `canDeriveChangedFiles()` を required にする）は満たされている。

### OBS-3: ManagedRuntime 新規 run パスの RELOAD_FAILED

`ManagedRuntime.reloadJobState` が throw する。新規 run パス（`existingWorktreePath === undefined`）では `runner.ts:195` がこれを呼び出し RELOAD_FAILED で job が失敗する。`design.md` の Risk 節でこれが behavior-preserving であること（R2c 以前も同経路で throw が発生）と、managed runtime ストアトポロジーの別 request による対応を明記している。TC-029 でこの throw 挙動を明示的にテスト済み。
