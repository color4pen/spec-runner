# Code Review Feedback — iteration 001

## 検証した項目

### diff 範囲
`git diff main...HEAD --stat` で 20 ファイル変更、うち実装変更は 3 ファイル + テスト 4 ファイル。

### 実装 (T-01〜T-03)

**workspace-materializer.ts (T-01)**  
- `appendSynthesizedCommit` import 追加: line 27 ✅  
- `git commit` 成功後、`opts?.requestFilePath` ガード内に `git rev-parse HEAD` 呼び出しを挿入: lines 227–242 ✅  
- rev-parse 失敗時: `manager.remove` + `manager.prune` → throw の順（既存 commit-failure クリーンアップと同パターン）: lines 231–235 ✅  
- OID を `appendSynthesizedCommit(s, bootstrapOid)` で ledger に追記: lines 238–242 ✅  
- `slugOpts` は line 170 で定義済みで正しく参照している ✅  

**local.ts (T-02)**  
- `appendSynthesizedCommit` import: line 61 ✅  
- `isRunPath && opts?.requestFilePath` ガード内に挿入: lines 415–428 ✅  
- no-worktree path では worktree クリーンアップ不要、直接 throw（design D2 準拠）✅  
- `slugOpts` は `{ slug, stateRoot: this.cwd }` で正しく参照 ✅  

**managed.ts (T-03)**  
- `appendSynthesizedCommit` import: line 18 ✅  
- `opts?.requestFilePath` ガード内に挿入、`git push origin <branchName>`（2 回目 push）より前: lines 244–257 ✅  
- rev-parse 失敗時は throw → 後続 push が実行されない（fail-closed, design D2 準拠）✅  
- `updateJobState(jobId, mutator)` — slugOpts なし（managed store は currentSlug で解決、設計 D3 通り）✅  

### テスト (T-04〜T-07)

**bootstrap-egress-ledger-wm.test.ts (TC-001/004)**  
- `spawnFn` を `vi.fn()` で構築し `rev-parse HEAD` に既知 OID を返す構成 ✅  
- `updateJobState` モックが mutator を逐次適用し `trackedState` に反映 ✅  
- TC-004: `removeStub` / `pruneStub` が呼ばれることを assertion ✅  
- 両テストに "RED before T-01 fix" コメントあり（破壊確認の意図が明示されている）✅  

**bootstrap-egress-ledger-local.test.ts (TC-002/005)**  
- `vi.mock("config/store.js")` を import より前にホイスト ✅  
- `noWorktree: true` で `setupWorkspaceNoWorktree` へのルーティングを確認 ✅  
- TC-002: 永続化済み state を `JobStateStore` で読み戻して `synthesizedCommits` を検証 ✅  
- TC-005: rev-parse 失敗時の rejection を検証 ✅  

**bootstrap-egress-ledger-managed.test.ts (TC-003/006)**  
- TC-003: managed local store（`localSidecarDir`）から読み戻して `synthesizedCommits` を検証 ✅  
- TC-006: rev-parse 失敗時の rejection を検証（かつ後続 push が未到達であることが implicit に保証）✅  

**bootstrap-egress-ledger-e2e.test.ts (TC-007/008/009)**  
- 実 git リポジトリ + bare remote で bootstrap commit → step commit の順を再現 ✅  
- TC-007: `verifyEgressLedger` に両 OID を渡して resolve を確認 ✅  
- TC-008: bootstrap OID を意図的に除外、`EGRESS_UNKNOWN_COMMIT` で reject を確認（破壊確認）✅  
- `makePipelineSpawnFn` が push をインターセプトし、実 git rev-list はそのまま通す ✅  
- TC-009: `appendSynthesizedCommit` が `state/schema.ts` から再 export されていることを確認 — `schema.ts:9` の `export * from "./schema/operations.js"` で担保 ✅  

### 受け入れ基準の充足確認

| 基準 | 状況 |
|---|---|
| 3 経路で bootstrap OID を synthesizedCommits に記録するテストで固定 | TC-001/002/003 で担保 ✅ |
| 手動 seed なし実 git bootstrap → 初回 push で EGRESS_UNKNOWN_COMMIT 未発生 | TC-007 (e2e) で担保 ✅ |
| rev-parse 失敗で bootstrap が失敗する | TC-004/005/006 で担保 ✅ |
| 修正前の挙動に戻すと該当テストが fail する破壊確認 | TC-008 (ledger 未記録シミュレート) + 各ユニットテスト RED コメント ✅ |
| 既存 egress/合成/revision 束縛テストは無改変で green | git diff で当該ファイルの変更なし確認、test 8944 件 passed ✅ |
| typecheck && test が green | verification-result.md: build/typecheck/test/lint すべて passed ✅ |

### スコープ外の不変条件

- `runInlineEgressCheck` / `verifyEgressLedger` の変更なし ✅
- publish-range 計算 (`rev-list HEAD --not --remotes=origin`) の厳密形を維持 ✅

## 検証できなかった項目

None — 全受け入れ基準の証跡をコードとテストで確認した。

## Findings 詳細

指摘なし。実装・テスト・設計整合・検証結果すべてに問題なし。
