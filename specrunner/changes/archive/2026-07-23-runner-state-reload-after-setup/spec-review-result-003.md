# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### operator 適用済み修正の確認（commit debdfe5ea）

**F-03 解消確認: T-01 JSDoc の managed 記述**

tasks.md T-01 の JSDoc 指示を精読した。前回 escalation 指摘「`managed: passthrough (returns unchanged jobState)` が D3 の fail-closed throw と矛盾する」に対し、operator が以下の通り修正していることを確認した:

```
- managed: fail-closed throw（store 構成の reload 安全性が別 request で検証されるまで。
  seed 順序の安全性を確認できた場合のみ managedLocalStore からの load を許容 — D3 / T-03 と同一の選択）
```

"passthrough" の文字列はどこにも残存していない。D3 の記述（fail-closed throw 一次案 / managedLocalStore load 代替案）と T-03 の実装指示と T-01 の JSDoc 指示が三者一致することを確認した。 ✅

**T-03 見出しの確認**

`## T-03: Implement \`reloadJobState\` fail-closed throw in ManagedRuntime` と明示されており、passthrough の痕跡なし。 ✅

### 背景・根本原因の現コードとの照合

`src/core/command/runner.ts:169-181` を直接読み、以下を確認した:

- `worktreePath` と `branch` の手動 mirror ブロックが存在する（169–181 行）
- `synthesizedCommits` の mirror が存在しない（コメント付きで worktreePath/branch のみ）

`src/core/runtime/workspace-materializer.ts:154-256`（new-run case）を直接読み、以下の順序を確認した:

1. `bootstrapState` を slug store へ seed（`new JobStateStore(...).persist(opts.bootstrapState)`）
2. `updateJobState(worktreePath)` — store のみ更新
3. `updateJobState(request.path)` — store のみ更新
4. `appendSynthesizedCommit(bootstrapOid)` via `updateJobState` — store のみ更新
5. `updateJobState(branch)` — store のみ更新
6. `return workspaceCtx`（WorkspaceContext には synthesizedCommits フィールドなし）

runner.ts の mirror は `workspace.worktreePath` / `workspace.branch` を読んでいるが、WorkspaceContext は synthesizedCommits を持たないため mirror できない。これが bug の構造的確認。

### 設計判断の妥当性

**D1（optional/required 分割）**: `runtime-strategy.ts` の `RealRuntimeStrategy` が `assertNoDuplicateLiveJob` / `assertProviderReadiness` / `snapshotMainCheckoutGuard` 等をすでに同パターンで必須化していることを確認。`reloadJobState` の追加は既存パターンと完全に一貫している。

**D2（LocalRuntime 実装）**: `src/core/runtime/local.ts` が `JobStateStore` を既にインポートしていることを確認。T-02 の `new JobStateStore(jobId, this.cwd, { slug, stateRoot }).load()` は追加インポートなしで実装可能。

**D3（ManagedRuntime）**: fail-closed throw が一次案、managedLocalStore load が「実装者が安全性を確認できた場合のみ」の代替案という設計は、#893 以降の方針（state 不明のまま pipeline を走らせない）と一貫していることを確認した。

**D4（runner.ts 修正）**: runner.ts line 117 で `const { jobState, ... } = prepared` として const 束縛されている。T-04 に「`jobState` が `const` 束縛であるため `let` 再宣言が必要なことを確認」と明記されており、実装者への指示は正確。reload ブロックの fail-closed エラーパス（`transitionJob` → `persistJobState` → return 1）は workspace setup 失敗パス（lines 153-167）と同型で整合する。

**D5（field 保全の構造的保証）**: materializer の seed 操作（`new JobStateStore(...).persist(opts.bootstrapState)`）が `updateJobState` 群より先に実行される順序を確認した。`prepare()` が `reviewers / noWorktree / issueNumber` を `jobState` に設定した後で `workspaceOpts.bootstrapState = jobState` を渡す設計（同パターンで `runner.ts` の `prepare()` で確認）のため、reload 後の state にこれらの field が含まれることの構造的保証は成立している。

### spec.md シナリオ → tasks.md テストカバレッジ照合

| spec.md 要件 | カバーするタスク |
|---|---|
| R1: reload による一本化 | T-01, T-02, T-04 |
| R2: in-memory 専用 field の保全 | T-05 TC-012 |
| R3: 封鎖テスト（実 store + 実 git） | T-06 TC-013（runtime 層）+ TC-013b（runner 配線層） |
| R4: halt 経路の非破壊 | T-06 TC-014 |

request.md 受け入れ基準との照合:

- 「実 store + 実 git 統合テスト」→ TC-013（timeout ≥30 000ms、手動 seed なし）✅
- 「in-memory 経路の直接 assert」→ TC-013b の sentinel（`"sentinel-oid-123"`）✅
- 「runner.ts の手動 mirror 削除」→ T-04 の削除指示 ✅
- 「reviewers/noWorktree/issueNumber 保持」→ TC-012 ✅
- 「reload 失敗で run 開始されない」→ TC-011 ✅
- 「破壊確認として記録」→ TC-011 / TC-013 / TC-013b の DESTROY コメント ✅
- 「既存テスト green」→ T-07 ✅
- 「typecheck && test green」→ T-07 ✅

### TC-013b の実現可能性

runner.ts line 237: `finalState = await pipeline.run(startStep, jobState, deps);`

`pipeline` は `buildPipelineForJob(jobState, deps, this.events)` から生成される。既存の `runner.test.ts` が `vi.mock("../../../../src/core/pipeline/index.js", ...)` でこの関数をモックしていることを確認した。TC-013b は同じモック seam を使い、`pipeline.run()` に渡される `jobState`（第2引数）を capture する設計であり技術的に実現可能。

### セキュリティ確認

- **パス構築**: `stateRoot = workspace.worktreePath ?? this.cwd` — `setupWorkspace()` の成功後に設定される trusted な値。slug は run 開始時に検証済み。新規の attack surface なし。
- **エラー情報**: RELOAD_FAILED のメッセージは既存エラーハンドリングと同パターン（stderr のみ）。
- **外部入力の流入**: reload は runner 自身が書いた store ファイルを読む操作であり外部入力ではない。
- OWASP Top 10 観点で本変更固有のリスクなし。

### 型安全性

`NormalizedJobState → JobState` キャストは reload 時点でステップ実行ゼロが不変条件であり safe。T-02 にコメント追記指示あり、適切。

### T-07 の既存テスト保護

`runtime-strategy.ts`-typed test fakes が `reloadJobState` を持たない場合、optional-chain（`this.runtime.reloadJobState?.(...)`）でスキップされ、in-memory state は変更なし。既存 runner.test.ts の `buildMockRuntime()` がこのパターンに合致することを確認した。

## 検証できなかった項目

- managed runtime の `.specrunner/local/<slug>/` での seed 順序保証（managed store topology の実コード）。ただし D3 が fail-closed throw を一次案としており、この不確実性はリスクヘッジ済み。別 request スコープであり本レビューでは未検証で可。

## Findings 詳細

None。operator 適用（commit debdfe5ea）により F-03（T-01 JSDoc passthrough 記述）は解消済み。前回指摘の F-01（設計）・F-02（封鎖テスト再設計）は attempt 2 時点で解消確認済み。新規 finding なし。
