# Spec Review Result

- **change**: job-state-store-di
- **verdict**: approved

## Summary

仕様全体として整合が取れており、実装に踏み切れる品質。設計判断の根拠が明確で、タスク粒度も十分。

## Findings

### ✅ 問題定義とコードの一致

request.md の行番号指摘（L93/203/213/278/296/367/470）は実際の `pipeline.ts` と一致。`executor.ts` L366-368 の `new JobStateStore(jobId)` in `getStore()` も確認済み。「DI と素 new が混在」という診断は正確。

### ✅ 設計選択の妥当性

- **factory 注入（vs インスタンス注入）**: `buildDeps()` のシグネチャが jobId を取らない制約から factory が唯一の合理的選択。`spawn: SpawnFn` との対称性も正しい。
- **composition root**: `local.ts` / `managed.ts` の `buildDeps()` に確定。`run.ts` の `const executor = new StepExecutor(bus, runner)` (L57/L132) が更新対象として正確に特定されている。
- **port 化しない**: 具象 factory 差し替えでテスタビリティが達成される。interface 抽出は over-abstraction であり却下は正当。
- **`StoreFactory` 型を export**: cancel/finish/resume が将来同一 seam に乗れる布石として適切。

### ✅ tasks.md の実装指針の完全性

- 各タスクに before/after コードスニペットあり
- `handleExhausted` へ `deps` パラメータ追加（Task 4 steps 3-4）と 3 call site 更新を明示——private メソッドシグネチャ変更の見落とし防止として重要
- `storeFactory` を required な 3rd positional parameter として `spawnFn?` より前に置く決定が型安全（`(jobId: string) => JobStateStore` と `SpawnFn` は型が異なるため TypeScript がすべての未更新呼び出しを検出する）
- Task 7 の grep 検証コマンドが受け入れ基準と 1:1 で対応

### ✅ Delta Spec の品質

両 delta spec（step-execution-architecture / pipeline-orchestrator）とも：
- `## Requirements` + `### Requirement:` ヘッダー形式 ✓
- `SHALL` キーワード含む normative 記述 ✓
- `#### Scenario:` Given/When/Then 形式 ✓
- grep-based シナリオ（「zero matches」）で CI 検証可能 ✓

### ✅ スコープ外の正当性

cancel/finish/resume の `new JobStateStore` を除外する理由（`PipelineDeps` チェーン外の短命経路）は妥当。`StoreFactory` 型を export することで将来の統一経路を閉じていない点も適切。

### ✅ セキュリティ

純粋な構造リファクタリングであり、外部入力処理・認証・API 公開面に変更なし。OWASP 上の懸念事項なし。

## 軽微な観察（need-fix には至らない）

1. **Task 6c の網羅性**: 「typecheck でエラーが出るファイルを洗い出し」という方針は実行可能だが、既知の影響ファイル（executor の unit test、pipeline の unit test 等）を事前に列挙していれば実装者の認知負荷がさらに下がった。Task 7 の typecheck green が最終ゲートとして機能するため問題はない。

2. **`local.ts` の `spawn: spawnCommand` ハードコード**: `buildDeps()` が `this.spawnFn` ではなく直 `spawnCommand` を使っている既存の不整合は本 request のスコープ外で正しく扱われている。
