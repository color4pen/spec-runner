# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 背景・根本原因の確認
- `src/core/command/runner.ts:169-181` を直接読んで手動 mirror ブロックを確認。`worktreePath` / `branch` のみ mirror され、`synthesizedCommits` の mirror がないことを検証済み。
- `src/core/runtime/workspace-materializer.ts` の `new-run` アーム（lines 154-255）を読んで、seed → `updateJobState(worktreePath)` → `updateJobState(request.path)` → `updateJobState(appendSynthesizedCommit)` → `updateJobState(branch)` の順序が store のみを更新することを確認。
- `src/core/step/commit-push.ts` の `runInlineEgressCheck` が `state.synthesizedCommits ?? []` を ledger として使うことを確認。

### 設計判断の妥当性
- **D1 (optional/required 分割)**: `RuntimeStrategy` に optional、`RealRuntimeStrategy` に required として追加するパターンは、既存の `assertNoDuplicateLiveJob` / `assertProviderReadiness` / `snapshotMainCheckoutGuard` 等と一貫していることを `runtime-strategy.ts` で確認。
- **D2 (LocalRuntime 実装)**: `stateRoot = workspace.worktreePath ?? this.cwd` の導出は、既存の `slugStoreOpts()` ヘルパーのパターンと一致することを確認。
- **D4 (fail-closed)**: reload 失敗時のエラーパス（`transitionJob` → `persistJobState` → return 1）は workspace setup 失敗時と同型であり、`workspace` が利用可能（null でない）時点でのみ呼ばれることを確認。
- **D5 (in-memory field 保全)**: `pipeline-run.ts` の `prepare()` が `reviewers` / `noWorktree` / `issueNumber` を `jobState` に設定し、その後 `workspaceOpts.bootstrapState = jobState` を渡すことを確認。materializer の `new-run` アームはこの bootstrapState を最初の I/O（`JobStateStore.persist`）として seed してから `updateJobState` を呼ぶため、reload 後の state にはこれらの field が含まれる構造的保証を確認。

### spec.md シナリオの照合
- 4 要件 × シナリオ計 4 件を tasks.md の各タスク（T-01〜T-07）と照合。各シナリオに対応するタスクが存在することを確認。
- TC-013 / TC-014 の受け入れ基準と tasks.md の記述を照合（後述の F-02 を参照）。

### テスト戦略
- 既存の `bootstrap-egress-ledger-wm.test.ts` TC-001 が `host.updateJobState` を mock して store を使わないため「store → in-memory」経路を踏まないことを確認（request.md 22-23 行に記載の gap）。
- `runner.test.ts` の mock runtime が `reloadJobState` を実装していないことを確認。optional-chain ガードにより既存テストが壊れない設計であることを確認。

### 型安全性
- `NormalizedJobState` と `JobState` の差異（`steps` フィールドの required/optional）を `job-state-store.ts` で確認。reload 時点でステップ実行ゼロの不変条件はコメントでの緩和が適切であることを確認。
- `const { jobState, ... } = prepared` の分割代入が `const` 束縛であるため、T-04 実装時に `let` 再宣言が必要であることを確認。T-04 にこの旨が明記されており、実装者への指示は正確。

## 検証できなかった項目

- managed runtime の実際の store topology（`managedLocalStore` がどこに seed されるか）を `managed.ts` で確認したが、リロード後の managed runtime での synthesizedCommits 保全が成立するか否かは実行ログなしでは確定できない。

## Findings 詳細

### F-01: design.md D3 の managed passthrough 記述が実装不可能

`design.md` D3 に「ManagedRuntime.reloadJobState() returns the passed-in jobState unchanged (identity function)」と記されているが、提案されたインターフェースシグネチャ `reloadJobState(jobId, slug, workspace): Promise<JobState>` は `jobState` を引数として受け取らないため、「passthrough / identity function」は文字通り実装不可能。

`tasks.md` T-03 はこの矛盾を正しく認識して「it does NOT have access to the original jobState, so it cannot return it」とし、throw を選択肢として提示している。しかし design.md と tasks.md の記述が相反しており、実装者が design.md を正典と読んだ場合に混乱する可能性がある。

fix: design.md D3 の「identity function」の記述を「managed runtime では throw するか managedLocalStore から load する」に修正する。

### F-02: TC-013 の DESTROY コメントが封鎖する回帰経路を正しく記述していない

`tasks.md` T-06 TC-013 の DESTROY コメントは「remove the `reloadJobState` call in runner.ts and restore the mirror lines (worktreePath/branch only). The test at step 6 fails because `reloadedState.synthesizedCommits` would be whatever the store contains」と記している。

しかし TC-013 の step 6 は `runner.ts` を経由せず `runtime.reloadJobState(jobId, slug, workspace)` を直接呼ぶ。runner.ts の `reloadJobState` 呼び出しを削除しても `LocalRuntime.reloadJobState()` メソッドが残る限り、step 6 は synthesizedCommits を含む state を返し続け TC-013 は green のままになる。

DESTROY 条件「runner.ts の呼び出し削除＋mirror 復元」で TC-013 が fail する場面は存在しない。真の封鎖には `CommandRunner.execute()` を通じて `pipeline.run()` に渡される state を intercept し、そこで synthesizedCommits を assert するテストが必要。

承認基準「pipeline に渡る state の synthesizedCommits に bootstrap OID が含まれることを直接 assert する(store 直読でなく in-memory 経路)」は TC-013 で充足されていない（TC-013 がテストするのは「reloadJobState が正しい state を返す」であり「runner.ts がその state を pipeline.run() に渡す」ではない）。

fix: TC-013 を CommandRunner.execute() を通じた統合テストに変更するか、DESTROY コメントを「reloadJobState メソッドを LocalRuntime から完全削除すると step 6 が throws になり fail する」と正確に修正し、別途 runner.ts の経路を封鎖するテストを追加する。
