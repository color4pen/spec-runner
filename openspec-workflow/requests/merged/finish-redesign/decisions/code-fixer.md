# Code-Fixer Decisions — finish-redesign

## 判断ログ（現在形・事前宣言）

- `merge-feature-pr.ts` と `tests/finish-merge-feature-pr.test.ts` を削除する :: 2-PR モデル時代の dead code。orchestrator の `mergeFeaturePrPhase3` 内部関数が Phase 3 を実装済みであり、src/ 内に import する箇所がゼロ。spec.md C3「2-PR モデル前提モジュールを削除」の精神と直接衝突する
- `pr-state.ts` と `tests/finish-pr-state.test.ts` を削除する :: 同様に dead code。orchestrator は `gh pr view` の `mergeStateStatus` 文字列を直接使用しており、`NormalizedPrState` への正規化は使われていない。`getRecommendedAction` 削除後は `NormalizedPrState` / `ALL_NORMALIZED_PR_STATES` も参照ゼロになる
- `escalation.ts:37-58` の `getRecommendedAction` を削除し `import type { NormalizedPrState }` も除去する :: `merge-feature-pr.ts` 専用の dead chain。`--cleanup-only` / `specrunner finish ${jobId} --force` などの stale な CLI 文法を含む。削除後 `escalation.ts` は `formatEscalation` のみを export する
- `types.ts:10-26` の `NormalizedPrState` 型と `ALL_NORMALIZED_PR_STATES` を削除する :: `getRecommendedAction` を削除すれば `escalation.ts` からの参照もゼロになり、`pr-state.ts` も削除されるため完全 unreferenced になる。型 dependency tree として `types.ts` → `escalation.ts` → `merge-feature-pr.ts` / `pr-state.ts` という連鎖がまとめて消滅する
- `types.ts:65` の `cleanupOnly?: boolean` を削除する :: `merge-feature-pr.ts` 専用の deprecated field。CLI 入力（bin/specrunner.ts）からは渡されておらず実機能がなく、削除後に影響する参照もゼロ（orchestrator は `flags.dryRun ?? false` のみを使用）
- `archive-openspec.ts` の escalation 内 `${jobId}` を `${slug}` に置き換え、`jobId` パラメータを関数シグネチャから削除する :: spec.md は `specrunner finish <slug>` 形式でコマンドを記述しており、UUID の jobId を埋め込むと誤った再実行コマンドになる。slug は既に関数引数として受け取っている。orchestrator 側の呼び出しも `jobId` 引数を渡さない形に更新する
- `move-requests-dir.ts` の escalation 内 `${jobId}` を `${slug}` に置き換え、`jobId` パラメータを関数シグネチャから削除する :: 同上の一貫性 drift 修正。orchestrator 側の呼び出しも更新する
- Phase 4 worktree-aware の実装方針として「現 cwd の HEAD が main でない場合は `git checkout main` をスキップし警告ログのみ出力する」を採用する :: `git rev-parse --abbrev-ref HEAD` で HEAD 名を取得し、`main` でない場合は worktree 配下と判断してスキップする。`git rev-parse --git-common-dir` は `.git` vs worktree 判定として使えるが、HEAD 名での判定の方がシンプルかつ spec の想定ユースケース（worktree で finish → main は別 worktree）を正確に捉える。`git pull --ff-only` は main 上でのみ意味を持つため、checkout skip 時は pull もスキップする。spec.md Phase 4 を worktree シナリオの注記で補強する
- spec.md の Phase 4 に worktree シナリオの挙動を追記する :: MEDIUM #5 の「spec を更新して挙動を確定させる」要件に従う。新しい Scenario を spec.md に追加し、実装と仕様を同期させる
